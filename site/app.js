'use strict';
let market=window.MARKET_DATA||{series:{},fetches:[]};
const research=window.RESEARCH,sources=window.SOURCES;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const table=(headers,rows)=>`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const source=(id,text)=>`<a href="${esc(sources[id]?.url||'#')}" target="_blank" rel="noopener">${esc(text||sources[id]?.title||id)} ↗</a>`;
const status=s=>!s?'<span class="pill warn">无数据</span>':s.fetch_status!=='ok'?'<span class="pill warn">本次失败 / 缓存</span>':s.stale?'<span class="pill warn">观测已陈旧</span>':'<span class="pill">获取成功</span>';
const card=(label,val,sub='',extra='')=>`<article class="card"><div class="label">${esc(label)}${extra}</div><strong>${val}</strong><div class="sub">${sub}</div></article>`;
const signed=(n,unit)=>n==null?'—':`${n>0?'+':''}${num(n,1)}${unit}`;
function renderCards(){
 const specs=[['UST30','30年美国国债'],['BAMLC0A0CM','全市场 IG OAS'],['BAMLH0A0HYM2','全市场 HY OAS'],['OWL','Blue Owl 股价']];
 $('cards').innerHTML=specs.map(([id,label])=>{const s=market.series[id];if(id.startsWith('BAML'))return card(label,'<a href="https://fred.stlouisfed.org/series/'+id+'" target="_blank" rel="noopener">来源查看 ↗</a>','受限行情不在公开站点转载；前往原站查看最新值');return card(label,s?`${num(s.value,s.unit==='bp'?0:2)}<small style="font-size:13px"> ${esc(s.unit)}</small>`:'—',s?`<div class="delta">20观测 ${signed(s.change_20obs,s.unit==='USD'?'%':'bp')}</div>${esc(s.observed_at)} · ${esc(s.provider)}<br>${s.unit==='USD'?'未复权日线 / 非NAV':'日频最新可得；非盘中'}`:'本次未获取，详见数据与来源',status(s));}).join('');
 $('externalCredit').innerHTML=[{"id": "BAMLC0A0CM", "label": "全市场 IG OAS", "url": "https://fred.stlouisfed.org/series/BAMLC0A0CM"}, {"id": "BAMLC0A1CAAA", "label": "AAA OAS", "url": "https://fred.stlouisfed.org/series/BAMLC0A1CAAA"}, {"id": "BAMLH0A0HYM2", "label": "全市场 HY OAS", "url": "https://fred.stlouisfed.org/series/BAMLH0A0HYM2"}, {"id": "BAMLC0A4CBBB", "label": "BBB OAS", "url": "https://fred.stlouisfed.org/series/BAMLC0A4CBBB"}, {"id": "BAMLC0A2CAA", "label": "AA OAS", "url": "https://fred.stlouisfed.org/series/BAMLC0A2CAA"}, {"id": "BAMLC0A3CA", "label": "A OAS", "url": "https://fred.stlouisfed.org/series/BAMLC0A3CA"}, {"id": "BAMLH0A1HYBB", "label": "BB OAS", "url": "https://fred.stlouisfed.org/series/BAMLH0A1HYBB"}, {"id": "BAMLH0A3HYC", "label": "CCC 及以下 OAS", "url": "https://fred.stlouisfed.org/series/BAMLH0A3HYC"}, {"id": "BAMLH0A2HYB", "label": "B OAS", "url": "https://fred.stlouisfed.org/series/BAMLH0A2HYB"}, {"id": "BAMLC1A0C13Y", "label": "IG 1–3 年 OAS", "url": "https://fred.stlouisfed.org/series/BAMLC1A0C13Y"}, {"id": "BAMLC2A0C35Y", "label": "IG 3–5 年 OAS", "url": "https://fred.stlouisfed.org/series/BAMLC2A0C35Y"}, {"id": "BAMLC3A0C57Y", "label": "IG 5–7 年 OAS", "url": "https://fred.stlouisfed.org/series/BAMLC3A0C57Y"}, {"id": "BAMLC4A0C710Y", "label": "IG 7–10 年 OAS", "url": "https://fred.stlouisfed.org/series/BAMLC4A0C710Y"}, {"id": "BAMLC0A0CMEY", "label": "全市场 IG 有效收益率", "url": "https://fred.stlouisfed.org/series/BAMLC0A0CMEY"}, {"id": "BAMLH0A0HYM2EY", "label": "全市场 HY 有效收益率", "url": "https://fred.stlouisfed.org/series/BAMLH0A0HYM2EY"}, {"id": "BAMLC7A0C1015Y", "label": "IG 10–15 年 OAS", "url": "https://fred.stlouisfed.org/series/BAMLC7A0C1015Y"}, {"id": "BAMLC8A0C15PY", "label": "IG 15 年以上 OAS", "url": "https://fred.stlouisfed.org/series/BAMLC8A0C15PY"}].map(s=>`<a target="_blank" rel="noopener" href="${esc(s.url)}">${esc(s.label)} ↗<small>FRED / ICE 原站</small></a>`).join('');
 const failures=market.fetches.filter(f=>!f.ok);
 $('status').className='notice'+(failures.length?' warn':'');
 $('status').innerHTML=`最后抓取 ${esc(market.fetched_at)} · ${Object.keys(market.series).length}条序列 · ${failures.length?`${failures.length}组来源未成功更新，缓存保留原日期`:'市场来源获取成功'}。日频、第三方行情与研究快照分别标注。`;
}
function renderSelect(){
 const old=$('seriesSelect').value;
 const preferred=['UST30','UST10','UST20','UST2','UST5','UST30_2','UST30_10','DFII30','DFII10','ACMTP10','BAMLC0A0CM','BAMLH0A0HYM2','BAMLH0A3HYC','OWL'];
 const ids=[...new Set([...preferred,...Object.keys(market.series)])].filter(k=>market.series[k]);
 $('seriesSelect').innerHTML=ids.map(k=>`<option value="${esc(k)}">${esc(market.series[k].label)}${k.startsWith("DGS")?" / FRED副源":""} (${esc(market.series[k].unit)})</option>`).join('');
 if(ids.includes(old))$('seriesSelect').value=old;
}
function renderChart(){
 const s=market.series[$('seriesSelect').value];if(!s)return;
 const n=Number($('rangeSelect').value);const pts=n?s.history.slice(-n):s.history;
 $('chartLabel').innerHTML=`<b>${esc(s.label)}</b><strong>${num(s.value,s.unit==='bp'?0:2)} ${esc(s.unit)}</strong>${status(s)}`;
 if(pts.length<2){$('chart').innerHTML='<p>尚无足够历史观测绘图。</p>';return;}
 const W=1100,H=300,p={l:60,r:25,t:25,b:35};
 const vals=pts.map(v=>v[1]);let lo=Math.min(...vals),hi=Math.max(...vals);const pad=(hi-lo||1)*.12;lo-=pad;hi+=pad;
 const x=i=>p.l+i/(pts.length-1)*(W-p.l-p.r), y=v=>H-p.b-(v-lo)/(hi-lo)*(H-p.t-p.b);
 const line=pts.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(2)},${y(v[1]).toFixed(2)}`).join(' ');
 const grid=Array.from({length:5},(_,i)=>{const v=lo+(hi-lo)*i/4;return `<line x1="${p.l}" x2="${W-p.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e6ebe6"/><text x="${p.l-10}" y="${y(v)+4}" text-anchor="end" fill="#72828b" font-size="11">${num(v,s.unit==='bp'?0:2)}</text>`;}).join('');
 const labels=[0,Math.floor(pts.length/2),pts.length-1].map(i=>`<text x="${x(i)}" y="${H-5}" text-anchor="${i===0?'start':i===pts.length-1?'end':'middle'}" fill="#72828b" font-size="11">${esc(pts[i][0])}</text>`).join('');
 $('chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.label)}历史走势"><title>${esc(s.label)}，${esc(pts[0][0])}至${esc(pts.at(-1)[0])}</title>${grid}<path d="${line} L${x(pts.length-1)},${H-p.b} L${p.l},${H-p.b} Z" fill="#177b75" opacity=".07"/><path d="${line}" fill="none" stroke="#177b75" stroke-width="2.5"/>${pts.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v[1])}" r="4" fill="transparent"><title>${esc(v[0])}: ${num(v[1])} ${esc(s.unit)}</title></circle>`).join('')}${labels}</svg>`;
 $('chartNote').innerHTML=`观测日 ${esc(s.observed_at)}${s.quote_time?' / 行情时点 '+esc(s.quote_time):''} · <a target="_blank" rel="noopener" href="${esc(s.source_url)}">${esc(s.provider)} ↗</a><br>${esc(s.note)} · 不填补缺失值；横轴按有效观测等距。`;
}
function renderMarket(){
 const family=$('family').value;
 const list=Object.values(market.series).filter(s=>family==='all'||(family==='stock'?s.unit==='USD':family==='credit'?s.id.startsWith('BAML')||s.id==='BB_BBB':s.unit!=='USD'&&!s.id.startsWith('BAML')&&s.id!=='BB_BBB'));
 $('marketTable').innerHTML=table(['指标','最新值','5观测变化','20观测变化','观测日期','状态 / 来源'],list.map(s=>[`${esc(s.label)}<small>${esc(s.id)} / ${esc(s.frequency)}</small>`,`<b class="num">${num(s.value,s.unit==='bp'?1:2)} ${esc(s.unit)}</b>`,signed(s.change_5obs,s.unit==='USD'?'%':'bp'),signed(s.change_20obs,s.unit==='USD'?'%':'bp'),esc(s.observed_at),`${status(s)}<small><a target="_blank" href="${esc(s.source_url)}" rel="noopener">${esc(s.provider)}</a></small>`]));
}
function renderStatic(){
 $('cashTable').innerHTML='<p class="callout">单名现券报价表保留在本地研究版。公开版保留研究方法、融资情景及来源索引。</p>';
 $('cdsTable').innerHTML='<p class="callout">CDS报价表保留在本地研究版；需通过授权行情核验报价日期、买卖差与成交深度。</p>';
 $('oracleCards').innerHTML=[['经营现金流','23.103','USD bn'],['现金capex','28.499','USD bn'],['客户预付款融资成分','11.363','USD bn · 包含在CFO内'],['CFO减预付款减capex','−16.759','USD bn · 本研究资金桥']].map(r=>card(...r)).join('');
 $('oracleSource').href=sources.OracleQ1.url;
 $('planTable').innerHTML=table(['主体 / 类型','资料日期 / 期间','金额 / 状态','下次复核什么'],research.plans.map(p=>[`${esc(p.entity)}<small>${esc(p.type)}</small>`,`${esc(p.date)}<small>${esc(p.window)}</small>`,`<b>${esc(p.amount)}</b><small>${esc(p.status)}</small>`,`${esc(p.next)}<small>${source(p.source,p.source)}</small>`]));
 const terms=[['租金起算','shell交付即起租，还是接电/验收后起租？利息与租金之间的空窗由谁承担？'],['担保与残值','担保金额、期限、触发和上限；残值保证不是无条件保全部债。'],['转让与终止','允许转给谁？原租户是否继续负责？终止赔偿、不可抗力和债权人同意权。'],['完工与电力','施工超支、进度、接电成本和许可风险的承担；获批MW不是已可用MW。'],['可借比例与摊还','LTC/LTV、现金扫付、利息储备、DSCR；票面价差之外的融资收紧。'],['融资期限','首赎、WAL、ARD、法定到期、balloon余额分别记录；避免把首赎当必然还本日。']];
 $('terms').innerHTML=terms.map(([h,p])=>`<article><h3>${h}</h3><p>${p}</p></article>`).join('');
 $('owlCards').innerHTML=research.owl.metrics.map(([h,v,u])=>card(h,num(v,1),`${esc(u)} · 2026-06-30`)).join('');
 $('bdcTable').innerHTML=table(['基金','利息覆盖','非应计 / %','净杠杆'],research.owl.lagged_bdc.rows.map(([a,b,c,d])=>[a,num(b,1)+'×',num(c,1),num(d,2)+'×']));
 $('signalTable').innerHTML=table(['观察组','跟踪什么','复核阈值（非回测）','数据可用性','含义与限制'],research.indicators.map(r=>r.map(esc)));
 $('sourceList').innerHTML=Object.entries(sources).map(([k,v])=>`<a target="_blank" rel="noopener" href="${esc(v.url)}">${esc(k)} · ${esc(v.title)}<small>${esc(v.type)}</small></a>`).join('');
}
function renderScenario(){
 const key=$('scenarioSelect').value;const i=research.scenarios.findIndex(s=>s.id===key);const s=research.scenarios[i];
 $('scenarioDesc').textContent=s.description+' 研究窗口 '+research.window.join('—')+'。';
 const range=a=>a.map(n=>num(n,0)).join('–');
 $('scenarioCards').innerHTML=[card('拟毛融资需求',num(s.gross_bn,0),'USD bn · 研究工作情景'),card('其中证券形式',num(s.securities_bn,0),'USD bn · 含部分144A私募证券'),card('实际完成额演示',range(s.realized_bn),'USD bn · 乘假设完成率'),card('净增量演示',range(s.net_bn),'USD bn · 再扣假设偿还/置换')].join('');
 $('fundingBars').innerHTML=research.channels.map(c=>`<div class="bar-row"><div class="bar-label"><span>${esc(c.name)}</span><b>${c.values[i]}</b></div><div class="bar-track"><div style="width:${c.values[i]/600*100}%"></div></div><small class="muted">${esc(c.basis)}</small></div>`).join('');
 $('curveTable').innerHTML=table(['期限','国债区间 / %'],research.tenors.map((t,j)=>[t+'年',s.treasury[j].map(n=>num(n,2)).join('–')]));
 const rows=[];research.credit.forEach(c=>c.tenors.forEach((t,j)=>{const rates=s.treasury[research.tenors.indexOf(t)],sp=c.spreads[key][j];rows.push([esc(c.name),t+'年',sp.join('–')+'bp',`${num(rates[0]+sp[0]/100)}–${num(rates[1]+sp[1]/100)}%`,esc(c.metric)]);}));
 $('yieldTable').innerHTML=table(['类型','期限 / WAL','信用利差假设','近似收益率','使用限制'],rows);
}
function renderDscr(){
 const rate=Number($('loanRate').value),dscr=8/(65*rate/100+2),max=Math.max(0,(8/1.2-2)/(rate/100));
 $('loanRateLabel').textContent=num(rate,2)+'%';
 $('dscrResult').innerHTML=`<div><small>偿债覆盖 DSCR</small><strong class="${dscr<1.2?'bad':'good'}">${num(dscr,2)}×</strong><small>${dscr<1.2?'低于示例1.2×门槛':'超过示例1.2×门槛'}</small></div><div><small>该门槛下最高债务</small><strong>${num(max,2)}</strong><small>与原债65相比 ${signed(max-65,'')}</small></div>`;
}
function renderAlerts(){
 const rules=[['UST30',40,'长端利率'],['OWL',-15,'OWL市场信号']];
 $('alerts').innerHTML=rules.map(([id,t,label])=>{const s=market.series[id];const valid=s&&!s.stale&&s.fetch_status==='ok'&&s.change_20obs!=null;const triggered=valid&&(t<0?s.change_20obs<=t:s.change_20obs>=t);return card(label,!valid?'待复核':triggered?'达到复核阈值':'本项未达阈值',valid?`20观测变化 ${signed(s.change_20obs,id==='OWL'?'%':'bp')}<br>阈值 ${t}${id==='OWL'?'%':'bp'}；不代表整体安全`:'数据缺失、陈旧或本次更新失败；不作安全判断',`<span class="pill ${!valid||triggered?'warn':'gray'}">${!valid?'数据待补':triggered?'需交叉确认':'单指标'}</span>`);}).join('');
}
function renderQuality(){
 $('quality').innerHTML=table(['来源批次','本次获取','时间','错误 / 序列数'],market.fetches.map(f=>[esc(f.source),f.ok?'<span class="pill">成功</span>':'<span class="pill warn">失败</span>',esc(f.checked_at),f.ok?esc(f.series_count):esc(f.error)]));
}
function renderAll(){for(const s of Object.values(market.series)){const age=(Date.now()-Date.parse(s.observed_at+"T00:00:00Z"))/86400000;s.stale=age>s.stale_calendar_days;}renderCards();renderSelect();renderChart();renderMarket();renderQuality();renderAlerts();}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===b.dataset.tab));}));
$('seriesSelect').addEventListener('change',renderChart);$('rangeSelect').addEventListener('change',renderChart);$('family').addEventListener('change',renderMarket);$('scenarioSelect').addEventListener('change',renderScenario);$('loanRate').addEventListener('input',renderDscr);
$('refresh').addEventListener('click',async()=>{
 const btn=$('refresh');btn.disabled=true;btn.textContent='正在读取…';
 try{
  const response=await fetch('data/snapshot.json?ts='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const candidate=await response.json();
  if(!candidate.series||!Array.isArray(candidate.fetches))throw Error('数据格式不完整');
  market=candidate;renderAll();
  $('status').innerHTML+=' 已读取云端快照；如需重新抓取数据，请由所有者运行“后台更新”。';
 }catch(e){$('status').className='notice warn';$('status').textContent='读取失败：'+e.message+'。页面保留上次成功载入的快照。';}
 finally{btn.disabled=false;btn.textContent='读取最新快照';}
});
renderStatic();renderAll();renderScenario();renderDscr();
