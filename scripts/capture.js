#!/usr/bin/env node
/**
 * 逐帧抓取演示页 → PNG/JPEG 序列
 * 用法: node capture.js <html绝对路径> <输出目录> [fps] [总秒数] [format:png|jpeg]
 * 原理: 通过 CDP 连接 headless Chrome，调用页面里的 window.__seek(t) 精确定位动画时间，
 *       再 Page.captureScreenshot 抓帧 —— 与实时录屏无关，帧帧确定、可重跑。
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const HTML  = path.resolve(process.argv[2] || '演示页-视频版.html');
const OUT   = path.resolve(process.argv[3] || 'frames');
const FPS   = parseFloat(process.argv[4] || '25');
const SECS  = parseFloat(process.argv[5] || '60');
const FMT   = (process.argv[6] || 'png').toLowerCase();
const W = 1920, H = 1080, PORT = 9333;
const _findChrome = require('./__chrome.js');
const CHROME = _findChrome();
if (!CHROME) { console.error(_findChrome.HINT); process.exit(1); }
const UDD = path.join(require('os').tmpdir(), 'chrome-capture-' + Date.now());

fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function waitForDevtools() {
  for (let i = 0; i < 120; i++) {
    try { return await getJSON(`http://127.0.0.1:${PORT}/json/version`); }
    catch { await sleep(250); }
  }
  throw new Error('DevTools 端口未就绪');
}

(async () => {
  const total = Math.round(FPS * SECS);
  console.log(`页面: ${HTML}`);
  console.log(`输出: ${OUT}`);
  console.log(`规格: ${W}x${H} @ ${FPS}fps × ${SECS}s = ${total} 帧 (${FMT})`);

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--disable-lcd-text',
    '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${UDD}`,
    `--window-size=${W},${H}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let ws;
  try {
    await waitForDevtools();
    const targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
    const page = targets.find(t => t.type === 'page');
    if (!page) throw new Error('未找到 page target');

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0; const pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id); pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      const mid = ++id; pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result;

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 1, mobile: false,
    });

    const url = pathToFileURL(HTML).href + '?video=1';
    await send('Page.navigate', { url });

    // 等待页面与 __seek 就绪
    let ready = false;
    for (let i = 0; i < 80; i++) {
      await sleep(250);
      const r = await evaluate('typeof window.__seek === "function" && !!document.querySelector(".scene.active")');
      if (r && r.value === true) { ready = true; break; }
    }
    if (!ready) throw new Error('页面未就绪（未找到 __seek）');

    // 预跑一轮，确保字体与首帧渲染完成
    await evaluate('document.fonts && document.fonts.ready');
    await evaluate('__seek(0)');
    await sleep(600);

    const t0 = Date.now();
    for (let f = 0; f < total; f++) {
      const t = f / FPS;
      await evaluate(`__seek(${t})`);
      const shot = await send('Page.captureScreenshot', FMT === 'jpeg'
        ? { format: 'jpeg', quality: 95, captureBeyondViewport: false, optimizeForSpeed: true }
        : { format: 'png', captureBeyondViewport: false, optimizeForSpeed: true });
      const ext = FMT === 'jpeg' ? 'jpg' : 'png';
      const name = 'f' + String(f).padStart(5, '0') + '.' + ext;
      fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.data, 'base64'));
      if (f % 25 === 0 || f === total - 1) {
        const pct = ((f + 1) / total * 100).toFixed(1);
        const el = (Date.now() - t0) / 1000;
        const eta = f > 0 ? (el / (f + 1) * (total - f - 1)).toFixed(0) : '?';
        process.stdout.write(`\r  帧 ${f + 1}/${total}  ${pct}%  已用 ${el.toFixed(0)}s  ETA ${eta}s   `);
      }
    }
    console.log(`\n完成：${total} 帧 → ${OUT}`);
  } finally {
    try { ws && ws.close(); } catch {}
    chrome.kill('SIGKILL');
    try { fs.rmSync(UDD, { recursive: true, force: true }); } catch {}
  }
})().catch(e => { console.error('抓帧失败:', e.message); process.exit(1); });
