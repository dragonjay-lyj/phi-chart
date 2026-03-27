#!/usr/bin/env node
/**
 * multitrack-chart.js v2 — 节奏优先 + 歌词画面事件
 *
 * 核心原则：
 *   1. 音符只踩强拍和人声字头，不填满
 *   2. 歌词画面→丰富的判定线事件
 *   3. Hold不与Tap/Hold重叠（扩大碰撞范围）
 *   4. 前奏有Fake观赏+线表演
 */
const fs = require('fs');

const args = {};
for (let i = 2; i < process.argv.length; i += 2)
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const chart = JSON.parse(fs.readFileSync(args.chart, 'utf-8'));
const trackData = JSON.parse(fs.readFileSync(args.tracks, 'utf-8'));
const prevAnalysis = args.analysis ? JSON.parse(fs.readFileSync(args.analysis, 'utf-8')) : null;
const BPM = chart.BPMList[0].bpm;
const MS_PER_BEAT = 60000 / BPM;
chart.META.RPEVersion = 170;

// ===== Helpers =====
function gcd(a,b){return b===0?a:gcd(b,a%b);}
function beatToTimeT(beat){
  const bar=Math.floor(beat),frac=beat-bar;
  if(Math.abs(frac)<0.001)return[bar,0,1];
  const den=48,num=Math.round(frac*den),g=gcd(Math.abs(num),den);
  return[bar,num/g,den/g];
}
function parseTime(str){
  const m=str.match(/(\d+):(\d+)/);
  if(!m)return 0;
  return(parseInt(m[1])*60+parseInt(m[2]))/60*BPM;
}
function parseTimeRange(str){
  const p=str.split('-');return{start:parseTime(p[0]),end:parseTime(p[1])};
}
let rngS=42;
function rng(){rngS=(rngS*1664525+1013904223)&0x7FFFFFFF;return rngS/0x7FFFFFFF;}

// ===== Collision (type 2=Hold also blocked by any nearby note) =====
const lineNotes={},lineEvts={};
function getLN(l){if(!lineNotes[l])lineNotes[l]=[];return lineNotes[l];}

function canPlace(beat,type,x,line){
  for(const n of getLN(line)){
    const d=Math.abs(n.beat-beat)*MS_PER_BEAT;
    // Any two notes at same time within 150px = overlap
    if(d<5 && Math.abs(n.x-x)<150 && (n.type<=2||type<=2)) return false;
    if(n.type===3&&type===1&&d>0&&d<250)return false;
    if(type===3&&n.type===1&&d>0&&d<250)return false;
    if(n.type===4&&type===1&&d>0&&d<250)return false;
    if(type===4&&n.type===1&&d>0&&d<250)return false;
  }
  return true;
}

function placeNote(beat,type,x,line,isFake){
  x=Math.max(-675,Math.min(675,Math.round(x)));
  if(line<0||line>=chart.judgeLineList.length)return false;
  if(!isFake&&!canPlace(beat,type,x,line))return false;
  const t=beatToTimeT(beat);
  chart.judgeLineList[line].notes.push({
    above:1,alpha:isFake?100:255,endTime:[...t],isFake:isFake?1:0,
    positionX:x,size:1,speed:1,startTime:t,type:type,visibleTime:999999.0,yOffset:0
  });
  if(!isFake)getLN(line).push({beat,type,x});
  return true;
}

function placeHold(s,e,x,line){
  x=Math.max(-675,Math.min(675,Math.round(x)));
  if(e<=s+0.5)return false;
  // Check entire hold duration for conflicts
  for(const n of getLN(line)){
    if(Math.abs(n.x-x)<150 && n.beat>=s-0.1 && n.beat<=e+0.1) return false;
  }
  if(!canPlace(s,2,x,line))return false;
  chart.judgeLineList[line].notes.push({
    above:1,alpha:255,endTime:beatToTimeT(e),isFake:0,
    positionX:x,size:1,speed:1,startTime:beatToTimeT(s),type:2,visibleTime:999999.0,yOffset:0
  });
  getLN(line).push({beat:s,type:2,x});
  return true;
}

