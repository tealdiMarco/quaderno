/* Aspetto del testo: font e colori per titoli, grassetto, tag, codice, sorgente. */
(function (root) {
  'use strict';
  const KEY = 'quaderno.style';
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
  const SCALE = { Caveat: 1.3 };
  /* chiave: [etichetta, colore predefinito chiaro, scuro] */
  const KEYS = {
    body: ['Testo normale', '#2B2620', '#EDE6D6'],
    h1: ['Titolo 1  #', '#2B2620', '#EDE6D6'],
    h2: ['Titolo 2  ##', '#2B2620', '#EDE6D6'],
    h3: ['Titolo 3  ###', '#2B2620', '#EDE6D6'],
    h4: ['Titolo 4-6', '#2B2620', '#EDE6D6'],
    bold: ['Grassetto  **', '#8C3A18', '#F0A27E'],
    italic: ['Corsivo  *', '#3F6AA8', '#8FB3E8'],
    tag: ['Tag  #nome', '#7B4FD0', '#B79BEA'],
    code: ['Codice', '#2F7A4B', '#7FD1A0'],
    src: ['Sorgente markdown', '#2B2620', '#EDE6D6'],
  };
  const D = (a, b) => [a, b];
  const PRESETS = {
    quaderno: { name: 'Quaderno', f: ['Fraunces', 'Inter'], c: ['#A24621', '#2B2620', '#A24621'], v: {} },
    rivista: { name: 'Rivista', f: ['Playfair Display', 'Lora'], c: ['#A24621', '#2F3FA8', '#D2693F'], v: {
      h1: { f: 'Playfair Display', c: D('#A24621', '#E08A63') },
      h2: { f: 'Lora', c: D('#2F3FA8', '#8FA0F0') },
      h3: { f: 'Lora', c: D('#3FA66B', '#6FCF97') },
      h4: { f: 'Lora', c: D('#3FA66B', '#6FCF97') },
      body: { f: 'Lora' }, bold: { c: D('#D2693F', '#F0A27E') }, tag: { c: D('#14A3A3', '#5FD3D3') } } },
    appunti: { name: 'Appunti', f: ['Caveat', 'Inter'], c: ['#2F3FA8', '#3FA66B', '#E0457B'], v: {
      h1: { f: 'Caveat', c: D('#2F3FA8', '#8FA0F0') },
      h2: { f: 'Caveat', c: D('#3FA66B', '#6FCF97') },
      h3: { f: 'Caveat', c: D('#3FA66B', '#6FCF97') },
      h4: { f: 'Caveat', c: D('#3FA66B', '#6FCF97') },
      bold: { c: D('#E0457B', '#F07BA3') }, tag: { c: D('#14A3A3', '#5FD3D3') } } },
  };
  let st = { preset: 'quaderno', over: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && PRESETS[s.preset]) st = { preset: s.preset, over: s.over || {} }; } catch (e) { /* ok */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ok */ } };
  const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };
  const fontOf = (n) => FONTS.find((f) => f.n === n);
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
  function eff(k) {
    const p = (PRESETS[st.preset].v[k]) || {};
    const o = st.over[k] || {};
    const c = o.c || (Array.isArray(p.c) ? p.c[isDark() ? 1 : 0] : p.c) || null;
    return { f: o.f || p.f || null, c, custom: !!(o.f || o.c) };
  }
  const SYN = { bold: '--syn-b', italic: '--syn-i', tag: '--syn-tag', code: '--syn-code' };
  function apply() {
    const s = document.documentElement.style;
    Object.keys(KEYS).forEach((k) => {
      const e = eff(k);
      const f = e.f && fontOf(e.f);
      if (f) { loadFont(e.f); s.setProperty('--f-' + k, f.s); } else s.removeProperty('--f-' + k);
      if (e.c) s.setProperty('--c-' + k, e.c); else s.removeProperty('--c-' + k);
      if (SYN[k]) { if (e.c) s.setProperty(SYN[k], e.c); else s.removeProperty(SYN[k]); }
      if (/^h\d$/.test(k)) { if (e.f && SCALE[e.f]) s.setProperty('--k-' + k, SCALE[e.f]); else s.removeProperty('--k-' + k); }
    });
  }
  function set(k, patch) {
    const o = Object.assign({}, st.over[k] || {}, patch);
    if (!o.f) delete o.f;
    if (!o.c) delete o.c;
    if (Object.keys(o).length) st.over[k] = o; else delete st.over[k];
    save(); apply();
  }
  function setPreset(p) { st = { preset: p, over: {} }; save(); apply(); }
  function reset() { setPreset('quaderno'); }
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  apply();
  root.STY = { FONTS, MONO, KEYS, PRESETS, get state() { return st; }, eff, set, setPreset, reset, apply, isDark, loadFont };

  /* ---------- finestra ---------- */
  let dlg = null;
  const el = (t, a, ...kids) => { const e = document.createElement(t); Object.entries(a || {}).forEach(([k, v]) => { if (k === 'on') Object.entries(v).forEach(([ev, fn]) => e.addEventListener(ev, fn)); else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }); kids.forEach((x) => e.append(x)); return e; };
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#000000');
  function row(label, keys, mono) {
    const k0 = keys[0];
    const e = eff(k0);
    const def = KEYS[k0][isDark() ? 2 : 1];
    const sel = el('select', { 'aria-label': label + ': font' });
    const fonts = k0 === 'src' || k0 === 'code' ? FONTS.filter((f) => MONO.includes(f.n)) : FONTS;
    sel.append(el('option', { value: '', text: 'Predefinito' }));
    fonts.forEach((f) => { const o = el('option', { value: f.n, text: f.n }); if (e.f === f.n) o.selected = true; sel.append(o); });
    const col = el('input', { type: 'color', 'aria-label': label + ': colore', value: hex(e.c || def) });
    sel.addEventListener('change', () => { keys.forEach((k) => set(k, { f: sel.value || null })); });
    col.addEventListener('input', () => { keys.forEach((k) => set(k, { c: col.value })); });
    const x = el('button', { type: 'button', class: 'sty-x', 'aria-label': 'Ripristina ' + label, text: '↺', on: { click: () => { keys.forEach((k) => { delete st.over[k]; }); save(); apply(); build(); } } });
    return el('div', { class: 'sty-row' }, el('span', { text: label }), sel, col, x);
  }
  function build() {
    const body = dlg.querySelector('.sty-body');
    body.replaceChildren();
    const cards = el('div', { class: 'sty-cards' });
    Object.entries(PRESETS).forEach(([id, p]) => {
      const ff = fontOf(p.f[0]); const fb = fontOf(p.f[1]);
      loadFont(p.f[0]); loadFont(p.f[1]);
      const dark = isDark();
      const c = el('button', { type: 'button', class: 'sty-card' + (st.preset === id ? ' on' : ''), 'aria-pressed': String(st.preset === id), on: { click: () => { setPreset(id); build(); } } },
        el('b', { text: p.name }), el('i', { text: 'Sottotitolo' }), el('span', { text: 'testo, grassetto e #tag' }));
      c.querySelector('b').style.cssText = 'font-family:' + ff.s + ';color:' + (id === 'quaderno' ? 'var(--text)' : (p.v.h1 && p.v.h1.c[dark ? 1 : 0]) || 'var(--text)') + ';font-size:' + (SCALE[p.f[0]] ? 26 : 20) + 'px';
      c.querySelector('i').style.cssText = 'font-family:' + ff.s + ';color:' + (id === 'quaderno' ? 'var(--accent)' : (p.v.h2 && p.v.h2.c[dark ? 1 : 0]) || 'var(--accent)');
      c.querySelector('span').style.fontFamily = fb.s;
      cards.append(c);
    });
    body.append(el('div', { class: 'sty-sec', text: 'Temi pronti' }), cards, el('div', { class: 'sty-sec', text: 'Ritocca' }),
      row('Titoli', ['h1', 'h2', 'h3', 'h4']), row('Testo', ['body']), row('Sorgente', ['src']), row('Codice', ['code']));
    const adv = el('details', { class: 'sty-adv' }, el('summary', { text: 'Avanzate: un colore e un font per ogni elemento' }));
    [['Titolo 1  #', 'h1'], ['Titolo 2  ##', 'h2'], ['Titolo 3  ###', 'h3'], ['Titolo 4-6', 'h4'], ['Grassetto  **', 'bold'], ['Corsivo  *', 'italic'], ['Tag  #nome', 'tag']].forEach(([l, k]) => adv.append(row(l, [k])));
    adv.append(el('p', { class: 'hint', text: 'Nell’editor il font è uno solo (Sorgente): i titoli, il grassetto e i tag cambiano solo colore, così il cursore resta allineato. Un colore scelto vale sia nel tema chiaro che nello scuro.' }));
    if (localStorage.getItem('quaderno.styleAdv') === '1') adv.open = true;
    adv.addEventListener('toggle', () => { try { localStorage.setItem('quaderno.styleAdv', adv.open ? '1' : '0'); } catch (e) { /* ok */ } });
    body.append(adv);
  }
  function openDialog() {
    if (!dlg) {
      dlg = el('dialog', { id: 'styleDlg' }, el('h2', { text: 'Aspetto del testo' }), el('div', { class: 'sty-body' }),
        el('div', { class: 'dlg-actions' },
          el('button', { type: 'button', class: 'btn-secondary', text: 'Ripristina', on: { click: () => { reset(); build(); } } }),
          el('button', { type: 'button', class: 'btn-primary', text: 'Fatto', on: { click: () => dlg.close() } })));
      document.body.append(dlg);
    }
    build();
    dlg.showModal();
  }
  root.STY.openDialog = openDialog;
})(window);
