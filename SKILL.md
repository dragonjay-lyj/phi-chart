---
name: phi-chart
description: PhiEdit (RPE) 谱面制作辅助工具。支持创建 RPEJSON 谱面、添加音符/事件/判定线、生成 info.txt、打包 PEZ 格式、BPM 分析等。触发条件：用户要求制作 Phigros 谱面、使用 RPE 相关功能、或使用 /phi-chart 命令。
allowed-tools: Read Write Edit Bash Agent AskUserQuestion
---

# PhiEdit 制谱辅助 Skill

## 目标

帮助新手用户通过自然语言描述来创建 Phigros (Re:PhiEdit) 谱面。自动生成标准 RPEJSON 格式的谱面文件、info.txt 元数据，以及 PEZ 打包。

## 核心能力

1. **创建谱面项目** — 生成 RPEJSON 骨架、info.txt、文件夹结构
2. **添加音符** — 通过描述节拍位置/类型/坐标来放置 Tap/Drag/Flick/Hold
3. **添加判定线与事件** — 移动、旋转、透明度、速度事件，支持缓动
4. **BPM 管理** — 设置/修改 BPM 列表，支持变速曲
5. **导出 PEZ** — 将谱面项目打包为标准 PEZ 格式
6. **谱面验证** — 检查 RPEJSON 合法性，输出纠错信息
7. **故事版** — 贴图、文字事件、UI 绑定、着色器基础配置

## 工作流

### Phase 1: 收集谱面基本信息

向用户询问以下信息（缺少的必须询问）：

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| 音乐文件 | 是 | - | .mp3/.ogg/.wav 路径 |
| 曲绘文件 | 是 | - | .jpg/.png 路径 |
| BPM | 是 | - | 基准 BPM（可多段） |
| 谱面名称 | 是 | - | 歌曲名 |
| 谱师名称 | 是 | - | 制谱者 |
| 曲师名称 | 否 | "Unknown" | 作曲者 |
| 画师名称 | 否 | "Unknown" | 曲绘画师 |
| 难度 | 否 | "SP Lv.?" | 谱面难度文字 |
| 基准线数 | 否 | 24 | 初始判定线数量 |
| 偏移(ms) | 否 | 0 | 音乐偏移量 |
| 谱面ID | 否 | 自动生成 | 纯数字文件夹名 |

### Phase 2: 生成谱面骨架

调用 `scripts/create-chart.js` 生成：
- `chart.json` — 标准 RPEJSON
- `info.txt` — 元数据
- 提示用户将音乐/曲绘文件放入对应目录

### Phase 3: 编辑谱面

用户通过自然语言描述来编辑谱面：

**添加音符示例：**
- "在第1小节第2拍放一个 Tap，X坐标0"
- "从第2小节开始每半拍放一排双押"
- "在第3小节放一个Hold，持续2拍"
- "在第1到4小节加16分鼓点采音"

**添加事件示例：**
- "让0号线在第4拍移动到屏幕右边"
- "让1号线旋转90度，用 EaseOut 缓动"
- "让2号线从透明到不透明，线性渐变"
- "所有线速度设为10"

**判定线管理示例：**
- "添加一条新判定线，父线为0号"
- "给5号线绑定 combo UI"
- "把3号线设为遮罩模式"

### Phase 4: 验证与导出

- 运行 `scripts/validate-chart.js` 检查常见错误
- 运行 `scripts/export-pez.js` 打包为 PEZ

## RPEJSON 参考

### 坐标系
- 屏幕可见范围：X `[-675, 675]`，Y `[-450, 450]`
- 分辨率正比于 1920x1080
- 速度 10 = 每秒移动 1200 像素

### TimeT 时间三元组 `[小节, 分子, 分母]`
- `[0, 0, 1]` = 第0拍
- `[1, 0, 1]` = 第1小节
- `[0, 1, 2]` = 半拍
- `[0, 1, 4]` = 四分之一拍（16分音符位置）
- `[2, 1, 3]` = 第2小节 + 1/3拍（三连音）

### 音符类型
| 类型 | 编号 | 名称 | 判定方式 |
|------|------|------|----------|
| Tap | 1 | 蓝键 | 点击 |
| Hold | 2 | 长条 | 按住 |
| Flick | 3 | 红/粉键 | 划动 |
| Drag | 4 | 黄键 | 经过即可 |

