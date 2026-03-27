#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function timeTToBeat(t) { return !t || t.length !== 3 ? 0 : t[0] + t[1] / t[2]; }
function beatToTimeT(beat) {
  const bar = Math.floor(beat);
  const frac = beat - bar;
  if (Math.abs(frac) < 0.001) return [bar, 0, 1];
  const den = 48;
  const num = Math.round(frac * den);
  const g = gcd(Math.abs(num), den);
  return [bar, num / g, den / g];
}
function compareTimeT(a, b) { return timeTToBeat(a.startTime || a) - timeTToBeat(b.startTime || b); }
function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function array(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(item => text(item)).filter(Boolean);
  return value === undefined || value === null || value === '' ? [] : [text(value)];
}
function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  return Math.abs(hash);
}
function parseTimestamp(raw) {
  const parts = text(raw).split(':').filter(Boolean);
  if (parts.length === 0) return NaN;
  let seconds = 0;
  for (const part of parts) {
    if (!/^[-+]?\d+(\.\d+)?$/.test(part)) return NaN;
    seconds = seconds * 60 + parseFloat(part);
  }
  return seconds;
}
function parseTimeRange(raw) {
  const [start, end] = text(raw).split('-');
  const startSeconds = parseTimestamp(start);
  const endSeconds = parseTimestamp(end);
  return Number.isFinite(startSeconds) && Number.isFinite(endSeconds) ? { startSeconds, endSeconds } : null;
}
function secondsToBeat(seconds, bpmList) {
  let currentTime = 0;
  for (let i = 0; i < bpmList.length; i++) {
    const current = bpmList[i];
    const currentBeat = timeTToBeat(current.startTime);
    const nextBeat = i + 1 < bpmList.length ? timeTToBeat(bpmList[i + 1].startTime) : Infinity;
    const beatDuration = 60 / current.bpm;
    const segSeconds = (nextBeat - currentBeat) * beatDuration;
    if (seconds < currentTime + segSeconds || i === bpmList.length - 1) {
      return currentBeat + (seconds - currentTime) / beatDuration;
    }
    currentTime += segSeconds;
  }
  return 0;
}
function vocalActive(value) {
  const normalized = text(value).toLowerCase();
  return normalized !== '' && !['无', 'none', 'instrumental', 'off', 'no vocal', '无人声', '纯音乐'].includes(normalized);
}

const DIFFICULTY = {
  easy: { density: 0.45, maxSim: 1, useFlick: false, useDrag: false, spread: 180, lineMove: 0.35, lineRot: 0.2, introStep: 2 },
  normal: { density: 0.7, maxSim: 2, useFlick: true, useDrag: true, spread: 260, lineMove: 0.55, lineRot: 0.45, introStep: 1.5 },
  hard: { density: 0.9, maxSim: 2, useFlick: true, useDrag: true, spread: 360, lineMove: 0.75, lineRot: 0.7, introStep: 1.25 },
  expert: { density: 1, maxSim: 3, useFlick: true, useDrag: true, spread: 440, lineMove: 1, lineRot: 1, introStep: 1 }
};

const SECTION_TYPES = {
  intro: 'intro', verse: 'verse', 'pre-chorus': 'pre_chorus', pre_chorus: 'pre_chorus', prechorus: 'pre_chorus',
  chorus: 'chorus', climax_chorus: 'chorus', drop: 'drop', bridge: 'bridge', breakdown: 'breakdown',
  buildup: 'buildup', build: 'buildup', outro: 'outro', outro_fade: 'outro', instrumental: 'instrumental', silence: 'silence'
};

const INSTRUMENT_LINES = [
  { line: 0, keys: ['vocal', 'voice', 'singer', 'human', 'rock', 'pop', 'blues', 'latin', 'folk', 'acoustic', 'guitar', 'band', '人声', '主唱'] },
  { line: 1, keys: ['electronic', 'edm', 'electro', 'synth', 'dance', 'house', 'techno', 'trance', 'dubstep', 'bass', 'chip', '电子', '合成', '低音'] },
  { line: 2, keys: ['classical', 'jazz', 'piano', 'orchestra', 'orchestral', 'string', 'strings', 'stage', 'screen', 'ambient', 'cinematic', '古典', '爵士', '钢琴', '弦乐'] },
  { line: 3, keys: ['hip hop', 'hiphop', 'rap', 'trap', 'drill', 'r&b', '说唱', '嘻哈'] }
];

