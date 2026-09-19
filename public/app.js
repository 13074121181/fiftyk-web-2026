const $=s=>document.querySelector(s);let ws=null,me=null,state=null,sortMode='deal',selected=new Set(),tripleMode='ordinary',pendingConnectAction=null;
const suitText={clubs:'♣',diamonds:'♦',spades:'♠',hearts:'♥',joker:''};
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const point=c=>c.rank===5?5:(c.rank===10||c.rank===13?10:0);
const isRed=c=>c.suit==='hearts'||c.suit==='diamonds';
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),1800)}
function connect(after){if(ws&&ws.readyState===1){after?.();return}pendingConnectAction=after;ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);ws.onopen=()=>{$('#status').textContent='已连接';const saved=localStorage.getItem('fiftykPlayerId');if(saved)send({type:'resume',playerId:saved});else{const a=pendingConnectAction;pendingConnectAction=null;a?.()}};ws.onclose=()=>$('#status').textContent='连接断开';ws.onmessage=e=>handle(JSON.parse(e.data));}
function send(x){if(ws?.readyState===1)ws.send(JSON.stringify(x));else toast('正在连接服务器……')}
function handle(m){
 if(m.type==='resume_failed'){localStorage.removeItem('fiftykPlayerId');const a=pendingConnectAction;pendingConnectAction=null;a?.();return}
 if(m.type==='error'){toast(m.message||'操作失败');return}
 if(m.type==='resumed'){me=m.playerId;window.me=me;localStorage.setItem('fiftykPlayerId',me);if(m.room){$('#lobby').classList.add('hidden');$('#room').classList.remove('hidden');$('#table').classList.toggle('hidden',!m.game);$('#roomCode').textContent=m.room.roomCode;renderSeats(m.room.players,m.room.dealerSeat);$('#notice').textContent=m.room.started?'游戏已开始':'等待玩家加入……';}if(m.game){state=m.game;window.state=state;$('#room').classList.add('hidden');$('#table').classList.remove('hidden');renderGame();}return}
 if(m.type==='room'){me=m.me||me;window.me=me;if(me)localStorage.setItem('fiftykPlayerId',me);$('#lobby').classList.add('hidden');$('#room').classList.remove('hidden');$('#table').classList.add('hidden');$('#roomCode').textContent=m.roomCode;renderSeats(m.players,m.dealerSeat);$('#notice').textContent=m.started?'游戏已开始':'等待玩家加入……';}
 if(m.type==='started'||m.type==='game'){if(m.game){state=m.game;window.state=state;$('#room').classList.add('hidden');$('#table').classList.remove('hidden');renderGame();}}
}
function renderSeats(ps,dealerSeat){$('#seats').innerHTML=[0,1,2,3].map(s=>{const p=ps.find(x=>x.seat===s);const team=p?.team||((s%2===0)?'A':'B');return `<div class="room-seat ${p?'':'empty'} team${team}"><div class="seat-avatar">${p?(p.bot?'AI':esc((p.name||'玩')[0])):'+'}</div><div class="seat-name">${p?esc(p.name):'等待玩家'}</div><div class="seat-meta">${p?(p.bot?'机器人 · ':'真人 · ')+team+'队'+(p.id===me?' · 我':''):'空位 · '+team+'队'}</div>${s===dealerSeat?'<span class="dealer-badge">庄</span>':''}</div>`}).join('')}
function seatInfo(sel,p,dealer=false){if(!p)return;$(sel).innerHTML=`${dealer?'<span class="dealer-badge">庄</span>':''}<b>${esc(p.name)}</b><small>${p.bot?'机器人':'真人'} · ${p.team}队 · ${p.handCount}张 · ${p.score}分${p.connected?'':' · 离线'}</small>`}
function renderGame(){const g=state,mine=g.players.find(p=>p.id===me);$('#handNo').textContent=g.handNo;$('#handNoSide').textContent=g.handNo;$('#myScore').textContent=mine?.score??0;const turn=g.players.find(p=>p.seat===g.turnSeat);$('#turnName').textContent=turn?.name||'—';const top=g.players.find(p=>p.seat===((mine?.seat??0)+2)%4),left=g.players.find(p=>p.seat===((mine?.seat??0)+3)%4),right=g.players.find(p=>p.seat===((mine?.seat??0)+1)%4);seatInfo('#seatTop',top,top?.seat===g.dealerSeat);seatInfo('#seatLeft',left,left?.seat===g.dealerSeat);seatInfo('#seatRight',right,right?.seat===g.dealerSeat);seatInfo('#seatBottom',mine,mine?.seat===g.dealerSeat);$('#turnBanner').classList.toggle('active',mine?.seat===g.turnSeat);$('#lastPlay').innerHTML=g.trick?`<strong>${esc(g.trick.label)}</strong><div class="played">${g.trick.cards.map(cardHtml).join('')}</div>`:`<div class="empty-orbit">♠</div><strong>等待出牌</strong><small>首轮由庄家先出</small>`;renderHand();renderRankings(g);const myTurn=mine?.seat===g.turnSeat&&g.phase==='playing';$('#pass').disabled=!myTurn||!g.trick;$('#play').disabled=!myTurn;['sortPoint','sortRank','move50','tripleMode'].forEach(id=>$('#'+id).disabled=g.phase!=='playing');if(g.phase==='settled')showResult();else{$('#result').classList.add('hidden');$('#next').classList.add('hidden')}}
function renderRankings(g){const done=g.players.filter(p=>p.finishRank!=null).sort((a,b)=>a.finishRank-b.finishRank);$('#rankList').innerHTML=done.length?done.map(p=>`<div class="rank ${p.finishRank===1?'first':''}"><span class="badge">${p.finishRank}</span><span>${esc(p.name)}</span><span>${p.handCount===0?'出完':''}</span></div>`).join(''):'<div class="rank"><span class="badge">·</span><span>等待有人出完</span></div>'}
function renderHand(){let cards=[...state.hand];if(sortMode==='point')cards.sort((a,b)=>point(a)-point(b)||a.rank-b.rank||String(a.suitLabel).localeCompare(String(b.suitLabel)));if(sortMode==='rank')cards.sort((a,b)=>a.rank-b.rank||String(a.suitLabel).localeCompare(String(b.suitLabel)));if(sortMode==='50')cards=moveFifty(cards);$('#hand').innerHTML=cards.map(c=>`<div class="card ${isRed(c)?'red':''} ${selected.has(c.id)?'selected':''}" data-id="${c.id}" onclick="toggleCard('${c.id}')">${c.label}<br><span>${c.suitLabel||''}</span></div>`).join('')}
function moveFifty(cards){const f=[],rest=[];for(const c of cards)if(c.rank===5||c.rank===10||c.rank===13)f.push(c);else rest.push(c);return rest.concat(f)}
function toggleCard(id){if(state?.phase!=='playing')return;selected.has(id)?selected.delete(id):selected.add(id);renderHand()}window.toggleCard=toggleCard;
function cardHtml(c){return `<span class="mini ${isRed(c)?'red':''}">${esc(c.label)}<small>${c.suitLabel||''}</small></span>`}
function showResult(){const g=state,r=g.result;if(!r)return;$('#result').classList.remove('hidden');$('#result').innerHTML=`<h3>本把结算</h3><div>${r.ranking.map(x=>`<div>${x.rank}名 · ${esc(x.name)} · ${x.score}分</div>`).join('')}</div><div style="margin-top:10px;font-weight:900">我方 ${r.teamScores.A}　对方 ${r.teamScores.B}</div>`;$('#next').classList.remove('hidden');$('#next').disabled=false}
function openModal(kind){const data={settings:['设置','音效、动画和桌面显示设置将在正式版这里集中管理。'],help:['游戏帮助','选择手牌后点击出牌；如果无法压过上一手，可以点击不要。整理按钮可按点数或牌序整理，五十K按钮会把相关牌移到手牌末尾。'],chat:['聊天','朋友局聊天面板预留。正式联机版可在这里发送快捷语和文字。'],records:['最近战绩',((state?.history||[]).slice(-10).reverse().map(h=>`<div class="record-row"><span>第 ${h.handNo} 把</span><b>A ${h.teamScores?.A??0} · B ${h.teamScores?.B??0}</b></div>`).join('')||'<p class="modal-copy">暂无历史记录</p>')]};const d=data[k]||data.help;$('#modalContent').innerHTML=`<div class="modal-title">${d[0]}</div>${Array.isArray(d[1])?d[1].join(''): `<div class="modal-copy">${d[1]}</div>`}`;$('#modal').classList.remove('hidden')}
$('#create').onclick=()=>connect(()=>send({type:'create',name:$('#name').value.trim()||'玩家1'}));
$('#join').onclick=()=>connect(()=>send({type:'join',name:$('#name').value.trim()||'玩家',code:$('#code').value.trim()}));
$('#start').onclick=()=>send({type:'start'});
$('#pass').onclick=()=>send({type:'pass'});
$('#play').onclick=()=>{const cards=[...selected];if(!cards.length)return toast('先选择要出的牌');send({type:'play',cardIds:cards,tripleMode});selected.clear()};
$('#tripleMode').onclick=()=>{tripleMode=tripleMode==='ordinary'?'bomb':'ordinary';$('#tripleMode').textContent=tripleMode==='ordinary'?'三张：普通':'三张：三炸';$('#tripleSwitch').checked=tripleMode==='bomb'};
$('#tripleSwitch').onchange=e=>{tripleMode=e.target.checked?'bomb':'ordinary';$('#tripleMode').textContent=tripleMode==='ordinary'?'三张：普通':'三张：三炸'};
$('#next').onclick=()=>send({type:'nextHand'});$('#sortPoint').onclick=()=>{sortMode='point';renderHand()};$('#sortRank').onclick=()=>{sortMode='rank';renderHand()};$('#move50').onclick=()=>{sortMode='50';renderHand()};
$('#copyCode').onclick=()=>copyRoom();$('#copyCodeTop').onclick=()=>copyRoom();function copyRoom(){const c=$('#roomCode').textContent;if(navigator.clipboard)navigator.clipboard.writeText(c).then(()=>toast('房间号已复制'));else toast('房间号：'+c)}
document.querySelectorAll('[data-modal]').forEach(b=>b.onclick=()=>openModal(b.dataset.modal));$('#modalClose').onclick=()=>$('#modal').classList.add('hidden');document.querySelector('.modal-backdrop').onclick=()=>$('#modal').classList.add('hidden');$('#exitBtn').onclick=()=>{if(confirm('退出当前页面？'))location.reload()};