### 缓动类型速查
| 序号 | 名称 | 描述 |
|------|------|------|
| 0 | fixed | 固定不变 |
| 1 | linear | 线性 |
| 2 | outSine | 正弦缓出 |
| 3 | inSine | 正弦缓入 |
| 4 | outQuad | 二次缓出 |
| 5 | inQuad | 二次缓入 |
| 6 | ioSine | 正弦缓入缓出 |
| 7 | ioQuad | 二次缓入缓出 |
| 8 | outCubic | 三次缓出 |
| 9 | inCubic | 三次缓入 |
| 10 | outQuart | 四次缓出 |
| 11 | inQuart | 四次缓入 |
| 12 | ioCubic | 三次缓入缓出 |
| 13 | ioQuart | 四次缓入缓出 |
| 14 | outQuint | 五次缓出 |
| 15 | inQuint | 五次缓入 |
| 16 | outExpo | 指数缓出 |
| 17 | inExpo | 指数缓入 |
| 18 | inCirc | 圆形缓入 |
| 19 | outCirc | 圆形缓出 |
| 20 | outBack | 回弹缓出 |
| 21 | inBack | 回弹缓入 |
| 22 | ioCirc | 圆形缓入缓出 |
| 23 | ioBack | 回弹缓入缓出 |
| 24 | outElastic | 弹性缓出 |
| 25 | inElastic | 弹性缓入 |
| 26 | outBounce | 反弹缓出 |
| 27 | inBounce | 反弹缓入 |
| 28 | ioBounce | 反弹缓入缓出 |
| 29 | ioElastic | 弹性缓入缓出 |

### 默认判定线模板
```json
{
  "Group": 0,
  "Name": "Untitled",
  "Texture": "line.png",
  "alphaControl": [{"easing": 1, "x": 0, "alpha": 255}],
  "bpmfactor": 1.0,
  "eventLayers": [
    {
      "moveXEvents": [{"bezier": 0, "bezierPoints": [0,0,0,0], "easingLeft": 0, "easingRight": 1, "easingType": 1, "end": 0, "endTime": [1,0,1], "linkgroup": 0, "start": 0, "startTime": [0,0,1]}],
      "moveYEvents": [{"bezier": 0, "bezierPoints": [0,0,0,0], "easingLeft": 0, "easingRight": 1, "easingType": 1, "end": 0, "endTime": [1,0,1], "linkgroup": 0, "start": 0, "startTime": [0,0,1]}],
      "rotateEvents": [{"bezier": 0, "bezierPoints": [0,0,0,0], "easingLeft": 0, "easingRight": 1, "easingType": 1, "end": 0, "endTime": [1,0,1], "linkgroup": 0, "start": 0, "startTime": [0,0,1]}],
      "alphaEvents": [{"bezier": 0, "bezierPoints": [0,0,0,0], "easingLeft": 0, "easingRight": 1, "easingType": 1, "end": 255, "endTime": [1,0,1], "linkgroup": 0, "start": 255, "startTime": [0,0,1]}],
      "speedEvents": [{"bezier": 0, "bezierPoints": [0,0,0,0], "easingLeft": 0, "easingRight": 1, "easingType": 1, "end": 10, "endTime": [1,0,1], "linkgroup": 0, "start": 10, "startTime": [0,0,1]}]
    },
    null, null, null
  ],
  "extended": {
    "inclineEvents": [],
    "scaleXEvents": [],
    "scaleYEvents": [],
    "textEvents": []
  },
  "father": -1,
  "isCover": 1,
  "notes": [],
  "numOfNotes": 0,
  "posControl": [{"easing": 1, "x": 0, "pos": 1}],
  "sizeControl": [{"easing": 1, "x": 0, "size": 1}],
  "skewControl": [{"easing": 1, "x": 0, "skew": 0}],
  "yControl": [{"easing": 1, "x": 0, "y": 1}],
  "zOrder": 0
}
```

### 默认音符模板
```json
{
  "above": 1,
  "alpha": 255,
  "endTime": [0, 0, 1],
  "isFake": 0,
  "positionX": 0,
  "size": 1,
  "speed": 1,
  "startTime": [0, 0, 1],
  "type": 1,
  "visibleTime": 999999.0,
  "yOffset": 0,
  "color": [255, 255, 255],
  "judgeArea": 1.0
}
```

