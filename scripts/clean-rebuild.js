#!/usr/bin/env node
/**
 * clean-rebuild.js v3 — 修复前奏空白、旋转过度、Hold过多、事件重叠
 */
const fs = require('fs');

const args = {};
for (let i = 2; i < process.argv.length; i += 2)
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

if (!args.chart || !args.analysis) { console.error('Need --chart and --analysis'); process.exit(1); }

const difficulty = args.difficulty || 'normal';
const chart = JSON.parse(fs.readFileSync(args.chart, 'utf-8'));
const analysis = JSON.parse(fs.readFileSync(args.analysis, 'utf-8'));
const BPM = chart.BPMList[0].bpm;
const MS_PER_BEAT = 60000 / BPM;

chart.META.RPEVersion = 170;

const DIFF = {
  easy:   { density:0.4, maxSim:1, flick:false, drag:false, spread:200, lineMove:0.3, lineRot:0, multiLine:false },
  normal: { density:0.65, maxSim:2, flick:true, drag:true, spread:350, lineMove:0.5, lineRot:0.2, multiLine:true },
  hard:   { density:0.85, maxSim:2, flick:true, drag:true, spread:500, lineMove:0.7, lineRot:0.4, multiLine:true },
  expert: { density:1.0, maxSim:3, flick:true, drag:true, spread:600, lineMove:1.0, lineRot:0.6, multiLine:true },
}[difficulty];

const SEC_MAP = {
  intro:'intro', verse:'verse', 'pre-chorus':'pre_chorus', pre_chorus:'pre_chorus',
  chorus:'chorus', climax_chorus:'chorus', climax:'chorus', drop:'drop',
  bridge:'bridge', breakdown:'breakdown', build:'buildup', buildup:'buildup',
  outro:'outro', outro_solo:'outro', outro_fade:'outro', instrumental:'instrumental', silence:'silence'
};

// ===== Helpers =====
function gcd(a,b){return b===0?a:gcd(b,a%b);}
function beatToTimeT(beat){
  const bar=Math.floor(beat), frac=beat-bar;
  if(Math.abs(frac)<0.001) return [bar,0,1];
  const den=48, num=Math.round(frac*den), g=gcd(Math.abs(num),den);
  return [bar,num/g,den/g];
}
let rngS=42;
function rng(){rngS=(rngS*1664525+1013904223)&0x7FFFFFFF;return rngS/0x7FFFFFFF;}

// ===== Collision tracking =====
const lineNotes={}, lineEvts={};
function getLN(l){if(!lineNotes[l])lineNotes[l]=[];return lineNotes[l];}

function canPlace(beat,type,x,line){
  for(const n of getLN(line)){
    const d=Math.abs(n.beat-beat)*MS_PER_BEAT;
    if(d<1&&Math.abs(n.x-x)<50&&n.type<=2&&type<=2) return false;
    if(n.type===3&&type===1&&d>0&&d<200) return false;
    if(type===3&&n.type===1&&d>0&&d<200) return false;
    if(n.type===4&&type===1&&d>0&&d<200) return false;
    if(type===4&&n.type===1&&d>0&&d<200) return false;
  }
  return true;
}

function placeNote(beat,type,x,line,isFake){
  x=Math.max(-675,Math.min(675,Math.round(x)));
  if(line<0||line>=chart.judgeLineList.length) return false;
  if(!isFake && !canPlace(beat,type,x,line)) return false;
  const t=beatToTimeT(beat);
  chart.judgeLineList[line].notes.push({
    above:1, alpha: isFake ? 128 : 255, endTime:[...t], isFake: isFake?1:0,
    positionX:x, size:1, speed:1, startTime:t, type:type, visibleTime:999999.0, yOffset:0
  });
  if(!isFake) getLN(line).push({beat,type,x});
  return true;
}

