#!/usr/bin/env node

/**
 * validate-chart.js — 验证 RPEJSON 谱面合法性与常见 RPE 规则风险
 *
 * Usage:
 *   node validate-chart.js --chart <chart.json>
 *
 * 输出：
 *   errors: 必须修复的错误
 *   warnings: 建议修复的警告
 *   cautions: 参考信息
 *   stats: 谱面统计信息
 */

const fs = require('fs');

const NOTE_NAMES = {
  1: 'Tap',
  2: 'Hold',
  3: 'Flick',
  4: 'Drag'
};

const EVENT_TYPE_KEYS = ['moveXEvents', 'moveYEvents', 'rotateEvents', 'alphaEvents', 'speedEvents'];
const COLLISION_X = 150;
const SAME_TIME_MS = 8;
const TAP_CHAIN_MS = 250;
const NEGATIVE_ALPHA_MIN = -2000;
const LINEAR_STREAK_THRESHOLD = 6;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

function timeTToFloat(timeT) {
  if (!timeT || !Array.isArray(timeT) || timeT.length !== 3) return NaN;
  return timeT[0] + timeT[1] / timeT[2];
}

function timeTToString(timeT) {
  return `[${timeT[0]}, ${timeT[1]}, ${timeT[2]}]`;
}

function sortBpmList(bpmList) {
  return [...(bpmList || [])].sort((a, b) => timeTToFloat(a.startTime) - timeTToFloat(b.startTime));
}

function beatToSeconds(beat, bpmList) {
  if (!Number.isFinite(beat) || bpmList.length === 0) return NaN;

  let currentSeconds = 0;
  for (let i = 0; i < bpmList.length; i++) {
    const current = bpmList[i];
    const startBeat = timeTToFloat(current.startTime);
    const nextBeat = i + 1 < bpmList.length ? timeTToFloat(bpmList[i + 1].startTime) : Infinity;
    const secPerBeat = 60 / current.bpm;

    if (beat <= nextBeat || i === bpmList.length - 1) {
      return currentSeconds + (beat - startBeat) * secPerBeat;
    }

    currentSeconds += (nextBeat - startBeat) * secPerBeat;
  }

  return NaN;
}

function rangesOverlap(startA, endA, startB, endB, epsilon) {
  const eps = epsilon === undefined ? 1e-6 : epsilon;
  return startA < endB - eps && endA > startB + eps;
}

function noteRef(lineIndex, noteIndex, note) {
  return `Line ${lineIndex}, Note ${noteIndex} (${NOTE_NAMES[note.type] || note.type} @ ${timeTToString(note.startTime)})`;
}

function eventRef(lineIndex, layerIndex, eventType, eventIndex, event) {
  return `Line ${lineIndex}, Layer ${layerIndex}, ${eventType}[${eventIndex}] (${timeTToString(event.startTime)} -> ${timeTToString(event.endTime)})`;
}

function pushIssue(collection, ruleCounts, key, message) {
  collection.push(message);
  if (key) {
    ruleCounts[key] = (ruleCounts[key] || 0) + 1;
  }
}