### 默认事件模板
```json
{
  "bezier": 0,
  "bezierPoints": [0, 0, 0, 0],
  "easingLeft": 0,
  "easingRight": 1,
  "easingType": 1,
  "end": 0,
  "endTime": [0, 0, 1],
  "linkgroup": 0,
  "start": 0,
  "startTime": [0, 0, 1]
}
```

### info.txt 格式（RPE 官方）
```
#
Name: 曲名
Path: 202603260
Song: 202603260.wav
Picture: 202603260.jpeg
Chart: 202603260.json
Level: SP Lv.?
Composer: 曲师
Charter: 谱师
Illustrator: 画师
LastEditTime: 2026_3_27_0_0_0_
Length: 0.000
EditTime: 0.000
Group: Default
```

**注意：** RPE 要求 PEZ 包内除 info.txt 外的所有文件使用纯数字ID作为文件名前缀（如 `202603260.wav`），避免中文文件名在 ZIP 编码中出现乱码。

### Phira info.yml 格式（用于 Phira 播放器）
Phira 使用 YAML 格式的 `info.yml` 代替 RPE 的 `info.txt`。Phira 以 info.yml 为准，RPEJSON 中的 META 信息仅作备用。
```yaml
id: ~                          # 谱面ID（本地谱为空）
name: "太阳之子"               # 谱面名称（必填）
difficulty: 7.0                # 难度数值（必填）
level: "HD Lv.7"              # 难度等级文字（必填）
charter: "DragonJay"          # 谱师（必填）
composer: "周杰伦"             # 曲师（必填）
illustrator: "Unknown"        # 画师（必填）
chart: "chart.json"           # 谱面文件名（必填）
music: "song.ogg"             # 音乐文件名（必填）
illustration: "bg.jpg"        # 曲绘文件名（必填）
previewStart: 123.0           # 预览开始时间秒（必填）
previewEnd: ~                 # 预览结束时间秒（空=开始后15秒）
aspectRatio: 1.7778           # 纵横比 16/9（必填）
backgroundDim: 0.6            # 背景暗化程度（必填）
lineLength: 6.0               # 判定线长度（必填）
offset: 0.0                   # 谱面延迟秒（必填）
tip: ~                        # 提示文字
tags: []                      # 标签
intro: ""                     # 简介
holdPartialCover: false       # Hold渲染选项
```

### extra.json（Phira 着色器特效）
Phira 支持在 `extra.json` 中配置视觉特效（着色器）和视频背景。

**内置着色器列表：**

| 着色器 | 效果 | 主要参数 |
|--------|------|---------|
| `chromatic` | 色差 | `power`(强度), `sampleCount`(采样数) |
| `circleBlur` | 圆点模糊 | `size`(像素大小) |
| `fisheye` | 鱼眼 | `power`(正=凸/负=凹) |
| `glitch` | 故障闪烁 | `power`, `rate`, `speed`, `blockCount`, `colorRate` |
| `grayscale` | 灰度化 | `factor`(0~1) |
| `noise` | 噪音模糊 | `seed`, `power` |
| `pixel` | 像素化 | `size` |
| `radialBlur` | 放射模糊 | `centerX/Y`, `power`, `sampleCount` |
| `shockwave` | 冲击波 | `progress`(0~1), `centerX/Y`, `width`, `distortion` |
| `vignette` | 虚光照(暗角) | `color`, `extend`, `radius` |

**extra.json 示例：**
```json
{
  "bpm": [{ "time": [0, 0, 1], "bpm": 90.666 }],
  "effects": [
    {
      "start": [100, 0, 1],
      "end": [108, 0, 1],
      "shader": "chromatic",
      "global": false,
      "vars": {
        "power": [{ "startTime": [100,0,1], "endTime": [108,0,1], "easingType": 2, "start": 0.0, "end": 0.05 }],
        "sampleCount": 5
      }
    }
  ]
}
```

### 音乐文件格式
| 格式 | 说明 |
|------|------|
| `.ogg` | **推荐**，体积小，无延迟问题 |
| `.wav` | 无压缩，体积大，可能导致上传失败 |
| `.mp3` | 可能有不可预测的延迟，尽量避免 |

## 注意事项