const LYRIC_MOTIFS = [
  { kind: 'lift', keys: ['光', '日', '太阳', '黎明', '天', '飞', '升', '希望', 'shine', 'light', 'sun', 'dawn', 'sky', 'rise', 'up', 'bright'] },
  { kind: 'fall', keys: ['夜', '暗', '黑', '泪', '雨', '沉', '落', '坠', 'cry', 'tear', 'dark', 'night', 'shadow', 'down', 'fall', 'deep', 'sink'] },
  { kind: 'sway', keys: ['风', '花', '海', '河', '月', '星', 'wave', 'wind', 'flower', 'float', 'river', 'moon', 'star', 'cloud'] },
  { kind: 'pulse', keys: ['火', '燃', '电', '心', 'glow', 'fire', 'burn', 'beat', 'pulse', 'spark'] },
  { kind: 'break', keys: ['碎', '破', '击', '战', 'storm', 'break', 'smash', 'impact', 'fight', 'crash', 'hit'] },
  { kind: 'spin', keys: ['梦', '迷', '钟', '转', '旋', 'twist', 'spin', 'dream', 'maze', 'clock'] },
  { kind: 'fade', keys: ['静', '空', 'alone', 'quiet', 'empty', 'fade', 'silence', '无声'] }
];

const args = parseArgs(process.argv);
if (!args.chart || !args.tracks) {
  console.error(JSON.stringify({ error: 'Missing --chart or --tracks parameter' }));
  process.exit(1);
}

const difficultyName = args.difficulty || 'normal';
if (!DIFFICULTY[difficultyName]) {
  console.error(JSON.stringify({ error: `Unknown difficulty: ${difficultyName}. Use: easy, normal, hard, expert` }));
  process.exit(1);
}

let chart;
let tracksInput;
let analysis = null;
try { chart = JSON.parse(fs.readFileSync(args.chart, 'utf-8')); } catch (error) {
  console.error(JSON.stringify({ error: `Failed to read chart: ${error.message}` }));
  process.exit(1);
}
try { tracksInput = JSON.parse(fs.readFileSync(args.tracks, 'utf-8')); } catch (error) {
  console.error(JSON.stringify({ error: `Failed to read tracks: ${error.message}` }));
  process.exit(1);
}
if (args.analysis) {
  try { analysis = JSON.parse(fs.readFileSync(args.analysis, 'utf-8')); } catch (error) {
    console.error(JSON.stringify({ error: `Failed to read analysis: ${error.message}` }));
    process.exit(1);
  }
}

const diff = DIFFICULTY[difficultyName];
const bpmList = chart.BPMList || [];
const totalLines = (chart.judgeLineList || []).length;
if (bpmList.length === 0 || totalLines === 0) {
  console.error(JSON.stringify({ error: 'Chart must contain BPMList and judgeLineList' }));
  process.exit(1);
}
chart.META.RPEVersion = Math.max(chart.META && chart.META.RPEVersion ? chart.META.RPEVersion : 150, 170);

let rngState = hashString(`${chart.META && chart.META.id ? chart.META.id : 'chart'}:${path.resolve(args.tracks)}:${difficultyName}`) || 42;
function rng() {
  rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff;
  return rngState / 0x7fffffff;
}

const lineNotes = {};
const lineEvents = {};
const baseMsPerBeat = 60000 / bpmList[0].bpm;

function noteState(line) { if (!lineNotes[line]) lineNotes[line] = []; return lineNotes[line]; }
function eventKey(line, layer, type) { return `${line}:${layer}:${type}`; }

function seedExistingState() {
  const eventMap = { moveX: 'moveXEvents', moveY: 'moveYEvents', rotate: 'rotateEvents', alpha: 'alphaEvents', speed: 'speedEvents' };
  for (let line = 0; line < chart.judgeLineList.length; line++) {
    const judgeLine = chart.judgeLineList[line];
    for (const note of judgeLine.notes || []) {
      noteState(line).push({
        beat: timeTToBeat(note.startTime),
        endBeat: note.type === 2 ? timeTToBeat(note.endTime) : timeTToBeat(note.startTime),
        type: note.type,
        x: note.positionX || 0,
        isFake: note.isFake === 1
      });
    }
    for (let layer = 0; layer < (judgeLine.eventLayers || []).length; layer++) {
      const current = judgeLine.eventLayers[layer];
      if (!current) continue;
      for (const [type, key] of Object.entries(eventMap)) {
        for (const event of current[key] || []) {
          const storeKey = eventKey(line, layer, type);
          if (!lineEvents[storeKey]) lineEvents[storeKey] = [];
          lineEvents[storeKey].push({ start: timeTToBeat(event.startTime), end: timeTToBeat(event.endTime) });
        }
      }
    }
  }
}

