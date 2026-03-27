# phi-chart

基于 Claude Code 的 AI 辅助 Phigros 制谱工具。通过音乐分析数据自动生成 RPEJSON 谱面，支持碰撞检测、歌词驱动事件、多音轨分层编排。

## 功能特性

- **自动制谱** — 提供音乐分析 JSON，一键生成完整谱面（音符 + 事件 + 判定线表演）
- **多音轨分层** — 根据乐器族和人声状态实时分配判定线（例如 Rock/人声 → Line 0，Electronic → Line 1，Classical/Jazz → Line 2）
- **歌词画面事件** — 根据歌词描绘的画面自动生成判定线移动、旋转、透明度变化（如"蒙娜丽莎微笑着哭泣"→线倾斜下沉）
- **碰撞检测** — 自动规避所有 RPE 报错：Tap&Hold 重叠、Tap After Flick/Drag、事件重叠
- **9 种排键模式** — 四分 / 八分 / 十六分 / 三连音 / 双押 / 交互 / 楼梯 / 连打 / 粉接八
- **4 档难度** — Easy / Normal / Hard / Expert，可调音符密度、扩散范围、线移动幅度
- **PEZ 导出** — 打包标准 PEZ 格式，直接导入 RPE
- **Phira 兼容** — 生成 info.yml 和 extra.json（支持着色器特效：色差、故障闪烁、冲击波等）
- **完整 RPEJSON 参考** — 30 种缓动、全部事件类型、扩展事件、Controls、UI 绑定

## 安装

将 `phi-chart` 文件夹复制到 Claude Code 的 skills 目录：

```bash
cp -r phi-chart ~/.claude/skills/
```

无需安装依赖，所有脚本仅使用 Node.js 内置模块。

## 快速开始

### 1. 创建谱面

```bash
node scripts/create-chart.js \
  --output ./charts \
  --name "歌曲名" \
  --bpm 120 \
  --charter "你的名字" \
  --song "song.ogg" \
  --image "bg.jpg" \
  --lines 24
```

命令会输出一段 JSON，其中包含 `chartDir` 和 `chartFile`。生成的谱面文件名是 `<chart_id>.json`，不是固定的 `chart.json`。

### 2. 从音乐分析自动生成

让能听音乐的 AI（Gemini、GPT-4o 等）按照 SKILL.md 中的提示词模板分析歌曲，然后：

```bash
# 标准化字段名（如果 AI 输出格式略有不同）
node scripts/normalize-analysis.js --input raw.json --output analysis.json

# 自动生成谱面（把这里替换成 create-chart.js 返回的 chartFile）
node scripts/auto-chart.js --chart ./charts/20260327001/20260327001.json --analysis analysis.json --difficulty normal

# 或使用多音轨数据做更精细的编排
node scripts/multitrack-chart.js --chart ./charts/20260327001/20260327001.json --tracks tracks.json --analysis analysis.json --difficulty normal
```

### 3. 验证并导出

```bash
# 检查 RPE 报错
node scripts/validate-chart.js --chart ./charts/20260327001/20260327001.json

# 打包为 PEZ（导出器会从 info.txt 中读取 Chart / Song / Picture）
node scripts/export-pez.js --dir ./chart_folder --output song.pez

# 生成 Phira 元数据（可选）
node scripts/gen-phira.js --chart ./charts/20260327001/20260327001.json --dir ./chart_folder
```

## 脚本列表

| 脚本 | 功能 |
|------|------|
| `create-chart.js` | 创建 RPEJSON 骨架 + info.txt |
| `add-notes.js` | 批量添加音符 |
| `add-events.js` | 批量添加事件 |
| `gen-pattern.js` | 生成常见排键模式 |
| `validate-chart.js` | 谱面合法性验证 |
| `auto-chart.js` | 根据音乐分析数据自动制谱 |
| `multitrack-chart.js` | 根据多音轨数据、人声状态、节奏提示和歌词意象生成谱面 |
| `clean-rebuild.js` | 带碰撞检测的安全重建 |
| `normalize-analysis.js` | 标准化外部 AI 分析数据 |
| `gen-phira.js` | 生成 Phira 的 info.yml + extra.json |
| `export-pez.js` | 打包为 PEZ 格式 |

## 音乐分析格式

AI 辅助制谱需要一份歌曲分析 JSON，可从任何能分析音频的 AI 获取：