function placeHold(s,e,x,line){
  x=Math.max(-675,Math.min(675,Math.round(x)));
  if(e<=s+0.25||line<0||line>=chart.judgeLineList.length) return false;
  if(!canPlace(s,2,x,line)) return false;
  chart.judgeLineList[line].notes.push({
    above:1, alpha:255, endTime:beatToTimeT(e), isFake:0,
    positionX:x, size:1, speed:1, startTime:beatToTimeT(s), type:2, visibleTime:999999.0, yOffset:0
  });
  getLN(line).push({beat:s,type:2,x});
  return true;
}

function canEvt(line,layer,type,s,e){
  const k=`${line}:${layer}:${type}`;
  for(const ev of (lineEvts[k]||[])) if(s<ev.end-0.01&&e>ev.start+0.01) return false;
  return true;
}

function placeEvt(line,layer,type,s,e,sv,ev,easing){
  if(e<=s+0.01) return false;
  if(!canEvt(line,layer,type,s,e)) return false;
  const k=`${line}:${layer}:${type}`;
  if(!lineEvts[k]) lineEvts[k]=[];
  lineEvts[k].push({start:s,end:e});
  lineEvts[k].sort((a,b)=>a.start-b.start);
  const MAP={moveX:'moveXEvents',moveY:'moveYEvents',rotate:'rotateEvents',alpha:'alphaEvents',speed:'speedEvents'};
  const jl=chart.judgeLineList[line];
  while(jl.eventLayers.length<=layer) jl.eventLayers.push(null);
  if(!jl.eventLayers[layer]) jl.eventLayers[layer]={moveXEvents:[],moveYEvents:[],rotateEvents:[],alphaEvents:[],speedEvents:[]};
  jl.eventLayers[layer][MAP[type]].push({
    bezier:0,bezierPoints:[0,0,0,0],easingLeft:0,easingRight:1,
    easingType:easing||1,end:ev,endTime:beatToTimeT(e),linkgroup:0,start:sv,startTime:beatToTimeT(s)
  });
  return true;
}

// ===== Sections =====
const sections=(analysis.sections||[]).map(s=>({
  type:SEC_MAP[s.name||s.type]||'verse', start:s.start_beat, end:s.end_beat, energy:s.energy||5
}));

function getSec(beat){
  for(const s of sections) if(beat>=s.start&&beat<s.end) return s;
  return {type:'verse',energy:5};
}

function pickLine(beat){
  if(!DIFF.multiLine) return 0;
  const sec=getSec(beat);
  if(sec.type==='chorus'||sec.type==='drop'||sec.energy>=9) return [0,1,2][Math.floor(rng()*3)];
  if(sec.energy>=6) return rng()<0.7?0:1;
  return 0;
}

// ===== 1. INTRO PERFORMANCE (beat 0 ~ first section with energy>=5) =====
const introEnd = sections.length > 0 ? sections[0].end : 57;
{
  // Fake观赏音符：从两侧飘入的音符流
  for(let b=2; b<introEnd; b+=2){
    const side = b%4<2 ? 1 : -1;
    const x = side * (200 + (b/introEnd)*400);
    placeNote(b, 4, x, 0, true); // Fake Drag
  }
  // 线缓慢移动：从左到中再到右
  const mid = introEnd/2;
  placeEvt(0,1,'moveX', 0, mid, -200, 0, 2); // outSine
  placeEvt(0,1,'moveX', mid, introEnd, 0, 200, 3); // inSine
  // 线缓慢浮动Y
  placeEvt(0,1,'moveY', 0, introEnd, -80, 80, 6); // ioSine
  // 线渐入
  placeEvt(0,1,'alpha', 0, 8, 0, 255, 2);
  // 轻微旋转
  placeEvt(0,1,'rotate', 0, mid, 0, 8, 6);
  placeEvt(0,1,'rotate', mid, introEnd-1, 8, -8, 6);
  placeEvt(0,1,'rotate', introEnd-1, introEnd, -8, 0, 2);
}