function canPlace(beat, endBeat, type, x, line) {
  for (const note of noteState(line)) {
    if (note.isFake) continue;
    const deltaMs = Math.abs(note.beat - beat) * baseMsPerBeat;
    const sameArea = Math.abs(note.x - x) < 150;
    const timeOverlap = beat < note.endBeat + 0.1 && endBeat > note.beat - 0.1;
    if (sameArea && (type === 2 || note.type === 2) && timeOverlap) return false;
    if (sameArea && deltaMs < 8 && (type <= 2 || note.type <= 2)) return false;
    if (type === 1 && (note.type === 3 || note.type === 4) && deltaMs > 0 && deltaMs < 250) return false;
    if (note.type === 1 && (type === 3 || type === 4) && deltaMs > 0 && deltaMs < 250) return false;
  }
  return true;
}

function makeNote(type, startBeat, endBeat, x, isFake) {
  const startTime = beatToTimeT(startBeat);
  return {
    above: 1,
    alpha: isFake ? 128 : 255,
    endTime: type === 2 ? beatToTimeT(endBeat) : [...startTime],
    isFake: isFake ? 1 : 0,
    positionX: clamp(Math.round(x), -675, 675),
    size: 1,
    speed: 1,
    startTime,
    type,
    visibleTime: 999999.0,
    yOffset: 0
  };
}

function placeNote(beat, type, x, line, isFake) {
  if (line < 0 || line >= totalLines) return false;
  const px = clamp(Math.round(x), -675, 675);
  if (!isFake && !canPlace(beat, beat, type, px, line)) return false;
  chart.judgeLineList[line].notes.push(makeNote(type, beat, beat, px, isFake));
  noteState(line).push({ beat, endBeat: beat, type, x: px, isFake });
  return true;
}

function placeHold(startBeat, endBeat, x, line) {
  if (line < 0 || line >= totalLines || endBeat <= startBeat + 0.25) return false;
  const px = clamp(Math.round(x), -675, 675);
  if (!canPlace(startBeat, endBeat, 2, px, line)) return false;
  chart.judgeLineList[line].notes.push(makeNote(2, startBeat, endBeat, px, false));
  noteState(line).push({ beat: startBeat, endBeat, type: 2, x: px, isFake: false });
  return true;
}

function placeEvent(line, layer, type, startBeat, endBeat, start, end, easingType) {
  if (line < 0 || line >= totalLines || endBeat <= startBeat + 0.01) return false;
  const key = eventKey(line, layer, type);
  for (const event of lineEvents[key] || []) {
    if (startBeat < event.end - 0.01 && endBeat > event.start + 0.01) return false;
  }
  const judgeLine = chart.judgeLineList[line];
  while ((judgeLine.eventLayers || []).length <= layer) judgeLine.eventLayers.push(null);
  if (!judgeLine.eventLayers[layer]) {
    judgeLine.eventLayers[layer] = { moveXEvents: [], moveYEvents: [], rotateEvents: [], alphaEvents: [], speedEvents: [] };
  }
  const target = { moveX: 'moveXEvents', moveY: 'moveYEvents', rotate: 'rotateEvents', alpha: 'alphaEvents', speed: 'speedEvents' }[type];
  if (!target) return false;
  judgeLine.eventLayers[layer][target].push({
    bezier: 0, bezierPoints: [0, 0, 0, 0], easingLeft: 0, easingRight: 1, easingType: easingType || 1,
    end, endTime: beatToTimeT(endBeat), linkgroup: 0, start, startTime: beatToTimeT(startBeat)
  });
  if (!lineEvents[key]) lineEvents[key] = [];
  lineEvents[key].push({ start: startBeat, end: endBeat });
  return true;
}

