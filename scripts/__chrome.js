/* 跨平台定位 Chrome / Chromium。
   顺序：环境变量 CHROME_BIN → 各平台常见安装位置 → PATH 里的命令。
   找到返回路径；找不到返回 null，并导出 HINT 供调用方打印友好提示。 */
const fs = require('fs');
const { execSync } = require('child_process');

const CANDIDATES = [
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Linux
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  // Windows
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const p of CANDIDATES) {
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  for (const cmd of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const p = execSync('command -v ' + cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim();
      if (p) return p;
    } catch (e) {}
  }
  return null;
}

const HINT = [
  '未找到 Chrome / Chromium。请任选一种方式：',
  '  1) 设置环境变量： export CHROME_BIN="/path/to/chrome"',
  '  2) 安装 Google Chrome： https://www.google.com/chrome/',
  '     macOS:         brew install --cask google-chrome',
  '     Debian/Ubuntu: sudo apt install chromium-browser',
  '     CentOS/RHEL:   sudo yum install chromium',
].join('\n');

module.exports = findChrome;
module.exports.HINT = HINT;
