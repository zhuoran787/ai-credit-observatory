#!/usr/bin/env python3
"""Refresh the local research dashboard. Standard library + bundled xlrd.

No fabricated fills: successful new observations replace a series; failed
sources preserve the old series with an explicit error and its original date.
This is an on-demand fetcher, not a scheduler or trading feed.
"""
from __future__ import annotations
import concurrent.futures
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sys
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from zoneinfo import ZoneInfo
import zipfile

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.vendor'))
CONF = json.loads((ROOT / 'data/market-config.json').read_text())
START = CONF['history_start']
TODAY = datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat()
NOW = datetime.now(ZoneInfo('America/Los_Angeles')).isoformat(timespec='seconds')
RAW = ROOT / 'evidence/fetches' / NOW.replace(':', '-')


def download(url, key):
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urlopen(req, timeout=28) as res:
        data = res.read()
        if res.status != 200:
            raise ValueError(f'HTTP {res.status}')
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / key).write_bytes(data)
    return data


def points_clean(points):
    unique = {}
    for day, value in points:
        if not START <= day <= TODAY:
            continue
        try:
            number = float(value)
        except (ValueError, TypeError):
            continue
        if not math.isfinite(number):
            continue
        unique[day] = round(number, 6)
    return [[d, unique[d]] for d in sorted(unique)]


def series_record(sid, label, pts, source_url, provider, unit='%', frequency='日频',
                  stale_days=7, note='', quote_time=None):
    pts = points_clean(pts)
    if not pts:
        raise ValueError(f'{sid}: source returned no valid observations')
    latest = pts[-1]
    return {'id': sid, 'label': label, 'unit': unit, 'frequency': frequency,
            'provider': provider, 'source_url': source_url, 'fetched_at': NOW,
            'observed_at': latest[0], 'value': latest[1], 'history': pts,
            'stale_calendar_days': stale_days, 'note': note,
            'quote_time': quote_time, 'fetch_status': 'ok', 'error': None}


def fetch_fred(specs=None):
    specs = specs or CONF['fred_series']
    url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?' + urlencode({
        'id': ','.join(s['id'] for s in specs)}, safe=',')
    data = download(url, 'fred-' + specs[0]['id'] + '.bin')
    # FRED can return CSV, or a ZIP when series frequencies differ.
    if data.startswith(b'PK'):
        archive = zipfile.ZipFile(io.BytesIO(data))
        csvs = [archive.read(n).decode('utf-8-sig') for n in archive.namelist() if n.endswith('.csv')]
    else:
        csvs = [data.decode('utf-8-sig')]
    result = {}
    by_id = {s['id']: [] for s in specs}
    for raw in csvs:
        for row in csv.DictReader(io.StringIO(raw)):
            day = row.get('observation_date', row.get('DATE', ''))
            for spec in specs:
                value = row.get(spec['id'])
                if value not in (None, '', '.'):
                    by_id[spec['id']].append([day, float(value) * spec['scale']])
    for spec in specs:
        if not by_id[spec['id']]:
            continue
        note = '全市场基准；包含AI发行人，不是剔除AI后的指数。' if spec['id'].startswith('BAML') else ''
        if spec['id'].startswith('BAML'):
            note += ' ICE通过FRED授权展示；仅本地研究使用；历史自2026年4月起仅保留3年。'
        if spec['id'] == 'MORTGAGE30US':
            note = 'Freddie Mac调查的住房贷款利率；不是agency MBS收益率或OAS。'
        result[spec['id']] = series_record(spec['id'], spec['label'], by_id[spec['id']],
            'https://fred.stlouisfed.org/series/' + spec['id'],
            'ICE / FRED' if spec['id'].startswith('BAML') else 'FRED（来源见原页面）',
            spec['unit'], spec['frequency'], spec['stale_calendar_days'], note)
    if not result:
        raise ValueError('FRED returned no requested series')
    return result