function canEvt(line,layer,type,s,e){
  const k=`${line}:${layer}:${type}`;
  for(const ev of(lineEvts[k]||[]))if(s<ev.end-0.01&&e>ev.start+0.01)return false;
  return true;
}
function placeEvt(line,layer,type,s,e,sv,ev,easing){
  if(e<=s+0.01)return false;
  if(!canEvt(line,layer,type,s,e))return false;
  const k=`${line}:${layer}:${type}`;
  if(!lineEvts[k])lineEvts[k]=[];
  lineEvts[k].push({start:s,end:e});
  lineEvts[k].sort((a,b)=>a.start-b.start);
  const MAP={moveX:'moveXEvents',moveY:'moveYEvents',rotate:'rotateEvents',alpha:'alphaEvents',speed:'speedEvents'};
  const jl=chart.judgeLineList[line];
  while(jl.eventLayers.length<=layer)jl.eventLayers.push(null);
  if(!jl.eventLayers[layer])jl.eventLayers[layer]={moveXEvents:[],moveYEvents:[],rotateEvents:[],alphaEvents:[],speedEvents:[]};
  jl.eventLayers[layer][MAP[type]].push({
    bezier:0,bezierPoints:[0,0,0,0],easingLeft:0,easingRight:1,
    easingType:easing||1,end:ev,endTime:beatToTimeT(e),linkgroup:0,start:sv,startTime:beatToTimeT(s)
  });
  return true;
}

// ===== Parse tracks =====
const tracks=(trackData.analysis||trackData).map(t=>{
  const r=parseTimeRange(t.time_range);
  return{...t,startBeat:r.start,endBeat:r.end};
}).sort((a,b)=>a.startBeat-b.startBeat);

// ===== Find intro end (first vocal) =====
const firstVocal=tracks.find(t=>t.vocal_state&&t.vocal_state!=='无');
const introEnd=firstVocal?firstVocal.startBeat:57;

// ===== 1. INTRO: Fake notes + rich line performance =====
for(let b=2;b<introEnd;b+=1.5){
  const side=b%3<1.5?1:-1;
  placeNote(b,4,side*(150+(b/introEnd)*350),0,true);
}
const iMid=introEnd/2;
placeEvt(0,1,'moveX',1,iMid,-200,200,6);
placeEvt(0,1,'moveX',iMid,introEnd-0.5,200,-200,6);
placeEvt(0,1,'moveY',1,introEnd-0.5,-80,80,6);
placeEvt(0,1,'rotate',1,iMid,0,10,6);
placeEvt(0,1,'rotate',iMid,introEnd-0.5,10,0,6);
placeEvt(0,1,'alpha',1,6,0,200,2);
placeEvt(0,1,'alpha',6.01,introEnd-0.5,200,255,1);

// ===== 2. NOTES: Only from beats data (rhythm hits), NOT filling every track =====
if(prevAnalysis && prevAnalysis.beats){
  const beats=(prevAnalysis.beats||[]).map(b=>({
    beat:b.beat, intensity:b.intensity||5,
    sound:b.sound||b.sound_type||'kick',
    accent:b.accent||b.is_accent||false
  })).sort((a,b)=>a.beat-b.beat);

  // Group by quantized time
  const groups={};
  for(const b of beats){
    const k=Math.round(b.beat*4)/4;
    if(!groups[k])groups[k]=[];
    groups[k].push(b);
  }

  for(const[bs,group]of Object.entries(groups)){
    const beat=parseFloat(bs);
    const maxI=Math.max(...group.map(g=>g.intensity));
    const strongest=group.reduce((a,b)=>b.intensity>a.intensity?b:a,group[0]);

    // Only keep ~50% of beats (rhythm, not spam)
    if(rng()>0.5 && maxI<8) continue;

    let noteType=1;
    if(strongest.sound==='snare'&&strongest.accent&&maxI>=9) noteType=3;
    else if((strongest.sound==='hihat'||strongest.sound==='cymbal')&&maxI<7) noteType=4;

    const side=Math.floor(beat*2)%2===0?1:-1;
    const x=side*(50+rng()*250);
    placeNote(beat,noteType,x,0,false);

    // Double for strong accents only
    if(strongest.accent&&maxI>=10){
      placeNote(beat,1,-x,0,false);
    }
  }
}

// ===== 3. HOLDS: Only from sustained_notes, max 4 beats, well-spaced =====
if(prevAnalysis&&prevAnalysis.sustained_notes){
  for(const sus of prevAnalysis.sustained_notes){
    const len=sus.end_beat-sus.start_beat;
    if(len<1)continue;
    const holdLen=Math.min(len,4);
    const x=rng()<0.5?-200:200;
    placeHold(sus.start_beat,sus.start_beat+holdLen,x,0);
  }
}