// ===== 2. SECTION EVENTS (controlled, no rotation accumulation) =====
for(const sec of sections){
  if(sec.start < introEnd) continue; // intro handled above
  const dur=sec.end-sec.start;
  const mid=sec.start+dur/2;
  const moveAmt=150*DIFF.lineMove;

  if(sec.type==='chorus'||sec.type==='drop'){
    // Gentle sway, NO spin
    placeEvt(0,1,'moveX', sec.start, mid, -moveAmt*0.5, moveAmt*0.5, 7); // ioQuad
    placeEvt(0,1,'moveX', mid, sec.end, moveAmt*0.5, 0, 4); // outQuad
    // Small controlled rotation: max ±12 degrees, always return to 0
    if(DIFF.lineRot>0){
      const rot=12*DIFF.lineRot;
      placeEvt(0,1,'rotate', sec.start, mid, 0, rot, 4);
      placeEvt(0,1,'rotate', mid, sec.end, rot, 0, 4);
    }
    // Multi-line counter motion
    if(DIFF.multiLine){
      placeEvt(1,1,'moveX', sec.start, sec.end, moveAmt*0.3, -moveAmt*0.3, 6);
      placeEvt(2,1,'moveY', sec.start, sec.end, -40, 40, 6);
    }
  } else if(sec.type==='verse'||sec.type==='pre_chorus'){
    placeEvt(0,1,'moveX', sec.start, sec.end, 0, moveAmt*0.2*(sec.type==='pre_chorus'?2:1), 6);
  } else if(sec.type==='bridge'){
    placeEvt(0,1,'moveY', sec.start, sec.end, -20, 20, 6);
  } else if(sec.type==='breakdown'){
    placeEvt(0,1,'alpha', sec.start, sec.end, 200, 200, 1);
  } else if(sec.type==='outro'){
    placeEvt(0,1,'alpha', sec.start, sec.end, 255, 80, 3);
  }
}

// ===== 3. ENERGY -> SPEED (only on layer 0 default, skip if overlap) =====
const ec=analysis.energy_curve||[];
for(let i=0;i<ec.length-1;i++){
  const cur=ec[i], next=ec[i+1];
  const ss=9+(cur.energy/10)*2, es=9+(next.energy/10)*2;
  // Speed events go on the DEFAULT layer 0 (not layer 1)
  // But layer 0 already has a default speed event [0,0,1]->[1,0,1], so skip that range
  if(cur.beat < 1 && next.beat <= 1) continue;
  const start = Math.max(cur.beat, 1.01);
  if(start >= next.beat) continue;
  placeEvt(0,0,'speed', start, next.beat, Math.round(ss*10)/10, Math.round(es*10)/10, 1);
}

// ===== 4. BEATS -> NOTES =====
const beats=(analysis.beats||[]).map(b=>({
  beat:b.beat, intensity:b.intensity||5,
  sound:b.sound||b.sound_type||'kick',
  accent:b.accent||b.is_accent||false
})).sort((a,b)=>a.beat-b.beat);

const beatGroups={};
for(const b of beats){
  const k=Math.round(b.beat*4)/4;
  if(!beatGroups[k]) beatGroups[k]=[];
  beatGroups[k].push(b);
}

for(const [bs,group] of Object.entries(beatGroups)){
  const beat=parseFloat(bs);
  const maxI=Math.max(...group.map(g=>g.intensity));
  if(rng()>DIFF.density && maxI<7) continue;
  const strongest=group.reduce((a,b)=>b.intensity>a.intensity?b:a,group[0]);

  let noteType=1;
  if(strongest.sound==='snare'&&DIFF.flick&&strongest.accent&&maxI>=9) noteType=3;
  else if((strongest.sound==='hihat'||strongest.sound==='cymbal'||strongest.sound==='fx')&&DIFF.drag) noteType=4;

  const side=Math.floor(beat*2)%2===0?1:-1;
  const x=side*(40+rng()*(DIFF.spread-40));
  const line=pickLine(beat);
  placeNote(beat,noteType,x,line,false);

  if(strongest.accent&&maxI>=9&&DIFF.maxSim>=2){
    const l2=line===0?(DIFF.multiLine?1:0):0;
    placeNote(beat,1,-x,l2,false);
  }
}