def fetch_treasury():
    year = int(TODAY[:4])
    rows = []
    for y in range(max(2026, int(START[:4])), year + 1):
        url = (f'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/'
               f'daily-treasury-rates.csv/{y}/all?type=daily_treasury_yield_curve'
               f'&field_tdr_date_value={y}&page&_format=csv')
        raw = download(url, f'treasury-{y}.csv').decode('utf-8-sig')
        if not raw.startswith('Date,'):
            raise ValueError('Treasury payload is not the expected CSV')
        rows += list(csv.DictReader(io.StringIO(raw)))
    result = {}
    source = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve'
    for tenor in [2, 5, 10, 20, 30]:
        pts = [[datetime.strptime(r['Date'], '%m/%d/%Y').date().isoformat(), r[f'{tenor} Yr']] for r in rows]
        sid = f'UST{tenor}'
        result[sid] = series_record(sid, f'美国国债 {tenor} 年', pts, source,
             'US Treasury', '%', '日频/收盘', note='财政部平价收益率曲线；不是盘中可成交报价。')
    return result


def fetch_sofr():
    url = 'https://markets.newyorkfed.org/api/rates/secured/sofr/last/30.json'
    raw = json.loads(download(url, 'sofr.json'))
    pts = [[r['effectiveDate'], r['percentRate']] for r in raw['refRates'] if r.get('type') == 'SOFR']
    return {'NYFED_SOFR': series_record('NYFED_SOFR', 'SOFR（纽约联储）', pts, url,
             'Federal Reserve Bank of New York', note='隔夜回购参考利率；不是CME远期Term SOFR。')}


def fetch_acm():
    import xlrd
    url = 'https://www.newyorkfed.org/medialibrary/media/research/data_indicators/ACMTermPremium.xls'
    raw = download(url, 'acm.xls')
    book = xlrd.open_workbook(file_contents=raw)
    sheet = book.sheet_by_name('ACM Daily')
    headers = sheet.row_values(0)
    col = headers.index('ACMTP10')
    pts = []
    for i in range(1, sheet.nrows):
        date_value = sheet.cell_value(i, 0)
        if isinstance(date_value, (float, int)):
            day = xlrd.xldate_as_datetime(date_value, book.datemode).date().isoformat()
        else:
            day = datetime.strptime(date_value, '%d-%b-%Y').date().isoformat()
        pts.append([day, sheet.cell_value(i, col)])
    return {'ACMTP10': series_record('ACMTP10', '10 年期限溢价（ACM）', pts,
            'https://www.newyorkfed.org/research/data_indicators/term-premia-tabs',
            'NY Fed ACM 模型', '%', '日频/模型估计', 10,
            '可修订的模型估计，不是可交易价格；不能当作30年期限溢价。')}


def fetch_stock(symbol):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d'
    payload = json.loads(download(url, f'{symbol}.json'))
    item = payload['chart']['result'][0]
    meta = item['meta']
    if meta.get('currency') != 'USD':
        raise ValueError(f'{symbol}: unexpected currency')
    values = item['indicators']['quote'][0]['close']
    pts = [[datetime.fromtimestamp(ts, ZoneInfo('America/New_York')).date().isoformat(), value]
           for ts, value in zip(item['timestamp'], values) if value is not None]
    quote_time = datetime.fromtimestamp(meta['regularMarketTime'], ZoneInfo('America/New_York')).isoformat()
    names = {'OWL': 'Blue Owl 管理公司', 'OBDC': 'Blue Owl Capital Corp BDC',
             'OTF': 'Blue Owl Technology Finance BDC', 'ORCL': 'Oracle',
             'CRWV': 'CoreWeave', 'NBIS': 'Nebius'}
    s = series_record(symbol, names[symbol], pts, f'https://finance.yahoo.com/quote/{symbol}/',
            'Yahoo Finance（第三方）', 'USD', '行情快照/日线', 7,
            '未复权收盘/日线末值；行情存在延迟，不保证即时；不等于基金NAV或债券价格。', quote_time)
    s['provider_quote_price'] = meta.get('regularMarketPrice')
    return {symbol: s}


