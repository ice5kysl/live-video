/* 静态页整页截图 */
const { spawn }=require('child_process'); const http=require('http'); const fs=require('fs');
const path=require('path'); const { pathToFileURL }=require('url');
const HTML=path.resolve(process.argv[2]), OUT=path.resolve(process.argv[3]);
const W=+(process.argv[4]||1920), H=+(process.argv[5]||1080), PORT=9479;
const WAIT=+(process.argv[6]||1500);
const _findChrome=require('./__chrome.js');
const CHROME=_findChrome();
if(!CHROME){console.error(_findChrome.HINT);process.exit(1);}
const UDD=path.join(require('os').tmpdir(),'ch-st-'+Date.now());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const getJSON=u=>new Promise((res,rej)=>http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej));
(async()=>{
  const ch=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',
    '--force-device-scale-factor=1',`--remote-debugging-port=${PORT}`,`--user-data-dir=${UDD}`,
    `--window-size=${W},${H}`,'about:blank'],{stdio:'ignore'});
  let ws;
  try{
    for(let i=0;i<120;i++){try{await getJSON(`http://127.0.0.1:${PORT}/json/version`);break}catch{await sleep(250)}}
    const pg=(await getJSON(`http://127.0.0.1:${PORT}/json`)).find(t=>t.type==='page');
    ws=new WebSocket(pg.webSocketDebuggerUrl);
    await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
    let id=0;const pend=new Map();
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result)}};
    const send=(m,p={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}))});
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:pathToFileURL(HTML).href});
    await sleep(WAIT);
    const shot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(OUT,Buffer.from(shot.data,'base64'));
    console.log('  ✓ '+OUT);
  } finally { try{ws&&ws.close()}catch{} ch.kill('SIGKILL'); try{fs.rmSync(UDD,{recursive:true,force:true})}catch{} }
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
