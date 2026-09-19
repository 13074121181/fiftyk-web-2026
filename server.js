import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createDeck, shuffle, rankName, cardPointValue } from './src/cards.ts';
import { classify, classifyBombOrSpecial, canBeat } from './src/patterns.ts';

const PORT = process.env.PORT || 3000;
const publicDir = join(process.cwd(), 'public');
const rooms = new Map();
const RANK_ORDER = [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17];
const SUIT_ORDER = { clubs: 0, diamonds: 1, spades: 2, hearts: 3, joker: 4 };

function send(ws, payload) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload)); }
function broadcast(room, payload) { for (const p of room.players.values()) send(p.ws, payload); }
function makeCode() { let code; do code = String(Math.floor(100000 + Math.random() * 900000)); while (rooms.has(code)); return code; }
function findRoom(playerId) { for (const room of rooms.values()) if (room.players.has(playerId)) return room; }
function teamForSeat(seat) { return seat % 2 === 0 ? 'A' : 'B'; }
function playerPublic(p) { return { id:p.id, name:p.name, seat:p.seat, bot:p.bot, team:p.team, connected:!!p.ws }; }
function roomSnapshot(room, me) {
  return { roomCode:room.code, hostId:room.hostId, started:room.started, dealerSeat:room.dealerSeat, players:[...room.players.values()].map(playerPublic), me };
}
function visibleCard(c) { return { ...c, label:rankName(c.rank), suitLabel:{clubs:'♣',diamonds:'♦',spades:'♠',hearts:'♥',joker:''}[c.suit] }; }
function publicGame(room, me) {
  const g=room.game; if(!g) return null;
  const mep=room.players.get(me);
  const players=[...room.players.values()].sort((a,b)=>a.seat-b.seat).map(p=>({id:p.id,name:p.name,seat:p.seat,team:p.team,bot:p.bot,handCount:p.hand.length,finishRank:p.finishRank,connected:!!p.ws,score:g.scores[p.id]||0,capturedScore:g.captured[p.id]||0}));
  return { handNo:g.handNo, dealerSeat:room.dealerSeat, leaderSeat:g.leaderSeat, turnSeat:g.turnSeat, trick:g.trick?{playerId:g.trick.playerId,seat:g.trick.seat,kind:g.trick.pattern.kind,cards:g.trick.cards.map(visibleCard),label:patternLabel(g.trick.pattern)}:null, passCount:g.passCount, players, hand:mep?.hand.map(visibleCard)||[], selected:[], phase:g.phase, result:g.result, scores:g.scores, teamScores:g.teamScores, history:room.history.slice(-30) };
}
function patternLabel(p){ if(!p) return ''; if(p.kind==='single')return '单牌'; if(p.kind==='pair')return '对子'; if(p.kind==='triple')return '三张'; if(p.kind==='straight')return `${p.length}连顺`; if(p.kind==='consecutivePairs')return `${p.pairCount}连对`; if(p.kind==='fiftyK')return p.real?'真五十K':'假五十K'; if(p.kind==='bomb')return `${p.bombSize}张炸弹`; return p.kind; }
function dealGame(room){
  const deck=shuffle(createDeck());
  const hands=[[],[],[],[]]; deck.forEach((c,i)=>hands[i%4].push(c));
  for(const p of room.players.values()) p.hand=hands[p.seat];
  const scores={}; const captured={}; for(const p of room.players.values()){ scores[p.id]=room.cumulativeScores[p.id]||0; captured[p.id]=0; p.finishRank=undefined; }
  room.game={handNo:(room.game?.handNo||0)+1,leaderSeat:room.dealerSeat,turnSeat:room.dealerSeat,trick:null,passCount:0,phase:'playing',result:null,scores,captured,teamScores:{A:room.teamScores.A||0,B:room.teamScores.B||0}};
}
function ensurePlayers(room){
  for(let seat=0;seat<4;seat++) if(![...room.players.values()].some(p=>p.seat===seat)){
    const id=`bot-${room.code}-${seat}-${Date.now()}`; room.players.set(id,{id,name:`机器人${seat+1}`,seat,team:teamForSeat(seat),bot:true,ws:null,hand:[],finishRank:undefined});
  }
}
function nextSeat(room, from){ for(let i=1;i<=4;i++){ const s=(from+i)%4; const p=[...room.players.values()].find(x=>x.seat===s); if(p && p.hand.length>0) return s; } return from; }
function getBySeat(room, seat){ return [...room.players.values()].find(p=>p.seat===seat); }
function handIsFinished(room){
  const ps=[...room.players.values()];
  return ['A','B'].some(team=>ps.filter(p=>p.team===team && p.finishRank!=null).length===2);
}
function capturePlay(room, player, cards){ const pts=cards.reduce((s,c)=>s+cardPointValue(c),0); room.game.captured[player.id]=(room.game.captured[player.id]||0)+pts; }
function finishPlayer(room,p){ if(p.hand.length===0 && p.finishRank==null){ const n=[...room.players.values()].filter(x=>x.finishRank!=null).length+1; p.finishRank=n; } }
function settle(room){
  const g=room.game, ps=[...room.players.values()];
  const teamCaptured={A:0,B:0}; for(const p of ps) teamCaptured[p.team]+=g.captured[p.id]||0;
  // The captured scoring cards accumulate for the team; the detailed individual score is shown separately.
  g.teamScores={A:(room.teamScores.A||0)+teamCaptured.A,B:(room.teamScores.B||0)+teamCaptured.B};
  // Remaining scoring cards transfer to a team that has both players finished.
  for(const team of ['A','B']){
    const own=ps.filter(p=>p.team===team); const other=team==='A'?'B':'A';
    if(own.every(p=>p.hand.length===0)){
      const remain=ps.filter(p=>p.team===other).reduce((s,p)=>s+p.hand.reduce((a,c)=>a+cardPointValue(c),0),0);
      g.teamScores[team]+=remain;
    }
  }
  // Keep the confirmed -40 special case for two teammates left with cards.
  const remaining=ps.filter(p=>p.hand.length>0);
  if(remaining.length===2 && remaining[0].team===remaining[1].team){
    const loser=remaining[0].team, winner=loser==='A'?'B':'A';
    const pts=remaining.reduce((s,p)=>s+p.hand.reduce((a,c)=>a+cardPointValue(c),0),0);
    g.teamScores[winner]+=pts; g.teamScores[loser]-=pts+40;
  }
  // Player-level card score: catcher gets +points, other three get -points.
  for(const p of ps){
    let delta=0; for(const q of ps){ const pts=g.captured[q.id]||0; delta += q.id===p.id?pts:-pts; }
    g.scores[p.id]=(g.scores[p.id]||0)+delta;
  }
  room.teamScores=g.teamScores;
  for(const p of ps) room.cumulativeScores[p.id]=g.scores[p.id];
  const ranking=ps.sort((a,b)=>(a.finishRank??99)-(b.finishRank??99)).map(p=>({name:p.name,seat:p.seat,rank:p.finishRank,score:g.scores[p.id]}));
  g.result={ranking,teamScores:g.teamScores,captured:g.captured}; g.phase='settled';
  room.history.push({time:new Date().toISOString(),handNo:g.handNo,scores:{...g.scores},teamScores:{...g.teamScores}}); room.history=room.history.slice(-30);
}
function chooseBotPlay(room,p){
  if(!p || p.hand.length===0) return null;
  const sorted=[...p.hand].sort((a,b)=>a.rank-b.rank||SUIT_ORDER[a.suit]-SUIT_ORDER[b.suit]);
  if(!room.game.trick) return [sorted[0]];
  const prev=room.game.trick.pattern;
  // Try same-size simple patterns first, then any bomb/special.
  const candidates=[];
  const add=(cards,mode='ordinary')=>{ const pat=mode==='bomb'?classifyBombOrSpecial(cards):classify(cards,mode); if(pat && canBeat(prev,pat)) candidates.push(cards); };
  if(prev.kind==='single') for(const c of sorted) add([c]);
  else if(prev.kind==='pair'){
    const by=new Map(); for(const c of sorted){ if(!by.has(c.rank))by.set(c.rank,[]); by.get(c.rank).push(c); }
    for(const [r,cs] of by) if(cs.length>=2)add(cs.slice(0,2));
  } else if(prev.kind==='triple'){
    const by=new Map(); for(const c of sorted){ if(!by.has(c.rank))by.set(c.rank,[]); by.get(c.rank).push(c); }
    for(const cs of by.values()) if(cs.length>=3)add(cs.slice(0,3));
  } else if(prev.kind==='straight'){
    const need=prev.length; const by=new Map(); for(const c of sorted){if(c.rank<15&&!by.has(c.rank))by.set(c.rank,c)}
    const rs=[...by.keys()].sort((a,b)=>a-b); for(let i=0;i<=rs.length-need;i++){const part=rs.slice(i,i+need); if(part.every((r,j)=>j===0||r===part[j-1]+1))add(part.map(r=>by.get(r)));}
  } else if(prev.kind==='consecutivePairs'){
    const need=prev.pairCount, by=new Map(); for(const c of sorted){if(!by.has(c.rank))by.set(c.rank,[]);by.get(c.rank).push(c)}
    const rs=[...by.keys()].filter(r=>r<15).sort((a,b)=>a-b); for(let i=0;i<=rs.length-need;i++){const part=rs.slice(i,i+need);if(part.every((r,j)=>j===0||r===part[j-1]+1)&&part.every(r=>by.get(r).length>=2))add(part.flatMap(r=>by.get(r).slice(0,2)));}
  } else if(prev.kind==='bomb'){
    const by=new Map();for(const c of sorted){if(!by.has(c.rank))by.set(c.rank,[]);by.get(c.rank).push(c)} for(const cs of by.values()) for(let n=Math.min(12,cs.length);n>=3;n--)add(cs.slice(0,n),'bomb');
  }
  // special bombs
  for(const size of [2,3,4]){const jok=sorted.filter(c=>c.suit==='joker');if(jok.length>=size)add(jok.slice(0,size),'bomb');}
  if(candidates.length) return candidates[0];
  // Any bomb if previous is not already too high.
  const by=new Map();for(const c of sorted){if(!by.has(c.rank))by.set(c.rank,[]);by.get(c.rank).push(c)}
  for(const cs of by.values()) if(cs.length>=3){const c=cs.slice(0,3);const pat=classifyBombOrSpecial(c);if(pat&&canBeat(prev,pat))return c;}
  return null;
}
function maybeBot(room){
  if(!room?.game || room.game.phase!=='playing') return;
  const p=getBySeat(room,room.game.turnSeat); if(!p?.bot || p.hand.length===0) return;
  setTimeout(()=>{
    if(room.game?.phase!=='playing' || room.game.turnSeat!==p.seat) return;
    const play=chooseBotPlay(room,p);
    if(play) playCards(room,p,play,'ordinary'); else passTurn(room,p);
  },450);
}
function playCards(room,p,cardIds,tripleMode='ordinary'){
  if(room.game.phase!=='playing'||room.game.turnSeat!==p.seat) return {ok:false,message:'还没轮到你'};
  const ids=new Set(cardIds); if(ids.size!==cardIds.length) return {ok:false,message:'选牌重复'};
  const cards=p.hand.filter(c=>ids.has(c.id)); if(cards.length!==cardIds.length) return {ok:false,message:'你没有这些牌'};
  const pat=cards.length>=2&&cards.every(c=>c.suit==='joker')?classifyBombOrSpecial(cards):classify(cards,tripleMode);
  if(!pat) return {ok:false,message:'牌型不成立'};
  if(room.game.trick && !canBeat(room.game.trick.pattern,pat)) return {ok:false,message:'这手牌压不过上一手'};
  p.hand=p.hand.filter(c=>!ids.has(c.id)); capturePlay(room,p,cards); room.game.trick={playerId:p.id,seat:p.seat,pattern:pat,cards}; room.game.passCount=0; finishPlayer(room,p);
  if(handIsFinished(room)){settle(room);broadcast(room,{type:'game',game:publicGame(room)});return {ok:true};}
  room.game.turnSeat=nextSeat(room,p.seat); broadcast(room,{type:'game',game:publicGame(room)}); maybeBot(room); return {ok:true};
}
function passTurn(room,p){
  if(room.game.phase!=='playing'||room.game.turnSeat!==p.seat)return {ok:false,message:'还没轮到你'};
  if(!room.game.trick)return {ok:false,message:'没有牌可不要'};
  room.game.passCount++;
  if(room.game.passCount>=3){ room.game.leaderSeat=room.game.trick.seat; room.game.turnSeat=room.game.trick.seat; room.game.trick=null; room.game.passCount=0; }
  else room.game.turnSeat=nextSeat(room,p.seat);
  broadcast(room,{type:'game',game:publicGame(room)}); maybeBot(room); return {ok:true};
}

