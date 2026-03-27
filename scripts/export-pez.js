#!/usr/bin/env node

/**
 * export-pez.js — 将谱面项目打包为 PEZ 格式（本质是 ZIP）
 *
 * Usage:
 *   node export-pez.js --dir <chart_dir> --output <output.pez>
 *
 * chart_dir 中需要包含 chart.json、info.txt、音乐文件、曲绘文件
 * 所有文件会被放在 ZIP 根目录下（无子目录）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.dir || !args.output) {
    console.error(JSON.stringify({ error: 'Missing --dir or --output parameter' }));
    process.exit(1);
  }

  const chartDir = path.resolve(args.dir);
  const outputPath = path.resolve(args.output);

  if (!fs.existsSync(chartDir)) {
    console.error(JSON.stringify({ error: `Chart directory not found: ${chartDir}` }));
    process.exit(1);
  }

  // Check required files
  const requiredFiles = ['chart.json', 'info.txt'];
  const missingFiles = [];
  for (const f of requiredFiles) {
    if (!fs.existsSync(path.join(chartDir, f))) {
      missingFiles.push(f);
    }
  }

  // Read info.txt to find music and image files
  const infoPath = path.join(chartDir, 'info.txt');
  let songFile = null;
  let imageFile = null;

  if (fs.existsSync(infoPath)) {
    const infoContent = fs.readFileSync(infoPath, 'utf-8');
    const lines = infoContent.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        if (match[1] === 'Music') songFile = match[2].trim();
        if (match[1] === 'Image') imageFile = match[2].trim();
      }
    }
  }

  if (songFile && !fs.existsSync(path.join(chartDir, songFile))) {
    missingFiles.push(songFile + ' (音乐文件)');
  }
  if (imageFile && !fs.existsSync(path.join(chartDir, imageFile))) {
    missingFiles.push(imageFile + ' (曲绘文件)');
  }

  if (missingFiles.length > 0) {
    console.error(JSON.stringify({
      error: `缺少文件: ${missingFiles.join(', ')}`,
      chartDir: chartDir
    }));
    process.exit(1);
  }

  // Collect all files in chartDir (no subdirectories for PEZ)
  const files = fs.readdirSync(chartDir).filter(f => {
    const fullPath = path.join(chartDir, f);
    return fs.statSync(fullPath).isFile();
  });

  // Check for extra.json (shader config)
  const hasExtra = files.includes('extra.json');

  // Use system zip if available, otherwise create a simple ZIP manually
  try {
    // Try using PowerShell Compress-Archive on Windows
    const filesArg = files.map(f => `"${path.join(chartDir, f)}"`).join(',');

    // Remove existing output if any
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // Use PowerShell to create ZIP
    const psCommand = `powershell -NoProfile -Command "Compress-Archive -Path ${filesArg} -DestinationPath '${outputPath}'"`;
    execSync(psCommand, { stdio: 'pipe' });

    // If output ends with .pez, rename (PowerShell adds .zip)
    const zipPath = outputPath.endsWith('.pez') ? outputPath : outputPath;
    if (outputPath.endsWith('.pez')) {
      const autoZipPath = outputPath + '.zip';
      // PowerShell may or may not add .zip extension
      if (fs.existsSync(autoZipPath) && !fs.existsSync(outputPath)) {
        fs.renameSync(autoZipPath, outputPath);
      }
    }

    // Verify output
    if (!fs.existsSync(outputPath)) {
      // Try with .zip appended
      const withZip = outputPath + '.zip';
      if (fs.existsSync(withZip)) {
        fs.renameSync(withZip, outputPath);
      }
    }

    const stats = fs.statSync(outputPath);

    console.log(JSON.stringify({
      success: true,
      outputPath: outputPath,
      fileCount: files.length,
      files: files,
      size: `${(stats.size / 1024).toFixed(1)} KB`,
      hasShader: hasExtra,
      message: `PEZ 导出成功！文件: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB, ${files.length} 个文件)`
    }, null, 2));

  } catch (e) {
    // Fallback: just report what would be needed
    console.error(JSON.stringify({
      error: `ZIP 打包失败: ${e.message}`,
      suggestion: '请手动将以下文件压缩为ZIP，然后改扩展名为.pez',
      files: files,
      chartDir: chartDir
    }));
    process.exit(1);
  }
}

main();
