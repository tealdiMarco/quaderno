/* Allegati di Quaderno: blocchi di disegno, immagini e PDF (con annotazioni a penna) e barra degli strumenti flottante. */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const MAX = 25 * 1024 * 1024;
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', pdf: 'application/pdf' };

  let Q = null;
  let session = null;
  let bar = null;
  let selRow = null;
  let fileInput = null;
  let io = null;
  const lastPage = new Map();
  const pdfCache = new Map();
  const urlCache = new Map();
  const pdfBlocks = new Set();

  /* ---------------------------------------------------------------- utilità */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'on') Object.entries(v).forEach(([ev, fn]) => e.addEventListener(ev, fn));
      else e.setAttribute(k, v);
    });
    kids.flat().forEach((c) => { if (c != null) e.append(c); });
    return e;
  }

  function ic(id) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ic');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function mkBtn(cls, label, icon, onClick) {
    const b = h('button', { type: 'button', class: cls, 'aria-label': label, title: label }, icon ? ic(icon) : null);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  const extOf = (p) => ((p.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  const baseName = (p) => p.split('/').pop();
  const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
  const stem = (p) => baseName(p).replace(/\.md$/i, '');
  const encodeSeg = (s) => encodeURIComponent(s).replace(/\(/g, '%28').replace(/\)/g, '%29');
  const encodeRel = (rel) => rel.split('/').map(encodeSeg).join('/');
  const assetsDir = (notePath) => dirOf(notePath) + stem(notePath) + '.assets/';
  const refDir = (notePath) => encodeSeg(stem(notePath)) + '.assets/';

  function decodePath(s) {
    return s.split('/').map((seg) => { try { return decodeURIComponent(seg); } catch (e) { return seg; } }).join('/');
  }

  function normalizeRel(base, rel) {
    const out = [];
    (base + rel).split('/').forEach((p) => {
      if (!p || p === '.') return;
      if (p === '..') out.pop(); else out.push(p);
    });
    return out.join('/');
  }

  const SPRITE = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' +
    '<symbol id="a-pen" viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z M14 6l3 3"/></symbol>' +
    '<symbol id="a-hl" viewBox="0 0 24 24"><path d="M5 20h6M9 15l8-8-3-3-8 8 3 3z"/></symbol>' +
    '<symbol id="a-eraser" viewBox="0 0 24 24"><path d="M4 16l8-8 6 6-4 4H8z M12 20h8"/></symbol>' +
    '<symbol id="a-shape" viewBox="0 0 24 24"><rect x="3" y="11" width="9" height="9" rx="1"/><circle cx="16" cy="8" r="5"/></symbol>' +
    '<symbol id="a-lasso" viewBox="0 0 24 24"><ellipse cx="12" cy="10" rx="8" ry="5" stroke-dasharray="3 3"/><path d="M12 15c0 3-2 5-4 5"/></symbol>' +
    '<symbol id="a-undo" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/></symbol>' +
    '<symbol id="a-redo" viewBox="0 0 24 24"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"/></symbol>' +
    '<symbol id="a-hand" viewBox="0 0 24 24"><path d="M8 13V6a1.5 1.5 0 0 1 3 0v5m0-2V4.5a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v6m0-3a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-3-5a1.5 1.5 0 0 1 2.5-1.5L8 14"/></symbol>' +
    '<symbol id="a-trash" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></symbol>' +
    '<symbol id="a-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></symbol>' +
    '<symbol id="a-clip" viewBox="0 0 24 24"><path d="M20 11l-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></symbol>' +
    '<symbol id="a-prev" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>' +
    '<symbol id="a-next" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></symbol>' +
    '<symbol id="a-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>' +
    '<symbol id="a-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>' +
    '<symbol id="a-up" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></symbol>' +
    '</svg>';

  /* ---------------------------------------------------------------- file: indirizzi e risoluzione */
  function blobUrl(rec) {
    const key = rec.updated + ':' + rec.data.byteLength;
    const c = urlCache.get(rec.path);
    if (c && c.key === key) return c.url;
    if (c) URL.revokeObjectURL(c.url);
    const url = URL.createObjectURL(new Blob([rec.data], { type: rec.mime || MIME[extOf(rec.path)] || 'application/octet-stream' }));
    urlCache.set(rec.path, { key, url });
    return url;
  }

  function buildIndex() {
    const m = new Map();
    for (const n of Q.files.values()) {
      if (n.deleted || !n.kind || n.kind === 'md') continue;
      if (/\.ink\.svg$/i.test(n.path) || /\.note\.txt$/i.test(n.path)) continue;
      const b = baseName(n.path).toLowerCase();
      if (!m.has(b)) m.set(b, []);
      m.get(b).push(n.path);
    }
    return m;
  }

  function resolve(src, notePath, idx) {
    if (/^https:\/\//i.test(src)) return { url: src };
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return null;
    const clean = decodePath(src.split('#')[0].split('?')[0]);
    if (!clean) return null;
    const tries = [normalizeRel(dirOf(notePath), clean), normalizeRel('', clean.replace(/^\/+/, ''))];
    for (const t of tries) {
      const r = Q.getFile(t);
      if (r && r.kind && r.kind !== 'md') return { rec: r };
    }
    const cands = idx.get(baseName(clean).toLowerCase());
    if (cands && cands.length) {
      const dir = dirOf(notePath);
      const score = (p) => { let i = 0; while (i < p.length && i < dir.length && p[i] === dir[i]) i++; return i; };
      cands.sort((a, b) => score(b) - score(a));
      const r = Q.getFile(cands[0]);
      if (r) return { rec: r };
    }
    return null;
  }

  /* ---------------------------------------------------------------- pdf.js (caricato solo quando serve) */
  let libP = null;
  function loadLib() {
    if (!libP) {
      libP = import('./vendor/pdf.min.mjs').then((m) => {
        m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', document.baseURI).href;
        return m;
      });
      libP.catch(() => { libP = null; });
    }
    return libP;
  }

  async function getPdf(rec) {
    const key = rec.updated + ':' + rec.data.byteLength;
    const c = pdfCache.get(rec.path);
    if (c && c.key === key) return c.promise;
    const lib = await loadLib();
    const promise = lib.getDocument({ data: new Uint8Array(rec.data.slice(0)), isEvalSupported: false, enableXfa: false }).promise;
    pdfCache.set(rec.path, { key, promise });
    promise.catch(() => pdfCache.delete(rec.path));
    return promise;
  }

  /* ---------------------------------------------------------------- blocchi nell'anteprima */
  function overlaySvg() {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ov');
    return svg;
  }

  function drawBlock(rec, alt) {
    const parsed = INK.parseDrawing(rec.content) || { strokes: [], W: 1000, H: 420 };
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ink-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', alt || 'Disegno');
    INK.renderStatic(svg, parsed.strokes, parsed.W, parsed.H, false);
    const paper = h('div', { class: 'paper' }, svg);
    const box = h('div', { class: 'inkblock', 'data-path': rec.path }, paper);
    const cfg = { kind: 'draw', path: rec.path, svg, box };
    box._cfg = cfg;
    box.append(h('button', { type: 'button', class: 'blk-btn', on: { click: () => startInk(cfg) } }, ic('a-pen'), 'Disegna'));
    return box;
  }

  function imageBlock(rec, alt) {
    const img = h('img', { alt: alt || baseName(rec.path), decoding: 'async' });
    const ov = overlaySvg();
    const pagebox = h('div', { class: 'pagebox on-page' }, img, ov);
    const cfg = { kind: 'overlay', svg: ov, box: pagebox, annPath: rec.path + '.ink.svg', H: 0, ready: false };
    const setDims = () => {
      if (!img.naturalWidth) return;
      cfg.H = Math.round((1000 * img.naturalHeight) / img.naturalWidth);
      cfg.ready = true;
      const ann = Q.getFile(cfg.annPath);
      const parsed = ann ? INK.parseDrawing(ann.content) : null;
      INK.renderStatic(ov, parsed ? parsed.strokes : [], 1000, cfg.H, true);
    };
    img.addEventListener('load', setDims);
    img.addEventListener('error', () => { pagebox.replaceChildren(h('div', { class: 'pdfmsg' }, 'Impossibile mostrare questa immagine')); });
    img.src = blobUrl(rec);
    if (img.complete) setDims();
    const annot = h('button', { type: 'button', class: 'blk-btn', on: { click: () => { if (!cfg.ready) { Q.toast('Attendi il caricamento dell\'immagine'); return; } startInk(cfg); } } }, ic('a-pen'), 'Annota');
    const box = h('div', { class: 'media imgblock', 'data-path': rec.path }, pagebox, annot);
    box._cfg = cfg;
    return box;
  }

  function pdfBlock(rec) {
    const lbl = h('span', { class: 'mpage' }, '');
    const prev = mkBtn('mbtn', 'Pagina precedente', 'a-prev');
    const next = mkBtn('mbtn', 'Pagina successiva', 'a-next');
    const annot = h('button', { type: 'button', class: 'mtxt' }, 'Annota');
    const full = mkBtn('mbtn', 'Schermo intero con note per pagina', 'i-expand', () => openReader(rec, page));
    const mbar = h('div', { class: 'mediabar' }, ic('i-file'), h('span', { class: 'mname' }, baseName(rec.path)), lbl, h('span', { class: 'sp' }), prev, next, full, annot);
    const canvas = document.createElement('canvas');
    const ov = overlaySvg();
    const msg = h('div', { class: 'pdfmsg' }, 'Caricamento…');
    const pagebox = h('div', { class: 'pagebox on-page' }, canvas, ov, msg);
    const box = h('div', { class: 'media pdfblock', 'data-path': rec.path }, mbar, pagebox);
    const cfg = { kind: 'overlay', svg: ov, box: pagebox, annPath: null, H: 0, ready: false };
    box._cfg = cfg;

    let page = lastPage.get(rec.path) || 1;
    let token = 0;
    let task = null;
    let doc = null;

    async function show(n) {
      const my = ++token;
      if (session && session.cfg === cfg) stopInk();
      cfg.ready = false;
      try {
        doc = doc || await getPdf(rec);
        page = Math.max(1, Math.min(doc.numPages, n));
        lastPage.set(rec.path, page);
        lbl.textContent = 'Pagina ' + page + ' di ' + doc.numPages;
        prev.disabled = page <= 1;
        next.disabled = page >= doc.numPages;
        const pg = await doc.getPage(page);
        if (my !== token) return;
        const vp1 = pg.getViewport({ scale: 1 });
        pagebox.style.aspectRatio = vp1.width + ' / ' + vp1.height;
        const cssW = pagebox.clientWidth || 720;
        const vp = pg.getViewport({ scale: (cssW / vp1.width) * Math.min(window.devicePixelRatio || 1, 2.5) });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        if (task) { try { task.cancel(); } catch (e) { /* ok */ } }
        task = pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        await task.promise;
        if (my !== token) return;
        box._w = pagebox.clientWidth;
        msg.hidden = true;
        cfg.H = Math.round((1000 * vp1.height) / vp1.width);
        cfg.annPath = rec.path + '.p' + page + '.ink.svg';
        cfg.ready = true;
        const ann = Q.getFile(cfg.annPath);
        const parsed = ann ? INK.parseDrawing(ann.content) : null;
        INK.renderStatic(ov, parsed ? parsed.strokes : [], 1000, cfg.H, true);
      } catch (e) {
        if (e && e.name === 'RenderingCancelledException') return;
        msg.hidden = false;
        msg.textContent = 'Impossibile mostrare questo PDF';
      }
    }

    prev.addEventListener('click', () => show(page - 1));
    next.addEventListener('click', () => show(page + 1));
    annot.addEventListener('click', () => { if (!cfg.ready) { Q.toast('Attendi il caricamento della pagina'); return; } startInk(cfg); });
    box._redraw = () => show(page);
    box._load = () => show(page);
    pdfBlocks.add(box);
    if (io) io.observe(box); else setTimeout(() => box._load(), 0);
    return box;
  }

  const observers = new Map();
  function observerFor(root) {
    let o = observers.get(root);
    if (!o && 'IntersectionObserver' in window) {
      o = new IntersectionObserver((entries, ob) => entries.forEach((en) => {
        if (en.isIntersecting) { ob.unobserve(en.target); if (en.target._load) en.target._load(); }
      }), { root, rootMargin: '500px' });
      observers.set(root, o);
    }
    return o;
  }

  function hydrate(container, notePath, scrollerEl) {
    try { MD.typeset(container); } catch (e) { /* ok */ }
    io = observerFor(scrollerEl || Q.scroller);
    const idx = buildIndex();
    container.querySelectorAll('.embed').forEach((span) => {
      const src = span.dataset.src || '';
      const alt = span.dataset.alt || '';
      const res = resolve(src, notePath, idx);
      let el;
      if (!res) {
        el = h('span', { class: 'img-note' }, '[file non trovato: ' + decodePath(src) + ']');
      } else if (res.url) {
        el = h('img', { class: 'remote-img', src: res.url, alt, loading: 'lazy', referrerpolicy: 'no-referrer' });
      } else if (res.rec.kind === 'text' && res.rec.content.includes('data-quaderno')) {
        el = drawBlock(res.rec, alt);
      } else if (extOf(res.rec.path) === 'pdf' && res.rec.data) {
        el = pdfBlock(res.rec);
      } else if (res.rec.data) {
        el = imageBlock(res.rec, alt);
      } else {
        el = h('span', { class: 'img-note' }, '[file non leggibile: ' + decodePath(src) + ']');
      }
      if (el._cfg) { el._cfg.notePath = notePath; if (scrollerEl) el._cfg.scroller = scrollerEl; }
      span.replaceWith(el);
    });
  }

  window.addEventListener('resize', (() => {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(() => {
        pdfBlocks.forEach((b) => {
          if (!b.isConnected) { pdfBlocks.delete(b); return; }
          if (session && session.cfg === b._cfg) return;
          const w = b.querySelector('.pagebox').clientWidth;
          if (b._w && Math.abs(w - b._w) > 4 && b._redraw) b._redraw();
        });
      }, 300);
    };
  })());

  /* ---------------------------------------------------------------- sessione di disegno */
  function saveSession(s) {
    if (!s) return;
    s.dirty = false;
    const { ed, cfg } = s;
    const path = cfg.kind === 'draw' ? cfg.path : cfg.annPath;
    if (!path) return;
    if (cfg.kind !== 'draw' && !ed.strokes.length) {
      if (Q.getFile(path)) Q.removeFile(path);
      return;
    }
    Q.writeText(path, INK.drawingSvg(ed.strokes, ed.W, ed.H));
  }

  function startInk(cfg) {
    stopInk();
    let strokes = [];
    let H = 420;
    if (cfg.kind === 'draw') {
      const rec = Q.getFile(cfg.path);
      const parsed = rec ? INK.parseDrawing(rec.content) : null;
      if (parsed) { strokes = parsed.strokes; H = parsed.H; }
    } else {
      const rec = cfg.annPath ? Q.getFile(cfg.annPath) : null;
      const parsed = rec ? INK.parseDrawing(rec.content) : null;
      if (parsed) strokes = parsed.strokes;
      H = cfg.H;
    }
    const s = { cfg, dirty: false, timer: null, ed: null };
    const persistSoon = () => { s.dirty = true; clearTimeout(s.timer); s.timer = setTimeout(() => saveSession(s), 700); };
    s.ed = new INK.Editor({
      svg: cfg.svg, W: 1000, H, fixedH: cfg.kind !== 'draw', overlay: cfg.kind !== 'draw', strokes,
      scroller: cfg.scroller || Q.scroller,
      onChange: () => { persistSoon(); refreshBar(); },
      onSel: (has) => { if (selRow) selRow.hidden = !has; },
    });
    s.ed.start();
    session = s;
    cfg.box.classList.add('active');
    showBar();
    setTimeout(() => { try { cfg.box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* ok */ } }, 50);
  }

  function stopInk(noSave) {
    if (!session) return;
    const s = session;
    session = null;
    clearTimeout(s.timer);
    if (s.cfg.kind === 'draw') s.ed.trim(300);
    if (!noSave && (s.dirty || s.cfg.kind === 'draw')) {
      const rec = s.cfg.kind === 'draw' ? Q.getFile(s.cfg.path) : null;
      if (s.dirty || (rec && rec.content !== INK.drawingSvg(s.ed.strokes, s.ed.W, s.ed.H))) saveSession(s);
    }
    s.ed.stop();
    INK.renderStatic(s.cfg.svg, s.ed.strokes, s.ed.W, s.ed.H, s.cfg.kind !== 'draw');
    s.cfg.box.classList.remove('active');
    hideBar();
  }

  function flush() { if (session && session.dirty) { clearTimeout(session.timer); saveSession(session); } }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  /* ---------------------------------------------------------------- barra flottante */
  function buildBar() {
    const tools = [['pen', 'a-pen', 'Penna'], ['hl', 'a-hl', 'Evidenziatore'], ['eraser', 'a-eraser', 'Gomma'], ['shape', 'a-shape', 'Forme raddrizzate'], ['lasso', 'a-lasso', 'Selezione']];
    bar = h('div', { id: 'inkbar', class: 'inkbar', role: 'toolbar', 'aria-label': 'Strumenti di disegno' });
    bar.hidden = true;
    tools.forEach(([id, icon, label]) => {
      const b = mkBtn('ibtn', label, icon, () => {
        INK.state.tool = id;
        INK.saveState();
        if (id !== 'lasso' && session) { session.ed.clearSel(); }
        refreshBar();
      });
      b.dataset.tool = id;
      bar.append(b);
    });
    bar.append(h('span', { class: 'isep' }));
    const colBtn = h('button', { type: 'button', class: 'icolor-btn', 'aria-label': 'Colore e spessore', title: 'Colore e spessore', 'aria-expanded': 'false' }, h('span', { class: 'cdot' }), ic('a-up'));
    colBtn.addEventListener('click', togglePop);
    bar.append(colBtn);
    bar.append(h('span', { class: 'isep' }));
    const finger = mkBtn('ibtn ifinger', 'Disegna anche con il dito', 'a-hand', () => { INK.state.finger = !INK.state.finger; INK.saveState(); refreshBar(); });
    bar.append(finger);
    bar.append(mkBtn('ibtn iundo', 'Annulla', 'a-undo', () => session && session.ed.undo()));
    bar.append(mkBtn('ibtn iredo', 'Ripeti', 'a-redo', () => session && session.ed.redo()));
    const del = mkBtn('ibtn idel', 'Elimina questo disegno', 'a-trash', deleteDrawing);
    bar.append(del);
    bar.append(h('span', { class: 'isep' }));
    bar.append(h('button', { type: 'button', class: 'idone', on: { click: () => stopInk() } }, 'Fine'));

    selRow = h('div', { class: 'inksel' },
      h('span', { class: 'sellabel' }, 'Selezione'),
      h('button', { type: 'button', on: { click: () => session && session.ed.duplicateSel() } }, ic('a-copy'), 'Duplica'),
      h('button', { type: 'button', class: 'danger', on: { click: () => session && session.ed.deleteSel() } }, ic('a-trash'), 'Elimina'));
    selRow.hidden = true;

    buildPop();
    const wrap = h('div', { id: 'inkwrap', class: 'inkwrap' }, pop, selRow, bar);
    wrap.hidden = true;
    document.body.append(wrap);
  }

  function refreshBar() {
    if (!bar) return;
    bar.querySelectorAll('[data-tool]').forEach((b) => {
      const on = b.dataset.tool === INK.state.tool;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const cd = bar.querySelector('.cdot');
    if (cd) { cd.style.background = INK.state.color === 'ink' ? '#F6F1E7' : INK.state.color; }
    const f = bar.querySelector('.ifinger');
    f.classList.toggle('on', !!INK.state.finger);
    f.setAttribute('aria-pressed', String(!!INK.state.finger));
    bar.querySelector('.idel').hidden = !(session && session.cfg.kind === 'draw' && !session.cfg.sheet);
    if (session) {
      bar.querySelector('.iundo').disabled = !session.ed.hist.length;
      bar.querySelector('.iredo').disabled = !session.ed.redoS.length;
    }
  }

  let barScroller = null;
  function showBar() {
    if (!bar) buildBar();
    document.getElementById('inkwrap').hidden = false;
    bar.hidden = false;
    selRow.hidden = true;
    barScroller = (session && session.cfg.scroller) || Q.scroller;
    barScroller.classList.add('has-bar');
    refreshBar();
  }

  function hideBar() {
    closePop();
    const w = document.getElementById('inkwrap');
    if (w) w.hidden = true;
    if (barScroller) { barScroller.classList.remove('has-bar'); barScroller = null; }
  }


  /* ---------------------------------------------------------------- popover colori e spessori */
  let pop = null;
  let popTab = 'colors';
  const curWidth = () => (INK.state.tool === 'hl' ? INK.state.hw : INK.state.pw);

  function hsv2hex(hh, ss, vv) {
    const f = (n) => { const k = (n + hh / 60) % 6; return vv - vv * ss * Math.max(0, Math.min(k, 4 - k, 1)); };
    return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function hex2hsv(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let hh = 0;
    if (d) hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: hh * 60, s: mx ? d / mx : 0, v: mx };
  }
  const colorHex = (c) => (c === 'ink' ? '#2B2620' : c);

  function buildPop() {
    pop = h('div', { class: 'inkpop', role: 'dialog', 'aria-label': 'Colore e spessore' });
    pop.hidden = true;
  }
  function closePop() {
    if (!pop) return;
    pop.hidden = true;
    const b = bar && bar.querySelector('.icolor-btn');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function togglePop() {
    if (!pop.hidden) { closePop(); return; }
    pop.hidden = false;
    bar.querySelector('.icolor-btn').setAttribute('aria-expanded', 'true');
    renderPop();
  }
  function pickColor(c, close) {
    INK.state.color = c;
    INK.saveState();
    refreshBar();
    if (close) closePop();
  }

  function renderPop() {
    pop.replaceChildren();
    const tabs = h('div', { class: 'ptabs', role: 'tablist' });
    [['colors', 'Colori'], ['wheel', 'Ruota'], ['width', 'Spessore']].forEach(([id, label]) => {
      tabs.append(h('button', { type: 'button', role: 'tab', class: id === popTab ? 'on' : '', 'aria-selected': String(id === popTab), on: { click: () => { popTab = id; renderPop(); } } }, label));
    });
    pop.append(tabs);
    if (popTab === 'colors') pop.append(colorsTab());
    else if (popTab === 'wheel') pop.append(wheelTab());
    else pop.append(widthTab());
  }

  function swatch(c, label) {
    const hex = c === 'ink' ? 'var(--text)' : c;
    const on = INK.state.color === c;
    const b = h('button', { type: 'button', class: 'psw' + (on ? ' on' : ''), 'aria-label': 'Colore ' + label, 'aria-pressed': String(on), title: label }, h('span', { style: 'background:' + hex }));
    b.addEventListener('click', () => pickColor(c, true));
    return b;
  }

  function colorsTab() {
    const box = h('div', { class: 'pcols' });
    INK.COLORS.forEach((c) => box.append(swatch(c.id, c.label)));
    INK.state.saved.forEach((c) => box.append(swatch(c, c)));
    const plus = h('button', { type: 'button', class: 'psw plus', 'aria-label': 'Crea un colore personalizzato', title: 'Colore personalizzato', on: { click: () => { popTab = 'wheel'; renderPop(); } } }, '+');
    box.append(plus);
    return box;
  }

  function wheelTab() {
    const start = hex2hsv(colorHex(INK.state.color));
    const st = { h: start.h, s: start.s, v: start.v };
    const SIZE = 190, RING = 26, SQ = 40;
    const wheel = h('div', { class: 'wheel', style: 'width:' + SIZE + 'px;height:' + SIZE + 'px' });
    const inner = h('div', { class: 'wheel-in', style: 'inset:' + RING + 'px' });
    const sv = h('div', { class: 'wheel-sv', style: 'inset:' + SQ + 'px' });
    const kRing = h('span', { class: 'wknob' });
    const kSv = h('span', { class: 'wknob' });
    wheel.append(inner, sv, kRing, kSv);
    const preview = h('span', { class: 'wprev' });
    const hexIn = h('input', { class: 'whex', type: 'text', value: '#000000', maxlength: '7', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Codice del colore' });

    function paint(commit) {
      const hex = hsv2hex(st.h, st.s, st.v);
      sv.style.background = 'linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, ' + hsv2hex(st.h, 1, 1) + ')';
      const half = SIZE / 2;
      const rr = half - RING / 2;
      const a = (st.h - 90) * Math.PI / 180;
      kRing.style.left = (half + rr * Math.cos(a)) + 'px';
      kRing.style.top = (half + rr * Math.sin(a)) + 'px';
      const side = SIZE - SQ * 2;
      kSv.style.left = (SQ + st.s * side) + 'px';
      kSv.style.top = (SQ + (1 - st.v) * side) + 'px';
      kSv.style.background = hex;
      kRing.style.background = hsv2hex(st.h, 1, 1);
      preview.style.background = hex;
      if (document.activeElement !== hexIn) hexIn.value = hex;
      if (commit) { INK.state.color = hex; INK.saveState(); refreshBar(); }
    }

    let mode = null;
    const apply = (e) => {
      const r = wheel.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (mode === 'ring') {
        st.h = ((Math.atan2(y - SIZE / 2, x - SIZE / 2) * 180 / Math.PI) + 90 + 360) % 360;
      } else {
        const side = SIZE - SQ * 2;
        st.s = Math.max(0, Math.min(1, (x - SQ) / side));
        st.v = 1 - Math.max(0, Math.min(1, (y - SQ) / side));
      }
      paint(true);
    };
    wheel.addEventListener('pointerdown', (e) => {
      const r = wheel.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const inSq = x >= SQ && x <= SIZE - SQ && y >= SQ && y <= SIZE - SQ;
      mode = inSq ? 'sv' : 'ring';
      wheel.setPointerCapture(e.pointerId);
      e.preventDefault();
      apply(e);
    });
    wheel.addEventListener('pointermove', (e) => { if (mode) apply(e); });
    const end = () => { mode = null; };
    wheel.addEventListener('pointerup', end);
    wheel.addEventListener('pointercancel', end);
    hexIn.addEventListener('input', () => {
      let v = hexIn.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) { const c = hex2hsv(v); st.h = c.h; st.s = c.s; st.v = c.v; paint(true); }
    });
    hexIn.addEventListener('blur', () => paint(false));

    const savedRow = h('div', { class: 'pcols small' });
    const fillSaved = () => {
      savedRow.replaceChildren();
      INK.state.saved.forEach((c) => {
        const b = swatch(c, c);
        b.addEventListener('click', () => { const x = hex2hsv(c); st.h = x.h; st.s = x.s; st.v = x.v; paint(false); }, true);
        savedRow.append(b);
      });
    };
    fillSaved();
    const save = h('button', { type: 'button', class: 'psave', on: { click: () => {
      const hex = hsv2hex(st.h, st.s, st.v);
      const l = INK.state.saved.filter((c) => c.toUpperCase() !== hex);
      l.unshift(hex);
      INK.state.saved = l.slice(0, 12);
      INK.state.color = hex;
      INK.saveState();
      fillSaved();
      refreshBar();
    } } }, 'Salva nei miei colori');
    const side = h('div', { class: 'wside' },
      h('div', { class: 'plabel' }, 'Colore scelto'),
      h('div', { class: 'wrow' }, preview, hexIn),
      save,
      h('div', { class: 'plabel' }, 'I miei colori'),
      savedRow);
    paint(false);
    return h('div', { class: 'wheelrow' }, wheel, side);
  }

  function widthTab() {
    const hl = INK.state.tool === 'hl';
    const range = hl ? INK.HL_RANGE : INK.PEN_RANGE;
    const presets = hl ? INK.HL_PRESETS : INK.PEN_PRESETS;
    const key = hl ? 'hw' : 'pw';
    const val = h('span', { class: 'wval' }, '');
    const slider = h('input', { type: 'range', class: 'wslider', min: String(range[0]), max: String(range[1]), step: '0.5', value: String(INK.state[key]), 'aria-label': 'Spessore del tratto' });
    const prev = document.createElementNS(NS, 'svg');
    prev.setAttribute('viewBox', '0 0 120 40');
    prev.setAttribute('class', 'wprevsvg');
    prev.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M8 28 Q60 -6 112 16');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    prev.append(path);
    const dots = h('div', { class: 'wdots' });
    const paint = () => {
      const w = INK.state[key];
      val.textContent = String(Math.round(w * 10) / 10);
      slider.value = String(w);
      const pct = ((w - range[0]) / (range[1] - range[0])) * 100;
      slider.style.setProperty('--pct', pct + '%');
      path.setAttribute('stroke-width', String(Math.min(36, w)));
      path.setAttribute('stroke', INK.state.color === 'ink' ? 'var(--text)' : INK.state.color);
      path.setAttribute('opacity', hl ? '0.45' : '1');
      dots.querySelectorAll('button').forEach((b) => { const on = Number(b.dataset.w) === w; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    };
    presets.forEach((w) => {
      const d = Math.max(3, Math.min(22, hl ? w / 3 : w * 1.3));
      const b = h('button', { type: 'button', 'aria-label': 'Spessore ' + w, title: String(w) }, h('i', { style: 'width:' + d + 'px;height:' + d + 'px' }));
      b.dataset.w = String(w);
      b.addEventListener('click', () => { INK.state[key] = w; INK.saveState(); paint(); refreshBar(); });
      dots.append(b);
    });
    slider.addEventListener('input', () => { INK.state[key] = Number(slider.value); INK.saveState(); paint(); refreshBar(); });
    paint();
    return h('div', { class: 'widthtab' },
      h('div', { class: 'plabel' }, hl ? 'Spessore evidenziatore' : 'Spessore penna'),
      h('div', { class: 'wline' }, slider, val, prev),
      dots);
  }

  /* ---------------------------------------------------------------- formattazione markdown (barra della nota) */
  function fmt(ta, kind) {
    const st = ta.selectionStart;
    const en = ta.selectionEnd;
    const v = ta.value;
    const sel = v.slice(st, en);
    const wrap = (a, b, ph) => {
      const t = sel || ph;
      ta.setRangeText(a + t + b, st, en, 'end');
      ta.setSelectionRange(st + a.length, st + a.length + t.length);
    };
    const prefix = (p) => {
      const ls = v.lastIndexOf('\n', st - 1) + 1;
      const block = v.slice(ls, en).split('\n').map((l) => p + l).join('\n');
      ta.setRangeText(block, ls, en, 'end');
    };
    if (kind === 'bold') wrap('**', '**', 'testo');
    else if (kind === 'italic') wrap('*', '*', 'testo');
    else if (kind === 'code') wrap('`', '`', 'codice');
    else if (kind === 'wiki') wrap('[[', ']]', 'nota');
    else if (kind === 'h2') prefix('## ');
    else if (kind === 'list') prefix('- ');
    else if (kind === 'task') prefix('- [ ] ');
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  }

  /* ---------------------------------------------------------------- lettore PDF a schermo intero con nota per pagina */
  let reader = null;
  let activePageNote = null;
  const MODE_KEY = 'quaderno.rdmode';
  const SHEET_KEY = 'quaderno.sheet';
  const narrowMq = window.matchMedia('(max-width: 699px)');

  const pageNotePath = (rec, n) => rec.path + '.p' + n + '.md';
  const legacyTextPath = (rec, n) => rec.path + '.p' + n + '.note.txt';
  const legacyDrawPath = (rec, n) => rec.path + '.p' + n + '.notes.ink.svg';
  const annPath = (rec, n) => rec.path + '.p' + n + '.ink.svg';

  // le note scritte con la versione precedente (testo + un disegno) diventano una nota normale
  function migrateLegacy(rec, n) {
    const target = pageNotePath(rec, n);
    if (Q.getFile(target)) return;
    const t = Q.getFile(legacyTextPath(rec, n));
    const d = Q.getFile(legacyDrawPath(rec, n));
    let hasDraw = false;
    if (d) { const p = INK.parseDrawing(d.content); hasDraw = !!(p && p.strokes.length); }
    const text = t && t.content ? t.content.trim() : '';
    if (!text && !hasDraw) return;
    const md = [text, hasDraw ? '![Disegno](' + encodeSeg(baseName(d.path)) + ')' : ''].filter(Boolean).join('\n\n') + '\n';
    Q.writeMd(target, md);
    if (t) Q.removeFile(t.path);
  }

  function pageHasNotes(rec, n) {
    const m = Q.getFile(pageNotePath(rec, n));
    if (m && m.content && m.content.trim()) return true;
    if (Q.getFile(annPath(rec, n))) return true;
    const t = Q.getFile(legacyTextPath(rec, n));
    if (t && t.content && t.content.trim()) return true;
    const d = Q.getFile(legacyDrawPath(rec, n));
    if (d) { const p = INK.parseDrawing(d.content); if (p && p.strokes.length) return true; }
    return false;
  }

  function closeReader() {
    if (!reader) return;
    const r = reader;
    reader = null;
    stopInk();
    r.flush();
    r.el.remove();
    try { Q.refreshSidebar(); Q.syncNow && Q.syncNow(false); } catch (e) { /* ok */ }
    activePageNote = null;
    document.body.classList.remove('reader-open');
    document.removeEventListener('keydown', r.onKey);
    window.removeEventListener('resize', r.onResize);
    r.thumbIO && r.thumbIO.disconnect();
    lastPage.set(r.rec.path, r.page);
    pdfBlocks.forEach((b) => { if (b.isConnected && b.dataset.path === r.rec.path && b._redraw) b._redraw(); });
  }

  /* editor di una nota (anteprima, markdown, affiancati) dentro il foglio */
  function createPageNote(onSaved) {
    const E = { path: null, mode: 'preview', page: 1 };
    const pv = h('div', { class: 'rd-pv doc' });
    const hl = h('pre', { class: 'hl', 'aria-hidden': 'true' });
    const ta = h('textarea', { class: 'editor', spellcheck: 'false', 'aria-label': 'Testo Markdown della nota di questa pagina' });
    HL.attach(ta);
    const wrap = h('div', { class: 'edwrap rd-edwrap' }, hl, ta);
    const sp = h('div', { class: 'splitter', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Trascina per ridimensionare', tabindex: '0' }, h('i', {}, h('b'), h('b'), h('b')));
    const area = h('div', { class: 'rd-ednote', 'data-mode': 'preview' }, wrap, sp, pv);
    const tb = h('div', { class: 'toolbar rd-tb', role: 'toolbar', 'aria-label': 'Formattazione' });
    const mainTb = document.getElementById('toolbar');
    if (mainTb) tb.innerHTML = mainTb.innerHTML;
    tb.addEventListener('mousedown', (e) => e.preventDefault());

    const modeBtns = {};
    const seg = h('div', { class: 'seg rd-seg', role: 'group', 'aria-label': 'Modalità della nota' });
    [['preview', 'Anteprima'], ['edit', 'Markdown'], ['split', 'Affiancati']].forEach(([m, label]) => {
      const b = h('button', { type: 'button', class: m === 'split' ? 'only-split' : '' }, label);
      b.addEventListener('click', () => E.setMode(m));
      modeBtns[m] = b;
      seg.append(b);
    });

    const paintHl = () => { hl.innerHTML = HL.html(ta.value); hl.scrollTop = ta.scrollTop; };
    const eff = () => (E.mode === 'split' && narrowMq.matches ? 'edit' : E.mode);

    function renderPv() {
      if (!ta.value.trim()) { pv.innerHTML = '<p class="img-note">Nota vuota. Passa a "Markdown" per scrivere.</p>'; return; }
      const top = pv.scrollTop;
      pv.innerHTML = MD.render(ta.value);
      pv.querySelectorAll('a.wiki').forEach((a) => a.setAttribute('href', '#'));
      hydrate(pv, E.path, pv);
      pv.scrollTop = top;
    }
    function applyMode() {
      const m = eff();
      area.dataset.mode = m;
      Object.entries(modeBtns).forEach(([k, b]) => { b.classList.toggle('on', k === m); b.setAttribute('aria-pressed', String(k === m)); });
      if (m !== 'edit') renderPv();
    }
    E.setMode = (m) => {
      stopInk();
      E.mode = m;
      try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ok */ }
      applyMode();
      if (m !== 'preview') ta.focus();
    };

    let saveTimer = null;
    E.flush = () => {
      clearTimeout(saveTimer);
      if (E.path == null) return;
      const v = ta.value;
      const ex = Q.getFile(E.path);
      if (!v.trim()) { if (ex) Q.removeFile(E.path); }
      else if (!ex || ex.content !== v) Q.writeMd(E.path, v);
      onSaved(E.page);
    };
    let typingUntil = 0;
    const markTyping = () => { typingUntil = Date.now() + 900; };
    const livePv = (() => {
      let t;
      return () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (session || eff() !== 'split') return;
          const top = pv.scrollTop;
          renderPv();
          pv.scrollTop = top;
          HL.followPreview(ta, pv, false);
        }, 200);
      };
    })();
    const caretMoved = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => { if (eff() === 'split' && document.activeElement === ta && !session) HL.followPreview(ta, pv, false); }, 120); }; })();
    ta.addEventListener('input', () => {
      paintHl();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(E.flush, 500);
      if (eff() === 'split') { markTyping(); livePv(); }
    });
    let lock = 0;
    const follow = (from, to) => {
      if (eff() !== 'split' || Date.now() < lock || Date.now() < typingUntil) return;
      const max = from.scrollHeight - from.clientHeight;
      lock = Date.now() + 120;
      to.scrollTop = (max > 0 ? from.scrollTop / max : 0) * (to.scrollHeight - to.clientHeight);
    };
    ta.addEventListener('scroll', () => { hl.scrollTop = ta.scrollTop; follow(ta, pv); });
    pv.addEventListener('scroll', () => { if (!session) follow(pv, ta); });
    ['keyup', 'click', 'touchend'].forEach((ev) => ta.addEventListener(ev, () => { markTyping(); caretMoved(); }));
    document.addEventListener('selectionchange', () => { if (document.activeElement === ta) { markTyping(); caretMoved(); } });
    pv.addEventListener('click', (e) => {
      const a = e.target.closest('a.wiki');
      if (a) { e.preventDefault(); E.flush(); Q.openWiki(a.dataset.wiki); return; }
      const tg = e.target.closest('a.tag');
      if (tg) { e.preventDefault(); E.flush(); closeReader(); Q.showTag(tg.dataset.tag); }
    });

    // divisore trascinabile
    const setSplit = (pct) => {
      pct = Math.max(25, Math.min(75, pct));
      area.style.setProperty('--rdsplit', pct + '%');
      try { localStorage.setItem('quaderno.rdsplit', String(Math.round(pct))); } catch (e) { /* ok */ }
    };
    try { const sv = Number(localStorage.getItem('quaderno.rdsplit')); if (sv) setSplit(sv); } catch (e) { /* ok */ }
    let drag = false;
    sp.addEventListener('pointerdown', (e) => { drag = true; sp.setPointerCapture(e.pointerId); e.preventDefault(); });
    sp.addEventListener('pointerup', () => { drag = false; });
    sp.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = area.getBoundingClientRect();
      setSplit(((e.clientX - r.left) / r.width) * 100);
    });

    // inserimenti (disegni, immagini, PDF) nella nota della pagina
    const ctx = {
      get path() { return E.path; },
      insert(md) {
        const m = eff();
        const v = ta.value;
        if (m === 'preview') {
          ta.value = v.replace(/\s*$/, '') + (v.trim() ? '\n\n' : '') + md + '\n';
        } else {
          const st = ta.selectionStart;
          const before = v.slice(0, st);
          const after = v.slice(ta.selectionEnd);
          const pre = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
          ta.value = before + pre + md + '\n\n' + after;
        }
        paintHl();
        E.flush();
        if (E.mode === 'edit') E.mode = 'preview';
        applyMode();
      },
    };
    tb.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-fmt]');
      if (!b) return;
      const k = b.dataset.fmt;
      if (k === 'draw') addDrawing(ctx);
      else if (k === 'attach') pickAttachment(ctx);
      else { if (eff() === 'preview') E.setMode('edit'); fmt(ta, k); }
    });

    E.load = (path, page) => {
      E.flush();
      stopInk();
      E.path = path;
      E.page = page;
      const rec = Q.getFile(path);
      ta.value = rec ? rec.content : '';
      ta.scrollTop = 0;
      paintHl();
      let saved = 'preview';
      try { saved = localStorage.getItem(MODE_KEY) || 'preview'; } catch (e) { /* ok */ }
      E.mode = ta.value.trim() ? saved : 'edit';
      applyMode();
    };
    E.reload = () => {
      const rec = Q.getFile(E.path);
      ta.value = rec ? rec.content : '';
      paintHl();
      applyMode();
    };
    E.seg = seg;
    E.area = area;
    E.toolbar = tb;
    E.reapply = applyMode;
    narrowMq.addEventListener('change', applyMode);
    return E;
  }

  function openReaderFor(pdfPath, page) {
    const rec = Q.getFile(pdfPath);
    if (rec) openReader(rec, page); else Q.toast('PDF non trovato: ' + pdfPath);
  }
  function refreshActive(changed) {
    if (activePageNote && activePageNote.path && changed && changed.has(activePageNote.path)) activePageNote.reload();
  }

  function openReader(rec, startPage) {
    if (reader) closeReader();
    stopInk();
    const R = { rec, page: startPage || 1, doc: null, token: 0, task: null };
    reader = R;
    try { Q.syncNow(false); } catch (e) { /* ok */ }

    const thumbs = h('div', { class: 'rd-thumbs', role: 'list', 'aria-label': 'Pagine' });
    const closeBtn = mkBtn('mbtn rd-close', 'Chiudi il lettore', 'a-close', closeReader);
    const count = h('span', { class: 'rd-count' }, '');
    const annot = h('button', { type: 'button', class: 'mtxt rd-annot' }, ic('a-pen'), 'Annota la pagina');
    const syncBtn = mkBtn('mbtn rd-sync', 'Sincronizza ora', 'i-cloud', () => {
      activePageNote && activePageNote.flush();
      syncBtn.classList.add('busy');
      Promise.resolve(Q.syncNow()).finally(() => syncBtn.classList.remove('busy'));
    });
    const top = h('div', { class: 'rd-top' }, closeBtn, h('span', { class: 'rd-name' }, baseName(rec.path)), count, h('span', { class: 'sp' }), syncBtn, annot);
    const canvas = document.createElement('canvas');
    const ov = overlaySvg();
    const msg = h('div', { class: 'pdfmsg' }, 'Caricamento…');
    const pagebox = h('div', { class: 'pagebox on-page' }, canvas, ov, msg);
    const wrap = h('div', { class: 'rd-pagewrap' }, pagebox);
    const title = h('h3', { class: 'rd-title' }, '');
    const prev = mkBtn('mbtn', 'Pagina precedente', 'a-prev');
    const next = mkBtn('mbtn', 'Pagina successiva', 'a-next');
    const fold = mkBtn('mbtn', 'Comprimi o espandi il foglio note', 'a-down');

    const thumbEls = [];
    const refreshDot = (n) => { const t = thumbEls[n - 1]; if (t) t.classList.toggle('has', pageHasNotes(rec, n)); };
    const E = createPageNote(refreshDot);
    activePageNote = E;
    R.flush = () => E.flush();

    const grip = h('div', { class: 'rd-grip', role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': 'Trascina per ridimensionare il foglio', tabindex: '0' }, h('span'));
    const sheet = h('div', { class: 'rd-sheet' }, grip,
      h('div', { class: 'rd-sheethead' }, title, h('span', { class: 'sp' }), E.seg, prev, next, fold),
      E.area, E.toolbar);
    const main = h('div', { class: 'rd-main' }, top, wrap, sheet);
    const el = h('div', { class: 'reader', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Lettore PDF con nota per pagina' }, thumbs, main);
    R.el = el;
    document.body.append(el);
    document.body.classList.add('reader-open');

    // altezza del foglio, trascinabile
    const setSheet = (px) => {
      const max = Math.max(200, main.clientHeight - 110);
      px = Math.max(150, Math.min(max, px));
      el.style.setProperty('--sheet-h', px + 'px');
      try { localStorage.setItem(SHEET_KEY, String(Math.round(px))); } catch (e) { /* ok */ }
    };
    let sh = 0;
    try { sh = Number(localStorage.getItem(SHEET_KEY)) || 0; } catch (e) { /* ok */ }
    setSheet(sh || Math.round(main.clientHeight * 0.5));
    let gd = false;
    grip.addEventListener('pointerdown', (e) => { gd = true; grip.setPointerCapture(e.pointerId); e.preventDefault(); });
    grip.addEventListener('pointerup', () => { gd = false; });
    grip.addEventListener('pointermove', (e) => { if (gd) setSheet(main.getBoundingClientRect().bottom - e.clientY); });
    grip.addEventListener('keydown', (e) => {
      const cur = parseInt(el.style.getPropertyValue('--sheet-h'), 10) || 300;
      if (e.key === 'ArrowUp') setSheet(cur + 40);
      if (e.key === 'ArrowDown') setSheet(cur - 40);
    });
    fold.addEventListener('click', () => { const c = sheet.classList.toggle('collapsed'); fold.querySelector('use').setAttribute('href', c ? '#a-up' : '#a-down'); });

    const pageCfg = { kind: 'overlay', svg: ov, box: pagebox, annPath: null, H: 0, ready: false, scroller: wrap };

    async function show(n) {
      const my = ++R.token;
      E.flush();
      if (session && session.cfg === pageCfg) stopInk();
      pageCfg.ready = false;
      try {
        R.doc = R.doc || await getPdf(rec);
        const doc = R.doc;
        const pageNo = Math.max(1, Math.min(doc.numPages, n));
        R.page = pageNo;
        count.textContent = pageNo + ' / ' + doc.numPages;
        title.textContent = 'Nota della pagina ' + pageNo;
        prev.disabled = pageNo <= 1;
        next.disabled = pageNo >= doc.numPages;
        thumbEls.forEach((t, i) => { const on = i + 1 === pageNo; t.classList.toggle('on', on); t.setAttribute('aria-current', on ? 'page' : 'false'); });
        const cur = thumbEls[pageNo - 1];
        if (cur) cur.scrollIntoView({ block: 'nearest' });
        migrateLegacy(rec, pageNo);
        E.load(pageNotePath(rec, pageNo), pageNo);
        refreshDot(pageNo);
        const pg = await doc.getPage(pageNo);
        if (my !== R.token) return;
        const vp1 = pg.getViewport({ scale: 1 });
        pagebox.style.aspectRatio = vp1.width + ' / ' + vp1.height;
        const cssW = pagebox.clientWidth || 640;
        const vp = pg.getViewport({ scale: (cssW / vp1.width) * Math.min(window.devicePixelRatio || 1, 2.5) });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        if (R.task) { try { R.task.cancel(); } catch (e) { /* ok */ } }
        R.task = pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        await R.task.promise;
        if (my !== R.token) return;
        msg.hidden = true;
        pageCfg.H = Math.round((1000 * vp1.height) / vp1.width);
        pageCfg.annPath = annPath(rec, pageNo);
        pageCfg.ready = true;
        const ann = Q.getFile(pageCfg.annPath);
        const parsed = ann ? INK.parseDrawing(ann.content) : null;
        INK.renderStatic(ov, parsed ? parsed.strokes : [], 1000, pageCfg.H, true);
        wrap.scrollTop = 0;
      } catch (e) {
        if (e && e.name === 'RenderingCancelledException') return;
        msg.hidden = false;
        msg.textContent = 'Impossibile mostrare questo PDF';
      }
    }

    prev.addEventListener('click', () => show(R.page - 1));
    next.addEventListener('click', () => show(R.page + 1));
    annot.addEventListener('click', () => { if (!pageCfg.ready) { Q.toast('Attendi il caricamento della pagina'); return; } startInk(pageCfg); });
    R.onKey = (e) => {
      if (!reader) return;
      const typing = /^(input|textarea)$/i.test((e.target && e.target.tagName) || '');
      if (e.key === 'Escape' && !session) closeReader();
      else if (!typing && !session && e.key === 'ArrowLeft') show(R.page - 1);
      else if (!typing && !session && e.key === 'ArrowRight') show(R.page + 1);
    };
    document.addEventListener('keydown', R.onKey);
    let rt;
    R.onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (reader === R && !session) show(R.page); }, 300); };
    window.addEventListener('resize', R.onResize);

    // miniature
    getPdf(rec).then((doc) => {
      if (reader !== R) return;
      R.doc = doc;
      let chain = Promise.resolve();
      R.thumbIO = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return;
        R.thumbIO.unobserve(en.target);
        const t = en.target;
        chain = chain.then(async () => {
          if (reader !== R) return;
          try {
            const pg = await doc.getPage(Number(t.dataset.n));
            const v1 = pg.getViewport({ scale: 1 });
            const v = pg.getViewport({ scale: (56 / v1.width) * Math.min(window.devicePixelRatio || 1, 2) });
            const c = t.querySelector('canvas');
            c.width = Math.floor(v.width);
            c.height = Math.floor(v.height);
            await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
          } catch (e) { /* miniatura non disponibile */ }
        });
      }), { root: thumbs, rootMargin: '200px' }) : null;
      for (let i = 1; i <= doc.numPages; i++) {
        const t = h('button', { type: 'button', class: 'rd-th', role: 'listitem', 'aria-label': 'Pagina ' + i, 'data-n': String(i) }, document.createElement('canvas'), h('span', { class: 'rd-thn' }, String(i)), h('b', { class: 'rd-dot' }));
        t.addEventListener('click', () => show(i));
        thumbEls.push(t);
        thumbs.append(t);
        if (pageHasNotes(rec, i)) t.classList.add('has');
        if (R.thumbIO) R.thumbIO.observe(t);
      }
      show(R.page);
    }).catch(() => { msg.textContent = 'Impossibile mostrare questo PDF'; });
  }

  function deleteDrawing() {
    if (!session || session.cfg.kind !== 'draw') return;
    if (!confirm('Eliminare questo disegno dalla nota?')) return;
    const cfg = session.cfg;
    stopInk(true);
    Q.removeFile(cfg.path);
    Q.removeLinesContaining(encodeSeg(baseName(cfg.path)), cfg.notePath || null);
    cfg.box.remove();
    if (activePageNote && cfg.notePath === activePageNote.path) activePageNote.reload();
  }

  document.addEventListener('keydown', (e) => {
    if (!session) return;
    const mod = e.metaKey || e.ctrlKey;
    const typing = /^(input|textarea)$/i.test((e.target && e.target.tagName) || '');
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) session.ed.redo(); else session.ed.undo(); }
    else if (e.key === 'Escape') stopInk();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && session.ed.sel.size) { e.preventDefault(); session.ed.deleteSel(); }
  });

  /* ---------------------------------------------------------------- inserimento */
  function startByPath(path) {
    const box = document.querySelector('.inkblock[data-path="' + (window.CSS && CSS.escape ? CSS.escape(path) : path) + '"]');
    if (box && box._cfg) startInk(box._cfg);
  }

  const mainCtx = () => { const n = Q.note(); return n ? { path: n.path, insert: (md) => Q.insertBlock(md) } : null; };

  function addDrawing(ctx) {
    ctx = ctx || mainCtx();
    const n = ctx && { path: ctx.path };
    if (!n) return;
    const name = 'disegno-' + Math.random().toString(36).slice(2, 7) + '.svg';
    const path = assetsDir(n.path) + name;
    Q.writeText(path, INK.emptyDrawing(1000, 420));
    ctx.insert('![Disegno](' + refDir(n.path) + name + ')');
    startByPath(path);
  }

  async function downscale(file) {
    try {
      const bmp = await createImageBitmap(file);
      const max = 2400;
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (k === 1 && file.size < 2 * 1024 * 1024) return null;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
      if (!blob || blob.size >= file.size) return null;
      return await blob.arrayBuffer();
    } catch (e) { return null; }
  }

  async function addFiles(files, ctx) {
    ctx = ctx || mainCtx();
    const n = ctx && { path: ctx.path };
    if (!n) return;
    const mds = [];
    let lastPath = null;
    for (const f of files) {
      const ext = extOf(f.name);
      if (!MIME[ext]) { Q.toast('Formato non supportato: ' + f.name); continue; }
      if (f.size > MAX) { Q.toast('"' + f.name + '" supera i 25 MB'); continue; }
      let buf = null;
      if (ext === 'jpg' || ext === 'jpeg') buf = await downscale(f);
      if (!buf) buf = await f.arrayBuffer();
      const dir = assetsDir(n.path);
      let name = f.name.replace(/[\\/:*?"<>|#%]/g, '-').trim() || ('file.' + ext);
      for (let k = 2; Q.getFile(dir + name); k++) name = name.replace(/(-\d+)?(\.[^.]+)$/, '-' + k + '$2');
      Q.writeBin(dir + name, buf, MIME[ext]);
      mds.push('![' + name.replace(/[\[\]]/g, '') + '](' + refDir(n.path) + encodeSeg(name) + ')');
      lastPath = dir + name;
    }
    if (mds.length) ctx.insert(mds.join('\n\n'));
    return lastPath;
  }

  let fileCtx = null;
  function pickAttachment(ctx) {
    fileCtx = ctx || null;
    if (!fileInput) {
      fileInput = h('input', { type: 'file', accept: 'image/*,.pdf,application/pdf', multiple: '' });
      fileInput.hidden = true;
      fileInput.addEventListener('change', async () => {
        const list = [...fileInput.files];
        fileInput.value = '';
        if (list.length) await addFiles(list, fileCtx);
      });
      document.body.append(fileInput);
    }
    fileInput.click();
  }

  function init(api) {
    Q = api;
    document.body.insertAdjacentHTML('afterbegin', SPRITE);
  }

  root.ATT = { init, hydrate, stopInk, inking: () => !!session, addDrawing, pickAttachment, fmt, closeReader, openReaderFor, refreshActive, assetsDir, refDir, encodeSeg, MIME, MAX };
})(window);