const server=http.createServer(async(req,res)=>{ let path=new URL(req.url,`http://${req.headers.host}`).pathname;if(path==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}));return;}if(path==='/')path='/index.html';const file=join(publicDir,path.replace(/^\/+/,''));try{const data=await readFile(file);const ext=extname(file);const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}});
const wss=new WebSocketServer({server});
wss.on('connection',ws=>{
  let playerId=Math.random().toString(36).slice(2,10);
  let resumed=false;
  ws.on('message',raw=>{let msg;try{msg=JSON.parse(raw.toString())}catch{return}
    if(msg.type==='resume'){
      const rid=String(msg.playerId||'');
      const r=findRoom(rid);
      const rp=r?.players.get(rid);
      if(r && rp){
        playerId=rid; resumed=true; rp.ws=ws;
        send(ws,{type:'resumed',playerId:rid,room:roomSnapshot(r,rid),game:publicGame(r,rid)});
        if(r.game) maybeBot(r);
      } else send(ws,{type:'resume_failed'});
      return;
    }
    if(msg.type==='create'){const code=makeCode();const room={code,hostId:playerId,started:false,dealerSeat:Math.floor(Math.random()*4),players:new Map(),game:null,history:[],cumulativeScores:{},teamScores:{A:0,B:0}};const p={id:playerId,name:String(msg.name||'玩家1').slice(0,12),seat:0,team:'A',bot:false,ws,hand:[]};room.players.set(playerId,p);rooms.set(code,room);send(ws,{type:'room',...roomSnapshot(room,playerId)});return;}
    if(msg.type==='join'){const room=rooms.get(String(msg.code));if(!room)return send(ws,{type:'error',message:'房间不存在'});if(room.started)return send(ws,{type:'error',message:'游戏已经开始'});if([...room.players.values()].filter(p=>!p.bot).length>=4)return send(ws,{type:'error',message:'房间已满'});const used=new Set([...room.players.values()].map(p=>p.seat));const seat=[0,1,2,3].find(s=>!used.has(s));const p={id:playerId,name:String(msg.name||`玩家${seat+1}`).slice(0,12),seat,team:teamForSeat(seat),bot:false,ws,hand:[]};room.players.set(playerId,p);send(ws,{type:'room',...roomSnapshot(room,playerId)});broadcast(room,{type:'room',...roomSnapshot(room)});return;}
    const room=findRoom(playerId);if(!room)return;
    const p=room.players.get(playerId); if(p)p.ws=ws;
    if(msg.type==='start'&&room.hostId===playerId){ensurePlayers(room);room.started=true;dealGame(room);broadcast(room,{type:'started',room:roomSnapshot(room),game:publicGame(room)});maybeBot(room);return;}
    if(msg.type==='replaceBot'&&!room.started){
      const bot=[...room.players.values()].find(x=>x.bot&&x.seat===Number(msg.seat));
      if(!bot)return send(ws,{type:'error',message:'这个位置不是机器人'});
      const human=room.players.get(playerId);
      if(!human || human.bot)return send(ws,{type:'error',message:'只有真人玩家可以接管机器人'});
      const oldSeat=human.seat, oldTeam=human.team;
      const targetSeat=bot.seat, targetTeam=bot.team;
      room.players.delete(bot.id);
      human.seat=targetSeat; human.team=targetTeam; human.ws=ws;
      // The vacated seat becomes a bot, preserving the two-team opposite seating.
      const bid=`bot-${room.code}-${oldSeat}-${Date.now()}`;
      room.players.set(bid,{id:bid,name:`机器人${oldSeat+1}`,seat:oldSeat,team:oldTeam,bot:true,ws:null,hand:[]});
      broadcast(room,{type:'room',...roomSnapshot(room)});
      return;
    }
    if(msg.type==='play'){const r=playCards(room,p,Array.isArray(msg.cardIds)?msg.cardIds:[],msg.tripleMode==='bomb'?'bomb':'ordinary');if(!r.ok)send(ws,{type:'error',message:r.message});return;}
    if(msg.type==='pass'){const r=passTurn(room,p);if(!r.ok)send(ws,{type:'error',message:r.message});return;}
    if(msg.type==='nextHand'&&room.hostId===playerId&&room.game?.phase==='settled'){room.dealerSeat=(room.dealerSeat+1)%4;dealGame(room);broadcast(room,{type:'game',game:publicGame(room)});maybeBot(room);return;}
  });
  ws.on('close',()=>{const room=findRoom(playerId);if(!room)return;const p=room.players.get(playerId);if(p)p.ws=null;broadcast(room,{type:'room',...roomSnapshot(room)});});
});
server.listen(PORT,()=>console.log(`五十K网页版：http://localhost:${PORT}`));