function sectionsFromAnalysis() {
  const source = Array.isArray(analysis && analysis.sections) ? analysis.sections : [];
  return source.map(section => {
    const startBeat = section.start_beat !== undefined ? Number(section.start_beat) : secondsToBeat(Number(section.start_time || 0), bpmList);
    const endBeat = section.end_beat !== undefined ? Number(section.end_beat) : secondsToBeat(Number(section.end_time || 0), bpmList);
    return {
      type: SECTION_TYPES[section.type || section.name] || 'verse',
      startBeat,
      endBeat,
      energy: clamp(Number(section.energy || 5), 1, 10)
    };
  }).filter(section => Number.isFinite(section.startBeat) && Number.isFinite(section.endBeat) && section.endBeat > section.startBeat);
}

const sections = sectionsFromAnalysis();
function sectionForBeat(beat) { return sections.find(section => beat >= section.startBeat && beat < section.endBeat) || null; }
function sectionForRange(startBeat, endBeat) { return sectionForBeat(startBeat + (endBeat - startBeat) / 2); }

function estimateEnergy(segment) {
  let energy = 4 + Math.min(segment.instruments.length, 3);
  if (segment.vocalActive) energy += 1;
  if (/16|十六/.test(segment.drumRhythm)) energy += 2;
  else if (/8|八分/.test(segment.drumRhythm)) energy += 1;
  if (segment.section && ['chorus', 'drop', 'buildup'].includes(segment.section.type)) energy += 2;
  return clamp(energy, 2, 10);
}

function normalizeSegments(input) {
  const source = Array.isArray(input) ? input : Array.isArray(input && input.analysis) ? input.analysis : [];
  return source.map((segment, index) => {
    let startBeat;
    let endBeat;
    if (segment.start_beat !== undefined && segment.end_beat !== undefined) {
      startBeat = Number(segment.start_beat);
      endBeat = Number(segment.end_beat);
    } else if (segment.start_time !== undefined && segment.end_time !== undefined) {
      startBeat = secondsToBeat(Number(segment.start_time), bpmList);
      endBeat = secondsToBeat(Number(segment.end_time), bpmList);
    } else if (segment.time_range) {
      const range = parseTimeRange(segment.time_range);
      if (range) {
        startBeat = secondsToBeat(range.startSeconds, bpmList);
        endBeat = secondsToBeat(range.endSeconds, bpmList);
      }
    }
    if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat) || endBeat <= startBeat) return null;

    const instruments = array(segment.active_instruments || segment.instruments || segment.tracks);
    const lyrics = text(segment.lyrics);
    const vocalState = text(segment.vocal_state || segment.vocals || segment.voice);
    const section = sectionForRange(startBeat, endBeat);
    const normalized = {
      index,
      startBeat,
      endBeat,
      instruments,
      lyrics,
      vocalState,
      vocalActive: vocalActive(vocalState) || lyrics.length > 0,
      drumRhythm: text(segment.drum_rhythm || segment.rhythm),
      section
    };
    normalized.energy = clamp(Number(segment.energy || (section && section.energy) || estimateEnergy(normalized)), 1, 10);
    return normalized;
  }).filter(Boolean).sort((a, b) => a.startBeat - b.startBeat);
}

const trackSegments = normalizeSegments(tracksInput);
if (trackSegments.length === 0) {
  console.error(JSON.stringify({ error: 'tracks.json did not contain any valid segments' }));
  process.exit(1);
}

function matchInstrumentLine(instrument) {
  const normalized = text(instrument).toLowerCase();
  for (const rule of INSTRUMENT_LINES) {
    if (rule.keys.some(key => normalized.includes(key))) return rule.line;
  }
  return null;
}

function chooseLines(segment) {
  const lines = [];
  if (segment.vocalActive && totalLines > 0) lines.push(0);
  for (const instrument of segment.instruments) {
    const line = matchInstrumentLine(instrument);
    if (line !== null && line < totalLines) lines.push(line);
  }
  if (lines.length === 0) {
    const fallback = [0, 1, 2, 3].filter(line => line < totalLines);
    lines.push(fallback[segment.index % fallback.length]);
  }
  return [...new Set(lines)].slice(0, Math.min(totalLines, 3));
}

function lyricMotifs(lyrics) {
  const normalized = text(lyrics).toLowerCase();
  if (!normalized) return [];
  const motifs = [];
  for (const rule of LYRIC_MOTIFS) {
    if (rule.keys.some(key => normalized.includes(key))) motifs.push(rule.kind);
  }
  return motifs;
}

