#!/usr/bin/env node
/**
 * gen-phira.js — 生成 Phira 兼容的 info.yml 和 extra.json
 *
 * Usage:
 *   node gen-phira.js --chart <chart.json> --dir <chart_dir> [--previewStart <sec>]
 */
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i += 2)
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

if (!args.chart || !args.dir) {
  console.error('Usage: node gen-phira.js --chart <chart.json> --dir <chart_dir>');
  process.exit(1);
}

const chart = JSON.parse(fs.readFileSync(args.chart, 'utf-8'));
const meta = chart.META;
const previewStart = parseFloat(args.previewStart) || 60;
const chartFile = path.basename(args.chart);

// Generate info.yml
const infoYml = `id: ~
uploader: ~
name: "${meta.name}"
difficulty: ${parseFloat(meta.level.replace(/[^0-9.]/g, '')) || 7.0}
level: "${meta.level}"
charter: "${meta.charter}"
composer: "${meta.composer}"
illustrator: "${meta.illustrator || meta.illustration || 'Unknown'}"
chart: "${chartFile}"
music: "${meta.song}"
illustration: "${meta.background}"
previewStart: ${previewStart}
previewEnd: ~
aspectRatio: 1.7778
backgroundDim: 0.6
lineLength: 6.0
offset: ${(meta.offset || 0) / 1000}
tip: ~
tags: []
intro: ""
holdPartialCover: false
`;

// Generate extra.json with BPM config (needed for shader timing)
const extra = {
  bpm: chart.BPMList.map(b => ({
    time: b.startTime,
    bpm: b.bpm
  })),
  effects: []
};

// Write files
const ymlPath = path.join(args.dir, 'info.yml');
fs.writeFileSync(ymlPath, infoYml, 'utf-8');

const extraPath = path.join(args.dir, 'extra.json');
fs.writeFileSync(extraPath, JSON.stringify(extra, null, 2), 'utf-8');

console.log(JSON.stringify({
  success: true,
  infoYml: ymlPath,
  extraJson: extraPath,
  message: 'Phira info.yml and extra.json generated'
}));
