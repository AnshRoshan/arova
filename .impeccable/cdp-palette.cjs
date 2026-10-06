/* Palette capture over raw CDP (no deps). Walks every section of the workbench on a seeded
 * workspace, records the section colour that actually computed, and screenshots each room.
 * Screenshots are written from the same buffer that is reported; md5 per capture proves freshness.
 * Usage: node .impeccable/cdp-palette.cjs <out-dir> <workspace-session-id> */
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const net = require('net');
const fs = require('fs');
const os = require('os');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9345;
const APP_URL = 'http://localhost:3000/';
const OUT = process.argv[2] || '.impeccable/shots';
const WORKSPACE = process.argv[3];
if (!WORKSPACE) throw new Error('pass the workspace session id');

function getJson(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path, timeout: 4000 }, r => {
      let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

class WS {
  constructor(url) { this.url = new URL(url); this.buf = Buffer.alloc(0); this.handlers = new Map(); this.msgs = []; this.next = 1; }
  connect() {
    return new Promise((res, rej) => {
      const key = crypto.randomBytes(16).toString('base64');
      const s = net.connect(+this.url.port, this.url.hostname, () => {
        s.write(`GET ${this.url.pathname} HTTP/1.1\r\nHost: ${this.url.hostname}:${this.url.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      });
      this.s = s;
      let handshaken = false, hbuf = Buffer.alloc(0);
      s.on('data', d => {
        if (!handshaken) {
          hbuf = Buffer.concat([hbuf, d]);
          const i = hbuf.indexOf('\r\n\r\n');
          if (i === -1) return;
          handshaken = true; res();
          this._feed(hbuf.subarray(i + 4));
        } else this._feed(d);
      });
      s.on('error', rej);
    });
  }
  _feed(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (true) {
      if (this.buf.length < 2) return;
      const op = this.buf[0] & 0x0f; let len = this.buf[1] & 0x7f; let off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (this.buf.length < off + len) return;
      const payload = this.buf.subarray(off, off + len); this.buf = this.buf.subarray(off + len);
      if (op === 8) return;
      if (op !== 1 && op !== 2) continue;
      try { const j = JSON.parse(payload.toString()); if (j.id && this.handlers.has(j.id)) { const h = this.handlers.get(j.id); this.handlers.delete(j.id); h(null, j); } else if (j.method) this.msgs.push(j); } catch { /* not a control frame */ }
    }
  }
  send(method, params = {}) {
    const id = this.next++;
    const json = JSON.stringify({ id, method, params });
    const data = Buffer.from(json);
    const mask = crypto.randomBytes(4);
    const head = data.length < 126 ? Buffer.from([0x81, 0x80 | data.length])
      : data.length < 65536 ? Buffer.concat([Buffer.from([0x81, 0x80 | 126]), (() => { const b = Buffer.alloc(2); b.writeUInt16BE(data.length); return b; })()])
        : Buffer.concat([Buffer.from([0x81, 0x80 | 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(data.length)); return b; })()]);
    const masked = Buffer.alloc(data.length); for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
    this.s.write(Buffer.concat([head, mask, masked]));
    return new Promise((res, rej) => { const t = setTimeout(() => { this.handlers.delete(id); rej(new Error('timeout ' + method)); }, 60000); this.handlers.set(id, (err, j) => { clearTimeout(t); err ? rej(err) : j.error ? rej(new Error(method + ': ' + j.error.message)) : res(j.result); }); });
  }
  close() { try { this.s.destroy(); } catch { /* already gone */ } }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hideDevBadge = `(() => {
  const st = document.createElement('style');
  st.textContent = 'nextjs-\\003acategory-container, [id^="nextjs"], [data-nextjs-dev-tools-boundaries] { display: none !important; }';
  document.head.appendChild(st);
  for (const el of document.querySelectorAll('body > *')) if (/^nextjs/i.test(el.tagName || '') || el.shadowRoot) el.remove();
  return 'hidden';
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${os.tmpdir()}\\palette-profile`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 40 && !version; i++) { await sleep(500); version = await getJson('/json/version').catch(() => null); }
  if (!version) throw new Error('chrome did not come up');
  let page = null;
  for (let i = 0; i < 20 && !page; i++) { const list = await getJson('/json').catch(() => []); page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl); if (!page) await sleep(400); }
  const cdp = new WS(page.webSocketDebuggerUrl); await cdp.connect();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const evaluate = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const shot = async file => {
    await evaluate(hideDevBadge);
    await sleep(120);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(file, buf);
    console.log(`  shot ${file.split(/[\\/]/).pop()} ${buf.length} bytes md5:${crypto.createHash('md5').update(buf).digest('hex').slice(0, 8)}`);
  };

  await cdp.send('Network.setCookie', { name: 'arova_workspace', value: WORKSPACE, url: APP_URL, httpOnly: true, sameSite: 'Lax', path: '/' });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP_URL });
  for (let i = 0; i < 40; i++) { await sleep(600); if (await evaluate(`!!document.querySelector('.rail-btn')`).catch(() => false)) break; }
  await evaluate(hideDevBadge);

  const seen = [];
  for (const label of ['Overview', 'Agents', 'Organisation', 'Automations', 'Integrations', 'Settings']) {
    await evaluate(`(() => { const b = [...document.querySelectorAll('.rail-btn')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
    await sleep(900);
    const facts = await evaluate(`JSON.stringify({
      section: document.querySelector('.workbench')?.getAttribute('data-section'),
      sec: (getComputedStyle(document.querySelector('.workbench')).getPropertyValue('--sec') || '').trim(),
      bar: (() => { const on = document.querySelector('.rail-btn.on'); return on ? getComputedStyle(on, '::before').backgroundColor : null; })(),
      icon: getComputedStyle(document.querySelector('.rail-btn.on') || document.querySelector('.rail-btn')).color,
      title: (() => { const h = document.querySelector('.sp-title h2'); return h ? getComputedStyle(h).color : null; })(),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    })`);
    console.log('  ' + label + ':', facts);
    seen.push(facts);
    await shot(`${OUT}/palette-${(JSON.parse(facts).section || label).toLowerCase()}.png`);
  }

  // The local-tools console and the memory panel are the two brand-new surfaces.
  await evaluate(`(() => { const b = [...document.querySelectorAll('.rail-btn')].find(x => x.getAttribute('aria-label') === 'Integrations'); if (b) b.click(); return !!b; })()`);
  await sleep(700);
  await evaluate(`(() => { const b = [...document.querySelectorAll('.sp-tabs button')].find(x => /Local tools/.test(x.textContent)); if (b) b.click(); return !!b; })()`);
  await sleep(600);
  await shot(`${OUT}/palette-local-tools.png`);
  console.log('  local console:', await evaluate(`JSON.stringify({ rows: document.querySelectorAll('.local-console .rows .row').length, chips: [...document.querySelectorAll('.local-console .chip')].map(c => c.textContent.trim()), runner: !!document.querySelector('.lc-runner') })`));

  await evaluate(`(() => { const b = [...document.querySelectorAll('.rail-btn')].find(x => x.getAttribute('aria-label') === 'Agents'); if (b) b.click(); return !!b; })()`);
  await sleep(600);
  await evaluate(`(() => { const ch = document.querySelector('.group-channel') || [...document.querySelectorAll('.sp-item')].find(x => /Cartography|channel/i.test(x.textContent)); if (ch) ch.click(); return !!ch; })()`);
  await sleep(800);
  await evaluate(`(() => { const b = [...document.querySelectorAll('.memory-bar .ghost')].find(x => x.textContent.includes('Memory')); if (b) b.click(); return !!b; })()`);
  await sleep(500);
  await shot(`${OUT}/palette-memory.png`);
  console.log('  memory kinds:', await evaluate(`JSON.stringify([...document.querySelectorAll('.memory-kind[data-kind]')].map(k => k.getAttribute('data-kind') + '=' + getComputedStyle(k).color))`));

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.navigate', { url: APP_URL });
  for (let i = 0; i < 30; i++) { await sleep(600); if (await evaluate(`!!document.querySelector('.rail-btn')`).catch(() => false)) break; }
  await evaluate(hideDevBadge);
  await shot(`${OUT}/palette-mobile.png`);
  console.log('  mobile:', await evaluate(`JSON.stringify({ overflowX: document.documentElement.scrollWidth > window.innerWidth + 1, rail: !!document.querySelector('.iconrail') })`));

  const noise = cdp.msgs.filter(m => m.method === 'Runtime.exceptionThrown' || (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)));
  console.log('CONSOLE:', JSON.stringify(noise.map(m => m.method === 'Runtime.exceptionThrown' ? (m.params.exceptionDetails.exception?.description || '').slice(0, 160) : m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 160)).slice(0, 8)));
  cdp.close();
  chrome.kill();
  process.exit(0);
})().catch(e => { console.error('DRIVER FAILED:', e.message); process.exit(1); });
