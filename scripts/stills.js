#!/usr/bin/env node
/**
 * 静帧抓取：按给定的时刻列表逐个 __seek(t) 并截图，用于逐幕核对画面。
 * 用法: node stills.js <html> <outdir> <t1,t2,...>
 */
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { pathToFileURL } = require('url');

const HTML = path.resolve(process.argv[2]);
const OUT  = path.resolve(process.argv[3]);
const TS   = (process.argv[4] || '').split(',').filter(Boolean).map(Number);
const W = 1920, H = 1080, PORT = 9344;
const _findChrome = require('./__chrome.js');
const CHROME = _findChrome();
if (!CHROME) { console.error(_findChrome.HINT); process.exit(1); }
const UDD = path.join(require('os').tmpdir(), 'chrome-stills-' + Date.now());
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => http.get(url, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
}).on('error', rej));

(async () => {
  const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',
    '--force-device-scale-factor=1','--disable-lcd-text','--allow-file-access-from-files',
    `--remote-debugging-port=${PORT}`,`--user-data-dir=${UDD}`,`--window-size=${W},${H}`,'about:blank'], { stdio:'ignore' });
  let ws;
  try {
    for (let i = 0; i < 120; i++) { try { await getJSON(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
    const page = (await getJSON(`http://127.0.0.1:${PORT}/json`)).find(t => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = ev => { const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const {res,rej} = pending.get(m.id); pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
    const send = (method, params={}) => new Promise((res,rej) => { const mid = ++id; pending.set(mid,{res,rej});
      ws.send(JSON.stringify({id:mid,method,params})); });
    const ev = async e => (await send('Runtime.evaluate',{expression:e,returnByValue:true})).result;
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url: pathToFileURL(HTML).href + '?video=1'});
    let ready = false;
    for (let i = 0; i < 80; i++) { await sleep(250);
      const r = await ev('typeof window.__seek === "function"'); if (r && r.value) { ready = true; break; } }
    if (!ready) throw new Error('page not ready');
    await ev('document.fonts && document.fonts.ready'); await sleep(800);
    for (let k = 0; k < TS.length; k++) {
      await ev(`__seek(${TS[k]})`); await sleep(220);
      const shot = await send('Page.captureScreenshot',{format:'jpeg',quality:92,captureBeyondViewport:false});
      const name = 't' + String(TS[k]).replace('.', '_') + '.jpg';
      fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.data,'base64'));
      process.stdout.write(`  ${name}\n`);
    }
    console.log('done');
  } finally { try { ws && ws.close(); } catch {} chrome.kill('SIGKILL');
    try { fs.rmSync(UDD,{recursive:true,force:true}); } catch {} }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