```jsonc
{
  "meta": { "bpm": 120, "title": "歌曲名" },
  "sections": [{ "type": "chorus", "start_beat": 64, "end_beat": 128, "energy": 9 }],
  "beats": [{ "beat": 1.0, "intensity": 7, "sound": "kick", "accent": true }],
  "sustained_notes": [{ "start_beat": 32, "end_beat": 36 }],
  "energy_curve": [{ "beat": 0, "energy": 2 }],
  "markers": [{ "beat": 64, "type": "impact" }]
}
```

**段落类型：** `intro` `verse` `pre_chorus` `chorus` `drop` `bridge` `breakdown` `buildup` `outro` `instrumental` `silence`

**声音类型：** `kick` `snare` `clap` `hihat` `cymbal` `bass` `vocal` `melody` `percussion` `synth` `fx`

**标记类型：** `impact` `drop` `rise` `silence` `climax` `transition`

完整的格式规范和 AI 提示词模板（中/英文）请参见 SKILL.md。

## 多音轨格式

提供逐段乐器时间线数据，可实现更精细的编排。生成器会根据 `active_instruments`、`vocal_state`、`lyrics`、`drum_rhythm` 自动推导分线、音符重心和判定线事件，而不是依赖某一首歌的固定模板：

```json
{
  "analysis": [
    {
      "time_range": "01:02-01:07",
      "active_instruments": ["Rock"],
      "vocal_state": "主唱",
      "lyrics": "谁弹奏着灰黑协奏曲",
      "drum_rhythm": "八分"
    }
  ]
}
```

**音轨→判定线映射：**

| 音轨 | 判定线 | 位置 |
|------|--------|------|
| Rock / Pop / Blues / Latin | Line 0 | 居中 |
| Electronic | Line 1 | 左偏 |
| Classical / Jazz / Stage & Screen | Line 2 | 右偏 |
| Hip Hop | Line 3 | 下方 |

## Phira 着色器特效

通过 `extra.json` 为 Phira 播放器添加视觉特效：

| 着色器 | 效果 | 主要参数 |
|--------|------|---------|
| `chromatic` | 色差 | `power`, `sampleCount` |
| `glitch` | 故障闪烁 | `power`, `rate`, `speed` |
| `shockwave` | 冲击波 | `progress`, `centerX/Y` |
| `fisheye` | 鱼眼 | `power`（正=凸，负=凹） |
| `radialBlur` | 放射模糊 | `centerX/Y`, `power` |
| `pixel` | 像素化 | `size` |
| `grayscale` | 灰度 | `factor` |
| `noise` | 噪音模糊 | `seed`, `power` |
| `circleBlur` | 圆点模糊 | `size` |
| `vignette` | 暗角 | `color`, `extend`, `radius` |

## RPE 报错预防

制谱引擎自动规避所有常见 RPE 报错：

| 报错类型 | 预防措施 |
|---------|---------|
| Tap&Hold Overlapped | 150px 碰撞半径检测 |
| Tap After Flick | 250ms 最小间隔 |
| Tap After Drag | 250ms 最小间隔 |
| Event Overlapped | 逐线逐层逐类型追踪 |
| Hold 过长 | 最长 4 拍 |
| X 坐标越界 | 限制在 [-675, 675] |
| 旋转过度 | 最大 ±12 度，始终归零 |

## RPEJSON 参考

SKILL.md 内含完整的 RPEJSON 参考文档：

- 坐标系：X [-675, 675]，Y [-450, 450]
- 时间三元组：`[小节, 分子, 分母]`
- 30 种缓动类型函数表
- 5 种普通事件（moveX/Y、rotate、alpha、speed）× 4 层
- 扩展事件（scaleX/Y、color、text、incline、GIF）
- 音符类型（Tap=1、Hold=2、Flick=3、Drag=4）
- Controls 控制序列（alpha、size、pos、y、skew）
- UI 绑定（暂停键、连击数、分数、进度条、歌曲名、难度）
- RPE 1.7.0 新特性（音符染色 tint、判定区域 judgeArea、轨迹录制、迁移式 BPM 修改）
- RPE 操作快捷键速查（40+ 个快捷键）
- 纠错信息代码参考表

## 兼容性

| 目标平台 | 格式 | 支持程度 |
|---------|------|---------|
| Re:PhiEdit (RPE) | RPEJSON + info.txt + PEZ | 完整支持 |
| Phira | RPEJSON + info.yml + extra.json | 完整支持 |
| PhiEditer (PE) | PEC | 仅参考 |
| Phigros 官方 | Official JSON | 仅参考 |

## 参考链接

- [Phira 源代码](https://github.com/TeamFlos/phira)
- [Phira 文档](https://teamflos.github.io/phira-docs/)
- [缓动函数参考](https://easings.net/)

## 许可证

MIT
