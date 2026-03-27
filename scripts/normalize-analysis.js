#!/usr/bin/env node
/**
 * normalize-analysis.js — 将外部 AI 输出的分析 JSON 标准化为 auto-chart.js 所需格式
 * 处理常见的字段名差异
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

const SECTION_NAME_MAP = {
  'intro': 'intro',
  'verse': 'verse',
  'pre-chorus': 'pre_chorus',
  'pre_chorus': 'pre_chorus',
  'prechorus': 'pre_chorus',
  'chorus': 'chorus',
  'climax_chorus': 'chorus',
  'drop': 'drop',
  'bridge': 'bridge',
  'breakdown': 'breakdown',
  'buildup': 'buildup',
  'build': 'buildup',
  'outro': 'outro',
  'outro_solo': 'outro',
  'outro_fade': 'outro',
  'instrumental': 'instrumental',
  'solo': 'instrumental',
  'silence': 'silence',
  'interlude': 'bridge'
};

function main() {
  const args = parseArgs(process.argv);
  if (!args.input || !args.output) {
    console.error('Usage: node normalize-analysis.js --input <raw.json> --output <normalized.json>');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(args.input, 'utf-8'));
  const out = { ...raw };

  // Normalize sections
  if (out.sections) {
    out.sections = out.sections.map(s => {
      const name = s.name || s.type || 'verse';
      return {
        type: SECTION_NAME_MAP[name] || 'verse',
        start_beat: s.start_beat,
        end_beat: s.end_beat,
        start_time: s.start_time,
        end_time: s.end_time,
        energy: s.energy,
        description: s.description || name
      };
    });
  }

  // Normalize beats
  if (out.beats) {
    out.beats = out.beats.map(b => ({
      beat: b.beat,
      time: b.time,
      intensity: b.intensity,
      sound: b.sound || b.sound_type || 'percussion',
      accent: b.accent !== undefined ? b.accent : (b.is_accent || false)
    }));
  }

  fs.writeFileSync(args.output, JSON.stringify(out, null, 2), 'utf-8');
  console.log(JSON.stringify({
    success: true,
    sections: (out.sections || []).length,
    beats: (out.beats || []).length,
    sustained_notes: (out.sustained_notes || []).length,
    energy_points: (out.energy_curve || []).length,
    markers: (out.markers || []).length
  }));
}

main();