// ===== 4. MARKERS: impacts, drops, climaxes =====
if(prevAnalysis&&prevAnalysis.markers){
  for(const m of prevAnalysis.markers){
    const b=m.beat;
    if(m.type==='impact'){
      placeNote(b,1,-300,0,false);placeNote(b,1,0,0,false);placeNote(b,1,300,0,false);
      placeEvt(0,1,'moveY',b,b+1.5,-40,0,24);
    }else if(m.type==='climax'){
      placeNote(b,3,-400,0,false);placeNote(b,3,0,0,false);placeNote(b,3,400,0,false);
      placeEvt(0,1,'rotate',b,b+3,-8,8,24);
    }else if(m.type==='drop'){
      for(let i=0;i<4;i++) placeNote(b+i*0.25,4,(i-1.5)*150,0,false);
      placeEvt(0,1,'moveY',b,b+1,80,-80,17);
    }else if(m.type==='silence'){
      placeEvt(0,1,'alpha',b,b+0.5,255,50,17);
    }else if(m.type==='rise'){
      for(let i=0;i<3;i++) placeNote(b+i*0.5,1,(i-1)*150,0,false);
      placeEvt(0,1,'moveY',b,b+2,-60,60,16);
    }
  }
}

// ===== 5. LYRIC-DRIVEN EVENTS (the core improvement!) =====
// Map lyrics to visual events based on imagery
const LYRIC_EVENTS = [
  // Verse 1
  {time:"01:02", lyrics:"谁弹奏着灰黑协奏曲", event:"moveX", line:0, start:-100, end:100, easing:6, desc:"钢琴左右摇摆"},
  {time:"01:07", lyrics:"蒙娜丽莎微笑着哭泣", event:"rotate", line:0, start:0, end:-8, easing:3, desc:"画作倾斜"},
  {time:"01:07", lyrics:"蒙娜丽莎微笑着哭泣", event:"moveY", line:0, start:0, end:-30, easing:3, desc:"下沉感"},
  {time:"01:12", lyrics:"救赎来临前始终不语", event:"alpha", line:0, start:255, end:150, easing:3, desc:"沉默变暗"},
  {time:"01:17", lyrics:"解剖过去谁的表情刻意", event:"moveX", line:0, start:0, end:-150, easing:5, desc:"快速偏移(说唱)"},
  {time:"01:19", lyrics:"松手前的鹅毛笔指向线索的信", event:"moveX", line:0, start:-150, end:150, easing:4, desc:"快速反弹"},
  {time:"01:23", lyrics:"莎士比亚笔下的纯真", event:"rotate", line:0, start:-8, end:5, easing:2, desc:"恢复平衡"},
  {time:"01:23", lyrics:"莎士比亚笔下的纯真", event:"alpha", line:0, start:150, end:255, easing:2, desc:"回亮"},
  {time:"01:28", lyrics:"哈姆雷特花丛那歌声", event:"moveY", line:0, start:-30, end:30, easing:6, desc:"花丛中浮动"},
  {time:"01:33", lyrics:"火炬的光不照着剧本", event:"alpha", line:0, start:255, end:180, easing:3, desc:"光暗淡"},
  {time:"01:33", lyrics:"火炬的光不照着剧本", event:"moveX", line:0, start:150, end:0, easing:2, desc:"归中"},
  {time:"01:38", lyrics:"黑夜来袭蝙蝠轰然离去", event:"moveY", line:0, start:30, end:-50, easing:17, desc:"急坠"},
  {time:"01:38", lyrics:"黑夜来袭蝙蝠轰然离去", event:"alpha", line:0, start:180, end:100, easing:17, desc:"黑暗降临"},
  {time:"01:40", lyrics:"远方正邪在对立黎明前谁参与", event:"rotate", line:0, start:5, end:-5, easing:7, desc:"摇摆对立"},
  // Pre-chorus
  {time:"01:44", lyrics:"雏菊紫罗兰飘散在风里", event:"moveX", line:0, start:0, end:120, easing:6, desc:"花瓣飘动"},
  {time:"01:44", lyrics:"雏菊紫罗兰飘散在风里", event:"moveY", line:0, start:-50, end:40, easing:6, desc:"风中上浮"},
  {time:"01:44", lyrics:"雏菊紫罗兰飘散在风里", event:"alpha", line:0, start:100, end:255, easing:2, desc:"渐亮"},
  {time:"01:49", lyrics:"浮出水面的是不是真理", event:"moveY", line:0, start:40, end:80, easing:4, desc:"浮出水面"},
  {time:"01:49", lyrics:"浮出水面的是不是真理", event:"moveX", line:0, start:120, end:0, easing:4, desc:"归中"},
  {time:"01:54", lyrics:"克林姆的吻是一种别离", event:"rotate", line:0, start:-5, end:0, easing:2, desc:"亲吻后归正"},
  {time:"01:54", lyrics:"克林姆的吻是一种别离", event:"moveY", line:0, start:80, end:0, easing:8, desc:"回落"},
  // Chorus 1 — "我就是光"
  {time:"02:03", lyrics:"我就是光照亮远方黑夜", event:"moveX", line:0, start:0, end:0, easing:1, desc:"居中爆发"},
  {time:"02:03", lyrics:"我就是光照亮远方黑夜", event:"alpha", line:0, start:100, end:255, easing:16, desc:"光芒爆发"},
  {time:"02:03", lyrics:"我就是光照亮远方黑夜", event:"moveY", line:0, start:0, end:-20, easing:20, desc:"弹出"},
  {time:"02:06", lyrics:"我闯马上将你击溃", event:"moveX", line:0, start:0, end:-120, easing:5, desc:"冲锋左"},
  {time:"02:09", lyrics:"如钢把心魔都粉碎", event:"moveX", line:0, start:-120, end:120, easing:4, desc:"粉碎弹回"},
  {time:"02:09", lyrics:"如钢把心魔都粉碎", event:"rotate", line:0, start:0, end:12, easing:20, desc:"震动"},
  {time:"02:11", lyrics:"不怯不退将邪恶都灭", event:"moveX", line:0, start:120, end:0, easing:4, desc:"归中"},
  {time:"02:11", lyrics:"不怯不退将邪恶都灭", event:"rotate", line:0, start:12, end:0, easing:24, desc:"弹性归正"},
  {time:"02:14", lyrics:"光照亮远方黑夜", event:"moveY", line:0, start:-20, end:30, easing:4, desc:"光上升"},
  {time:"02:17", lyrics:"我闯恶梦灰飞烟灭", event:"moveX", line:0, start:0, end:100, easing:5, desc:"冲"},
  {time:"02:19", lyrics:"我扛不管声嘶力竭", event:"moveX", line:0, start:100, end:-100, easing:4, desc:"反弹"},
  {time:"02:22", lyrics:"不怯不退将邪恶都灭", event:"moveX", line:0, start:-100, end:0, easing:4, desc:"归中"},
  {time:"02:22", lyrics:"不怯不退将邪恶都灭", event:"moveY", line:0, start:30, end:0, easing:4, desc:"归中"},
  // Bridge/间奏
  {time:"02:34", lyrics:"间奏", event:"moveY", line:0, start:0, end:-40, easing:6, desc:"沉思下沉"},
  {time:"02:34", lyrics:"间奏", event:"alpha", line:0, start:255, end:180, easing:3, desc:"变暗"},
  // Verse 2
  {time:"02:47", lyrics:"吧台后镜子里的世界", event:"alpha", line:0, start:180, end:255, easing:2, desc:"镜子反光"},
  {time:"02:47", lyrics:"吧台后镜子里的世界", event:"moveX", line:0, start:0, end:-80, easing:6, desc:"镜像偏移"},
  {time:"02:52", lyrics:"与你对话的人又是谁", event:"rotate", line:0, start:0, end:-6, easing:3, desc:"疑惑倾斜"},
  {time:"02:58", lyrics:"调了一杯迷惑的无解", event:"rotate", line:0, start:-6, end:6, easing:7, desc:"迷惑摇晃"},
  {time:"02:58", lyrics:"调了一杯迷惑的无解", event:"moveX", line:0, start:-80, end:80, easing:7, desc:"摇晃"},
  {time:"03:02", lyrics:"笔触强烈这张画的细节", event:"moveX", line:0, start:80, end:-100, easing:5, desc:"笔触(说唱急移)"},
  {time:"03:04", lyrics:"色调暗示着一切线条却在分裂", event:"moveX", line:0, start:-100, end:100, easing:4, desc:"分裂弹回"},
  {time:"03:04", lyrics:"色调暗示着一切线条却在分裂", event:"rotate", line:0, start:6, end:-8, easing:5, desc:"线条分裂"},
  {time:"03:08", lyrics:"瞳孔里燃烧的向日葵", event:"alpha", line:0, start:255, end:255, easing:1, desc:"燃烧明亮"},
  {time:"03:08", lyrics:"瞳孔里燃烧的向日葵", event:"moveY", line:0, start:-40, end:40, easing:4, desc:"火焰上升"},
  {time:"03:08", lyrics:"瞳孔里燃烧的向日葵", event:"rotate", line:0, start:-8, end:0, easing:4, desc:"归正"},
  {time:"03:13", lyrics:"孤独的夜游者等心碎", event:"moveY", line:0, start:40, end:-30, easing:3, desc:"孤独下沉"},
  {time:"03:13", lyrics:"孤独的夜游者等心碎", event:"moveX", line:0, start:100, end:0, easing:8, desc:"归中"},
  {time:"03:19", lyrics:"左耳纷乱中搁下是非", event:"moveX", line:0, start:0, end:-60, easing:6, desc:"左耳偏左"},
  {time:"03:23", lyrics:"月光低垂隆河上的星夜", event:"moveY", line:0, start:-30, end:50, easing:2, desc:"月光低垂后上浮"},
  {time:"03:25", lyrics:"教堂里有人告解谁被吸干了血", event:"alpha", line:0, start:255, end:150, easing:17, desc:"黑暗教堂"},
  {time:"03:25", lyrics:"教堂里有人告解谁被吸干了血", event:"moveX", line:0, start:-60, end:60, easing:4, desc:"反弹"},
  // Pre-chorus 2
  {time:"03:29", lyrics:"时间的钟被扭曲的声音", event:"rotate", line:0, start:0, end:-10, easing:7, desc:"时钟扭曲"},
  {time:"03:29", lyrics:"时间的钟被扭曲的声音", event:"moveX", line:0, start:60, end:-60, easing:7, desc:"扭曲摆动"},
  {time:"03:34", lyrics:"如同被折叠起来的表情", event:"moveY", line:0, start:50, end:-40, easing:5, desc:"折叠"},
  {time:"03:34", lyrics:"如同被折叠起来的表情", event:"rotate", line:0, start:-10, end:10, easing:5, desc:"翻转"},
  {time:"03:40", lyrics:"而我却在风中一路前行", event:"rotate", line:0, start:10, end:0, easing:4, desc:"归正坚定"},
  {time:"03:40", lyrics:"而我却在风中一路前行", event:"moveX", line:0, start:-60, end:0, easing:4, desc:"归中前行"},
  {time:"03:40", lyrics:"而我却在风中一路前行", event:"moveY", line:0, start:-40, end:0, easing:4, desc:"归中"},
  {time:"03:40", lyrics:"而我却在风中一路前行", event:"alpha", line:0, start:150, end:255, easing:4, desc:"光明归来"},
  // Chorus 2
  {time:"03:49", lyrics:"我就是光照亮远方黑夜", event:"moveY", line:0, start:0, end:-25, easing:20, desc:"弹出"},
  {time:"03:52", lyrics:"我闯马上将你击溃", event:"moveX", line:0, start:0, end:-130, easing:5, desc:"冲锋"},
  {time:"03:54", lyrics:"如钢把心魔都粉碎", event:"moveX", line:0, start:-130, end:130, easing:4, desc:"粉碎"},
  {time:"03:57", lyrics:"不怯不退将邪恶都灭", event:"moveX", line:0, start:130, end:0, easing:4, desc:"归中"},
  {time:"04:00", lyrics:"光照亮远方黑夜", event:"moveY", line:0, start:-25, end:25, easing:4, desc:"上升"},
  {time:"04:02", lyrics:"我闯恶梦灰飞烟灭", event:"moveX", line:0, start:0, end:100, easing:5, desc:"冲"},
  {time:"04:05", lyrics:"我扛不管声嘶力竭", event:"moveX", line:0, start:100, end:-100, easing:4, desc:"反弹"},
  {time:"04:07", lyrics:"不怯不退将邪恶都灭", event:"moveX", line:0, start:-100, end:0, easing:4, desc:"归中"},
  // Chorus 3 (final, biggest)
  {time:"04:20", lyrics:"我就是光照亮远方黑夜", event:"moveY", line:0, start:25, end:-30, easing:20, desc:"最强弹出"},
  {time:"04:20", lyrics:"我就是光照亮远方黑夜", event:"rotate", line:0, start:0, end:5, easing:20, desc:"震动"},
  {time:"04:23", lyrics:"我闯马上将你击溃", event:"moveX", line:0, start:0, end:-150, easing:5, desc:"最强冲锋"},
  {time:"04:26", lyrics:"如钢把心魔都粉碎", event:"moveX", line:0, start:-150, end:150, easing:4, desc:"最强粉碎"},
  {time:"04:26", lyrics:"如钢把心魔都粉碎", event:"rotate", line:0, start:5, end:-5, easing:24, desc:"弹性震动"},
  {time:"04:29", lyrics:"不怯不退将邪恶都灭", event:"moveX", line:0, start:150, end:0, easing:4, desc:"归中"},
  {time:"04:29", lyrics:"不怯不退将邪恶都灭", event:"rotate", line:0, start:-5, end:0, easing:24, desc:"归正"},
  {time:"04:31", lyrics:"光照亮远方黑夜", event:"moveY", line:0, start:-30, end:30, easing:4, desc:"光上升"},
  {time:"04:34", lyrics:"我闯恶梦灰飞烟灭", event:"moveX", line:0, start:0, end:120, easing:5, desc:"冲"},
  {time:"04:36", lyrics:"我扛不管声嘶力竭", event:"moveX", line:0, start:120, end:-120, easing:4, desc:"反弹"},
  {time:"04:39", lyrics:"不怯不退将邪恶都灭", event:"moveX", line:0, start:-120, end:0, easing:4, desc:"最终归中"},
  {time:"04:39", lyrics:"不怯不退将邪恶都灭", event:"moveY", line:0, start:30, end:0, easing:4, desc:"归中"},
  {time:"04:39", lyrics:"不怯不退将邪恶都灭", event:"alpha", line:0, start:255, end:255, easing:1, desc:"保持明亮"},
  // Outro fade
  {time:"04:42", lyrics:"尾声", event:"alpha", line:0, start:255, end:0, easing:3, desc:"淡出"},
  {time:"04:42", lyrics:"尾声", event:"moveY", line:0, start:0, end:-100, easing:3, desc:"下沉消失"},
];

