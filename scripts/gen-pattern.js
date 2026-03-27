#!/usr/bin/env node

/**
 * gen-pattern.js — 生成常见音符排列模式
 *
 * Usage:
 *   node gen-pattern.js --pattern <pattern_name> --startBar <bar> --bars <count>
 *     --bpm <bpm> [--line <line>] [--posX <x>] [--type <note_type>] [--spread <x_spread>]
 *
 * 支持的模式:
 *   quarter    - 四分采音（每拍一个）
 *   eighth     - 八分采音（每半拍一个）
 *   sixteenth  - 十六分采音（每四分之一拍）
 *   triplet    - 三连音
 *   doubles    - 双押海（每拍两个并排）
 *   alternate  - 交互（左右交替）
 *   stairs     - 楼梯（逐步偏移）
 *   stream     - 连打（高密度等间距）
 *   flick-tap  - 粉接八（Flick后接Tap）
 *
 * 输出 JSON 数组，可直接传给 add-notes.js
 */

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

function simplifyFraction(num, den) {
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  if (den === 0) return [num, 1];
  const g = gcd(Math.abs(num), Math.abs(den));
  return [num / g, den / g];
}

function beatToTimeT(beat) {
  const bar = Math.floor(beat);
  const frac = beat - bar;
  if (frac === 0) return [bar, 0, 1];

  // Convert to fraction with reasonable denominator
  const den = 48; // LCM of common subdivisions (2,3,4,6,8,12,16,24)
  const num = Math.round(frac * den);
  const [sn, sd] = simplifyFraction(num, den);
  return [bar, sn, sd];
}

function main() {
  const args = parseArgs(process.argv);

  const pattern = args.pattern || 'quarter';
  const startBar = parseInt(args.startBar) || 0;
  const bars = parseInt(args.bars) || 4;
  const line = parseInt(args.line) || 0;
  const noteType = parseInt(args.type) || 1;
  const posX = parseFloat(args.posX) || 0;
  const spread = parseFloat(args.spread) || 200;

  const notes = [];
  const endBeat = startBar + bars;

  switch (pattern) {
    case 'quarter': {
      // One note per beat
      for (let beat = startBar; beat < endBeat; beat += 1) {
        notes.push({
          line, type: noteType,
          startTime: beatToTimeT(beat),
          positionX: posX
        });
      }
      break;
    }

    case 'eighth': {
      // Two notes per beat
      for (let beat = startBar; beat < endBeat; beat += 0.5) {
        notes.push({
          line, type: noteType,
          startTime: beatToTimeT(beat),
          positionX: posX
        });
      }
      break;
    }

    case 'sixteenth': {
      // Four notes per beat
      for (let beat = startBar; beat < endBeat; beat += 0.25) {
        notes.push({
          line, type: noteType,
          startTime: beatToTimeT(beat),
          positionX: posX
        });
      }
      break;
    }

    case 'triplet': {
      // Three notes per beat
      for (let beat = startBar; beat < endBeat; beat += 1) {
        for (let sub = 0; sub < 3; sub++) {
          notes.push({
            line, type: noteType,
            startTime: beatToTimeT(beat + sub / 3),
            positionX: posX
          });
        }
      }
      break;
    }

    case 'doubles': {
      // Two simultaneous notes per beat
      for (let beat = startBar; beat < endBeat; beat += 1) {
        const time = beatToTimeT(beat);
        notes.push({
          line, type: noteType,
          startTime: time,
          positionX: -spread
        });
        notes.push({
          line, type: noteType,
          startTime: time,
          positionX: spread
        });
      }
      break;
    }

    case 'alternate': {
      // Left-right alternating, eighth notes
      let left = true;
      for (let beat = startBar; beat < endBeat; beat += 0.5) {
        notes.push({
          line, type: noteType,
          startTime: beatToTimeT(beat),
          positionX: left ? -spread : spread
        });
        left = !left;
      }
      break;
    }

    case 'stairs': {
      // Gradually shifting position
      const steps = bars * 4; // 16th note density
      const stepSize = (spread * 2) / steps;
      for (let i = 0; i < steps; i++) {
        const beat = startBar + i * 0.25;
        notes.push({
          line, type: noteType,
          startTime: beatToTimeT(beat),
          positionX: -spread + i * stepSize
        });
      }
      break;
    }

    case 'stream': {
      // High density 16th note stream with alternating positions
      let idx = 0;
      for (let beat = startBar; beat < endBeat; beat += 0.25) {
        const positions = [-spread, -spread / 3, spread / 3, spread];
        notes.push({
          line, type: noteType,
          startTime: beatToTimeT(beat),
          positionX: positions[idx % positions.length]
        });
        idx++;
      }
      break;
    }

    case 'flick-tap': {
      // Flick followed by Tap at eighth note intervals
      for (let beat = startBar; beat < endBeat; beat += 1) {
        notes.push({
          line, type: 3, // Flick
          startTime: beatToTimeT(beat),
          positionX: posX
        });
        notes.push({
          line, type: 1, // Tap
          startTime: beatToTimeT(beat + 0.5),
          positionX: posX
        });
      }
      break;
    }

    default: {
      console.error(JSON.stringify({
        error: `Unknown pattern: ${pattern}`,
        available: ['quarter', 'eighth', 'sixteenth', 'triplet', 'doubles', 'alternate', 'stairs', 'stream', 'flick-tap']
      }));
      process.exit(1);
    }
  }

  console.log(JSON.stringify(notes, null, 2));
}

main();