1. **TimeT 计算**：时间三元组 `[bar, num, den]` 表示 `bar + num/den` 拍。分母不能为0。拍→秒转换：`seconds = 60 / BPM * beat`
2. **音符排序**：RPEJSON 标准中音符按时间升序排列，非 Hold 在前，Hold 在后。
3. **事件垫底**：新建判定线至少有一个各类事件作为垫底。v143 后空层级不存 null 而是直接省略字段。
4. **父线**：不能形成循环引用。`rotateWithFather`(v163新增) 控制子线是否继承父线旋转，**缺失时视为 false**。
5. **速度事件**：速度10 = 1200px/s。v162 开始支持缓动但含义为 floorPosition。**v170 回归原始逻辑**：缓动直接作用于速度值。
6. **BPM因子**：判定线的实际 BPM = 基础 BPM **÷** bpmfactor（注意是除不是乘！）
7. **BPM 对齐**：确保音符时间准确对齐 BPM 节拍，避免采音偏移。
8. **PEZ 打包**：所有文件必须在 ZIP 根目录下，不能有子文件夹。
9. **谱面ID**：只能使用纯数字作为文件夹名和ID。
10. **音符颜色**：v170 新增 `tint`/`color` 字段（[R,G,B]），两个字段名都要兼容。`tintHitEffects` 覆盖打击特效颜色。
11. **事件层级**：若所有层级为空，`eventLayers` 字段整体不存在（不是空数组）。
12. **RPEVersion 对照**：150=v1.5.0~v1.6.0, 160=v1.6.1, 170=v1.7.0

## 常见制谱模式

### 四分采音 — 每拍一个 Tap
```
拍位: [n,0,1] (n=0,1,2,3...)
```

### 八分采音 — 每半拍一个音符
```
拍位: [n,0,1], [n,1,2] (n=0,1,2,3...)
```

### 十六分采音 — 每四分之一拍
```
拍位: [n,0,1], [n,1,4], [n,1,2], [n,3,4]
```

### 双押 — 同时两个音符
```
在同一拍位放两个不同 positionX 的音符
```

### 交互 — 左右交替
```
交替使用正/负 positionX
```

### 粉接八（Flick + Tap）
```
[n,0,1] type=3 (Flick), [n,1,2] type=1 (Tap)
```

## 脚本使用

所有脚本位于 `~/.claude/skills/phi-chart/scripts/`。调用时务必使用绝对路径 `"/c/Users/DragonJay/.claude/skills/phi-chart/scripts/xxx.js"` 或通过 `$HOME` 环境变量引用。

| 脚本 | 用途 |
|------|------|
| `create-chart.js` | 创建谱面骨架（RPEJSON + info.txt） |
| `add-notes.js` | 批量添加音符 |
| `add-events.js` | 批量添加事件 |
| `gen-pattern.js` | 生成常见音符排列模式（输出 JSON 传给 add-notes） |
| `validate-chart.js` | 验证谱面合法性 |
| `auto-chart.js` | 根据音乐分析数据自动生成谱面（核心） |
| `multitrack-chart.js` | 根据多音轨分析数据生成精细谱面（进阶） |
| `clean-rebuild.js` | 安全重建谱面（碰撞检测+歌词事件） |
| `normalize-analysis.js` | 标准化外部AI分析数据的字段名 |
| `gen-phira.js` | 生成 Phira 兼容的 info.yml 和 extra.json |
| `export-pez.js` | 打包为 PEZ 格式 |

### gen-pattern.js 支持的模式

| 模式 | 说明 |
|------|------|
| `quarter` | 四分采音（每拍一个） |
| `eighth` | 八分采音（每半拍一个） |
| `sixteenth` | 十六分采音（每四分之一拍） |
| `triplet` | 三连音 |
| `doubles` | 双押海 |
| `alternate` | 交互（左右交替） |
| `stairs` | 楼梯（逐步偏移） |
| `stream` | 连打（高密度多位置） |
| `flick-tap` | 粉接八（Flick+Tap 交替） |

## AI 辅助自动制谱

### 总览

用户可借助其他 AI（如音乐分析 AI）识别歌曲的结构、节拍、能量变化等信息，然后将分析结果以规范 JSON 格式提供给本 skill。本 skill 根据分析数据自动生成完整的谱面（音符+事件+演出）。

工作流：`用户提供音乐 → 外部AI分析 → 用户将分析结果粘贴/提供文件 → 本skill自动制谱`

### 你需要让外部 AI 提供的信息

将以下提示词发给能识别音乐的 AI（如 Gemini、GPT-4o 等），让它分析歌曲后输出 JSON：