function validateEventGroup(lineIndex, layerIndex, eventType, events, errors, warnings, cautions, ruleCounts) {
  const validEvents = [];
  let linearStreak = 0;
  let maxLinearStreak = 0;

  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    const ref = eventRef(lineIndex, layerIndex, eventType, eventIndex, event);

    if (!event.startTime || event.startTime.length !== 3) {
      pushIssue(errors, ruleCounts, 'invalidEventTime', `${ref}: startTime 格式无效`);
      continue;
    }
    if (!event.endTime || event.endTime.length !== 3) {
      pushIssue(errors, ruleCounts, 'invalidEventTime', `${ref}: endTime 格式无效`);
      continue;
    }
    if (event.startTime[2] === 0 || event.endTime[2] === 0) {
      pushIssue(errors, ruleCounts, 'invalidEventTime', `${ref}: 时间分母不能为0`);
      continue;
    }

    const startBeat = timeTToFloat(event.startTime);
    const endBeat = timeTToFloat(event.endTime);
    if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat)) {
      pushIssue(errors, ruleCounts, 'invalidEventTime', `${ref}: 时间无法解析`);
      continue;
    }

    if (startBeat < 0 || endBeat < 0) {
      pushIssue(errors, ruleCounts, 'eventTimeOutOfRange', `${ref}: Event Time Out of Range（事件时间不能小于0）`);
    }
    if (startBeat >= endBeat) {
      pushIssue(errors, ruleCounts, 'illegalEvent', `${ref}: illegal Event（结束时间必须大于开始时间）`);
      continue;
    }

    if (eventType === 'alphaEvents') {
      if (event.start > 255 || event.end > 255) {
        pushIssue(cautions, ruleCounts, 'alphaOutOfRange', `${ref}: Alpha Event Over Range（透明度值超过255）`);
      }
      if (event.start < NEGATIVE_ALPHA_MIN || event.end < NEGATIVE_ALPHA_MIN) {
        pushIssue(warnings, ruleCounts, 'alphaOutOfRange', `${ref}: alpha 小于 ${NEGATIVE_ALPHA_MIN}，超出常见扩展范围`);
      }
    }

    if (event.easingType === 1) {
      linearStreak++;
      maxLinearStreak = Math.max(maxLinearStreak, linearStreak);
    } else {
      linearStreak = 0;
    }

    validEvents.push({ eventIndex, event, startBeat, endBeat });
  }

  validEvents.sort((a, b) => a.startBeat - b.startBeat);
  for (let i = 1; i < validEvents.length; i++) {
    const previous = validEvents[i - 1];
    const current = validEvents[i];
    if (rangesOverlap(previous.startBeat, previous.endBeat, current.startBeat, current.endBeat, 0.01)) {
      pushIssue(
        errors,
        ruleCounts,
        'eventOverlap',
        `Line ${lineIndex}, Layer ${layerIndex}, ${eventType}: Event OverLapped（${eventRef(lineIndex, layerIndex, eventType, previous.eventIndex, previous.event)} 与 ${eventRef(lineIndex, layerIndex, eventType, current.eventIndex, current.event)} 重叠）`
      );
    }
  }

  if (maxLinearStreak >= LINEAR_STREAK_THRESHOLD && (eventType === 'moveXEvents' || eventType === 'moveYEvents' || eventType === 'rotateEvents')) {
    pushIssue(
      cautions,
      ruleCounts,
      'tooManyLinearEvents',
      `Line ${lineIndex}, Layer ${layerIndex}, ${eventType}: Too Many Linear ${eventType.replace('Events', '')}（连续 ${maxLinearStreak} 条线性事件）`
    );
  }
}