function instrumentMotifs(segment) {
  const joined = segment.instruments.map(item => text(item).toLowerCase()).join(' ');
  if (joined.includes('electronic') || joined.includes('synth') || joined.includes('电子')) return ['pulse', 'sway'];
  if (joined.includes('jazz') || joined.includes('classical') || joined.includes('piano') || joined.includes('钢琴') || joined.includes('弦乐')) return ['lift', 'fade'];
  if (joined.includes('hip hop') || joined.includes('rap') || joined.includes('说唱')) return ['break', 'pulse'];
  if (joined.includes('rock') || joined.includes('guitar') || joined.includes('band') || joined.includes('摇滚')) return ['break', 'sway'];
  return ['sway'];
}

for (const segment of trackSegments) {
  segment.lines = chooseLines(segment);
  segment.motifs = lyricMotifs(segment.lyrics);
  if (segment.motifs.length === 0) segment.motifs = instrumentMotifs(segment);
}

function segmentAtBeat(beat) {
  return trackSegments.find(segment => beat >= segment.startBeat && beat < segment.endBeat) || trackSegments[trackSegments.length - 1];
}

function baseX(line) {
  const preset = [0, -240, 240, 0];
  if (line < preset.length) return preset[line];
  return (line % 2 === 0 ? -1 : 1) * (120 + (line % 4) * 70);
}

function randomX(line, factor) {
  return baseX(line) + (rng() - 0.5) * 2 * diff.spread * factor;
}

function rhythmStep(segment) {
  const rhythm = segment ? segment.drumRhythm.toLowerCase() : '';
  if (rhythm.includes('trip') || rhythm.includes('三连')) return 1 / 3;
  if (rhythm.includes('16') || rhythm.includes('十六')) return 0.25;
  if (rhythm.includes('8') || rhythm.includes('八分')) return 0.5;
  if (rhythm.includes('2') || rhythm.includes('二分') || rhythm.includes('half')) return 2;
  return 1;
}

function inferSound(segment) {
  if (segment.vocalActive) return 'vocal';
  const joined = segment.instruments.map(item => text(item).toLowerCase()).join(' ');
  if (joined.includes('electronic') || joined.includes('synth') || joined.includes('电子')) return 'synth';
  if (joined.includes('piano') || joined.includes('classical') || joined.includes('jazz') || joined.includes('钢琴')) return 'melody';
  if (joined.includes('bass') || joined.includes('低音')) return 'bass';
  return 'kick';
}

function accentBeat(beat, step, segment) {
  if (Math.abs(beat - Math.round(beat)) < 0.001) return true;
  if (step >= 1) return true;
  return segment.energy >= 8 && Math.abs((beat * 2) - Math.round(beat * 2)) < 0.001;
}

function beatsFromInput() {
  if (analysis && Array.isArray(analysis.beats) && analysis.beats.length > 0) {
    return analysis.beats.map(beat => ({
      beat: beat.beat !== undefined ? Number(beat.beat) : secondsToBeat(Number(beat.time || 0), bpmList),
      intensity: clamp(Number(beat.intensity || 5), 1, 10),
      sound: text(beat.sound || beat.sound_type || 'kick').toLowerCase(),
      accent: Boolean(beat.accent !== undefined ? beat.accent : beat.is_accent)
    })).filter(beat => Number.isFinite(beat.beat)).sort((a, b) => a.beat - b.beat);
  }

  const generated = [];
  for (const segment of trackSegments) {
    const step = rhythmStep(segment);
    let beat = Math.ceil((segment.startBeat / step) - 1e-6) * step;
    if (beat < segment.startBeat) beat += step;
    while (beat < segment.endBeat - 1e-6) {
      generated.push({
        beat,
        intensity: clamp(Math.round(segment.energy), 1, 10),
        sound: inferSound(segment),
        accent: accentBeat(beat, step, segment)
      });
      beat += step;
    }
  }
  return generated;
}

function selectLine(sound, segment) {
  const lines = segment ? segment.lines : [0];
  if (sound === 'vocal' || sound === 'melody') return segment && segment.vocalActive && lines.includes(0) ? 0 : lines[0];
  if (['hihat', 'cymbal', 'synth', 'fx'].includes(sound)) return lines.find(line => line === 1) ?? lines[1] ?? lines[0];
  if (sound === 'bass') return lines[lines.length - 1];
  return lines[0];
}