```
请分析这首歌曲，按照以下JSON格式输出音乐分析数据：

{
  "meta": { ... },       // 基本信息
  "sections": [ ... ],   // 段落结构
  "beats": [ ... ],      // 逐拍点信息
  "sustained_notes": [ ... ],  // 长音/持续音
  "energy_curve": [ ... ],     // 能量曲线
  "markers": [ ... ]     // 特殊标记点
}

具体字段要求见下方。
```

### analysis.json 完整格式规范

```jsonc
{
  // ===== 1. 基本信息（必填） =====
  "meta": {
    "title": "歌曲名",
    "artist": "曲师/歌手",
    "bpm": 180,                    // 主BPM（必填）
    "bpm_changes": [               // 变速段（可选）
      { "beat": 64, "bpm": 200 }
    ],
    "time_signature": "4/4",       // 拍号（默认4/4）
    "duration_seconds": 210,       // 总时长秒
    "offset_ms": 0,                // 音乐起始偏移
    "key": "C minor",             // 调性（可选，供参考）
    "genre": "EDM"                // 风格（可选，供参考）
  },

  // ===== 2. 段落结构（必填，至少需要这个） =====
  // 将歌曲划分为若干段落，每段有类型和时间范围
  "sections": [
    {
      "type": "intro",            // 段落类型（见下方类型表）
      "start_time": 0.0,          // 开始时间（秒）— 和 start_beat 二选一
      "end_time": 8.5,            // 结束时间（秒）
      "start_beat": 0,            // 开始拍数 — 和 start_time 二选一
      "end_beat": 16,             // 结束拍数
      "description": "钢琴前奏",  // 简要描述（可选，帮助理解）
      "energy": 3                 // 该段整体能量 1-10（可选）
    }
  ],

  // ===== 3. 逐拍点信息（强烈推荐） =====
  // 每个需要放音符的时间点
  "beats": [
    {
      "time": 0.333,              // 时间秒 — 和 beat 二选一
      "beat": 1.0,                // 拍数 — 和 time 二选一
      "intensity": 7,             // 强度 1-10（决定音符类型和是否双押）
      "sound": "kick",            // 声音类型（见下方声音类型表）
      "accent": true              // 是否为重音（可选，默认false）
    }
  ],

  // ===== 4. 长音/持续音（可选） =====
  // 标记需要用 Hold 音符的位置
  "sustained_notes": [
    {
      "start_time": 16.0,         // 或 start_beat
      "end_time": 18.0,           // 或 end_beat
      "start_beat": 32,
      "end_beat": 36,
      "position_x": 0,            // X坐标建议（可选）
      "description": "人声长音"    // 可选
    }
  ],

  // ===== 5. 能量曲线（可选，用于控制速度和演出强度） =====
  // 描述歌曲的能量/氛围随时间的变化
  "energy_curve": [
    { "time": 0,    "beat": 0,   "energy": 2 },
    { "time": 8.5,  "beat": 16,  "energy": 5 },
    { "time": 30.0, "beat": 64,  "energy": 9 },
    { "time": 60.0, "beat": 120, "energy": 3 }
  ],

  // ===== 6. 特殊标记点（可选，用于生成演出效果） =====
  "markers": [
    {
      "time": 30.0,               // 或 beat
      "beat": 64,
      "type": "drop",             // 标记类型（见下方标记类型表）
      "description": "主旋律掉落", // 可选
      "duration_beats": 2         // 持续拍数（部分类型需要）
    }
  ]
}
```

### 段落类型表（sections.type）

| 类型 | 含义 | 自动生成效果 |
|------|------|-------------|
| `intro` | 前奏 | 四分采音，线从透明渐入 |
| `verse` | 主歌 | 八分采音，线轻微移动 |
| `pre_chorus` | 导歌/过渡段 | 八分→逐渐加密，线移动加大 |
| `chorus` | 副歌 | 十六分采音，大幅移动+旋转 |
| `drop` | 掉落/高能段 | 十六分密集+双押，爆炸式演出 |
| `bridge` | 间奏/桥段 | 四分Hold为主，缓慢浮动 |
| `breakdown` | 减速段 | 稀疏音符，线最小化 |
| `buildup` | 渐强段 | Drag流逐渐加密，线旋转加速 |
| `outro` | 尾奏 | 逐渐减少，线归中 |
| `instrumental` | 纯器乐 | 八分采音，轻微移动 |
| `silence` | 静音段 | 无音符，线隐藏 |

### 声音类型表（beats.sound）