/* Phase 7 · 动效与音效层 */
let previousTurn=null, previousTrickKey='', previousPhase=null, previousFinishKey='', audioCtx=null;
function ensureAudio(){
  if(audioCtx) return audioCtx;
  try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){audioCtx=null}
  return audioCtx;
}
function tone(freq=520,duration=.07,type='sine',gain=.035){
  const ac=ensureAudio(); if(!ac) return;
  if(ac.state==='suspended') ac.resume();
  const o=ac.createOscillator(), g=ac.createGain(); o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(gain,ac.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+duration);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+duration);
}
function sfx(kind){
  if(kind==='select') tone(620,.045,'triangle',.022);
  else if(kind==='click') tone(420,.045,'square',.014);
  else if(kind==='play'){tone(560,.06,'triangle',.028);setTimeout(()=>tone(760,.09,'triangle',.022),45)}
  else if(kind==='pass') tone(240,.09,'sine',.018);
  else if(kind==='fifty'){tone(740,.08,'triangle',.03);setTimeout(()=>tone(980,.16,'triangle',.026),70)}
  else if(kind==='bomb'){tone(160,.11,'sawtooth',.028);setTimeout(()=>tone(90,.18,'sawtooth',.022),75)}
  else if(kind==='settle'){tone(520,.08,'triangle',.025);setTimeout(()=>tone(680,.12,'triangle',.022),90);setTimeout(()=>tone(860,.18,'triangle',.02),190)}
  else if(kind==='finish'){tone(700,.07,'triangle',.025);setTimeout(()=>tone(900,.11,'triangle',.025),70)}
}
function fx(text,sub=''){
  const el=$('#fxToast'); if(!el)return;
  el.innerHTML=esc(text)+(sub?`<small style="display:block;margin-top:7px;font-size:13px;letter-spacing:1px;color:#fff9">${esc(sub)}</small>`:'');
  el.className='fx-toast'; void el.offsetWidth; el.classList.add('show');
}
function pulseTable(kind){const f=document.querySelector('.felt');if(!f)return;f.classList.remove('shake','flash');void f.offsetWidth;if(kind==='bomb'){f.classList.add('shake','flash')}else f.classList.add('flash');}
function animateNewCards(){document.querySelectorAll('#hand .card').forEach((el,i)=>{el.classList.remove('deal-in');el.style.setProperty('--delay',Math.min(i,18)*22+'ms');void el.offsetWidth;el.classList.add('deal-in')})}
function animatePile(){const el=$('#lastPlay');if(!el)return;el.classList.remove('has-new');void el.offsetWidth;el.classList.add('has-new');el.querySelectorAll('.mini').forEach((x,i)=>{x.style.animationDelay=(i*35)+'ms'})}

