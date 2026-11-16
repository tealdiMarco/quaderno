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
      if (/\.ink\.svg$/i.test(n.path)) continue;
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
    const mbar = h('div', { class: 'mediabar' }, ic('i-file'), h('span', { class: 'mname' }, baseName(rec.path)), lbl, h('span', { class: 'sp' }), prev, next, annot);
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

  function hydrate(container, notePath) {
    if (!io && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((entries, o) => entries.forEach((en) => {
        if (en.isIntersecting) { o.unobserve(en.target); if (en.target._load) en.target._load(); }
      }), { root: Q.scroller, rootMargin: '500px' });
    }
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
      scroller: Q.scroller,
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
    INK.COLORS.forEach((c) => {
      const b = h('button', { type: 'button', class: 'icol', 'aria-label': 'Colore ' + c.label, title: c.label }, h('span', { style: 'background:' + c.swatch }));
      b.dataset.color = c.id;
      b.addEventListener('click', () => { INK.state.color = c.id; INK.saveState(); refreshBar(); });
      bar.append(b);
    });
    bar.append(h('span', { class: 'isep' }));
    const sizeBtn = h('button', { type: 'button', class: 'ibtn isize', 'aria-label': 'Spessore del tratto', title: 'Spessore' }, h('span', { class: 'sizebar' }));
    sizeBtn.addEventListener('click', () => { INK.state.size = (INK.state.size + 1) % 3; INK.saveState(); refreshBar(); });
    bar.append(sizeBtn);
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

    const wrap = h('div', { id: 'inkwrap', class: 'inkwrap' }, selRow, bar);
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
    bar.querySelectorAll('[data-color]').forEach((b) => {
      const on = b.dataset.color === INK.state.color;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const sb = bar.querySelector('.sizebar');
    if (sb) sb.style.height = [2, 4, 8][INK.state.size] + 'px';
    const f = bar.querySelector('.ifinger');
    f.classList.toggle('on', !!INK.state.finger);
    f.setAttribute('aria-pressed', String(!!INK.state.finger));
    bar.querySelector('.idel').hidden = !(session && session.cfg.kind === 'draw');
    if (session) {
      bar.querySelector('.iundo').disabled = !session.ed.hist.length;
      bar.querySelector('.iredo').disabled = !session.ed.redoS.length;
    }
  }

  function showBar() {
    if (!bar) buildBar();
    document.getElementById('inkwrap').hidden = false;
    bar.hidden = false;
    selRow.hidden = true;
    Q.scroller.classList.add('has-bar');
    refreshBar();
  }

  function hideBar() {
    const w = document.getElementById('inkwrap');
    if (w) w.hidden = true;
    if (Q) Q.scroller.classList.remove('has-bar');
  }

  function deleteDrawing() {
    if (!session || session.cfg.kind !== 'draw') return;
    if (!confirm('Eliminare questo disegno dalla nota?')) return;
    const cfg = session.cfg;
    stopInk(true);
    Q.removeFile(cfg.path);
    Q.removeLinesContaining(encodeSeg(baseName(cfg.path)));
    cfg.box.remove();
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

  function addDrawing() {
    const n = Q.note();
    if (!n) return;
    const name = 'disegno-' + Math.random().toString(36).slice(2, 7) + '.svg';
    const path = assetsDir(n.path) + name;
    Q.writeText(path, INK.emptyDrawing(1000, 420));
    Q.insertBlock('![Disegno](' + refDir(n.path) + name + ')');
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

  async function addFiles(files) {
    const n = Q.note();
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
    if (mds.length) Q.insertBlock(mds.join('\n\n'));
    return lastPath;
  }

  function pickAttachment() {
    if (!fileInput) {
      fileInput = h('input', { type: 'file', accept: 'image/*,.pdf,application/pdf', multiple: '' });
      fileInput.hidden = true;
      fileInput.addEventListener('change', async () => {
        const list = [...fileInput.files];
        fileInput.value = '';
        if (list.length) await addFiles(list);
      });
      document.body.append(fileInput);
    }
    fileInput.click();
  }

  function init(api) {
    Q = api;
    document.body.insertAdjacentHTML('afterbegin', SPRITE);
  }

  root.ATT = { init, hydrate, stopInk, inking: () => !!session, addDrawing, pickAttachment, assetsDir, refDir, encodeSeg, MIME, MAX };
})(window);
