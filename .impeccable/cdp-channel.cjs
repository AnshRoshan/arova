/* Feature 11 driver over raw CDP (no deps). Attaches a real organisation to the browser session,
 * opens its channel, briefs the lead, and proves the summons land as their own posts — mid-stream
 * and settled, at desktop and phone sizes. Screenshots are written from the same buffer that is
 * reported, and every capture is checked rather than trusted. */
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const net = require('net');
const fs = require('fs');
const os = require('os');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9344;
const APP_URL = 'http://localhost:3000/';
const OUT = process.argv[2] || '.';
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
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${os.tmpdir()}\\f11cdp-profile`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
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
    const md5 = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
    console.log(`  shot ${file.split(/[\\/]/).pop()} ${buf.length} bytes md5:${md5}`);
    return { bytes: buf.length, md5 };
  };
  const setViewport = (w, h, dpr = 1) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 500 });

  for (const f of ['channel-desktop', 'channel-desktop-stream', 'channel-desktop-run', 'channel-mobile', 'channel-mobile-bench']) { try { fs.unlinkSync(`${OUT}/${f}.png`); } catch { /* first round */ } }

  // The demo identifies a workspace by an httpOnly cookie, so the session is attached through CDP.
  await cdp.send('Network.setCookie', { name: 'arova_workspace', value: WORKSPACE, url: APP_URL, httpOnly: true, sameSite: 'Lax', path: '/' });
  await setViewport(1440, 900);
  await cdp.send('Page.navigate', { url: APP_URL });
  for (let i = 0; i < 40; i++) { await sleep(600); if (await evaluate(`!!document.querySelector('.rail-btn')`).catch(() => false)) break; }
  await evaluate(hideDevBadge);

  // React renders the panel on the next tick, so the two clicks are separate round-trips.
  const openChannel = async () => {
    await evaluate(`(() => { const r = [...document.querySelectorAll('.rail-btn')].find(b => b.getAttribute('aria-label') === 'Agents'); if (r) r.click(); return !!r; })()`);
    for (let i = 0; i < 20; i++) { if (await evaluate(`!!document.querySelector('.group-channel')`).catch(() => false)) break; await sleep(300); }
    return evaluate(`(() => { const ch = document.querySelector('.group-channel'); if (!ch) return 'no channel entry in the bench'; ch.click(); return 'opened'; })()`);
  };
  console.log('OPEN:', await openChannel());
  for (let i = 0; i < 30; i++) { if (await evaluate(`!!document.querySelector('.thread.channel')`).catch(() => false)) break; await sleep(400); }
  console.log('AT REST:', await evaluate(`JSON.stringify({
    bar: document.querySelector('.sheet-bar h1')?.textContent,
    role: document.querySelector('.sheet-bar .ident-role')?.textContent,
    facts: [...document.querySelectorAll('.sheet-bar .fact')].map(f => f.textContent.trim()),
    brief: document.querySelector('.channel-brief')?.textContent?.slice(0, 60),
    chips: [...document.querySelectorAll('.seat-chip')].map(c => c.textContent.trim()),
    posts: document.querySelectorAll('.thread.channel .entry').length,
    kinds: [...document.querySelectorAll('.thread.channel .entry-head .tag')].map(t => t.textContent),
    authors: [...document.querySelectorAll('.thread.channel .entry-head strong')].map(s => s.textContent),
    composer: document.querySelector('.composer textarea')?.getAttribute('placeholder'),
    composerBar: [...document.querySelectorAll('.composer-bar span')].map(s => s.textContent.trim()),
    panelTitle: document.querySelector('.sidepanel .panel-title, .sp-title, .panel-head')?.textContent?.trim()?.slice(0, 40) || null,
  })`));
  await shot(`${OUT}/channel-desktop.png`);

  // --no-brief: re-shoot the surface from the posts that are already stored, without spending another call.
  if (!process.argv.includes('--no-brief')) {
    const BRIEF = 'Before you decide, ask the UX Researcher what users actually did during onboarding. Then name the one thing we fix first.';
    console.log('SEND:', await evaluate(`(() => {
      const ta = document.querySelector('.composer textarea');
      if (!ta) return 'no composer';
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(BRIEF)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.form.requestSubmit();
      return 'submitted';
    })()`));
  
    // Mid-stream evidence: poll in a single round-trip so the capture is the frame that is live.
    const lengths = [];
    let streamShot = null;
    for (let i = 0; i < 90; i++) {
      const snap = await evaluate(`JSON.stringify({
        live: !!document.querySelector('.entry-live'),
        head: document.querySelector('.entry-live .entry-head .tag')?.textContent || null,
        len: document.querySelector('.entry-live .entry-text')?.textContent?.length || 0,
        posts: [...document.querySelectorAll('.thread.channel .entry-head .tag')].map(t => t.textContent).filter(t => t !== 'notice'),
        authors: [...document.querySelectorAll('.thread.channel .entry-head strong')].map(s => s.textContent),
        consulting: document.querySelector('.entry-live .consult .consult-q')?.textContent?.slice(0, 70) || null,
        stop: !!document.querySelector('.entry-live .stop-btn'),
        board: [...document.querySelectorAll('.board .bd-row.live .bd-main b, .board .bd-row.live b')].map(x => x.textContent.trim().slice(0, 70)),
      })`);
      const s = JSON.parse(snap);
      if (s.live && s.len > 0 && (!lengths.length || s.len !== lengths[lengths.length - 1])) {
        lengths.push(s.len);
        console.log(`  live #${lengths.length}: ${JSON.stringify(s)}`);
        if (lengths.length === 3) streamShot = await shot(`${OUT}/channel-desktop-stream.png`);
      }
      if (!s.live && lengths.length > 0 && i > 4) break;
      await sleep(1200);
    }
    for (let i = 0; i < 40; i++) {
      const still = await evaluate(`!!document.querySelector('.entry-live')`).catch(() => true);
      if (!still) break;
      await sleep(1500);
    }
    await sleep(1200);
    console.log('SETTLED:', await evaluate(`JSON.stringify({
      posts: [...document.querySelectorAll('.thread.channel .entry')].length,
      kinds: [...document.querySelectorAll('.thread.channel .entry-head')].map(h => [h.querySelector('strong')?.textContent, ...[...h.querySelectorAll('.tag')].map(t => t.textContent)].join(' / ')),
      asked: [...document.querySelectorAll('.thread.channel .consult')].map(c => c.textContent.replace(/\\s+/g, ' ').slice(0, 110)),
      feet: [...document.querySelectorAll('.thread.channel .post-foot')].map(f => f.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120)),
      summaryHasPeer: [...document.querySelectorAll('.thread.channel .entry-text')].some(e => /UX Researcher/.test(e.textContent) && /reports:/i.test(e.textContent)),
      live: [...document.querySelectorAll('.thread.channel .entry-live')].length,
      attention: [...document.querySelectorAll('.board .board-sec')].map(x => [x.querySelector('.group-label span')?.textContent, x.querySelectorAll('.bd-row').length]),
    })`));
    const settledShot = await shot(`${OUT}/channel-desktop.png`);
    console.log('distinct stream/settled frames:', streamShot && settledShot ? `${streamShot.md5} vs ${settledShot.md5} ${streamShot.md5 !== settledShot.md5 ? 'OK' : 'IDENTICAL — not evidence'}` : `stream captured: ${!!streamShot}, lengths ${lengths.join(",")}`);
  } else { console.log('BRIEF SKIPPED (--no-brief): using the posts already stored'); await sleep(400); }

  // Drill into the run the brief executed.
  console.log('RUN BUTTON:', await evaluate(`(() => {
    const b = [...document.querySelectorAll('.thread.channel .post-foot button')].pop();
    if (!b) return 'no run link';
    b.click();
    return 'clicked';
  })()`));
  await sleep(700);
  console.log('RUN DIALOG:', await evaluate(`JSON.stringify({
    title: [...document.querySelectorAll('.scrim .dialog h2')].map(h => h.textContent).slice(-2),
    steps: [...document.querySelectorAll('.scrim .dialog .step, .scrim .dialog .run-step, .scrim .dialog li')].map(x => x.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80)).slice(0, 8),
    state: document.querySelector('.scrim .dialog .chip')?.textContent?.trim(),
    text: document.querySelector('.scrim .dialog')?.innerText?.replace(/\\s+/g, ' ').slice(0, 220),
  })`));
  await shot(`${OUT}/channel-desktop-run.png`);
  await evaluate(`(() => { const x = document.querySelector('.scrim .dialog-top .x'); if (x) x.click(); return x ? 'closed' : 'no close button'; })()`);

  // The org manager owns the lead picker and the channel entry, so it belongs to this surface.
  await evaluate(`(() => { const r = [...document.querySelectorAll('.rail-btn')].find(b => b.getAttribute('aria-label') === 'Organisation'); if (r) r.click(); return !!r; })()`);
  await sleep(900);
  console.log('ORG PANE:', await evaluate(`JSON.stringify({
    roles: [...document.querySelectorAll('.org-roles label, .org-roles button')].map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)),
    leadSelected: document.querySelector('.org-roles select')?.selectedOptions[0]?.textContent?.trim(),
    leadOptions: [...(document.querySelector('.org-roles select')?.options ?? [])].map(o => o.textContent.trim()).slice(0, 3),
    stats: [...document.querySelectorAll('.org-stats > div')].map(d => d.textContent.replace(/\s+/g, ' ').trim()),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  })`));
  await shot(`${OUT}/channel-org-pane.png`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('.org-roles button')].find(x => /Channel/.test(x.textContent)); if (b) b.click(); return !!b; })()`);
  await sleep(900);
  console.log('FROM ORG MANAGER:', await evaluate(`JSON.stringify({ channel: !!document.querySelector('.thread.channel'), bar: document.querySelector('.sheet-bar h1')?.textContent })`));
  // ── memory and triggers: the org's record, and its inbound door ──
  await evaluate(`(() => { const b = [...document.querySelectorAll('.memory-bar .ghost')].find(x => x.textContent.includes('Memory')); if (b) b.click(); return !!b; })()`);
  await sleep(600);
  console.log('MEMORY FORM:', await evaluate(`(() => {
    const i = document.querySelector('.memory-add input');
    if (!i) return 'no input';
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(i, 'Compliance samples three epics per release, not every epic.');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.form.requestSubmit();
    return 'submitted';
  })()`));
  await sleep(1500);
  console.log('MEMORY:', await evaluate(`JSON.stringify({
    rows: document.querySelectorAll('.memory-row').length,
    kinds: [...document.querySelectorAll('.memory-kind')].map(k => k.textContent),
    meta: [...document.querySelectorAll('.memory-main em')].map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)),
    scope: document.querySelector('.memory-scope')?.textContent,
    pin: !!document.querySelector('.memory-row .icon-btn'),
    overflow: (b => b ? b.scrollWidth > b.clientWidth + 1 : null)(document.querySelector('.sheet-body')),
  })`));
  await evaluate(`(() => { const p = document.querySelector('.memory-panel'); const b = document.querySelector('.sheet-body'); if (p && b) b.scrollTop = Math.max(0, p.offsetTop - 90); return p ? 'scrolled' : 'no panel'; })()`);
  await shot(`${OUT}/channel-memory.png`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('.memory-bar .ghost')].find(x => x.textContent.includes('Memory')); if (b) b.click(); return !!b; })()`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('.memory-bar .ghost')].find(x => x.textContent.includes('Trigger')); if (b) b.click(); return !!b; })()`);
  await sleep(600);
  console.log('TRIGGER FORM:', await evaluate(`(() => {
    const forms = [...document.querySelectorAll('.memory-add')];
    const i = forms[forms.length - 1]?.querySelector('input');
    if (!i) return 'no input';
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(i, 'nightly build report');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.form.requestSubmit();
    return 'submitted';
  })()`));
  await sleep(1500);
  console.log('TRIGGER:', await evaluate(`JSON.stringify({
    rows: document.querySelectorAll('.memory-row').length,
    call: document.querySelector('.call-line')?.textContent?.slice(0, 110),
    meta: [...document.querySelectorAll('.memory-main em')].map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 100)),
    revoke: [...document.querySelectorAll('.memory-row .icon-btn')].length,
    overflow: (b => b ? b.scrollWidth > b.clientWidth + 1 : null)(document.querySelector('.sheet-body')),
  })`));
  await evaluate(`(() => { const p = document.querySelector('.memory-panel:last-of-type'); const b = document.querySelector('.sheet-body'); if (p && b) b.scrollTop = Math.max(0, p.offsetTop - 90); return p ? 'scrolled' : 'no panel'; })()`);
  await shot(`${OUT}/channel-trigger.png`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('.memory-row .icon-btn')].pop(); if (b) b.click(); return b ? 'revoked' : 'no revoke button'; })()`);
  await sleep(1000);
  console.log('AFTER REVOKE:', await evaluate(`JSON.stringify({ rows: document.querySelectorAll('.memory-row').length, toast: document.querySelector('.toast')?.textContent?.trim() })`));

  await setViewport(390, 844, 2);
  await cdp.send('Page.navigate', { url: APP_URL });
  for (let i = 0; i < 30; i++) { await sleep(600); if (await evaluate(`!!document.querySelector('.rail-btn')`).catch(() => false)) break; }
  await evaluate(hideDevBadge);
  console.log('MOBILE START:', await evaluate(`JSON.stringify({ pane: document.querySelector('.sheet-bar h1')?.textContent, bench: !!document.querySelector('.bench-group'), overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 })`));
  await evaluate(`(() => { const m = document.querySelector('.sheet-bar .icon-btn.only-mobile'); if (m) m.click(); const r = [...document.querySelectorAll('.rail-btn')].find(b => b.getAttribute('aria-label') === 'Agents'); if (r) r.click(); return 'drawer open'; })()`);
  for (let i = 0; i < 20; i++) { if (await evaluate(`!!document.querySelector('.group-channel')`).catch(() => false)) break; await sleep(300); }
  console.log('MOBILE OPEN:', await evaluate(`(() => { const ch = document.querySelector('.group-channel'); if (!ch) return 'no channel entry'; ch.click(); return 'opened'; })()`));
  for (let i = 0; i < 20; i++) { if (await evaluate(`!!document.querySelector('.thread.channel')`).catch(() => false)) break; await sleep(400); }
  await sleep(600);
  console.log('MOBILE:', await evaluate(`JSON.stringify({
    channel: !!document.querySelector('.thread.channel'),
    posts: document.querySelectorAll('.thread.channel .entry').length,
    authors: [...document.querySelectorAll('.thread.channel .entry-head strong')].map(s => s.textContent).slice(0, 6),
    chips: document.querySelectorAll('.seat-chip').length,
    composer: document.querySelector('.composer textarea')?.getAttribute('placeholder'),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    bodyScroll: (b => b ? { over: b.scrollWidth > b.clientWidth + 1, sw: b.scrollWidth, cw: b.clientWidth } : null)(document.querySelector('.sheet-body')),
    foot: (p => p ? { wrap: getComputedStyle(p).flexWrap, w: Math.round(p.getBoundingClientRect().width) } : null)(document.querySelector('.thread.channel .post-foot')),
    wide: (() => { const b = document.querySelector('.sheet-body'); if (!b) return null; const left = b.getBoundingClientRect().left; const out = []; for (const el of b.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.right - left > b.clientWidth + 1) out.push((el.className || el.tagName) + '>' + Math.round(r.right - left)); } return out.slice(0, 6); })(),
  })`));
  await shot(`${OUT}/channel-mobile.png`);

  const noise = cdp.msgs.filter(m => m.method === 'Runtime.exceptionThrown' || (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)));
  console.log('CONSOLE:', JSON.stringify(noise.map(m => m.method === 'Runtime.exceptionThrown' ? (m.params.exceptionDetails.exception?.description || '').slice(0, 160) : m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 160)).slice(0, 8)));
  cdp.close();
  chrome.kill();
  process.exit(0);
})().catch(e => { console.error('DRIVER FAILED:', e.message); process.exit(1); });