// Apply lyric events
for(const le of LYRIC_EVENTS){
  const startBeat=parseTime(le.time);
  // Each lyric phrase ~3-5 seconds = ~4.5-7.5 beats at BPM 91
  const endBeat=startBeat+5;
  placeEvt(le.line, 1, le.event, startBeat, endBeat, le.start, le.end, le.easing);
}

// ===== 6. Speed from energy curve =====
if(prevAnalysis&&prevAnalysis.energy_curve){
  const ec=prevAnalysis.energy_curve;
  for(let i=0;i<ec.length-1;i++){
    const cur=ec[i],next=ec[i+1];
    const ss=9+(cur.energy/10)*2,es=9+(next.energy/10)*2;
    if(cur.beat<1&&next.beat<=1)continue;
    const start=Math.max(cur.beat,1.01);
    if(start>=next.beat)continue;
    placeEvt(0,0,'speed',start,next.beat,Math.round(ss*10)/10,Math.round(es*10)/10,1);
  }
}

// ===== Sort =====
for(const jl of chart.judgeLineList){
  const nh=jl.notes.filter(n=>n.type!==2),h=jl.notes.filter(n=>n.type===2);
  const cmp=(a,b)=>(a.startTime[0]+a.startTime[1]/a.startTime[2])-(b.startTime[0]+b.startTime[1]/b.startTime[2]);
  nh.sort(cmp);h.sort(cmp);jl.notes=[...nh,...h];
  jl.numOfNotes=jl.notes.filter(n=>!n.isFake).length;
  for(const layer of jl.eventLayers){
    if(!layer)continue;
    for(const k of Object.keys(layer))if(Array.isArray(layer[k]))
      layer[k].sort((a,b)=>(a.startTime[0]+a.startTime[1]/a.startTime[2])-(b.startTime[0]+b.startTime[1]/b.startTime[2]));
  }
}

fs.writeFileSync(args.chart,JSON.stringify(chart,null,2),'utf-8');

let total=0,fake=0;const types={1:0,2:0,3:0,4:0};
for(const l of chart.judgeLineList){total+=l.notes.length;for(const n of l.notes){types[n.type]++;if(n.isFake)fake++;}}
const evtCount=Object.values(lineEvts).reduce((s,a)=>s+a.length,0);
console.log(JSON.stringify({
  success:true, totalNotes:total, fakeNotes:fake, realNotes:total-fake,
  noteTypes:{tap:types[1],hold:types[2],flick:types[3],drag:types[4]},
  totalEvents:evtCount,
  lyricEvents:LYRIC_EVENTS.length,
},null,2));
