#!/usr/bin/env node

/**
 * create-chart.js — 创建标准 RPEJSON 谱面骨架与 info.txt
 *
 * Usage:
 *   node create-chart.js --output <dir> --name <name> --bpm <bpm> --charter <charter>
 *     --song <song_file> --image <image_file> [--composer <composer>] [--illustrator <illustrator>]
 *     [--level <level>] [--lines <num>] [--offset <ms>] [--id <id>]
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

function makeDefaultEvent(startTime, endTime, startVal, endVal, easingType) {
  return {
    bezier: 0,
    bezierPoints: [0, 0, 0, 0],
    easingLeft: 0,
    easingRight: 1,
    easingType: easingType || 1,
    end: endVal !== undefined ? endVal : startVal,
    endTime: endTime || [1, 0, 1],
    linkgroup: 0,
    start: startVal,
    startTime: startTime || [0, 0, 1]
  };
}

function makeDefaultLine(index) {
  return {
    Group: 0,
    Name: `Line_${index}`,
    Texture: "line.png",
    alphaControl: [{ easing: 1, x: 0, alpha: 255 }],
    bpmfactor: 1.0,
    eventLayers: [
      {
        moveXEvents: [makeDefaultEvent([0, 0, 1], [1, 0, 1], 0, 0)],
        moveYEvents: [makeDefaultEvent([0, 0, 1], [1, 0, 1], 0, 0)],
        rotateEvents: [makeDefaultEvent([0, 0, 1], [1, 0, 1], 0, 0)],
        alphaEvents: [makeDefaultEvent([0, 0, 1], [1, 0, 1], 255, 255)],
        speedEvents: [makeDefaultEvent([0, 0, 1], [1, 0, 1], 10, 10)]
      },
      null,
      null,
      null
    ],
    extended: {
      inclineEvents: [],
      scaleXEvents: [],
      scaleYEvents: [],
      textEvents: []
    },
    father: -1,
    isCover: 1,
    notes: [],
    numOfNotes: 0,
    posControl: [{ easing: 1, x: 0, pos: 1 }],
    sizeControl: [{ easing: 1, x: 0, size: 1 }],
    skewControl: [{ easing: 1, x: 0, skew: 0 }],
    yControl: [{ easing: 1, x: 0, y: 1 }],
    zOrder: 0
  };
}

function main() {
  const args = parseArgs(process.argv);

  // Required params
  const required = ['output', 'name', 'bpm', 'charter', 'song', 'image'];
  for (const r of required) {
    if (!args[r]) {
      console.error(JSON.stringify({ error: `Missing required parameter: --${r}` }));
      process.exit(1);
    }
  }

  const outputDir = args.output;
  const chartId = args.id || String(Date.now()).slice(-9);
  const numLines = parseInt(args.lines) || 24;
  const bpm = parseFloat(args.bpm);
  const offset = parseInt(args.offset) || 0;
  // Use ID-prefixed filenames to avoid encoding issues in ZIP/PEZ
  const songExt = path.extname(args.song) || '.wav';
  const imageExt = path.extname(args.image) || '.jpg';
  const songFile = chartId + songExt;
  const imageFile = chartId + imageExt;
  const chartFile = chartId + '.json';
  const composer = args.composer || 'Unknown';
  const illustrator = args.illustrator || 'Unknown';
  const level = args.level || 'SP Lv.?';
  const chartName = args.name;
  const charter = args.charter;

  // Parse BPM list (support comma-separated "beat:bpm" or single value)
  const bpmList = [];
  const bpmParts = String(args.bpm).split(',');
  for (const part of bpmParts) {
    if (part.includes(':')) {
      const [beat, bpmVal] = part.split(':');
      bpmList.push({
        bpm: parseFloat(bpmVal),
        startTime: [parseInt(beat), 0, 1]
      });
    } else {
      if (bpmList.length === 0) {
        bpmList.push({
          bpm: parseFloat(part),
          startTime: [0, 0, 1]
        });
      }
    }
  }

  // Generate judge lines
  const judgeLineList = [];
  for (let i = 0; i < numLines; i++) {
    judgeLineList.push(makeDefaultLine(i));
  }

  // Build RPEJSON
  const chart = {
    BPMList: bpmList,
    META: {
      RPEVersion: 150,
      background: imageFile,
      charter: charter,
      composer: composer,
      id: chartId,
      illustrator: illustrator,
      level: level,
      name: chartName,
      offset: offset,
      song: songFile
    },
    judgeLineGroup: ["default"],
    judgeLineList: judgeLineList
  };

  // Build info.txt (official RPE format)
  const now = new Date();
  const timeStr = `${now.getFullYear()}_${now.getMonth()+1}_${now.getDate()}_0_0_0_`;
  const infoTxt = [
    '#',
    `Name: ${chartName}`,
    `Path: ${chartId}`,
    `Song: ${songFile}`,
    `Picture: ${imageFile}`,
    `Chart: ${chartFile}`,
    `Level: ${level}`,
    `Composer: ${composer}`,
    `Charter: ${charter}`,
    `Illustrator: ${illustrator}`,
    `LastEditTime: ${timeStr}`,
    `Length: 0.000`,
    `EditTime: 0.000`,
    `Group: Default`
  ].join('\n');

  // Write files
  const chartDir = path.join(outputDir, chartId);
  fs.mkdirSync(chartDir, { recursive: true });

  const chartPath = path.join(chartDir, chartFile);
  fs.writeFileSync(chartPath, JSON.stringify(chart, null, 2), 'utf-8');

  const infoPath = path.join(chartDir, 'info.txt');
  fs.writeFileSync(infoPath, infoTxt, 'utf-8');

  console.log(JSON.stringify({
    success: true,
    chartDir: chartDir,
    chartId: chartId,
    chartFile: chartPath,
    infoFile: infoPath,
    numLines: numLines,
    bpm: bpmList,
    songFile: songFile,
    imageFile: imageFile,
    message: `谱面创建成功！目录: ${chartDir}\n` +
      `请将音乐文件重命名为 "${songFile}" 并复制到该目录。\n` +
      `请将曲绘文件重命名为 "${imageFile}" 并复制到该目录。`
  }, null, 2));
}

main();
