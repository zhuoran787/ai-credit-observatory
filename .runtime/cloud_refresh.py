from pathlib import Path
import hashlib,json
from datetime import datetime,timezone
from refresh import refresh

ROOT=Path(__file__).resolve().parent
SITE=ROOT.parent/'site'
old=json.loads((SITE/'data/snapshot.json').read_text())
result=refresh()
assert result['series'] and any(f['ok'] for f in result['fetches']), 'All providers failed; keep the published snapshot'
assert not any(k.startswith('BAML') or k=='BB_BBB' for k in result['series']), 'Restricted series cannot be published'
result['public_external_series']=old.get('public_external_series',[])
for item in result['series'].values():
    assert item['history'] and item['observed_at']==item['history'][-1][0]
payload=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
(ROOT/'data/snapshot.json').write_text(payload)
(SITE/'data/snapshot.json').write_text(payload)
(SITE/'data/snapshot.js').write_text('window.MARKET_DATA = '+payload+';\n')
receipt=json.loads((SITE/'publication.json').read_text())
receipt.update(built_at=datetime.now(timezone.utc).isoformat(),market_fetched_at=result['fetched_at'],public_series=len(result['series']),index_sha256=hashlib.sha256((SITE/'index.html').read_bytes()).hexdigest())
(SITE/'publication.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