| 类型 | 含义 | 映射音符 |
|------|------|---------|
| `kick` | 底鼓/低音鼓 | Tap |
| `snare` | 军鼓 | Tap / 强拍→Flick |
| `clap` | 拍手 | Tap / 强拍→Flick |
| `hihat` | 踩镲 | Tap / Drag（难度高时） |
| `cymbal` | 吊镲 | Tap / Drag |
| `bass` | 贝斯 | Tap |
| `vocal` | 人声 | Tap |
| `melody` | 旋律乐器 | Tap |
| `percussion` | 其他打击乐 | Tap |
| `synth` | 合成器 | Tap |
| `fx` | 音效 | Flick / Drag |

### 特殊标记类型表（markers.type）

| 类型 | 含义 | 自动生成效果 |
|------|------|-------------|
| `impact` | 冲击/重击 | 三音同时+线弹跳 |
| `drop` | 掉落（动次打次开始） | Drag密集+线下沉 |
| `rise` | 上升/渐强 | 音符扩散+线上升 |
| `silence` | 突然安静 | 线快速消失 |
| `climax` | 高潮最强点 | 三Flick+线震动 |
| `transition` | 段落过渡 | Hold连接 |

### 难度等级

调用 `auto-chart.js` 时可指定难度：

| 难度 | 音符密度 | 最大同时 | Flick | Drag | 线演出 |
|------|---------|---------|-------|------|--------|
| `easy` | 40% | 单押 | 无 | 无 | 基本不动 |
| `normal` | 65% | 双押 | 有 | 无 | 轻微 |
| `hard` | 85% | 双押 | 有 | 有 | 明显 |
| `expert` | 100% | 三押 | 有 | 有 | 全开 |

### 自动制谱使用方法

```bash
# 1. 先创建谱面骨架
node scripts/create-chart.js --output <dir> --name <name> --bpm <bpm> ...

# 2. 将音乐分析 JSON 保存为文件
# （用户粘贴或提供路径）

# 3. 自动生成谱面
node scripts/auto-chart.js --chart <chart.json> --analysis <analysis.json> --difficulty normal

# 4. 验证
node scripts/validate-chart.js --chart <chart.json>

# 5. 导出
node scripts/export-pez.js --dir <chart_dir> --output <name.pez>
```

### 给外部 AI 的提示词模板

用户可以直接复制以下提示词发给音乐分析 AI：

---

**提示词（中文版）：**

> 请分析这首歌曲的结构和节奏，输出以下格式的 JSON 数据。
> 这些数据将用于自动生成 Phigros 音乐游戏的谱面。
>
> 请尽量详细，尤其是 sections 和 beats。
>
> 1. **meta**：歌曲标题、艺术家、BPM（必须精确）、拍号、总时长秒、调性、风格
> 2. **sections**：将歌曲分段（intro/verse/chorus/drop/bridge/outro等），标注每段的起止拍数和能量等级(1-10)
> 3. **beats**：列出每个有明显音色的节拍点，标注拍数(beat)、强度(1-10)、声音类型(kick/snare/hihat/vocal/melody等)、是否重音(accent)
> 4. **sustained_notes**：标记持续音/长音的起止拍数
> 5. **energy_curve**：每隔4-8拍标记一个能量值(1-10)，描述歌曲的能量变化趋势
> 6. **markers**：标记特殊时刻 — 如掉落(drop)、冲击(impact)、上升(rise)、突然安静(silence)、高潮(climax)等
>
> 时间请用拍数(beat)表示，基于你测出的BPM。输出纯JSON，不要其他内容。

---

**提示词（英文版）：**

> Analyze this song's structure and rhythm. Output JSON with these fields:
>
> 1. **meta**: title, artist, exact BPM, time_signature, duration_seconds, key, genre
> 2. **sections**: segment the song (intro/verse/chorus/drop/bridge/outro etc.) with start_beat, end_beat, energy (1-10)
> 3. **beats**: list every rhythmic hit point with beat number, intensity (1-10), sound type (kick/snare/hihat/vocal/melody/synth/fx), accent (true/false)
> 4. **sustained_notes**: mark sustained/held notes with start_beat and end_beat
> 5. **energy_curve**: energy level (1-10) sampled every 4-8 beats
> 6. **markers**: special moments — drop, impact, rise, silence, climax, transition
>
> Use beat numbers based on your detected BPM. Output pure JSON only.

---

