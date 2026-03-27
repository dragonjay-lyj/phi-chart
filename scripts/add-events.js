#!/usr/bin/env node

/**
 * add-events.js — 向 RPEJSON 谱面批量添加事件
 *
 * Usage:
 *   node add-events.js --chart <chart.json> --events <events_json>
 *
 * events_json 是一个 JSON 数组，每个元素包含：
 *   line: 判定线编号
 *   layer: 事件层级 (0-3, 默认0)
 *   type: "moveX" | "moveY" | "rotate" | "alpha" | "speed"
 *         | "scaleX" | "scaleY" | "text" | "incline" (扩展事件)
 *   startTime: [bar, num, den]
 *   endTime: [bar, num, den]
 *   start: 起始值
 *   end: 结束值
 *   easingType: 缓动类型 (默认1=线性)
 *   easingLeft: 截取缓动左边界 (默认0)
 *   easingRight: 截取缓动右边界 (默认1)
 *   bezier: 是否使用贝塞尔 (0或1, 默认0)
 *   bezierPoints: 贝塞尔控制点 [x1,y1,x2,y2] (默认[0,0,0,0])
 *   linkgroup: 链接组 (默认0)
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

const EVENT_TYPE_MAP = {
  moveX: 'moveXEvents',
  moveY: 'moveYEvents',
  rotate: 'rotateEvents',
  alpha: 'alphaEvents',
  speed: 'speedEvents'
};

const EXTENDED_EVENT_TYPE_MAP = {
  scaleX: 'scaleXEvents',
  scaleY: 'scaleYEvents',
  text: 'textEvents',
  incline: 'inclineEvents'
};

function makeEvent(eventData) {
  return {
    bezier: eventData.bezier || 0,
    bezierPoints: eventData.bezierPoints || [0, 0, 0, 0],
    easingLeft: eventData.easingLeft !== undefined ? eventData.easingLeft : 0,
    easingRight: eventData.easingRight !== undefined ? eventData.easingRight : 1,
    easingType: eventData.easingType || 1,
    end: eventData.end !== undefined ? eventData.end : 0,
    endTime: eventData.endTime || [0, 0, 1],
    linkgroup: eventData.linkgroup || 0,
    start: eventData.start !== undefined ? eventData.start : 0,
    startTime: eventData.startTime || [0, 0, 1]
  };
}

function compareTimeT(a, b) {
  const aVal = a[0] + a[1] / a[2];
  const bVal = b[0] + b[1] / b[2];
  return aVal - bVal;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.chart || !args.events) {
    console.error(JSON.stringify({ error: 'Missing --chart or --events parameter' }));
    process.exit(1);
  }

  const chartData = JSON.parse(fs.readFileSync(args.chart, 'utf-8'));

  let eventsInput;
  try {
    if (fs.existsSync(args.events)) {
      eventsInput = JSON.parse(fs.readFileSync(args.events, 'utf-8'));
    } else {
      eventsInput = JSON.parse(args.events);
    }
  } catch (e) {
    console.error(JSON.stringify({ error: `Failed to parse events: ${e.message}` }));
    process.exit(1);
  }

  if (!Array.isArray(eventsInput)) {
    eventsInput = [eventsInput];
  }

  let addedCount = 0;

  for (const eventData of eventsInput) {
    const lineIdx = eventData.line || 0;
    const layer = eventData.layer || 0;
    const type = eventData.type;

    if (lineIdx < 0 || lineIdx >= chartData.judgeLineList.length) {
      console.error(JSON.stringify({
        warning: `Line ${lineIdx} does not exist, skipping event`
      }));
      continue;
    }

    const line = chartData.judgeLineList[lineIdx];
    const event = makeEvent(eventData);

    // Check if it's an extended event
    if (EXTENDED_EVENT_TYPE_MAP[type]) {
      const eventKey = EXTENDED_EVENT_TYPE_MAP[type];
      if (!line.extended) {
        line.extended = { inclineEvents: [], scaleXEvents: [], scaleYEvents: [], textEvents: [] };
      }
      if (!line.extended[eventKey]) {
        line.extended[eventKey] = [];
      }
      line.extended[eventKey].push(event);
      line.extended[eventKey].sort((a, b) => compareTimeT(a.startTime, b.startTime));
      addedCount++;
    }
    // Normal event
    else if (EVENT_TYPE_MAP[type]) {
      const eventKey = EVENT_TYPE_MAP[type];

      // Ensure layer exists
      while (line.eventLayers.length <= layer) {
        line.eventLayers.push(null);
      }
      if (!line.eventLayers[layer]) {
        line.eventLayers[layer] = {
          moveXEvents: [],
          moveYEvents: [],
          rotateEvents: [],
          alphaEvents: [],
          speedEvents: []
        };
      }

      line.eventLayers[layer][eventKey].push(event);
      line.eventLayers[layer][eventKey].sort((a, b) => compareTimeT(a.startTime, b.startTime));
      addedCount++;
    } else {
      console.error(JSON.stringify({
        warning: `Unknown event type "${type}", skipping`
      }));
    }
  }

  fs.writeFileSync(args.chart, JSON.stringify(chartData, null, 2), 'utf-8');

  console.log(JSON.stringify({
    success: true,
    addedEvents: addedCount,
    message: `成功添加 ${addedCount} 个事件`
  }, null, 2));
}

main();
