#!/usr/bin/env node

/**
 * add-notes.js — 向 RPEJSON 谱面批量添加音符
 *
 * Usage:
 *   node add-notes.js --chart <chart.json> --notes <notes_json>
 *
 * notes_json 是一个 JSON 数组，每个元素包含：
 *   line: 判定线编号
 *   type: 1=Tap, 2=Hold, 3=Flick, 4=Drag
 *   startTime: [bar, num, den]
 *   endTime: [bar, num, den] (Hold 必填)
 *   positionX: X坐标 (-675~675)
 *   above: 1=上方, 2=下方 (默认1)
 *   speed: 速度倍率 (默认1)
 *   size: 宽度倍率 (默认1)
 *   alpha: 不透明度 (默认255)
 *   isFake: 0=真, 1=假 (默认0)
 *   visibleTime: 可视时间秒 (默认999999)
 *   yOffset: Y偏移 (默认0)
 */

const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

function makeNote(noteData) {
  const type = noteData.type || 1;
  const startTime = noteData.startTime || [0, 0, 1];
  let endTime = noteData.endTime;

  // Non-Hold notes: endTime = startTime
  if (type !== 2) {
    endTime = [...startTime];
  } else if (!endTime) {
    console.error(JSON.stringify({ error: 'Hold notes must have endTime' }));
    process.exit(1);
  }

  return {
    above: noteData.above !== undefined ? noteData.above : 1,
    alpha: noteData.alpha !== undefined ? noteData.alpha : 255,
    endTime: endTime,
    isFake: noteData.isFake || 0,
    positionX: noteData.positionX !== undefined ? noteData.positionX : 0,
    size: noteData.size !== undefined ? noteData.size : 1,
    speed: noteData.speed !== undefined ? noteData.speed : 1,
    startTime: startTime,
    type: type,
    visibleTime: noteData.visibleTime !== undefined ? noteData.visibleTime : 999999.0,
    yOffset: noteData.yOffset || 0
  };
}

function compareTimeT(a, b) {
  const aVal = a[0] + a[1] / a[2];
  const bVal = b[0] + b[1] / b[2];
  return aVal - bVal;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.chart || !args.notes) {
    console.error(JSON.stringify({ error: 'Missing --chart or --notes parameter' }));
    process.exit(1);
  }

  // Read chart
  const chartData = JSON.parse(fs.readFileSync(args.chart, 'utf-8'));

  // Parse notes (from file or inline JSON)
  let notesInput;
  try {
    if (fs.existsSync(args.notes)) {
      notesInput = JSON.parse(fs.readFileSync(args.notes, 'utf-8'));
    } else {
      notesInput = JSON.parse(args.notes);
    }
  } catch (e) {
    console.error(JSON.stringify({ error: `Failed to parse notes: ${e.message}` }));
    process.exit(1);
  }

  if (!Array.isArray(notesInput)) {
    notesInput = [notesInput];
  }

  let addedCount = 0;
  const lineStats = {};

  for (const noteData of notesInput) {
    const lineIdx = noteData.line || 0;

    if (lineIdx < 0 || lineIdx >= chartData.judgeLineList.length) {
      console.error(JSON.stringify({
        warning: `Line ${lineIdx} does not exist (total lines: ${chartData.judgeLineList.length}), skipping note`
      }));
      continue;
    }

    const note = makeNote(noteData);
    const line = chartData.judgeLineList[lineIdx];
    line.notes.push(note);
    addedCount++;

    if (!lineStats[lineIdx]) lineStats[lineIdx] = 0;
    lineStats[lineIdx]++;
  }

  // Sort notes on each affected line: non-Hold first (sorted by time), then Hold (sorted by time)
  for (const lineIdxStr of Object.keys(lineStats)) {
    const lineIdx = parseInt(lineIdxStr);
    const line = chartData.judgeLineList[lineIdx];
    const nonHold = line.notes.filter(n => n.type !== 2);
    const holds = line.notes.filter(n => n.type === 2);
    nonHold.sort((a, b) => compareTimeT(a.startTime, b.startTime));
    holds.sort((a, b) => compareTimeT(a.startTime, b.startTime));
    line.notes = [...nonHold, ...holds];
    line.numOfNotes = line.notes.filter(n => n.isFake === 0).length;
  }

  // Write back
  fs.writeFileSync(args.chart, JSON.stringify(chartData, null, 2), 'utf-8');

  console.log(JSON.stringify({
    success: true,
    addedNotes: addedCount,
    lineStats: lineStats,
    totalNotes: chartData.judgeLineList.reduce((sum, l) => sum + l.notes.length, 0),
    message: `成功添加 ${addedCount} 个音符`
  }, null, 2));
}

main();