## RPE 操作快捷键与纠错参考

### RPE 快捷键速查

| 快捷键 | 功能 |
|--------|------|
| Space | 播放/暂停 |
| Q | 放置 Tap |
| W | 放置 Drag |
| E | 放置 Flick |
| R...R | 放置 Hold（按住R拖动再按R结束） |
| Esc | 退出当前操作 |
| CTRL+S | 保存 |
| CTRL+Z / CTRL+Y | 撤销/重做 |
| CTRL+数字 | 切换到对应编号的判定线 |
| CTRL+鼠标滚轮 | 微调音符宽度/事件值 |
| CTRL+C / CTRL+V / CTRL+X | 复制/粘贴/剪切 |
| CTRL+B | 镜像粘贴 |
| CTRL+H | 将全局时间跳到光标位置 |
| CTRL+M | 将视野位置重置为0 |
| CTRL+J/K/L | 切换倍速 1.0x/0.75x/0.5x |
| ALT+1 | 切换判定线选择方式 |
| ALT+N | 切换 只编辑note / 同时编辑 模式 |
| ALT+F / ALT+G | 跳转到多选内容的开始/结束位置 |
| ALT+V | 数值粘贴 |
| ALT+鼠标滚轮 | 快速滚动时间 |
| SHIFT+点击+移动+点击 | 框选音符/事件 |
| Z+拖动 | 拖动音符/事件的头或尾时间 |
| T (按住) | 切换为播放窗口开始播放，松开恢复 |
| U (按住) | 开始播放，松开还原 |
| I | 开始播放（切换编辑/播放窗口） |
| O | 停止播放，时间归到播放起始位置 |
| P | 停止播放，不恢复全局时间 |
| TAB | 显示/隐藏当前线的属性 |
| A (note编辑) | 翻转X坐标 |
| S (note编辑) | 翻转下落朝向 |
| A (MoveX/Y/Rotate/Speed事件) | 头尾值取反 |
| A (Alpha事件) | 尾值设为0 |
| S (Alpha事件) | 尾值设为255 |
| D+右键 | 删除选中内容 |
| Delete | 删除选中内容 |
| Enter | 保存编辑 |
| N | 开关/关闭缩略图 |
| V | 开关/关闭锚线 |
| M (选中note后) | 将note的X设为当前鼠标位置 |
| F (选中note后按住) | note跟随鼠标移动 |

### 纠错信息参考

| 类型 | 代码 | 含义 |
|------|------|------|
| Error | Tap After Flick | Flick后紧跟Tap，滑动会导致Tap变Good |
| Error | Tap&Hold / Tap&Tap / Hold&Hold Overlapped | 音符时间和位置重叠碰撞 |
| Error | Event Time Out of Range | 事件时间超出范围（<0或超过结束时间） |
| Error | illegal Event | 事件结束时间小于等于开始时间 |
| Error | Event OverLapped | 同类同层事件时间重叠 |
| Warning | Note Judged OutScreen | 音符判定时位置在可见屏幕外 |
| Warning | Alpha Event Over Range | Alpha事件值超出[0,255]范围 |
| Warning | Tap After Drag | Drag后紧跟Tap，可能导致判定问题 |
| Caution | X Too Large | 音符X坐标最大值过大 |
| Caution | Short Readtime | 音符可读时间过短 |
| Caution | Too Many Linear MoveX/Y/Rotate | 过多连续线性事件，建议使用缓动 |
| Caution | separated MoveX/MoveY Event | X/Y移动事件不成对，无法转PEC |

### PhiEditer (PE) 与 RPE 差异

| 项目 | PhiEditer (PE) | Re:PhiEdit (RPE) |
|------|---------------|-----------------|
| 坐标系 | 屏幕中心(0,0)，左下(-1024,-700)，右上(1024,700) | 屏幕中心(0,0)，X[-675,675]，Y[-450,450] |
| 速度单位 | RPE的90/154倍 | 10 = 1200px/s |
| 事件XY | Move事件XY合一 | MoveX和MoveY分开 |
| 缓动类型 | 3种（线性/easeOutSine/easeInSine） | 29种+贝塞尔 |
| 事件层级 | 1层 | 4层普通+1层特殊 |
| 导出格式 | PEC (.json) | RPEJSON (.json) + PEZ |
| 锚线数 | 默认7条（推荐21条） | 创建时可指定（默认24条） |
| 父线 | 不支持 | 支持递归父线 |