function validateNotePairs(lineIndex, notes, bpmList, errors, warnings, ruleCounts) {
  const realNotes = notes
    .map((note, noteIndex) => ({
      note,
      noteIndex,
      startBeat: timeTToFloat(note.startTime),
      endBeat: note.type === 2 ? timeTToFloat(note.endTime) : timeTToFloat(note.startTime),
      startSec: beatToSeconds(timeTToFloat(note.startTime), bpmList)
    }))
    .filter(item => item.note.isFake !== 1 && Number.isFinite(item.startBeat))
    .sort((a, b) => a.startBeat - b.startBeat);

  for (let i = 0; i < realNotes.length; i++) {
    const current = realNotes[i];
    for (let j = i + 1; j < realNotes.length; j++) {
      const next = realNotes[j];

      if (current.note.type === 2) {
        if (next.startBeat > current.endBeat + 0.1) break;
      } else if (Number.isFinite(current.startSec) && Number.isFinite(next.startSec)) {
        if (next.startSec - current.startSec > TAP_CHAIN_MS / 1000 + 0.05) break;
      } else if (next.startBeat - current.startBeat > 2) {
        break;
      }

      const xDistance = Math.abs((current.note.positionX || 0) - (next.note.positionX || 0));
      const startDeltaMs = Number.isFinite(current.startSec) && Number.isFinite(next.startSec)
        ? Math.abs(next.startSec - current.startSec) * 1000
        : Infinity;
      const noteA = current.note;
      const noteB = next.note;

      if (noteA.type === 3 && noteB.type === 1 && startDeltaMs > 0 && startDeltaMs < TAP_CHAIN_MS) {
        pushIssue(errors, ruleCounts, 'tapAfterFlick', `${noteRef(lineIndex, current.noteIndex, noteA)} -> ${noteRef(lineIndex, next.noteIndex, noteB)}: Tap After Flick`);
      }
      if (noteA.type === 4 && noteB.type === 1 && startDeltaMs > 0 && startDeltaMs < TAP_CHAIN_MS) {
        pushIssue(warnings, ruleCounts, 'tapAfterDrag', `${noteRef(lineIndex, current.noteIndex, noteA)} -> ${noteRef(lineIndex, next.noteIndex, noteB)}: Tap After Drag`);
      }

      if (xDistance >= COLLISION_X) continue;

      if (noteA.type === 1 && noteB.type === 1 && startDeltaMs < SAME_TIME_MS) {
        pushIssue(errors, ruleCounts, 'tapTapOverlap', `${noteRef(lineIndex, current.noteIndex, noteA)} 与 ${noteRef(lineIndex, next.noteIndex, noteB)}: Tap&Tap Overlapped`);
      }

      if (
        ((noteA.type === 1 && noteB.type === 2) || (noteA.type === 2 && noteB.type === 1)) &&
        rangesOverlap(current.startBeat, current.endBeat, next.startBeat, next.endBeat, 0.01)
      ) {
        pushIssue(errors, ruleCounts, 'tapHoldOverlap', `${noteRef(lineIndex, current.noteIndex, noteA)} 与 ${noteRef(lineIndex, next.noteIndex, noteB)}: Tap&Hold Overlapped`);
      }

      if (noteA.type === 2 && noteB.type === 2 && rangesOverlap(current.startBeat, current.endBeat, next.startBeat, next.endBeat, 0.01)) {
        pushIssue(errors, ruleCounts, 'holdHoldOverlap', `${noteRef(lineIndex, current.noteIndex, noteA)} 与 ${noteRef(lineIndex, next.noteIndex, noteB)}: Hold&Hold Overlapped`);
      }
    }
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.chart) {
    console.error(JSON.stringify({ error: 'Missing --chart parameter' }));
    process.exit(1);
  }

  let chartData;
  try {
    chartData = JSON.parse(fs.readFileSync(args.chart, 'utf-8'));
  } catch (error) {
    console.error(JSON.stringify({ error: `Failed to read chart: ${error.message}` }));
    process.exit(1);
  }

  const errors = [];
  const warnings = [];
  const cautions = [];
  const ruleCounts = {};

  if (!chartData.META) {
    pushIssue(errors, ruleCounts, 'missingMeta', '缺少 META 字段');
  } else {
    const meta = chartData.META;
    if (!meta.name) pushIssue(errors, ruleCounts, 'missingMetaField', 'META.name (谱面名称) 为空');
    if (!meta.charter) pushIssue(warnings, ruleCounts, 'missingMetaField', 'META.charter (谱师名称) 为空');
    if (!meta.song) pushIssue(errors, ruleCounts, 'missingMetaField', 'META.song (音乐文件) 为空');
    if (!meta.background) pushIssue(errors, ruleCounts, 'missingMetaField', 'META.background (曲绘文件) 为空');
    if (meta.id && !/^\d+$/.test(String(meta.id))) {
      pushIssue(warnings, ruleCounts, 'nonNumericId', `META.id "${meta.id}" 不是纯数字，可能导致1.5+版本无法识别`);
    }
  }

  const bpmList = sortBpmList(chartData.BPMList);
  if (bpmList.length === 0) {
    pushIssue(errors, ruleCounts, 'missingBpm', 'BPMList 为空，必须至少有一个 BPM 段');
  } else {
    for (let i = 0; i < bpmList.length; i++) {
      const bpm = bpmList[i];
      if (!bpm.bpm || bpm.bpm <= 0) {
        pushIssue(errors, ruleCounts, 'invalidBpm', `BPMList[${i}]: BPM 值 ${bpm.bpm} 无效`);
      }
      if (!bpm.startTime || bpm.startTime.length !== 3) {
        pushIssue(errors, ruleCounts, 'invalidBpm', `BPMList[${i}]: startTime 格式无效`);
      } else if (bpm.startTime[2] === 0) {
        pushIssue(errors, ruleCounts, 'invalidBpm', `BPMList[${i}]: startTime 分母不能为0`);
      }
      if (i > 0) {
        const previousBeat = timeTToFloat(bpmList[i - 1].startTime);
        const currentBeat = timeTToFloat(bpm.startTime);
        if (currentBeat <= previousBeat) {
          pushIssue(errors, ruleCounts, 'invalidBpmOrder', `BPMList[${i}]: BPM 段起始时间必须严格递增`);
        }
      }
    }
  }

  if (!chartData.judgeLineList || chartData.judgeLineList.length === 0) {
    pushIssue(errors, ruleCounts, 'missingJudgeLines', 'judgeLineList 为空，必须至少有一条判定线');
  }

  let totalNotes = 0;
  let totalRealNotes = 0;
  const noteTypeCount = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (let lineIndex = 0; lineIndex < (chartData.judgeLineList || []).length; lineIndex++) {
    const line = chartData.judgeLineList[lineIndex];

    if (!line || typeof line !== 'object') {
      pushIssue(errors, ruleCounts, 'invalidJudgeLine', `Line ${lineIndex}: 判定线数据无效`);
      continue;
    }

    if (line.father !== undefined && line.father !== -1) {
      if (line.father < 0 || line.father >= chartData.judgeLineList.length) {
        pushIssue(errors, ruleCounts, 'invalidFather', `Line ${lineIndex}: 父线编号 ${line.father} 超出范围`);
      }
      if (line.father === lineIndex) {
        pushIssue(errors, ruleCounts, 'invalidFather', `Line ${lineIndex}: 父线不能指向自身`);
      }
    }

    if (line.father !== -1 && line.father !== undefined) {
      const visited = new Set([lineIndex]);
      let current = line.father;
      while (current !== -1 && current !== undefined) {
        if (visited.has(current)) {
          pushIssue(errors, ruleCounts, 'cyclicFather', `Line ${lineIndex}: 父线存在循环引用`);
          break;
        }
        visited.add(current);
        if (current >= 0 && current < chartData.judgeLineList.length) {
          current = chartData.judgeLineList[current].father;
        } else {
          break;
        }
      }
    }

    if (line.eventLayers) {
      for (let layerIndex = 0; layerIndex < line.eventLayers.length; layerIndex++) {
        const layer = line.eventLayers[layerIndex];
        if (!layer) continue;

        for (const eventType of EVENT_TYPE_KEYS) {
          validateEventGroup(
            lineIndex,
            layerIndex,
            eventType,
            layer[eventType] || [],
            errors,
            warnings,
            cautions,
            ruleCounts
          );
        }

        const xCount = (layer.moveXEvents || []).length;
        const yCount = (layer.moveYEvents || []).length;
        if (xCount !== yCount) {
          pushIssue(cautions, ruleCounts, 'separatedMoveEvents', `Line ${lineIndex}, Layer ${layerIndex}: separated MoveX/MoveY Event（X=${xCount}, Y=${yCount}）`);
        }
      }
    }

    const notes = line.notes || [];
    for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
      const note = notes[noteIndex];
      totalNotes++;
      if (note.isFake !== 1) totalRealNotes++;

      if (note.type < 1 || note.type > 4) {
        pushIssue(errors, ruleCounts, 'invalidNoteType', `Line ${lineIndex}, Note ${noteIndex}: 无效的音符类型 ${note.type}`);
      } else {
        noteTypeCount[note.type]++;
      }

      if (!note.startTime || note.startTime.length !== 3) {
        pushIssue(errors, ruleCounts, 'invalidNoteTime', `Line ${lineIndex}, Note ${noteIndex}: startTime 格式无效`);
        continue;
      }
      if (note.startTime[2] === 0) {
        pushIssue(errors, ruleCounts, 'invalidNoteTime', `Line ${lineIndex}, Note ${noteIndex}: startTime 分母不能为0`);
        continue;
      }

      const startBeat = timeTToFloat(note.startTime);
      if (!Number.isFinite(startBeat)) {
        pushIssue(errors, ruleCounts, 'invalidNoteTime', `Line ${lineIndex}, Note ${noteIndex}: startTime 无法解析`);
      } else if (startBeat < 0) {
        pushIssue(errors, ruleCounts, 'noteTimeOutOfRange', `${noteRef(lineIndex, noteIndex, note)}: 音符时间不能小于0`);
      }

      if (note.type === 2) {
        if (!note.endTime || note.endTime.length !== 3) {
          pushIssue(errors, ruleCounts, 'invalidNoteTime', `Line ${lineIndex}, Note ${noteIndex}: Hold 音符缺少 endTime`);
        } else if (note.endTime[2] === 0) {
          pushIssue(errors, ruleCounts, 'invalidNoteTime', `Line ${lineIndex}, Note ${noteIndex}: Hold endTime 分母不能为0`);
        } else {
          const endBeat = timeTToFloat(note.endTime);
          if (!Number.isFinite(endBeat)) {
            pushIssue(errors, ruleCounts, 'invalidNoteTime', `Line ${lineIndex}, Note ${noteIndex}: Hold endTime 无法解析`);
          } else if (startBeat >= endBeat) {
            pushIssue(errors, ruleCounts, 'illegalHold', `${noteRef(lineIndex, noteIndex, note)}: Hold 音符 endTime 必须大于 startTime`);
          }
        }
      }

      if (Math.abs(note.positionX || 0) > 675) {
        pushIssue(cautions, ruleCounts, 'xTooLarge', `${noteRef(lineIndex, noteIndex, note)}: X Too Large（${note.positionX} 超出可见范围 [-675, 675]）`);
      }

      if (note.above !== 1 && note.above !== 0 && note.above !== 2) {
        pushIssue(warnings, ruleCounts, 'invalidAbove', `Line ${lineIndex}, Note ${noteIndex}: above 值 ${note.above} 异常（应为 0/1/2）`);
      }

      if (note.visibleTime !== undefined && note.visibleTime !== null && note.visibleTime > 0 && note.visibleTime < 0.12) {
        pushIssue(cautions, ruleCounts, 'shortReadtime', `${noteRef(lineIndex, noteIndex, note)}: Short Readtime（visibleTime=${note.visibleTime}）`);
      }
    }

    for (let noteIndex = 1; noteIndex < notes.length; noteIndex++) {
      const previous = notes[noteIndex - 1];
      const current = notes[noteIndex];
      const previousBeat = timeTToFloat(previous.startTime);
      const currentBeat = timeTToFloat(current.startTime);
      if (Number.isFinite(previousBeat) && Number.isFinite(currentBeat)) {
        if (previousBeat > currentBeat) {
          pushIssue(warnings, ruleCounts, 'unsortedNotes', `Line ${lineIndex}: 音符未按时间升序排列（Note ${noteIndex - 1} 在 Note ${noteIndex} 之后）`);
          break;
        }
        if (previousBeat === currentBeat && previous.type === 2 && current.type !== 2) {
          pushIssue(warnings, ruleCounts, 'unsortedNotes', `Line ${lineIndex}: 同拍位 Hold 应排在非 Hold 之后`);
          break;
        }
      }
    }

    validateNotePairs(lineIndex, notes, bpmList, errors, warnings, ruleCounts);
  }

  for (let lineIndex = 0; lineIndex < (chartData.judgeLineList || []).length; lineIndex++) {
    const line = chartData.judgeLineList[lineIndex];
    const actualRealNotes = (line.notes || []).filter(note => note.isFake !== 1).length;
    if (line.numOfNotes !== actualRealNotes) {
      pushIssue(warnings, ruleCounts, 'numOfNotesMismatch', `Line ${lineIndex}: numOfNotes(${line.numOfNotes}) 与实际真音符数(${actualRealNotes}) 不匹配`);
    }
  }

  const result = {
    errors,
    warnings,
    cautions,
    stats: {
      totalLines: (chartData.judgeLineList || []).length,
      totalNotes,
      totalRealNotes,
      noteTypes: {
        tap: noteTypeCount[1],
        hold: noteTypeCount[2],
        flick: noteTypeCount[3],
        drag: noteTypeCount[4]
      },
      bpmSegments: bpmList.length,
      ruleHits: ruleCounts
    },
    valid: errors.length === 0,
    message: errors.length === 0
      ? `验证通过！${warnings.length} 个警告，${cautions.length} 个提示`
      : `发现 ${errors.length} 个错误，${warnings.length} 个警告，${cautions.length} 个提示`
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