function noteType(sound, intensity) {
  if ((sound === 'snare' || sound === 'clap') && diff.useFlick && intensity >= 8) return 3;
  if ((sound === 'hihat' || sound === 'cymbal' || sound === 'synth' || sound === 'fx') && diff.useDrag) return 4;
  return 1;
}

function addCompanions(beat, currentType, primaryLine, segment, x) {
  const others = (segment ? segment.lines : [primaryLine]).filter(line => line !== primaryLine);
  if (diff.maxSim > 1) {
    const line = others[0] !== undefined ? others[0] : primaryLine;
    placeNote(beat, currentType === 4 ? 1 : currentType, line === primaryLine ? -x : randomX(line, 0.35), line, false);
  }
  if (diff.maxSim > 2) {
    const line = others[1] !== undefined ? others[1] : others[0] !== undefined ? others[0] : primaryLine;
    placeNote(beat, 1, line === primaryLine ? 0 : randomX(line, 0.2), line, false);
  }
}

function applyMotif(line, motif, startBeat, endBeat, energy) {
  const duration = endBeat - startBeat;
  const midBeat = startBeat + duration / 2;
  const move = clamp(45 + energy * 20 * diff.lineMove, 40, 260);
  const rotate = clamp(2 + energy * 1.8 * diff.lineRot, 0, 18);
  const lowAlpha = clamp(255 - energy * 12, 120, 220);

  if (motif === 'lift') {
    placeEvent(line, 1, 'moveY', startBeat, endBeat, move * 0.4, -move * 0.4, 2);
  } else if (motif === 'fall') {
    placeEvent(line, 1, 'moveY', startBeat, endBeat, -move * 0.3, move * 0.45, 3);
    placeEvent(line, 1, 'alpha', startBeat, endBeat, 255, lowAlpha, 3);
  } else if (motif === 'pulse') {
    placeEvent(line, 1, 'alpha', startBeat, endBeat, lowAlpha, 255, 16);
    placeEvent(line, 1, 'moveY', startBeat, midBeat, 0, -move * 0.2, 20);
    placeEvent(line, 1, 'moveY', midBeat, endBeat, -move * 0.2, 0, 24);
  } else if (motif === 'break') {
    placeEvent(line, 1, 'moveX', startBeat, midBeat, 0, move * 0.75, 5);
    placeEvent(line, 1, 'moveX', midBeat, endBeat, move * 0.75, -move * 0.25, 4);
    if (rotate > 0) placeEvent(line, 1, 'rotate', startBeat, endBeat, -rotate, rotate, 24);
  } else if (motif === 'spin') {
    if (rotate > 0) {
      placeEvent(line, 1, 'rotate', startBeat, midBeat, -rotate, rotate, 7);
      placeEvent(line, 1, 'rotate', midBeat, endBeat, rotate, 0, 4);
    }
  } else if (motif === 'fade') {
    placeEvent(line, 1, 'alpha', startBeat, endBeat, 255, lowAlpha, 3);
  } else {
    placeEvent(line, 1, 'moveX', startBeat, midBeat, -move * 0.45, move * 0.45, 6);
    placeEvent(line, 1, 'moveX', midBeat, endBeat, move * 0.45, 0, 6);
  }
}

function introPerformance(introEndBeat) {
  if (!(introEndBeat > 1)) return;
  for (let beat = 1; beat < introEndBeat; beat += diff.introStep) {
    const segment = segmentAtBeat(beat);
    const line = segment.lines[0];
    const side = Math.floor((beat - 1) / diff.introStep) % 2 === 0 ? -1 : 1;
    placeNote(beat, 4, baseX(line) + side * (160 + rng() * 180), line, true);
  }
  const introLines = [...new Set(trackSegments.filter(segment => segment.startBeat < introEndBeat).flatMap(segment => segment.lines))];
  for (const line of introLines) {
    const amount = 80 + line * 30;
    placeEvent(line, 1, 'alpha', 0.5, Math.min(introEndBeat, 6), 0, 220, 2);
    placeEvent(line, 1, 'moveX', 0.5, introEndBeat, -amount, amount, 6);
    placeEvent(line, 1, 'moveY', 0.5, introEndBeat, -40, 40, 6);
    placeEvent(line, 1, 'rotate', 0.5, introEndBeat, 0, clamp(6 * diff.lineRot, 0, 10), 6);
  }
}

