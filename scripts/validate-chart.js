#!/usr/bin/env node

/**
 * validate-chart.js — 验证 RPEJSON 谱面合法性
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

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

function timeTToFloat(t) {
  if (!t || !Array.isArray(t) || t.length !== 3) return NaN;
  return t[0] + t[1] / t[2];
}

function timeTToString(t) {
  return `[${t[0]}, ${t[1]}, ${t[2]}]`;
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
  } catch (e) {
    console.error(JSON.stringify({ error: `Failed to read chart: ${e.message}` }));
    process.exit(1);
  }

  const errors = [];
  const warnings = [];
  const cautions = [];

  // === META validation ===
  if (!chartData.META) {
    errors.push('缺少 META 字段');
  } else {
    const meta = chartData.META;
    if (!meta.name) errors.push('META.name (谱面名称) 为空');
    if (!meta.charter) warnings.push('META.charter (谱师名称) 为空');
    if (!meta.song) errors.push('META.song (音乐文件) 为空');
    if (!meta.background) errors.push('META.background (曲绘文件) 为空');
    if (meta.id && !/^\d+$/.test(String(meta.id))) {
      warnings.push(`META.id "${meta.id}" 不是纯数字，可能导致1.5+版本无法识别`);
    }
  }

  // === BPMList validation ===
  if (!chartData.BPMList || chartData.BPMList.length === 0) {
    errors.push('BPMList 为空，必须至少有一个 BPM 段');
  } else {
    for (let i = 0; i < chartData.BPMList.length; i++) {
      const bpm = chartData.BPMList[i];
      if (!bpm.bpm || bpm.bpm <= 0) {
        errors.push(`BPMList[${i}]: BPM 值 ${bpm.bpm} 无效`);
      }
      if (!bpm.startTime || bpm.startTime.length !== 3) {
        errors.push(`BPMList[${i}]: startTime 格式无效`);
      }
      if (bpm.startTime && bpm.startTime[2] === 0) {
        errors.push(`BPMList[${i}]: startTime 分母不能为0`);
      }
    }
  }

  // === JudgeLine validation ===
  if (!chartData.judgeLineList || chartData.judgeLineList.length === 0) {
    errors.push('judgeLineList 为空，必须至少有一条判定线');
  }

  let totalNotes = 0;
  let totalRealNotes = 0;
  let noteTypeCount = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (let li = 0; li < (chartData.judgeLineList || []).length; li++) {
    const line = chartData.judgeLineList[li];

    // Father line check
    if (line.father !== undefined && line.father !== -1) {
      if (line.father < 0 || line.father >= chartData.judgeLineList.length) {
        errors.push(`Line ${li}: 父线编号 ${line.father} 超出范围`);
      }
      if (line.father === li) {
        errors.push(`Line ${li}: 父线不能指向自身`);
      }
    }

    // Check for circular parent references
    if (line.father !== -1 && line.father !== undefined) {
      const visited = new Set([li]);
      let current = line.father;
      let depth = 0;
      while (current !== -1 && current !== undefined && depth < 100) {
        if (visited.has(current)) {
          errors.push(`Line ${li}: 父线存在循环引用`);
          break;
        }
        visited.add(current);
        if (current >= 0 && current < chartData.judgeLineList.length) {
          current = chartData.judgeLineList[current].father;
        } else {
          break;
        }
        depth++;
      }
    }

    // Event layers check
    if (line.eventLayers) {
      for (let layerIdx = 0; layerIdx < line.eventLayers.length; layerIdx++) {
        const layer = line.eventLayers[layerIdx];
        if (!layer) continue;

        // Check each event type
        for (const eventType of ['moveXEvents', 'moveYEvents', 'rotateEvents', 'alphaEvents', 'speedEvents']) {
          const events = layer[eventType] || [];
          for (let ei = 0; ei < events.length; ei++) {
            const evt = events[ei];
            if (!evt.startTime || evt.startTime.length !== 3) {
              errors.push(`Line ${li}, Layer ${layerIdx}, ${eventType}[${ei}]: startTime 格式无效`);
            }
            if (!evt.endTime || evt.endTime.length !== 3) {
              errors.push(`Line ${li}, Layer ${layerIdx}, ${eventType}[${ei}]: endTime 格式无效`);
            }
            if (evt.startTime && evt.endTime) {
              if (evt.startTime[2] === 0 || evt.endTime[2] === 0) {
                errors.push(`Line ${li}, Layer ${layerIdx}, ${eventType}[${ei}]: 时间分母不能为0`);
              }
              const st = timeTToFloat(evt.startTime);
              const et = timeTToFloat(evt.endTime);
              if (st > et) {
                warnings.push(`Line ${li}, Layer ${layerIdx}, ${eventType}[${ei}]: startTime > endTime`);
              }
            }
            if (eventType === 'alphaEvents') {
              if (evt.start > 255 || evt.end > 255) {
                cautions.push(`Line ${li}, Layer ${layerIdx}, alphaEvents[${ei}]: 透明度值超过255`);
              }
            }
          }
        }
      }

      // Check if XY events can be paired (for PEC compatibility)
      const layer0 = line.eventLayers[0];
      if (layer0) {
        const xCount = (layer0.moveXEvents || []).length;
        const yCount = (layer0.moveYEvents || []).length;
        if (xCount !== yCount) {
          cautions.push(`Line ${li}: X移动事件(${xCount})与Y移动事件(${yCount})数量不匹配，无法转为PEC格式`);
        }
      }
    }

    // Notes check
    if (line.notes) {
      for (let ni = 0; ni < line.notes.length; ni++) {
        const note = line.notes[ni];
        totalNotes++;
        if (note.isFake !== 1) totalRealNotes++;

        if (note.type < 1 || note.type > 4) {
          errors.push(`Line ${li}, Note ${ni}: 无效的音符类型 ${note.type}`);
        } else {
          noteTypeCount[note.type]++;
        }

        if (!note.startTime || note.startTime.length !== 3) {
          errors.push(`Line ${li}, Note ${ni}: startTime 格式无效`);
        }
        if (note.startTime && note.startTime[2] === 0) {
          errors.push(`Line ${li}, Note ${ni}: startTime 分母不能为0`);
        }

        if (note.type === 2) {
          if (!note.endTime || note.endTime.length !== 3) {
            errors.push(`Line ${li}, Note ${ni}: Hold 音符缺少 endTime`);
          } else {
            const st = timeTToFloat(note.startTime);
            const et = timeTToFloat(note.endTime);
            if (st >= et) {
              errors.push(`Line ${li}, Note ${ni}: Hold 音符 endTime 必须大于 startTime`);
            }
          }
        }

        if (Math.abs(note.positionX) > 675) {
          cautions.push(`Line ${li}, Note ${ni}: positionX=${note.positionX} 超出可见范围 [-675, 675]`);
        }

        if (note.above !== 1 && note.above !== 0 && note.above !== 2) {
          warnings.push(`Line ${li}, Note ${ni}: above 值 ${note.above} 异常（应为 0/1/2）`);
        }
      }
    }
  }

  // === numOfNotes consistency ===
  for (let li = 0; li < (chartData.judgeLineList || []).length; li++) {
    const line = chartData.judgeLineList[li];
    const actualRealNotes = (line.notes || []).filter(n => n.isFake !== 1).length;
    if (line.numOfNotes !== actualRealNotes) {
      warnings.push(`Line ${li}: numOfNotes(${line.numOfNotes}) 与实际真音符数(${actualRealNotes}) 不匹配`);
    }
  }

  const result = {
    errors: errors,
    warnings: warnings,
    cautions: cautions,
    stats: {
      totalLines: (chartData.judgeLineList || []).length,
      totalNotes: totalNotes,
      totalRealNotes: totalRealNotes,
      noteTypes: {
        tap: noteTypeCount[1],
        hold: noteTypeCount[2],
        flick: noteTypeCount[3],
        drag: noteTypeCount[4]
      },
      bpmSegments: (chartData.BPMList || []).length
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
