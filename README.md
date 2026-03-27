# phi-chart

[中文文档](README_CN.md)

A Claude Code skill for AI-assisted Phigros chart creation. Generate RPEJSON charts from music analysis data, with collision detection, lyric-driven events, and multi-track instrument layering.

## Features

- **Auto Chart Generation** — Feed music analysis JSON and get a complete chart with notes, events, and line performance
- **Multi-Track Layering** — Judge lines are assigned from instrument families and vocal presence at runtime (for example Vocal/Rock → Line 0, Electronic → Line 1, Classical/Jazz → Line 2)
- **Lyric-Driven Events** — Map song lyrics to visual line movements (sway, bounce, fade, rotate) that match the narrative
- **Collision Detection** — Prevents all RPE errors: Tap&Hold overlap, Tap After Flick/Drag, Event overlap
- **9 Note Patterns** — Quarter, eighth, sixteenth, triplet, doubles, alternate, stairs, stream, flick-tap
- **4 Difficulty Presets** — Easy / Normal / Hard / Expert with tunable density, spread, and line movement
- **PEZ Export** — Package charts for RPE import with correct info.txt format
- **Phira Compatibility** — Generate info.yml and extra.json for Phira player with shader effects
- **Full RPEJSON Reference** — 30 easing types, all event types, extended events, Controls, UI binding

## Installation

Copy the `phi-chart` folder to your Claude Code skills directory:

```bash
cp -r phi-chart ~/.claude/skills/
```

No dependencies required — all scripts use Node.js built-in modules only.

## Quick Start

### 1. Create a chart

```bash
node scripts/create-chart.js \
  --output ./charts \
  --name "Song Name" \
  --bpm 120 \
  --charter "YourName" \
  --song "song.ogg" \
  --image "bg.jpg" \
  --lines 24
```

The command prints a JSON result containing `chartDir` and `chartFile`. The generated chart file is named `<chart_id>.json`, not a fixed `chart.json`.

### 2. Auto-generate from music analysis

Get music analysis from an AI that can listen to audio (Gemini, GPT-4o, etc.) using the prompt template in SKILL.md, then:

```bash
# Normalize field names if needed
node scripts/normalize-analysis.js --input raw.json --output analysis.json

# Generate chart (replace with the chartFile returned by create-chart.js)
node scripts/auto-chart.js --chart ./charts/20260327001/20260327001.json --analysis analysis.json --difficulty normal

# Or use multi-track data for finer control
node scripts/multitrack-chart.js --chart ./charts/20260327001/20260327001.json --tracks tracks.json --analysis analysis.json --difficulty normal
```

### 3. Validate and export

```bash
# Check for RPE errors
node scripts/validate-chart.js --chart ./charts/20260327001/20260327001.json

# Package as PEZ (the exporter reads Chart / Song / Picture from info.txt)
node scripts/export-pez.js --dir ./chart_folder --output song.pez

# Generate Phira metadata (optional)
node scripts/gen-phira.js --chart ./charts/20260327001/20260327001.json --dir ./chart_folder
```

## Scripts

| Script | Description |
|--------|-------------|
| `create-chart.js` | Create RPEJSON skeleton + info.txt |
| `add-notes.js` | Batch add notes from JSON |
| `add-events.js` | Batch add events from JSON |
| `gen-pattern.js` | Generate common note patterns |
| `validate-chart.js` | Validate chart for RPE errors |
| `auto-chart.js` | Auto-generate chart from analysis data |
| `multitrack-chart.js` | Generate from multi-track instrument data, vocal state, rhythm hints, and lyric imagery |
| `clean-rebuild.js` | Safe rebuild with collision detection |
| `normalize-analysis.js` | Normalize external AI analysis field names |
| `gen-phira.js` | Generate Phira info.yml + extra.json |
| `export-pez.js` | Package as PEZ format |

## Music Analysis Format

The AI-assisted workflow requires a JSON analysis of the song. You can get this from any AI that can analyze audio. The format supports:

```jsonc
{
  "meta": { "bpm": 120, "title": "...", ... },
  "sections": [{ "type": "chorus", "start_beat": 64, "end_beat": 128, "energy": 9 }],
  "beats": [{ "beat": 1.0, "intensity": 7, "sound": "kick", "accent": true }],
  "sustained_notes": [{ "start_beat": 32, "end_beat": 36 }],
  "energy_curve": [{ "beat": 0, "energy": 2 }, { "beat": 64, "energy": 9 }],
  "markers": [{ "beat": 64, "type": "impact" }]
}
```

Section types: `intro` `verse` `pre_chorus` `chorus` `drop` `bridge` `breakdown` `buildup` `outro` `instrumental` `silence`

Sound types: `kick` `snare` `clap` `hihat` `cymbal` `bass` `vocal` `melody` `percussion` `synth` `fx`

Marker types: `impact` `drop` `rise` `silence` `climax` `transition`

See SKILL.md for the complete specification and prompt templates (Chinese & English).

## Multi-Track Format

For finer control, provide per-instrument timeline data. The generator will infer judge-line routing, note emphasis, and line events from `active_instruments`, `vocal_state`, `lyrics`, and `drum_rhythm` instead of relying on a song-specific template:

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

## Phira Shader Effects

Charts can include visual effects via `extra.json` for the Phira player:

| Shader | Effect |
|--------|--------|
| `chromatic` | Color aberration |
| `glitch` | Glitch / error flicker |
| `shockwave` | Shockwave ripple |
| `fisheye` | Fish-eye distortion |
| `radialBlur` | Radial blur |
| `pixel` | Pixelation |
| `grayscale` | Grayscale |
| `noise` | Static noise |
| `circleBlur` | Circle bokeh blur |
| `vignette` | Dark edges / vignette |

## RPE Error Prevention

The chart generator automatically avoids all common RPE errors:

| Error | Prevention |
|-------|-----------|
| Tap&Hold Overlapped | 150px collision radius check |
| Tap After Flick | 250ms minimum gap |
| Tap After Drag | 250ms minimum gap |
| Event Overlapped | Per-line per-layer per-type tracking |
| Hold too long | Max 4 beats per Hold |
| X out of range | Clamped to [-675, 675] |
| Rotation excess | Max ±12 degrees, always returns to 0 |

## RPEJSON Reference

The skill includes a comprehensive RPEJSON reference covering:

- Coordinate system: X [-675, 675], Y [-450, 450]
- TimeT format: `[bar, numerator, denominator]`
- 30 easing types with function table
- 5 event types (moveX/Y, rotate, alpha, speed) across 4 layers
- Extended events (scaleX/Y, color, text, incline, GIF)
- Note types (Tap=1, Hold=2, Flick=3, Drag=4)
- Controls (alpha, size, pos, y, skew)
- UI binding (pause, combo, score, bar, name, level)
- RPE 1.7.0 new features (note tint, judgeArea, trajectory recording)

## Compatibility

| Target | Format | Support |
|--------|--------|---------|
| Re:PhiEdit (RPE) | RPEJSON + info.txt + PEZ | Full |
| Phira | RPEJSON + info.yml + extra.json | Full |
| PhiEditer (PE) | PEC | Reference only |
| Phigros Official | Official JSON | Reference only |

## References

- [Phira Source Code](https://github.com/TeamFlos/phira)
- [Phira Documentation](https://teamflos.github.io/phira-docs/)
- [RPE Easing Reference](https://easings.net/)

## License

MIT