// ===== 5. SUSTAINED NOTES -> HOLD (max 4 beats, only where it makes sense) =====
const MAX_HOLD = 4; // 4 beats max = ~2.6 seconds
for(const sus of (analysis.sustained_notes||[])){
  const totalLen = sus.end_beat - sus.start_beat;
  if(totalLen < 1) continue;
  // Only place 1-2 holds per sustained note, not a chain
  const holdLen = Math.min(totalLen, MAX_HOLD);
  const x = rng()<0.5 ? -150 : 150;
  placeHold(sus.start_beat, sus.start_beat+holdLen, x, 0);
  // If long, add one more at the end
  if(totalLen > MAX_HOLD * 2){
    const endStart = sus.end_beat - holdLen;
    placeHold(endStart, sus.end_beat, -x, DIFF.multiLine ? 1 : 0);
  }
}

// ===== 6. MARKERS =====
for(const marker of (analysis.markers||[])){
  const beat=marker.beat;
  switch(marker.type){
    case 'impact':
      placeNote(beat,1,-300,0,false);
      placeNote(beat,1,0,0,false);
      placeNote(beat,1,300,0,false);
      placeEvt(0,1,'moveY', beat, beat+1.5, -40, 0, 24);
      break;
    case 'drop':
      for(let i=0;i<4;i++){
        const sub=beat+i*0.25, dx=(i-1.5)*150;
        placeNote(sub, DIFF.drag?4:1, dx, DIFF.multiLine?(i%2):0, false);
      }
      break;
    case 'rise':
      for(let i=0;i<4;i++){
        placeNote(beat+i*0.5, 1, (i-1.5)*120, 0, false);
      }
      break;
    case 'climax':
      const t=DIFF.flick?3:1;
      placeNote(beat,t,-400,0,false);
      placeNote(beat,t,0,DIFF.multiLine?1:0,false);
      placeNote(beat,t,400,DIFF.multiLine?2:0,false);
      break;
    case 'silence':
      placeEvt(0,1,'alpha', beat, beat+0.5, 255, 50, 17);
      break;
  }
}

// ===== Sort =====
for(const jl of chart.judgeLineList){
  const nh=jl.notes.filter(n=>n.type!==2), h=jl.notes.filter(n=>n.type===2);
  const cmp=(a,b)=>(a.startTime[0]+a.startTime[1]/a.startTime[2])-(b.startTime[0]+b.startTime[1]/b.startTime[2]);
  nh.sort(cmp); h.sort(cmp);
  jl.notes=[...nh,...h];
  jl.numOfNotes=jl.notes.filter(n=>!n.isFake).length;
  for(const layer of jl.eventLayers){
    if(!layer) continue;
    for(const k of Object.keys(layer)) if(Array.isArray(layer[k]))
      layer[k].sort((a,b)=>(a.startTime[0]+a.startTime[1]/a.startTime[2])-(b.startTime[0]+b.startTime[1]/b.startTime[2]));
  }
}

fs.writeFileSync(args.chart, JSON.stringify(chart,null,2),'utf-8');

// Stats
let total=0,fakeCount=0;const types={1:0,2:0,3:0,4:0};const used=new Set();
for(let i=0;i<chart.judgeLineList.length;i++){
  const l=chart.judgeLineList[i];
  total+=l.notes.length;
  for(const n of l.notes){types[n.type]++;if(n.isFake)fakeCount++;}
  if(l.notes.length>0) used.add(i);
}
let holdBeats=0;
for(const l of chart.judgeLineList) for(const n of l.notes)
  if(n.type===2) holdBeats+=(n.endTime[0]+n.endTime[1]/n.endTime[2])-(n.startTime[0]+n.startTime[1]/n.startTime[2]);

console.log(JSON.stringify({
  success:true, difficulty, RPEVersion:170,
  totalNotes:total, fakeNotes:fakeCount, realNotes:total-fakeCount,
  noteTypes:{tap:types[1],hold:types[2],flick:types[3],drag:types[4]},
  holdTotalBeats:Math.round(holdBeats*10)/10,
  linesUsed:[...used].sort((a,b)=>a-b),
  events:Object.values(lineEvts).reduce((s,a)=>s+a.length,0),
},null,2));