function segmentPerformance(segment) {
  const duration = segment.endBeat - segment.startBeat;
  if (duration <= 0.5) return;
  const motifs = [...new Set(segment.motifs)].slice(0, 2);
  const windows = motifs.length > 1
    ? [[segment.startBeat, segment.startBeat + duration / 2], [segment.startBeat + duration / 2, segment.endBeat]]
    : [[segment.startBeat, segment.endBeat]];
  motifs.forEach((motif, index) => applyMotif(segment.lines[0], motif, windows[index][0], windows[index][1], segment.energy));

  if (segment.lines[1] !== undefined && segment.energy >= 6) {
    const counter = clamp(30 + segment.energy * 10 * diff.lineMove, 30, 120);
    placeEvent(segment.lines[1], 1, 'moveX', segment.startBeat, segment.endBeat, counter, -counter, 6);
    placeEvent(segment.lines[1], 1, 'alpha', segment.startBeat, segment.endBeat, 220, 255, 2);
  }
  if (segment.section && ['chorus', 'drop', 'buildup'].includes(segment.section.type)) {
    for (const line of segment.lines) placeEvent(line, 1, 'alpha', segment.startBeat, segment.endBeat, 200, 255, 2);
  }
}

function addBeats() {
  for (const beatEntry of beatsFromInput()) {
    const segment = segmentAtBeat(beatEntry.beat);
    if (rng() > diff.density && beatEntry.intensity < 8) continue;
    const line = selectLine(beatEntry.sound, segment);
    const type = noteType(beatEntry.sound, beatEntry.intensity);
    const x = randomX(line, 0.45);
    if (placeNote(beatEntry.beat, type, x, line, false) && beatEntry.accent && beatEntry.intensity >= 8) {
      addCompanions(beatEntry.beat, type, line, segment, x);
    }
  }
}

function addSustained() {
  const sustained = Array.isArray(analysis && analysis.sustained_notes) ? analysis.sustained_notes : [];
  for (const item of sustained) {
    const startBeat = item.start_beat !== undefined ? Number(item.start_beat) : secondsToBeat(Number(item.start_time || 0), bpmList);
    const endBeat = item.end_beat !== undefined ? Number(item.end_beat) : secondsToBeat(Number(item.end_time || 0), bpmList);
    if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat) || endBeat <= startBeat + 0.5) continue;
    const segment = segmentAtBeat(startBeat);
    const line = segment && segment.vocalActive && segment.lines.includes(0) ? 0 : segment.lines[0];
    const x = item.position_x !== undefined ? Number(item.position_x) : baseX(line) + (rng() < 0.5 ? -90 : 90);
    placeHold(startBeat, Math.min(endBeat, startBeat + 4), x, line);
  }
}

function addMarkers() {
  const markers = Array.isArray(analysis && analysis.markers) ? analysis.markers : [];
  for (const marker of markers) {
    const beat = marker.beat !== undefined ? Number(marker.beat) : secondsToBeat(Number(marker.time || 0), bpmList);
    if (!Number.isFinite(beat)) continue;
    const segment = segmentAtBeat(beat);
    const lines = segment ? segment.lines : [0];
    const primary = lines[0];

    if (marker.type === 'impact') {
      placeNote(beat, 1, baseX(primary) - 180, primary, false);
      placeNote(beat, 1, baseX(primary), primary, false);
      placeNote(beat, 1, baseX(primary) + 180, primary, false);
      placeEvent(primary, 1, 'moveY', beat, beat + 1.5, -60, 0, 24);
    } else if (marker.type === 'drop') {
      for (let i = 0; i < 4; i++) placeNote(beat + i * 0.25, diff.useDrag ? 4 : 1, randomX(lines[i % lines.length], 0.2), lines[i % lines.length], false);
      placeEvent(primary, 1, 'moveY', beat, beat + 1, 80, -90, 17);
    } else if (marker.type === 'rise') {
      for (let i = 0; i < Math.min(3, diff.maxSim); i++) placeNote(beat + i * 0.5, 1, baseX(lines[i % lines.length]) + (i - 1) * 120, lines[i % lines.length], false);
      placeEvent(primary, 1, 'moveY', beat, beat + 2, 60, -80, 16);
    } else if (marker.type === 'climax') {
      for (let i = 0; i < Math.min(lines.length, diff.maxSim); i++) placeNote(beat, diff.useFlick ? 3 : 1, baseX(lines[i]), lines[i], false);
      placeEvent(primary, 1, 'rotate', beat, beat + 3, -10, 10, 24);
    } else if (marker.type === 'silence') {
      for (const line of lines) placeEvent(line, 1, 'alpha', beat, beat + 0.5, 255, 60, 17);
    } else if (marker.type === 'transition') {
      placeHold(beat, beat + clamp(Number(marker.duration_beats || 2), 0.5, 4), baseX(primary), primary);
    }
  }
}