def add_derived(series):
    def spread(sid, label, left, right):
        if left not in series or right not in series:
            return
        a, b = series[left], series[right]
        bdict = dict(b['history'])
        scale = 100 if a['unit'] == '%' else 1
        pts = [[d, (v - bdict[d]) * scale] for d, v in a['history'] if d in bdict]
        if not pts:
            return
        item = series_record(sid, label, pts, a['source_url'], '同日数据计算', 'bp',
             note=f'{left} − {right}；只使用双方都有数据的同一天。')
        if a['fetch_status'] != 'ok' or b['fetch_status'] != 'ok':
            item['fetch_status'] = 'cached'
            item['error'] = '至少一个输入本次获取失败；沿用原观测日期。'
        series[sid] = item
    spread('UST30_2', '国债 30Y−2Y', 'UST30', 'UST2')
    spread('UST30_10', '国债 30Y−10Y', 'UST30', 'UST10')
    spread('BB_BBB', 'BB−BBB OAS', 'BAMLH0A1HYBB', 'BAMLC0A4CBBB')


def finalize(series):
    for item in series.values():
        pts = item.get('history', [])
        if not pts:
            continue
        item['age_calendar_days'] = (datetime.fromisoformat(TODAY).date() -
                                    datetime.fromisoformat(pts[-1][0]).date()).days
        item['stale'] = item['age_calendar_days'] > item.get('stale_calendar_days', 7)
        for n in [5, 20, 60]:
            if len(pts) <= n:
                item[f'change_{n}obs'] = None
            elif item['unit'] == 'USD':
                item[f'change_{n}obs'] = round((pts[-1][1]/pts[-n-1][1]-1)*100, 3) if pts[-n-1][1] else None
            else:
                multiplier = 100 if item['unit'] == '%' else 1
                item[f'change_{n}obs'] = round((pts[-1][1]-pts[-n-1][1])*multiplier, 3)


def refresh():
    oldpath = ROOT / 'data/snapshot.json'
    old = json.loads(oldpath.read_text()) if oldpath.exists() else {}
    series = old.get('series', {})
    for item in series.values():
        item['fetch_status'] = 'cached'
        item['error'] = '本次尚未成功更新'
    jobs = {'Treasury': fetch_treasury, 'NYFed_SOFR': fetch_sofr, 'NYFed_ACM': fetch_acm}
    for offset in range(0, len(CONF['fred_series'])):
        batch = CONF['fred_series'][offset:offset+1]
        jobs['FRED_' + batch[0]['id']] = lambda batch=batch: fetch_fred(batch)
    for symbol in CONF['stocks']:
        jobs[symbol] = lambda symbol=symbol: fetch_stock(symbol)
    outcomes = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(fn): name for name, fn in jobs.items()}
        for fut in concurrent.futures.as_completed(futures):
            name = futures[fut]
            try:
                new = fut.result()
                if name == 'NYFed_SOFR' and 'NYFED_SOFR' in series:
                    new['NYFED_SOFR']['history'] = points_clean(series['NYFED_SOFR']['history'] + new['NYFED_SOFR']['history'])
                series.update(new)
                outcomes.append({'source': name, 'ok': True, 'series_count': len(new), 'checked_at': NOW})
            except Exception as exc:
                outcomes.append({'source': name, 'ok': False, 'error': f'{type(exc).__name__}: {exc}', 'checked_at': NOW})
    add_derived(series)
    finalize(series)
    result = {'fetched_at': NOW, 'research_asof': CONF['research_asof'], 'today_local': TODAY,
              'refresh_policy': CONF['refresh_policy'], 'series': series, 'fetches': outcomes,
              'config_hash': hashlib.sha256((ROOT/'data/market-config.json').read_bytes()).hexdigest(),
              'limitations': ['日频不等于盘中实时；各指标日期可能不同。',
                  '发行人现金债/CDS/发行条款使用单独的研报快照，没有伪造实时接口。',
                  '评级指数包括AI发行人；没有把全市场IG冒充非AI指数。']}
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    tmp = oldpath.with_suffix('.tmp')
    tmp.write_text(payload)
    os.replace(tmp, oldpath)
    js = ROOT/'data/snapshot.js'
    tempjs = js.with_suffix('.tmp')
    tempjs.write_text('window.MARKET_DATA = '+payload+';\n')
    os.replace(tempjs, js)
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW/'receipt.json').write_text(json.dumps(outcomes, ensure_ascii=False, indent=2))
    print(json.dumps({'fetched_at': NOW, 'series_count': len(series), 'fetches': outcomes}, ensure_ascii=False))
    return result


if __name__ == '__main__':
    refresh()