function seatSelectorForPlayer(g, seat){
  const mine=g?.players?.find(p=>p.id===window.me); if(!mine) return '#seatBottom';
  const diff=(seat-mine.seat+4)%4;
  return diff===0?'#seatBottom':diff===1?'#seatRight':diff===2?'#seatTop':'#seatLeft';
}
function flyCard(fromEl, toEl, card, i, total, face=true){
  const layer=$('#flyLayer'); if(!layer||!fromEl||!toEl)return;
  const a=fromEl.getBoundingClientRect(), b=toEl.getBoundingClientRect();
  const x=a.left+a.width/2, y=a.top+a.height/2, tx=b.left+b.width/2, ty=b.top+b.height/2;
  const el=document.createElement('div'); el.className='fly-card '+(face?'face':'back');
  if(face){el.innerHTML=`<b>${esc(card?.label||'')}</b><small>${esc(card?.suitLabel||'')}</small>`;if(card&&isRed(card))el.classList.add('red')}
  const fan=(i-(total-1)/2)*9;
  el.style.left=x+'px';el.style.top=y+'px';el.style.setProperty('--tx',(tx-x+fan)+'px');el.style.setProperty('--ty',(ty-y)+'px');el.style.setProperty('--rot',((i-(total-1)/2)*3)+'deg');el.style.setProperty('--delay',(i*42)+'ms');
  layer.appendChild(el);setTimeout(()=>el.remove(),760+i*42);
}
function animateCardFlight(g,trick){
  const target=$('#lastPlay'); if(!target||!trick)return;
  const from=$(seatSelectorForPlayer(g,trick.seat)); if(!from)return;
  trick.cards.slice(0,12).forEach((c,i)=>flyCard(from,target,c,i,Math.min(trick.cards.length,12),trick.playerId===window.me));
  const ring=$('#impactRing'); if(ring){ring.className='impact-ring';void ring.offsetWidth;ring.classList.add('show');}
}
function spawnParticles(kind='normal',count=16){
  const layer=$('#particleLayer');if(!layer)return;
  const chars=kind==='fifty'?['✦','◆','K','5']:kind==='bomb'?['✦','•','◆']:['•','✦'];
  for(let i=0;i<count;i++){
    const el=document.createElement('i');el.className='particle '+kind;el.textContent=chars[i%chars.length];
    el.style.left=(50+(Math.random()*26-13))+'%';el.style.top=(47+(Math.random()*12-6))+'%';
    el.style.setProperty('--dx',(Math.random()*220-110)+'px');el.style.setProperty('--dy',(-70-Math.random()*170)+'px');el.style.setProperty('--delay',(Math.random()*180)+'ms');
    layer.appendChild(el);setTimeout(()=>el.remove(),1200);
  }
}
function finishFx(g){
  const key=g.players.filter(p=>p.finishRank!=null).sort((a,b)=>a.finishRank-b.finishRank).map(p=>p.id+':'+p.finishRank).join('|');
  if(key===previousFinishKey)return;
  const fresh=g.players.filter(p=>p.finishRank!=null).sort((a,b)=>a.finishRank-b.finishRank).find(p=>!(previousFinishKey||'').includes(p.id+':'));
  if(fresh){const sel=seatSelectorForPlayer(g,fresh.seat),el=$(sel);if(el){el.classList.remove('finish-pop');void el.offsetWidth;el.classList.add('finish-pop')};sfx('finish');fx(fresh.finishRank===1?'第一名！':'出完牌',fresh.name);spawnParticles(fresh.finishRank===1?'fifty':'normal',fresh.finishRank===1?26:12)}
  previousFinishKey=key;
}
function settlementFx(g){
  const ring=$('#impactRing');if(ring){ring.className='impact-ring settle-ring';void ring.offsetWidth;ring.classList.add('show')}
  spawnParticles('settle',34);sfx('settle');
  setTimeout(()=>{document.querySelector('.settlement-card')?.classList.add('show-in')},40);
}
function updateTurnFx(g){
  const mine=g?.players?.find(p=>p.id===window.me);const t=g?.turnSeat;
  document.querySelectorAll('.player-card').forEach(e=>e.classList.remove('is-turn'));
  const map={top:'#seatTop',left:'#seatLeft',right:'#seatRight',bottom:'#seatBottom'};
  const seats=[...document.querySelectorAll('.player-card')];
  const target=g?.players?.find(p=>p.seat===t); if(target){
    const mySeat=mine?.seat??0, diff=(target.seat-mySeat+4)%4;
    const sel=diff===0?map.bottom:diff===1?map.right:diff===2?map.top:map.left;
    if(sel)$(sel)?.classList.add('is-turn');
  }
  if(previousTurn!==null && previousTurn!==t){sfx('click')}
  previousTurn=t;
}
function classifyFx(trick){
  const k=trick?.kind||''; const label=trick?.label||'';
  if(label.includes('五十K')||k==='fiftyk')return 'fifty';
  if(String(k).includes('bomb')||label.includes('炸'))return 'bomb';
  return 'play';
}
const _renderGame=renderGame;
renderGame=function(){
  const oldTrick=previousTrickKey, oldPhase=previousPhase;
  _renderGame();
  const g=state; if(!g)return;
  updateTurnFx(g);
  const key=g.trick?`${g.trick.playerId}:${g.trick.cards.map(c=>c.id).join(',')}`:'';
  if(key && key!==oldTrick){
    animateCardFlight(g,g.trick);
    animatePile(); const fxKind=classifyFx(g.trick); sfx(fxKind); pulseTable(fxKind);
    if(fxKind==='bomb'||fxKind==='fifty')spawnParticles(fxKind,fxKind==='fifty'?30:22);
    if(fxKind==='fifty')fx('五十K','漂亮的一手');
    else if(fxKind==='bomb')fx('炸弹！');
    else if(oldTrick) fx('出牌');
  }
  finishFx(g);
  if(oldPhase!=='settled' && g.phase==='settled'){fx('本把结算','积分已累计');settlementFx(g)}
  previousTrickKey=key;previousPhase=g.phase;
  if(oldPhase!=='playing'&&g.phase==='playing'){previousFinishKey='';setTimeout(animateNewCards,70)}
};
const _toggleCard=toggleCard;
toggleCard=function(id){const before=selected.has(id);_toggleCard(id);if(!before)sfx('select')};window.toggleCard=toggleCard;
const _send=send;
send=function(x){if(x?.type==='play')sfx('play');else if(x?.type==='pass')sfx('pass');else if(x?.type==='start'||x?.type==='nextHand')sfx('click');return _send(x)};
document.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('#play,#pass,#next'))sfx('click')},{passive:true});