### Alpha扩展功能

| Alpha值 | 效果 |
|---------|------|
| 0~255 | 正常透明度（0=完全透明，255=完全不透明） |
| -1 | 线上所有note不可见（但打击特效和音效仍在） |
| -2 | 只显示上方note，隐藏下方note（配合速度指令实现水桶效果） |
| -100~-1000 | 音符在判定前 (-alpha-100)/10 拍才显示（如-110=提前1拍显示） |
| -1000~-2000 | 扫描线模式：音符在判定前 (-alpha-1000)/10 拍显示后一直保持可见 |

### 多音符/多事件编辑

RPE支持强大的批量编辑：
- 选中多个音符/事件后，可按 **数值下界/上界/缓动类型/循环序列/抖动** 进行批量修改
- 修改方式：By(加)、To(设为)、Times(乘)、Max/Min(取大/小)、ToHold（同时作用于Hold）
- 事件克隆：可将一条线的事件批量复制到多条线上
- 多选事件支持筛选：基于表达式 `n`(序号)、`N`(总数)、`st.x`/`ed.x`(头尾值)、`st.time`/`ed.time`(头尾时间)、`easing` 等变量进行筛选
- 音符筛选变量：`n`、`N`、`x`(坐标)、`speed`/`v`、`pos`/`dir`(朝向)、`yoffset`、`width`/`w`、`visibletime`/`vt`、`alpha`/`al`
- 筛选支持逻辑运算：`and`、`or`、`xor`
- 克隆线号列表支持 `a*b` 语法（如 `2*(0 1)` 展开为 `0 1 0 1`）

### RPE 1.7.0 新增特性

**编辑器功能：**
- **全局面板**：新增"全局面板"按钮，整合谱面信息、调试信息、属性控制等
- **轨迹录制**：录制鼠标拖拽轨迹自动生成移动事件，支持自动计算角度事件，可通过平滑参数优化曲线
- **判定线管理**：重构状态页，可视化显示判定线位置、透明度、速度、线号、绑定UI等
- **快速Drag生成**：选中音符后长按中键可快速进行等距Drag生成
- **数值录制**：记录鼠标拖拽事件上的数值变化并直接应用
- **事件Duration修改**：修改后事件的结束时间自动跟随头部移动
- **迁移式修改**：改变BPM时可同时让所有音符实时拍迁移（保持实际时间不变而自动调整拍数）

**音符新属性（RPEJSON扩展）：**
```json
{
  "color": [255, 255, 255],  // RGB染色
  "judgeArea": 1.0           // 判定区域缩放比例
}
```

**新增工具：**
- 事件"对齐"：多选事件后统一对齐开始/结束时间
- 音符"散布"：将选中音符以当前线为中心散布到附近判定线上
- 音符"反转"：将一组选中事件数值乘以-1
- "追踪线"功能（F1）：编辑时画布跟随当前判定线位置移动
- Ctrl+C 可将音符X坐标直接复制到系统剪贴板
- 支持长按事件段选择，方便编辑连续事件
- 预制事件自定义键映射（`./Resources/prefab_mapper.json`，默认E键放置）

**导入导出：**
- 支持从 osu! 和 Malody 谱面文件（.osz/.mcz）直接导入BPM列表
- 删除操作增加异常数据修复功能
- 音频文件开头可插入空白段
- 支持压缩格式输出JSON文件（减小文件体积）

**速度事件：**
- 速度事件全面支持缓动（非线性），所有缓动描述的是速度的变化趋势（而非floorPosition）

**可视化增强：**
- 可视化显示判定范围（TAB键开关）
- 音频波形按钮：显示音频频谱和波形图
- 颜色事件：判定线在被选中时不再被统一染色

**Bug修复要点：**
- 修复了剪贴板功能中Alpha事件数值丢失
- 修复了光标位置被意外移动
- 修复了Windows 11下拖拽调整窗口大小时无响应
- 修复了缓动29（ElasticInOut）的可用性
- 恢复了29号缓动的可用性

## 交互规则

1. 始终用中文与用户交流
2. 对新手解释每个操作的含义（如缓动类型、坐标含义）
3. 操作前确认关键参数，避免误操作
4. 每次修改后简要报告变更内容和当前音符/事件数量
5. 对于复杂操作（如大量音符排布），先展示预览再执行
6. 如果用户描述模糊，主动追问（用 AskUserQuestion）
