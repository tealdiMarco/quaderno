/* Aspetto del testo: palette generata, colore e font per ogni sintassi markdown, font dal computer, luminosità del tema. */
(function (root) {
  'use strict';
  const KEY = 'quaderno.style2';
  const OLD = 'quaderno.style';
  const NPAL = 10;

  const FONTS = [
    { n: 'Fraunces', s: "'Fraunces', Georgia, serif" },
    { n: 'Playfair Display', s: "'Playfair Display', Georgia, serif", g: 'Playfair+Display:wght@400;700' },
    { n: 'Lora', s: "'Lora', Georgia, serif", g: 'Lora:ital,wght@0,400;0,500;0,700;1,400' },
    { n: 'Merriweather', s: "'Merriweather', Georgia, serif", g: 'Merriweather:wght@400;700' },
    { n: 'Georgia', s: 'Georgia, serif' },
    { n: 'Inter', s: "'Inter', system-ui, sans-serif" },
    { n: 'Source Sans 3', s: "'Source Sans 3', system-ui, sans-serif", g: 'Source+Sans+3:wght@400;600;700' },
    { n: 'Caveat', s: "'Caveat', cursive", g: 'Caveat:wght@500;700' },
    { n: 'Sistema', s: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
    { n: 'JetBrains Mono', s: "'JetBrains Mono', ui-monospace, Menlo, monospace" },
    { n: 'Fira Code', s: "'Fira Code', ui-monospace, Menlo, monospace", g: 'Fira+Code:wght@400;500' },
    { n: 'Source Code Pro', s: "'Source Code Pro', ui-monospace, Menlo, monospace", g: 'Source+Code+Pro:wght@400;600' },
    { n: 'Monospazio', s: 'ui-monospace, Menlo, Consolas, monospace' },
  ];
  const MONO = ['JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Monospazio'];
  const PAIRS = [
    ['Playfair Display', 'Lora'], ['Fraunces', 'Inter'], ['Lora', 'Source Sans 3'], ['Merriweather', 'Inter'],
    ['Caveat', 'Inter'], ['Playfair Display', 'Source Sans 3'], ['Georgia', 'Sistema'], ['Fraunces', 'Lora'],
  ];
  const SCALE = { Caveat: 1.3 };

  /* chiave: [etichetta, gruppo, colore chiaro, colore scuro] (predefiniti, senza palette) */
  const KEYS = {
    h1: ['Titolo 1  #', 'Titoli', '#2B2620', '#EDE6D6'], h2: ['Titolo 2  ##', 'Titoli', '#2B2620', '#EDE6D6'],
    h3: ['Titolo 3  ###', 'Titoli', '#2B2620', '#EDE6D6'], h4: ['Titolo 4  ####', 'Titoli', '#2B2620', '#EDE6D6'],
    h5: ['Titolo 5  #####', 'Titoli', '#2B2620', '#EDE6D6'], h6: ['Titolo 6  ######', 'Titoli', '#2B2620', '#EDE6D6'],
    bold: ['Grassetto  **', 'Testo', '#8C3A18', '#F0A27E'], italic: ['Corsivo  *', 'Testo', '#3F6AA8', '#8FB3E8'],
    strike: ['Barrato  ~~', 'Testo', '#6B6254', '#A79E8C'], mark: ['Evidenziato  ==', 'Testo', '#F2C230', '#F2C230'],
    link: ['Link  [..](..)', 'Collegamenti', '#2B6CB0', '#7DB4F0'], wiki: ['Nota  [[..]]', 'Collegamenti', '#A24621', '#E08A63'],
    tag: ['Tag  #nome', 'Collegamenti', '#7B4FD0', '#B79BEA'],
    quote: ['Citazione  >', 'Blocchi', '#6B6254', '#A79E8C'], bullet: ['Elenco  -', 'Blocchi', '#A24621', '#E08A63'],
    todo: ['Da fare  [ ]', 'Blocchi', '#9A5B00', '#E5B567'], done: ['Fatto  [x]', 'Blocchi', '#2F7A4B', '#6FCF97'],
    code: ['Codice  `', 'Blocchi', '#2F7A4B', '#7FD1A0'],
    body: ['Testo normale', 'Base', '#2B2620', '#EDE6D6'], src: ['Sorgente (editor)', 'Base', '#2B2620', '#EDE6D6'],
  };
  const PICKED = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'bold', 'italic', 'link', 'wiki', 'tag', 'quote', 'bullet', 'todo', 'done', 'code', 'strike', 'mark'];
  const NOFONT = { src: 1 }; /* l'editor ha un solo font */
  const BASES = {
    light: { '--bg': '#F6F1E7', '--side': '#EDE6D6', '--paper': '#FFFDF8', '--code-bg': '#EDE6D6', '--line': '#DDD3BF' },
    dark: { '--bg': '#1D1A16', '--side': '#26221D', '--paper': '#24201B', '--code-bg': '#2B2620', '--line': '#3A342C' },
  };

  /* ---------- colori ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (r) => '#' + r.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  function hexToHsl(hex) {
    const [r, g, b] = toRgb(hex).map((v) => v / 255);
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2;
    if (mx === mn) return { h: 0, s: 0, l };
    const d = mx - mn; const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const f = (n) => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }
  const mix = (a, b, t) => { const x = toRgb(a); const y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const rl = (hex) => { const [r, g, b] = toRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const x = rl(a); const y = rl(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ---------- stato ---------- */
  const fresh = () => ({ pal: null, adapt: true, over: {}, lum: 0, extra: [] });
  let st = fresh();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) st = Object.assign(fresh(), s);
    else {
      const o = JSON.parse(localStorage.getItem(OLD) || 'null');
      if (o && o.over) {
        Object.entries(o.over).forEach(([k, v]) => { st.over[k] = v; if (k === 'h4') { st.over.h5 = v; st.over.h6 = v; } });
      }
    }
  } catch (e) { /* ok */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ok */ } };
  const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };

  /* luminosità del tema */
  function bgVars(dark) {
    const b = BASES[dark ? 'dark' : 'light'];
    const lum = st.lum || 0;
    if (!lum) return b;
    const t = Math.abs(lum) / 10;
    const lim = dark ? (lum > 0 ? 0.18 : 0.6) : (lum > 0 ? 0.7 : 0.16);
    const to = lum > 0 ? '#FFFFFF' : '#000000';
    const out = {};
    Object.keys(b).forEach((k) => { out[k] = mix(b[k], to, t * lim); });
    return out;
  }

  /* palette */
  const cache = new Map();
  function palette(dark) {
    const p = st.pal;
    if (!p) return null;
    const bg = bgVars(dark)['--paper'];
    const ck = [p.base, p.harm, p.tone, p.seed, dark, st.adapt, bg].join('|');
    if (cache.has(ck)) return cache.get(ck);
    const rng = mulberry(p.seed * 7919 + 13);
    const base = hexToHsl(p.base);
    const offs = { mono: [0], ana: [0, -30, 30, -15, 15], compl: [0, 180, 20, 160, -20, 200], triad: [0, 120, 240], tetra: [0, 90, 180, 270] }[p.harm] || [0];
    const sat = { soft: 0.4, eq: 0.62, vivid: 0.85 }[p.tone] || 0.62;
    const cols = [];
    for (let i = 0; i < NPAL; i++) {
      const jit = p.harm === 'mono' ? 0 : (rng() - 0.5) * 22;
      const h = base.h + offs[i % offs.length] + jit;
      const s = clamp(sat + (rng() - 0.5) * 0.2, 0.12, 0.95);
      let l = p.harm === 'mono' ? (dark ? 0.52 + i * 0.035 : 0.24 + i * 0.03) : (dark ? 0.68 : 0.4) + (rng() - 0.5) * 0.12;
      let c = hslToHex(h, i === 0 && p.harm !== 'mono' ? clamp(base.s, 0.25, 0.95) : s, l);
      if (st.adapt) {
        let n = 0;
        while (contrast(c, bg) < 4.5 && n++ < 30) { l += dark ? 0.02 : -0.02; c = hslToHex(h, s, clamp(l, 0.05, 0.95)); }
      }
      cols.push(c);
    }
    const perm = cols.map((_, i) => i);
    for (let i = NPAL - 1; i > 1; i--) { const j = 1 + Math.floor(rng() * i); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const res = { cols, perm };
    cache.set(ck, res);
    return res;
  }
  function eff(k) {
    const o = st.over[k] || {};
    const dark = isDark();
    const d = KEYS[k][dark ? 3 : 2];
    let c = null; let from = 'default';
    if (o.c) { c = o.c; from = 'custom'; } else if (st.pal && k !== 'body' && k !== 'src') {
      const P = palette(dark);
      const idx = o.p != null ? o.p : P.perm[PICKED.indexOf(k) % NPAL];
      c = P.cols[idx % NPAL]; from = 'palette';
    }
    return { f: o.f || null, c, shown: c || d, from, pidx: o.p };
  }

  /* ---------- font ---------- */
  const allFonts = () => FONTS.concat(st.extra.map((e) => ({ n: e.n, s: "'" + e.n.replace(/'/g, '') + "', system-ui, sans-serif", extra: e.kind })));
  const fontOf = (n) => allFonts().find((f) => f.n === n);
  const loaded = new Set();
  function loadFont(n) {
    const f = fontOf(n);
    if (!f || !f.g || loaded.has(n)) return;
    loaded.add(n);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + f.g + '&display=swap';
    document.head.appendChild(l);
  }
  /* font caricati da file: restano nel database del dispositivo */
  const fdb = () => new Promise((res, rej) => { const r = indexedDB.open('quaderno-fonts', 1); r.onupgradeneeded = () => r.result.createObjectStore('f', { keyPath: 'name' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function fontPut(rec) { const db = await fdb(); return new Promise((res, rej) => { const t = db.transaction('f', 'readwrite'); t.objectStore('f').put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function fontDel(name) { const db = await fdb(); return new Promise((res) => { const t = db.transaction('f', 'readwrite'); t.objectStore('f').delete(name); t.oncomplete = res; t.onerror = res; }); }
  async function fontAll() { const db = await fdb(); return new Promise((res) => { const g = db.transaction('f').objectStore('f').getAll(); g.onsuccess = () => res(g.result || []); g.onerror = () => res([]); }); }
  async function registerFile(rec) {
    try { const ff = new FontFace(rec.name, rec.data); await ff.load(); document.fonts.add(ff); } catch (e) { /* font non valido */ }
  }
  async function restoreFonts() {
    try { const all = await fontAll(); for (const r of all) await registerFile(r); apply(); } catch (e) { /* ok */ }
  }
  async function addFontFile(file) {
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Font';
    const data = await file.arrayBuffer();
    try { const ff = new FontFace(name, data.slice(0)); await ff.load(); document.fonts.add(ff); } catch (e) { throw new Error('Questo file non sembra un font valido.'); }
    await fontPut({ name, data });
    if (!st.extra.some((x) => x.n === name)) st.extra.push({ n: name, kind: 'file' });
    save(); apply();
    return name;
  }
  function addFontName(name) {
    name = name.trim().replace(/['"]/g, '');
    if (!name) return null;
    if (!st.extra.some((x) => x.n === name) && !FONTS.some((x) => x.n === name)) st.extra.push({ n: name, kind: 'name' });
    save(); apply();
    return name;
  }
  async function removeExtra(name) {
    st.extra = st.extra.filter((x) => x.n !== name);
    Object.keys(st.over).forEach((k) => { if (st.over[k].f === name) { delete st.over[k].f; if (!Object.keys(st.over[k]).length) delete st.over[k]; } });
    await fontDel(name);
    save(); apply();
  }

  /* ---------- applicazione ---------- */
  function apply() {
    const s = document.documentElement.style;
    const dark = isDark();
    const vars = bgVars(dark);
    Object.keys(BASES.light).forEach((k) => { if (st.lum) s.setProperty(k, vars[k]); else s.removeProperty(k); });
    Object.keys(KEYS).forEach((k) => {
      const e = eff(k);
      const f = e.f && fontOf(e.f);
      if (f && !NOFONT[k]) { loadFont(e.f); s.setProperty('--f-' + k, f.s); } else s.removeProperty('--f-' + k);
      if (e.c) s.setProperty('--c-' + k, e.c); else s.removeProperty('--c-' + k);
      if (/^h\d$/.test(k)) { if (e.f && SCALE[e.f]) s.setProperty('--k-' + k, SCALE[e.f]); else s.removeProperty('--k-' + k); }
    });
  }
  let onChange = () => {};
  const commit = () => { save(); apply(); onChange(); };

  /* ---------- modifiche ---------- */
  function setOver(k, patch) {
    const o = Object.assign({}, st.over[k] || {}, patch);
    ['f', 'c', 'p'].forEach((x) => { if (o[x] == null || o[x] === '') delete o[x]; });
    if (patch.c) delete o.p;
    if (patch.p != null) delete o.c;
    if (Object.keys(o).length) st.over[k] = o; else delete st.over[k];
    commit();
  }
  function setPal(patch) {
    st.pal = Object.assign({ base: '#A24621', harm: 'compl', tone: 'eq', seed: 1 }, st.pal || {}, patch);
    if (!patch.keep) { Object.keys(st.over).forEach((k) => { delete st.over[k].c; delete st.over[k].p; if (!Object.keys(st.over[k]).length) delete st.over[k]; }); }
    delete st.pal.keep;
    commit();
  }
  const reroll = () => setPal({ seed: ((st.pal && st.pal.seed) || 1) + 1 });
  function randomBase() { setPal({ base: hslToHex(Math.random() * 360, 0.55 + Math.random() * 0.3, 0.4), seed: Math.floor(Math.random() * 1e6) }); }
  function randomFonts() {
    const extras = st.extra.map((e) => e.n);
    const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    const [disp, body] = extras.length && Math.random() < 0.35 ? [extras[Math.floor(Math.random() * extras.length)], pair[1]] : pair;
    ['h1', 'h2', 'h3'].forEach((k) => setOverQuiet(k, { f: disp }));
    ['h4', 'h5', 'h6'].forEach((k) => setOverQuiet(k, { f: body }));
    setOverQuiet('bold', { f: disp }); setOverQuiet('body', { f: body });
    ['italic', 'strike', 'mark', 'link', 'wiki', 'tag', 'quote', 'bullet', 'todo', 'done'].forEach((k) => setOverQuiet(k, { f: null }));
    commit();
  }
  function setOverQuiet(k, patch) {
    const o = Object.assign({}, st.over[k] || {}, patch);
    ['f', 'c', 'p'].forEach((x) => { if (o[x] == null || o[x] === '') delete o[x]; });
    if (Object.keys(o).length) st.over[k] = o; else delete st.over[k];
  }
  function reset() { const keep = { extra: st.extra, lum: st.lum }; st = Object.assign(fresh(), keep); commit(); }
  const setLum = (v) => { st.lum = clamp(Math.round(v), -10, 10); commit(); };
  const setAdapt = (v) => { st.adapt = !!v; commit(); };
  new MutationObserver(() => { apply(); onChange(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { apply(); onChange(); });
  apply();
  restoreFonts();

  /* ---------- interfaccia ---------- */
  const el = (t, a, ...kids) => {
    const e = document.createElement(t);
    Object.entries(a || {}).forEach(([k, v]) => { if (k === 'on') Object.entries(v).forEach(([ev, fn]) => e.addEventListener(ev, fn)); else if (k === 'text') e.textContent = v; else if (v != null) e.setAttribute(k, v); });
    kids.forEach((x) => { if (x != null) e.append(x); });
    return e;
  };
  const SAMPLE = [
    '# Il modello TCP/IP', '', '## Livelli di rete', '### Incapsulamento', '#### Dettaglio', '##### Nota', '###### Fine', '',
    'Ogni **livello** usa *servizi* ~~vecchi~~ ==nuovi==.', '[sito](https://esempio.it) · [[altra nota]] · #reti #esame', '',
    '> Una citazione importante', '', '- elenco di esempio', '- [ ] da fare', '- [x] fatto', '', '`ip route` e $E=mc^2$',
  ].join('\n');
  const HK = { getTheme: () => 'auto', setTheme: () => {} };
  let dlg = null; let openAcc = { gen: true, syn: true, font: false, theme: false }; let openRow = null; let fontQ = ''; let tabNow = 'syn';

  function chips(k) {
    const dark = isDark();
    const P = palette(dark);
    const e = eff(k);
    const box = el('div', { class: 'sty-chips' });
    if (P) P.cols.forEach((c, i) => {
      box.append(el('button', { type: 'button', class: 'sty-chip' + (e.from === 'palette' && P.cols[(e.pidx != null ? e.pidx : P.perm[PICKED.indexOf(k) % NPAL]) % NPAL] === c ? ' on' : ''), style: 'background:' + c, 'aria-label': 'Colore ' + (i + 1) + ' della palette', on: { click: () => { setOver(k, { p: i }); } } }));
    });
    const col = el('input', { type: 'color', 'aria-label': 'Colore personalizzato', value: e.shown });
    col.addEventListener('input', () => { const o = st.over[k] || {}; st.over[k] = Object.assign({}, o, { c: col.value }); delete st.over[k].p; save(); apply(); });
    col.addEventListener('change', () => onChange());
    box.append(col, el('button', { type: 'button', class: 'sty-x', title: 'Predefinito', 'aria-label': 'Colore predefinito', text: '↺', on: { click: () => { if (st.over[k]) { delete st.over[k].c; delete st.over[k].p; if (!Object.keys(st.over[k]).length) delete st.over[k]; } commit(); } } }));
    return box;
  }
  function rowFor(k) {
    const e = eff(k);
    const sel = el('select', { 'aria-label': KEYS[k][0] + ': font' });
    sel.append(el('option', { value: '', text: NOFONT[k] ? 'Monospazio (editor)' : 'Predefinito' }));
    if (!NOFONT[k]) allFonts().forEach((f) => { const o = el('option', { value: f.n, text: f.n }); if (e.f === f.n) o.selected = true; sel.append(o); });
    else sel.disabled = true;
    sel.addEventListener('change', () => setOver(k, { f: sel.value || null }));
    const sw = el('button', { type: 'button', class: 'sty-sw', style: 'background:' + e.shown, 'aria-label': KEYS[k][0] + ': colore', 'aria-expanded': String(openRow === k), on: { click: () => { openRow = openRow === k ? null : k; buildBar(); } } });
    const r = el('div', { class: 'sty-row' + (openRow === k ? ' sel' : '') }, el('span', { class: 'sty-n', text: KEYS[k][0] }), sel, sw);
    const wrap = el('div', {}, r);
    if (openRow === k) wrap.append(chips(k));
    return wrap;
  }
  function seg(opts, cur, fn, cls) {
    return el('div', { class: 'sty-seg ' + (cls || '') }, ...opts.map(([v, t]) => el('button', { type: 'button', class: v === cur ? 'on' : '', text: t, on: { click: () => fn(v) } })));
  }
  function themeControls(box) {
    box.replaceChildren();
    const cur = HK.getTheme();
    box.append(seg([['light', 'Chiaro'], ['dark', 'Scuro'], ['auto', 'Come il dispositivo']], cur, (v) => { HK.setTheme(v); themeControls(box); }));
    const sl = el('input', { type: 'range', min: '-10', max: '10', step: '1', value: String(st.lum), 'aria-label': 'Luminosità del tema' });
    sl.addEventListener('input', () => { st.lum = +sl.value; apply(); });
    sl.addEventListener('change', () => { save(); onChange(); });
    box.append(el('div', { class: 'sty-lum' }, el('span', { text: 'Più scuro' }), sl, el('span', { text: 'Più chiaro' })));
    const ad = el('input', { type: 'checkbox', id: 'styAdapt' + (box.id || '') });
    ad.checked = !!st.adapt;
    ad.addEventListener('change', () => setAdapt(ad.checked));
    box.append(el('label', { class: 'sty-check' }, ad, el('span', { text: 'Adatta i colori della palette alla luminosità, per tenerli leggibili' })));
  }
  const acc = (id, title, body) => {
    const d = el('details', { class: 'sty-acc' }, el('summary', { text: title }), body);
    d.open = !!openAcc[id];
    d.addEventListener('toggle', () => { openAcc[id] = d.open; });
    return d;
  };
  function genBody() {
    const p = st.pal || { base: '#A24621', harm: 'compl', tone: 'eq', seed: 1 };
    const b = el('div', { class: 'sty-box' });
    const hex = el('input', { type: 'text', class: 'sty-hex', value: p.base, maxlength: '7', 'aria-label': 'Colore di partenza' });
    const pick = el('input', { type: 'color', value: p.base, 'aria-label': 'Scegli il colore di partenza' });
    const go = (v) => { if (/^#[0-9a-f]{6}$/i.test(v)) setPal({ base: v.toUpperCase() }); };
    pick.addEventListener('change', () => go(pick.value));
    hex.addEventListener('change', () => go(hex.value.startsWith('#') ? hex.value : '#' + hex.value));
    b.append(el('div', { class: 'sty-lbl', text: 'Colore di partenza' }), el('div', { class: 'sty-line' }, pick, hex, el('button', { type: 'button', class: 'btn-secondary sty-b', text: '🎲 A caso', on: { click: randomBase } })));
    b.append(el('div', { class: 'sty-lbl', text: 'Armonia' }), seg([['mono', 'Mono'], ['ana', 'Analoghi'], ['compl', 'Compl.'], ['triad', 'Triade'], ['tetra', 'Tetrade']], p.harm, (v) => setPal({ harm: v, base: p.base }), 'wrap'));
    b.append(el('div', { class: 'sty-lbl', text: 'Tono' }), seg([['soft', 'Tenue'], ['eq', 'Equilibrato'], ['vivid', 'Vivace']], p.tone, (v) => setPal({ tone: v, base: p.base })));
    b.append(el('div', { class: 'sty-line' },
      el('button', { type: 'button', class: 'btn-primary sty-b', text: '🎲 Nuova palette', on: { click: () => { if (!st.pal) setPal({}); else reroll(); } } }),
      el('button', { type: 'button', class: 'btn-secondary sty-b', text: '🎲 Font', on: { click: randomFonts } })));
    const P = palette(isDark());
    if (P) b.append(el('div', { class: 'sty-pal' }, ...P.cols.map((c) => el('span', { style: 'background:' + c }))));
    else b.append(el('p', { class: 'hint', text: 'Nessuna palette attiva: si usano i colori del tema. Scegli un colore e un\'armonia, oppure premi «Nuova palette».' }));
    return b;
  }
  function synBody() {
    const b = el('div', { class: 'sty-box' });
    b.append(el('p', { class: 'hint', text: 'Tocca il cerchio per cambiare colore: scegli uno della palette o uno tuo. Il font vale per l\'anteprima.' }));
    ['Titoli', 'Testo', 'Collegamenti', 'Blocchi', 'Base'].forEach((g) => {
      b.append(el('div', { class: 'sty-lbl', text: g }));
      Object.keys(KEYS).filter((k) => KEYS[k][1] === g).forEach((k) => b.append(rowFor(k)));
    });
    return b;
  }
  function fontBody() {
    const b = el('div', { class: 'sty-box' });
    const q = el('input', { type: 'search', placeholder: 'Cerca un font…', value: fontQ, 'aria-label': 'Cerca un font' });
    q.addEventListener('input', () => { fontQ = q.value; fillList(); });
    const list = el('div', { class: 'sty-fl' });
    const fillList = () => {
      list.replaceChildren();
      allFonts().filter((f) => f.n.toLowerCase().includes(fontQ.trim().toLowerCase())).forEach((f) => {
        loadFont(f.n);
        const row = el('div', { class: 'sty-frow' }, el('span', { style: 'font-family:' + f.s, text: f.n }), el('small', { text: f.extra === 'file' ? 'dal computer' : f.extra === 'name' ? 'installato' : 'incluso' }));
        if (f.extra) row.append(el('button', { type: 'button', class: 'sty-x', 'aria-label': 'Rimuovi ' + f.n, text: '✕', on: { click: async () => { await removeExtra(f.n); buildBar(); } } }));
        list.append(row);
      });
      if (!list.childElementCount) list.append(el('p', { class: 'hint', text: 'Nessun font con questo nome. Puoi aggiungerlo qui sotto.' }));
    };
    fillList();
    const file = el('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', multiple: '', hidden: '' });
    const msg = el('p', { class: 'hint', role: 'status' });
    file.addEventListener('change', async () => {
      for (const f of file.files) { try { const n = await addFontFile(f); msg.textContent = 'Aggiunto: ' + n; } catch (e) { msg.textContent = e.message; } }
      buildBar();
    });
    const nm = el('input', { type: 'text', placeholder: 'Nome di un font installato', 'aria-label': 'Nome di un font installato', list: 'styLocalFonts' });
    const dl = el('datalist', { id: 'styLocalFonts' });
    b.append(q, list, el('div', { class: 'sty-lbl', text: 'Aggiungi dal computer' }),
      el('button', { type: 'button', class: 'btn-secondary sty-b sty-wide', text: '📁 Carica file font (.ttf .otf .woff2)', on: { click: () => file.click() } }), file,
      el('div', { class: 'sty-line' }, nm, el('button', { type: 'button', class: 'btn-secondary sty-b', text: 'Aggiungi', on: { click: () => { const n = addFontName(nm.value); if (n) { msg.textContent = 'Aggiunto: ' + n + ' (funziona solo se è installato su questo dispositivo)'; buildBar(); } } } })), dl);
    if (window.queryLocalFonts) {
      b.append(el('button', { type: 'button', class: 'btn-secondary sty-b sty-wide', text: 'Mostra i font installati', on: { click: async () => { try { const all = await window.queryLocalFonts(); const names = [...new Set(all.map((f) => f.family))].sort(); dl.replaceChildren(...names.map((n) => el('option', { value: n }))); msg.textContent = names.length + ' font trovati: scrivi per cercarli.'; } catch (e) { msg.textContent = 'Permesso negato.'; } } } }));
    }
    b.append(msg, el('p', { class: 'hint', text: 'I font aggiunti restano su questo dispositivo: non passano da GitHub e vanno aggiunti di nuovo sugli altri.' }));
    return b;
  }
  function buildBar() {
    const bar = dlg.querySelector('.sty-bar');
    const top = bar.scrollTop;
    bar.replaceChildren(
      acc('gen', 'Generatore di palette', genBody()),
      acc('syn', 'Colori e font per ogni sintassi', synBody()),
      acc('font', 'Font', fontBody()),
      acc('theme', 'Tema generale', (() => { const d = el('div', { class: 'sty-box', id: 'styTheme2' }); themeControls(d); return d; })()),
      el('button', { type: 'button', class: 'btn-secondary sty-wide', text: 'Ripristina i predefiniti', style: 'margin-top:12px', on: { click: () => { reset(); buildBar(); } } }));
    bar.scrollTop = top;
  }
  function paintSample() {
    dlg.querySelector('.sty-src').innerHTML = HL.html(SAMPLE);
    const pv = dlg.querySelector('.sty-doc');
    pv.innerHTML = root.MD.render(SAMPLE, { noLines: true });
    pv.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
    try { root.MD.typeset(pv); } catch (e) { /* ok */ }
  }
  function openDialog() {
    if (!dlg) {
      const tabs = el('div', { class: 'sty-tabs' }, ...[['src', 'Sorgente'], ['prev', 'Anteprima'], ['syn', 'Impostazioni']].map(([v, t]) => el('button', { type: 'button', 'data-tab': v, text: t, on: { click: () => { tabNow = v; dlg.dataset.tab = v; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === v)); } } })));
      dlg = el('dialog', { id: 'styleDlg', class: 'sty-full' },
        el('div', { class: 'sty-top' }, el('button', { type: 'button', class: 'sty-back', 'aria-label': 'Indietro', text: '←', on: { click: () => dlg.close() } }), el('h2', { text: 'Aspetto del testo' }), el('span', { style: 'flex:1' }), el('button', { type: 'button', class: 'btn-primary', text: 'Fatto', on: { click: () => dlg.close() } })),
        tabs,
        el('div', { class: 'sty-grid' }, el('div', { class: 'sty-col sty-c1' }, el('div', { class: 'sty-lbl', text: 'Sorgente' }), el('div', { class: 'sty-src' })), el('div', { class: 'sty-col sty-c2' }, el('div', { class: 'sty-lbl', text: 'Anteprima' }), el('div', { class: 'doc sty-doc' })), el('div', { class: 'sty-bar' })));
      dlg.dataset.tab = tabNow === 'src' || tabNow === 'prev' ? tabNow : 'syn';
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === dlg.dataset.tab));
      document.body.append(dlg);
      onChange = () => { if (dlg.open) buildBar(); };
    }
    paintSample();
    buildBar();
    dlg.showModal();
  }
  root.STY = {
    FONTS, MONO, KEYS, get state() { return st; }, eff, apply, isDark, loadFont, openDialog, themeControls, setLum, hooks: HK, reset,
    palette, setPal, addFontFile, addFontName, setOver, bgVars, contrast, hexToHsl, hslToHex,
  };
})(window);