function addEnergy() {
  const curve = Array.isArray(analysis && analysis.energy_curve) ? analysis.energy_curve : [];
  if (curve.length < 2) return;
  const drivenLines = [...new Set(trackSegments.flatMap(segment => segment.lines))];
  for (let i = 0; i < curve.length - 1; i++) {
    const current = curve[i];
    const next = curve[i + 1];
    const startBeat = current.beat !== undefined ? Number(current.beat) : secondsToBeat(Number(current.time || 0), bpmList);
    const endBeat = next.beat !== undefined ? Number(next.beat) : secondsToBeat(Number(next.time || 0), bpmList);
    if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat) || endBeat <= startBeat) continue;
    const start = Math.max(startBeat, 1.01);
    if (start >= endBeat) continue;
    const startSpeed = 9 + clamp(Number(current.energy || 5), 1, 10) / 10 * 2.4;
    const endSpeed = 9 + clamp(Number(next.energy || 5), 1, 10) / 10 * 2.4;
    for (const line of drivenLines) {
      placeEvent(line, 0, 'speed', start, endBeat, Math.round(startSpeed * 10) / 10, Math.round(endSpeed * 10) / 10, 1);
    }
  }
}

function finalize() {
  for (const judgeLine of chart.judgeLineList) {
    const nonHold = (judgeLine.notes || []).filter(note => note.type !== 2).sort(compareTimeT);
    const holds = (judgeLine.notes || []).filter(note => note.type === 2).sort(compareTimeT);
    judgeLine.notes = [...nonHold, ...holds];
    judgeLine.numOfNotes = judgeLine.notes.filter(note => note.isFake !== 1).length;
    for (const layer of judgeLine.eventLayers || []) {
      if (!layer) continue;
      for (const key of Object.keys(layer)) if (Array.isArray(layer[key])) layer[key].sort(compareTimeT);
    }
  }
}

seedExistingState();
const firstLead = trackSegments.find(segment => segment.vocalActive || segment.lyrics);
const introEndBeat = firstLead ? firstLead.startBeat : Math.min(trackSegments[0].endBeat, trackSegments[0].startBeat + 8);
introPerformance(introEndBeat);
for (const segment of trackSegments) segmentPerformance(segment);
addBeats();
addSustained();
addMarkers();
addEnergy();
finalize();

fs.writeFileSync(args.chart, JSON.stringify(chart, null, 2), 'utf-8');

let totalNotes = 0;
let fakeNotes = 0;
const noteTypes = { tap: 0, hold: 0, flick: 0, drag: 0 };
const linesUsed = new Set();
for (let line = 0; line < chart.judgeLineList.length; line++) {
  const judgeLine = chart.judgeLineList[line];
  if ((judgeLine.notes || []).length > 0) linesUsed.add(line);
  for (const note of judgeLine.notes || []) {
    totalNotes++;
    if (note.isFake === 1) fakeNotes++;
    if (note.type === 1) noteTypes.tap++;
    else if (note.type === 2) noteTypes.hold++;
    else if (note.type === 3) noteTypes.flick++;
    else if (note.type === 4) noteTypes.drag++;
  }
}

console.log(JSON.stringify({
  success: true,
  difficulty: difficultyName,
  segmentsProcessed: trackSegments.length,
  linesUsed: [...linesUsed].sort((a, b) => a - b),
  totalNotes,
  fakeNotes,
  realNotes: totalNotes - fakeNotes,
  noteTypes,
  totalEvents: Object.values(lineEvents).reduce((sum, events) => sum + events.length, 0),
  message: `多音轨制谱完成，处理 ${trackSegments.length} 个分段，使用 ${linesUsed.size} 条判定线`
}, null, 2));
