#!/usr/bin/env node

/**
 * auto-chart.js — 根据音乐分析数据自动生成谱面内容（音符 + 事件）
 *
 * Usage:
 *   node auto-chart.js --chart <chart.json> --analysis <analysis.json> [--difficulty easy|normal|hard|expert]
 *
 * analysis.json 是音乐分析数据，格式见 SKILL.md 中的"AI音乐分析输入规范"
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

// ===== 时间工具 =====

function secondsToBeat(seconds, bpmList) {
  // 将秒数转换为拍数
  let currentBeat = 0;
  let currentTime = 0;

  for (let i = 0; i < bpmList.length; i++) {
    const bpm = bpmList[i].bpm;
    const segStart = bpmList[i].startTime;
    const segStartBeat = segStart[0] + segStart[1] / segStart[2];
    const nextSegStartBeat = (i + 1 < bpmList.length)
      ? bpmList[i + 1].startTime[0] + bpmList[i + 1].startTime[1] / bpmList[i + 1].startTime[2]
      : Infinity;

    const beatDuration = 60 / bpm; // seconds per beat
    const segDurationBeats = nextSegStartBeat - segStartBeat;
    const segDurationSeconds = segDurationBeats * beatDuration;

    if (currentTime + segDurationSeconds > seconds || i === bpmList.length - 1) {
      const remainingSeconds = seconds - currentTime;
      const remainingBeats = remainingSeconds / beatDuration;
      return segStartBeat + remainingBeats;
    }

    currentTime += segDurationSeconds;
  }
  return 0;
}

function beatToTimeT(beat) {
  const bar = Math.floor(beat);
  const frac = beat - bar;
  if (Math.abs(frac) < 0.001) return [bar, 0, 1];
  const den = 48;
  const num = Math.round(frac * den);
  const g = gcd(Math.abs(num), den);
  return [bar, num / g, den / g];
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

function makeNote(type, startTime, endTime, positionX, above, speed, alpha) {
  return {
    above: above || 1,
    alpha: alpha !== undefined ? alpha : 255,
    endTime: endTime || [...startTime],
    isFake: 0,
    positionX: positionX || 0,
    size: 1,
    speed: speed || 1,
    startTime: startTime,
    type: type,
    visibleTime: 999999.0,
    yOffset: 0
  };
}

function makeEvent(type, startTime, endTime, start, end, easingType) {
  return {
    _type: type,  // internal, removed before output
    bezier: 0,
    bezierPoints: [0, 0, 0, 0],
    easingLeft: 0,
    easingRight: 1,
    easingType: easingType || 1,
    end: end,
    endTime: endTime,
    linkgroup: 0,
    start: start,
    startTime: startTime
  };
}

function compareTimeT(a, b) {
  return (a[0] + a[1] / a[2]) - (b[0] + b[1] / b[2]);
}

// ===== 难度参数 =====
const DIFFICULTY_PRESETS = {
  easy: {
    noteDensityMult: 0.4,     // 只采部分音
    maxSimultaneous: 1,        // 最多单押
    useFlick: false,
    useDrag: false,
    holdMinBeats: 2,           // Hold最短2拍
    positionSpread: 200,       // X坐标扩散范围
    lineMovement: 0.3,         // 线移动幅度
    lineRotation: 0,           // 不旋转
    speedRange: [8, 10],
  },
  normal: {
    noteDensityMult: 0.65,
    maxSimultaneous: 2,        // 最多双押
    useFlick: true,
    useDrag: false,
    holdMinBeats: 1,
    positionSpread: 350,
    lineMovement: 0.5,
    lineRotation: 0.3,
    speedRange: [9, 11],
  },
  hard: {
    noteDensityMult: 0.85,
    maxSimultaneous: 2,
    useFlick: true,
    useDrag: true,
    holdMinBeats: 0.5,
    positionSpread: 500,
    lineMovement: 0.7,
    lineRotation: 0.6,
    speedRange: [10, 12],
  },
  expert: {
    noteDensityMult: 1.0,
    maxSimultaneous: 3,
    useFlick: true,
    useDrag: true,
    holdMinBeats: 0.25,
    positionSpread: 600,
    lineMovement: 1.0,
    lineRotation: 1.0,
    speedRange: [10, 14],
  }
};

// ===== 段落风格映射 =====
// 根据段落类型决定采音策略和演出风格
const SECTION_STYLE = {
  intro: {
    density: 'quarter',     // 四分采音
    noteType: 'tap',
    lineStyle: 'static',    // 线不动
    alpha: 'fade_in',       // 线从透明渐入
  },
  verse: {
    density: 'eighth',      // 八分采音
    noteType: 'mixed_tap',  // 以Tap为主
    lineStyle: 'gentle',    // 轻微移动
    alpha: 'visible',
  },
  pre_chorus: {
    density: 'eighth',
    noteType: 'accelerate', // 逐渐加密
    lineStyle: 'build',     // 逐渐加大移动
    alpha: 'visible',
  },
  chorus: {
    density: 'sixteenth',   // 十六分
    noteType: 'all',        // 所有类型混合
    lineStyle: 'dramatic',  // 大幅移动+旋转
    alpha: 'visible',
  },
  drop: {
    density: 'sixteenth',
    noteType: 'intense',    // 高密度+双押+Flick
    lineStyle: 'explosive', // 爆炸式演出
    alpha: 'flash',         // 闪烁
  },
  bridge: {
    density: 'quarter',
    noteType: 'hold_focus', // 以Hold为主
    lineStyle: 'float',     // 缓慢浮动
    alpha: 'dim',           // 变暗
  },
  breakdown: {
    density: 'sparse',      // 稀疏
    noteType: 'tap',
    lineStyle: 'minimal',
    alpha: 'dim',
  },
  buildup: {
    density: 'accelerate',  // 逐渐加密到16分
    noteType: 'drag_stream', // Drag流
    lineStyle: 'spin',      // 旋转加速
    alpha: 'visible',
  },
  outro: {
    density: 'decelerate',  // 逐渐减少
    noteType: 'tap',
    lineStyle: 'settle',    // 回归中心
    alpha: 'fade_out',
  },
  instrumental: {
    density: 'eighth',
    noteType: 'mixed_tap',
    lineStyle: 'gentle',
    alpha: 'visible',
  },
  silence: {
    density: 'none',
    noteType: 'none',
    lineStyle: 'static',
    alpha: 'hidden',
  }
};

// ===== 主处理逻辑 =====

function processAnalysis(chartData, analysis, difficulty) {
  const diff = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.normal;
  const bpmList = chartData.BPMList;
  const baseBpm = bpmList[0].bpm;

  const allNotes = [];     // {line, note}
  const allEvents = [];    // {line, layer, type, event}

  // ===== 处理段落 =====
  if (analysis.sections) {
    for (const section of analysis.sections) {
      const startBeat = section.start_beat !== undefined ? section.start_beat : secondsToBeat(section.start_time, bpmList);
      const endBeat = section.end_beat !== undefined ? section.end_beat : secondsToBeat(section.end_time, bpmList);
      const style = SECTION_STYLE[section.type] || SECTION_STYLE.verse;

      generateSectionEvents(allEvents, section, style, startBeat, endBeat, diff);
    }
  }

  // ===== 处理拍点 =====
  if (analysis.beats) {
    for (const beat of analysis.beats) {
      const beatPos = beat.beat !== undefined ? beat.beat : secondsToBeat(beat.time, bpmList);
      const intensity = beat.intensity || 5;
      const sound = beat.sound || 'percussion';

      // 根据难度跳过部分拍点
      if (Math.random() > diff.noteDensityMult && intensity < 7) continue;

      const noteResult = mapBeatToNote(beatPos, intensity, sound, beat.accent, diff);
      if (noteResult) {
        for (const n of noteResult) {
          allNotes.push(n);
        }
      }
    }
  }

  // ===== 处理长音/持续音 =====
  if (analysis.sustained_notes) {
    for (const sus of analysis.sustained_notes) {
      const startBeat = sus.start_beat !== undefined ? sus.start_beat : secondsToBeat(sus.start_time, bpmList);
      const endBeat = sus.end_beat !== undefined ? sus.end_beat : secondsToBeat(sus.end_time, bpmList);
      const duration = endBeat - startBeat;

      if (duration >= diff.holdMinBeats) {
        allNotes.push({
          line: 0,
          note: makeNote(2, beatToTimeT(startBeat), beatToTimeT(endBeat), sus.position_x || 0)
        });
      }
    }
  }

  // ===== 处理高潮/能量标记 =====
  if (analysis.energy_curve) {
    processEnergyCurve(allEvents, analysis.energy_curve, bpmList, diff);
  }

  // ===== 处理特殊标记 =====
  if (analysis.markers) {
    for (const marker of analysis.markers) {
      const beatPos = marker.beat !== undefined ? marker.beat : secondsToBeat(marker.time, bpmList);
      processMarker(allNotes, allEvents, marker, beatPos, diff);
    }
  }

  // ===== 写入谱面 =====
  let addedNotes = 0;
  let addedEvents = 0;

  // 添加音符
  for (const { line, note } of allNotes) {
    const lineIdx = line || 0;
    if (lineIdx >= 0 && lineIdx < chartData.judgeLineList.length) {
      chartData.judgeLineList[lineIdx].notes.push(note);
      addedNotes++;
    }
  }

  // 排序音符
  for (const jl of chartData.judgeLineList) {
    const nonHold = jl.notes.filter(n => n.type !== 2);
    const holds = jl.notes.filter(n => n.type === 2);
    nonHold.sort((a, b) => compareTimeT(a.startTime, b.startTime));
    holds.sort((a, b) => compareTimeT(a.startTime, b.startTime));
    jl.notes = [...nonHold, ...holds];
    jl.numOfNotes = jl.notes.filter(n => n.isFake !== 1).length;
  }

  // 添加事件
  const EVENT_TYPE_MAP = {
    moveX: 'moveXEvents', moveY: 'moveYEvents',
    rotate: 'rotateEvents', alpha: 'alphaEvents', speed: 'speedEvents'
  };

  for (const { line, layer, type, event } of allEvents) {
    const lineIdx = line || 0;
    const layerIdx = layer || 0;
    if (lineIdx < 0 || lineIdx >= chartData.judgeLineList.length) continue;

    const jl = chartData.judgeLineList[lineIdx];
    const eventKey = EVENT_TYPE_MAP[type];
    if (!eventKey) continue;

    while (jl.eventLayers.length <= layerIdx) jl.eventLayers.push(null);
    if (!jl.eventLayers[layerIdx]) {
      jl.eventLayers[layerIdx] = {
        moveXEvents: [], moveYEvents: [], rotateEvents: [],
        alphaEvents: [], speedEvents: []
      };
    }

    // 移除内部标记
    const cleanEvent = { ...event };
    delete cleanEvent._type;
    jl.eventLayers[layerIdx][eventKey].push(cleanEvent);
    jl.eventLayers[layerIdx][eventKey].sort((a, b) => compareTimeT(a.startTime, b.startTime));
    addedEvents++;
  }

  return { addedNotes, addedEvents };
}

function mapBeatToNote(beatPos, intensity, sound, accent, diff) {
  const timeT = beatToTimeT(beatPos);
  const results = [];

  // 位置生成 — 避免总是在中间
  const posRange = diff.positionSpread;
  const randomX = () => Math.round((Math.random() - 0.5) * 2 * posRange);

  // 根据声音类型选择音符类型
  let noteType = 1; // 默认Tap

  if (sound === 'kick' || sound === 'bass') {
    noteType = 1; // Tap
  } else if (sound === 'snare' || sound === 'clap') {
    noteType = diff.useFlick && intensity >= 7 ? 3 : 1; // 强拍Flick
  } else if (sound === 'hihat' || sound === 'cymbal') {
    noteType = diff.useDrag ? 4 : 1; // Hi-hat用Drag
  } else if (sound === 'vocal') {
    noteType = 1; // 人声用Tap
  } else if (sound === 'melody') {
    noteType = 1;
  }

  // 基础音符
  results.push({ line: 0, note: makeNote(noteType, timeT, null, randomX()) });

  // 强重音 → 双押
  if (accent && intensity >= 8 && diff.maxSimultaneous >= 2) {
    const x1 = -Math.abs(randomX());
    const x2 = Math.abs(randomX());
    results.length = 0; // 替换单音符
    results.push({ line: 0, note: makeNote(noteType, timeT, null, x1) });
    results.push({ line: 0, note: makeNote(noteType, timeT, null, x2) });
  }

  // 超强重音 → 三押
  if (accent && intensity >= 10 && diff.maxSimultaneous >= 3) {
    results.push({ line: 0, note: makeNote(noteType, timeT, null, 0) });
  }

  return results;
}

function generateSectionEvents(allEvents, section, style, startBeat, endBeat, diff) {
  const startT = beatToTimeT(startBeat);
  const endT = beatToTimeT(endBeat);
  const duration = endBeat - startBeat;
  const midT = beatToTimeT(startBeat + duration / 2);

  // 透明度事件
  if (style.alpha === 'fade_in') {
    allEvents.push({ line: 0, layer: 0, type: 'alpha',
      event: makeEvent('alpha', startT, endT, 0, 255, 2) }); // outSine
  } else if (style.alpha === 'fade_out') {
    allEvents.push({ line: 0, layer: 0, type: 'alpha',
      event: makeEvent('alpha', startT, endT, 255, 0, 3) }); // inSine
  } else if (style.alpha === 'flash') {
    // 快闪 → 短暂消失再出现
    const flashT = beatToTimeT(startBeat + 0.25);
    allEvents.push({ line: 0, layer: 0, type: 'alpha',
      event: makeEvent('alpha', startT, flashT, 0, 255, 4) }); // outQuad
  } else if (style.alpha === 'dim') {
    allEvents.push({ line: 0, layer: 0, type: 'alpha',
      event: makeEvent('alpha', startT, endT, 128, 128, 1) });
  }

  // 移动事件
  const moveAmount = 300 * diff.lineMovement;
  if (style.lineStyle === 'gentle') {
    // 轻微左右浮动
    allEvents.push({ line: 0, layer: 0, type: 'moveX',
      event: makeEvent('moveX', startT, midT, 0, moveAmount * 0.3, 6) }); // ioSine
    allEvents.push({ line: 0, layer: 0, type: 'moveX',
      event: makeEvent('moveX', midT, endT, moveAmount * 0.3, 0, 6) });
  } else if (style.lineStyle === 'dramatic') {
    // 大幅左右移动
    const quarterT = beatToTimeT(startBeat + duration / 4);
    const threeQuarterT = beatToTimeT(startBeat + duration * 3 / 4);
    allEvents.push({ line: 0, layer: 0, type: 'moveX',
      event: makeEvent('moveX', startT, quarterT, 0, -moveAmount, 4) });
    allEvents.push({ line: 0, layer: 0, type: 'moveX',
      event: makeEvent('moveX', quarterT, midT, -moveAmount, 0, 4) });
    allEvents.push({ line: 0, layer: 0, type: 'moveX',
      event: makeEvent('moveX', midT, threeQuarterT, 0, moveAmount, 4) });
    allEvents.push({ line: 0, layer: 0, type: 'moveX',
      event: makeEvent('moveX', threeQuarterT, endT, moveAmount, 0, 4) });
  } else if (style.lineStyle === 'explosive') {
    // 爆发 → 从中心弹出
    const flashEndT = beatToTimeT(startBeat + 1);
    allEvents.push({ line: 0, layer: 0, type: 'moveY',
      event: makeEvent('moveY', startT, flashEndT, -100, 0, 20) }); // outBack
  } else if (style.lineStyle === 'float') {
    // 缓慢浮动
    allEvents.push({ line: 0, layer: 0, type: 'moveY',
      event: makeEvent('moveY', startT, endT, -50, 50, 6) }); // ioSine
  } else if (style.lineStyle === 'settle') {
    // 回归中心
    allEvents.push({ line: 0, layer: 0, type: 'moveX',
      event: makeEvent('moveX', startT, endT, undefined, 0, 2) });
    allEvents.push({ line: 0, layer: 0, type: 'moveY',
      event: makeEvent('moveY', startT, endT, undefined, 0, 2) });
  }

  // 旋转事件
  const rotateAmount = 45 * diff.lineRotation;
  if (style.lineStyle === 'dramatic' && rotateAmount > 0) {
    allEvents.push({ line: 0, layer: 0, type: 'rotate',
      event: makeEvent('rotate', startT, midT, 0, rotateAmount, 7) }); // ioQuad
    allEvents.push({ line: 0, layer: 0, type: 'rotate',
      event: makeEvent('rotate', midT, endT, rotateAmount, 0, 7) });
  } else if (style.lineStyle === 'spin' && rotateAmount > 0) {
    allEvents.push({ line: 0, layer: 0, type: 'rotate',
      event: makeEvent('rotate', startT, endT, 0, 360 * diff.lineRotation, 5) }); // inQuad
  } else if (style.lineStyle === 'explosive' && rotateAmount > 0) {
    const flashEndT = beatToTimeT(startBeat + 2);
    allEvents.push({ line: 0, layer: 0, type: 'rotate',
      event: makeEvent('rotate', startT, flashEndT, -30 * diff.lineRotation, 0, 24) }); // outElastic
  }
}

function processEnergyCurve(allEvents, energyCurve, bpmList, diff) {
  // 能量曲线 → 速度事件
  for (let i = 0; i < energyCurve.length - 1; i++) {
    const cur = energyCurve[i];
    const next = energyCurve[i + 1];

    const startBeat = cur.beat !== undefined ? cur.beat : secondsToBeat(cur.time, bpmList);
    const endBeat = next.beat !== undefined ? next.beat : secondsToBeat(next.time, bpmList);

    const startSpeed = diff.speedRange[0] + (cur.energy / 10) * (diff.speedRange[1] - diff.speedRange[0]);
    const endSpeed = diff.speedRange[0] + (next.energy / 10) * (diff.speedRange[1] - diff.speedRange[0]);

    allEvents.push({
      line: 0, layer: 0, type: 'speed',
      event: makeEvent('speed', beatToTimeT(startBeat), beatToTimeT(endBeat),
        Math.round(startSpeed * 10) / 10, Math.round(endSpeed * 10) / 10, 1)
    });
  }
}

function processMarker(allNotes, allEvents, marker, beatPos, diff) {
  const timeT = beatToTimeT(beatPos);

  switch (marker.type) {
    case 'impact': {
      // 冲击感 → 多个音符 + 线弹跳
      const spread = diff.positionSpread;
      allNotes.push({ line: 0, note: makeNote(1, timeT, null, -spread) });
      allNotes.push({ line: 0, note: makeNote(1, timeT, null, 0) });
      allNotes.push({ line: 0, note: makeNote(1, timeT, null, spread) });

      const endT = beatToTimeT(beatPos + 2);
      allEvents.push({ line: 0, layer: 0, type: 'moveY',
        event: makeEvent('moveY', timeT, endT, -80, 0, 24) }); // outElastic
      break;
    }

    case 'drop': {
      // 掉落/降音 → 大量Drag + 线下沉
      for (let i = 0; i < 8; i++) {
        const subBeat = beatPos + i * 0.125;
        const x = Math.round((Math.random() - 0.5) * diff.positionSpread * 2);
        allNotes.push({ line: 0, note: makeNote(4, beatToTimeT(subBeat), null, x) });
      }
      const endT = beatToTimeT(beatPos + 1);
      allEvents.push({ line: 0, layer: 0, type: 'moveY',
        event: makeEvent('moveY', timeT, endT, 200, -200, 17) }); // inExpo
      break;
    }

    case 'rise': {
      // 上升 → 音符位置逐渐向上扩散
      for (let i = 0; i < 8; i++) {
        const subBeat = beatPos + i * 0.125;
        const x = Math.round((i - 4) * diff.positionSpread / 4);
        allNotes.push({ line: 0, note: makeNote(4, beatToTimeT(subBeat), null, x) });
      }
      const endT = beatToTimeT(beatPos + 1);
      allEvents.push({ line: 0, layer: 0, type: 'moveY',
        event: makeEvent('moveY', timeT, endT, -200, 200, 16) }); // outExpo
      break;
    }

    case 'silence': {
      // 突然安静 → 清空 + 线消失
      const endT = beatToTimeT(beatPos + 0.5);
      allEvents.push({ line: 0, layer: 0, type: 'alpha',
        event: makeEvent('alpha', timeT, endT, 255, 0, 17) }); // inExpo
      break;
    }

    case 'climax': {
      // 高潮最强点 → 大Flick + 全屏特效感的多线
      allNotes.push({ line: 0, note: makeNote(3, timeT, null, -400) }); // Flick
      allNotes.push({ line: 0, note: makeNote(3, timeT, null, 0) });
      allNotes.push({ line: 0, note: makeNote(3, timeT, null, 400) });

      const endT = beatToTimeT(beatPos + 4);
      allEvents.push({ line: 0, layer: 0, type: 'rotate',
        event: makeEvent('rotate', timeT, endT, -15, 15, 24) }); // outElastic
      break;
    }

    case 'transition': {
      // 过渡 → Hold连接
      const endT = beatToTimeT(beatPos + (marker.duration_beats || 2));
      allNotes.push({ line: 0, note: makeNote(2, timeT, endT, 0) });
      break;
    }
  }
}

// ===== 主函数 =====

function main() {
  const args = parseArgs(process.argv);

  if (!args.chart || !args.analysis) {
    console.error(JSON.stringify({
      error: 'Missing --chart or --analysis parameter',
      usage: 'node auto-chart.js --chart <chart.json> --analysis <analysis.json> [--difficulty easy|normal|hard|expert]'
    }));
    process.exit(1);
  }

  const difficulty = args.difficulty || 'normal';
  if (!DIFFICULTY_PRESETS[difficulty]) {
    console.error(JSON.stringify({ error: `Unknown difficulty: ${difficulty}. Use: easy, normal, hard, expert` }));
    process.exit(1);
  }

  let chartData, analysis;
  try {
    chartData = JSON.parse(fs.readFileSync(args.chart, 'utf-8'));
  } catch (e) {
    console.error(JSON.stringify({ error: `Failed to read chart: ${e.message}` }));
    process.exit(1);
  }

  try {
    const analysisPath = path.resolve(args.analysis);
    analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  } catch (e) {
    console.error(JSON.stringify({ error: `Failed to read analysis: ${e.message}` }));
    process.exit(1);
  }

  // 验证必要字段
  if (!analysis.sections && !analysis.beats) {
    console.error(JSON.stringify({
      error: 'analysis.json 至少需要 sections 或 beats 字段',
      hint: '请参考 SKILL.md 中的 AI音乐分析输入规范'
    }));
    process.exit(1);
  }

  const result = processAnalysis(chartData, analysis, difficulty);

  fs.writeFileSync(args.chart, JSON.stringify(chartData, null, 2), 'utf-8');

  // 统计
  const totalNotes = chartData.judgeLineList.reduce((sum, l) => sum + l.notes.length, 0);
  const noteTypes = { tap: 0, hold: 0, flick: 0, drag: 0 };
  for (const l of chartData.judgeLineList) {
    for (const n of l.notes) {
      if (n.type === 1) noteTypes.tap++;
      else if (n.type === 2) noteTypes.hold++;
      else if (n.type === 3) noteTypes.flick++;
      else if (n.type === 4) noteTypes.drag++;
    }
  }

  console.log(JSON.stringify({
    success: true,
    difficulty: difficulty,
    addedNotes: result.addedNotes,
    addedEvents: result.addedEvents,
    totalNotes: totalNotes,
    noteTypes: noteTypes,
    sectionsProcessed: (analysis.sections || []).length,
    beatsProcessed: (analysis.beats || []).length,
    markersProcessed: (analysis.markers || []).length,
    message: `自动制谱完成！难度: ${difficulty}\n` +
      `添加 ${result.addedNotes} 个音符 (Tap:${noteTypes.tap} Hold:${noteTypes.hold} Flick:${noteTypes.flick} Drag:${noteTypes.drag})\n` +
      `添加 ${result.addedEvents} 个事件`
  }, null, 2));
}

main();
