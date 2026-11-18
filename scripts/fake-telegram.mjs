// Local stand-in for the Telegram Bot API, for tests and the demo. Not Telegram.
// Usage: node scripts/fake-telegram.mjs [port=4100] [photo.png]
// Bot API: getUpdates, sendMessage, sendPhoto, getFile, file download.
// Helper endpoints: POST /__say {text|photo,caption}, GET /__log, GET /__chat (small chat page).
import http from 'node:http';
import fs from 'node:fs';
const port = Number(process.argv[2] || 4100);
const photo = process.argv[3] && fs.existsSync(process.argv[3]) ? fs.readFileSync(process.argv[3]) : Buffer.from('89504e470d0a1a0a', 'hex');
const queue = []; const log = []; let uid = 900;
const CHAT = 777;
const page = `<!doctype html><meta charset=utf-8><title>Simulated Telegram</title>
<style>body{margin:0;font:16px system-ui;background:#e6ebee;height:100vh;display:flex;flex-direction:column}
header{background:#517da2;color:#fff;padding:12px 18px;font-weight:600}header small{display:block;font-weight:400;opacity:.85}
#log{flex:1;overflow:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;padding-bottom:84px}
.b{max-width:60%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;box-shadow:0 1px 1px #0002}
.me{align-self:flex-end;background:#effdde}.bot{align-self:flex-start;background:#fff}.b img{max-width:240px;display:block;margin-bottom:6px;border-radius:6px}
form{position:fixed;left:0;right:0;bottom:72px;background:#fff;padding:10px;display:flex;gap:8px}input{flex:1;font:inherit;padding:8px}</style>
<header>DoubtDesk bot<small>Simulated chat: a local fake of the Telegram Bot API, not real Telegram</small></header>
<div id=log></div>
<form id=f><input id=t autocomplete=off placeholder="Message"><button>Send</button><button type=button id=p>Send photo</button></form>
<script>
const L=document.getElementById('log');let n=0;
async function poll(){const r=await (await fetch('/__log')).json();if(r.length!==n){n=r.length;L.innerHTML=r.map(m=>'<div class="b '+(m.from==='me'?'me':'bot')+'">'+(m.photo?'<img src="/__photo">':'')+(m.text||'').replace(/</g,'&lt;')+'</div>').join('');L.scrollTop=1e9}}
setInterval(poll,400);poll();
const say=b=>fetch('/__say',{method:'POST',body:JSON.stringify(b)});
f.onsubmit=e=>{e.preventDefault();if(t.value.trim())say({text:t.value});t.value=''};
p.onclick=()=>say({photo:true,caption:t.value});
</script>`;
http.createServer((req, res) => {
  const body = [];
  req.on('data', (c) => body.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(body);
    const json = (r) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result: r })); };
    if (req.url === '/__chat') { res.setHeader('content-type', 'text/html'); return res.end(page); }
    if (req.url === '/__log') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(log)); }
    if (req.url === '/__photo' || req.url.includes('/file/bot')) { res.setHeader('content-type', 'image/png'); return res.end(photo); }
    if (req.url === '/__say') {
      const b = JSON.parse(raw || '{}'); uid++;
      const message = { message_id: uid, chat: { id: CHAT } };
      if (b.photo) { message.photo = [{ file_id: 'p' }]; if (b.caption) message.caption = b.caption; } else message.text = b.text;
      queue.push({ update_id: uid, message }); log.push({ from: 'me', text: b.text || b.caption || '', photo: Boolean(b.photo) });
      return json(true);
    }
    const m = req.url.match(/\/bot[^/]+\/(\w+)/);
    if (!m) { res.statusCode = 404; return res.end(); }
    if (m[1] === 'getUpdates') return setTimeout(() => json(queue.splice(0)), 200);
    if (m[1] === 'getFile') return json({ file_path: 'photos/p1.png' });
    if (m[1] === 'sendMessage') { const b = JSON.parse(raw); log.push({ from: 'bot', text: b.text }); return json({ message_id: 1 }); }
    if (m[1] === 'sendPhoto') { const s = raw.toString('latin1'); const cap = (s.match(/name="caption"\r\n\r\n([\s\S]*?)\r\n--/) || [])[1] || ''; log.push({ from: 'bot', text: cap, photo: true }); return json({ message_id: 2 }); }
    json({});
  });
}).listen(port, () => console.log('fake telegram on', port));
