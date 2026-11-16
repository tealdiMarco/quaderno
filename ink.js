/* Motore di disegno per Quaderno: tratti con pressione, evidenziatore, gomma,
   forme raddrizzate, selezione col lazo, annulla/ripeti.
   Coordinate logiche: larghezza fissa 1000, altezza variabile (blocchi) o proporzionale (PDF e immagini). */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = [
    { id: 'ink', hex: '#2B2620', swatch: '#F6F1E7', label: 'Nero' },
    { id: '#D2693F', hex: '#D2693F', swatch: '#D2693F', label: 'Terracotta' },
    { id: '#4A86F7', hex: '#4A86F7', swatch: '#4A86F7', label: 'Blu' },
    { id: '#3FA66B', hex: '#3FA66B', swatch: '#3FA66B', label: 'Verde' },
    { id: '#F2C230', hex: '#F2C230', swatch: '#F2C230', label: 'Giallo' },
  ];
  const PEN = [2.5, 4, 7];
  const HL = [16, 26, 40];
  const ERASER = 18;
  const TOOLS = ['pen', 'hl', 'eraser', 'shape', 'lasso'];

  const state = { tool: 'pen', color: 'ink', size: 1, finger: false };
  try {
    Object.assign(state, JSON.parse(localStorage.getItem('quaderno.ink') || '{}'));
  } catch (e) { /* nessuna preferenza salvata */ }
  if (!TOOLS.includes(state.tool)) state.tool = 'pen';
  if (!COLORS.some((c) => c.id === state.color)) state.color = 'ink';
  if (![0, 1, 2].includes(state.size)) state.size = 1;
  const saveState = () => { try { localStorage.setItem('quaderno.ink', JSON.stringify(state)); } catch (e) { /* ok */ } };

  /* La penna ha priorità: mentre è in uso (e subito dopo) i tocchi delle dita vengono ignorati (palm rejection). */
  let penUntil = 0;
  const penBusy = () => Date.now() < penUntil;

  const r1 = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const hexOf = (c) => (c === 'ink' ? '#2B2620' : c);
  let uid = 1;
  const nextId = () => uid++;

  /* ---------------------------------------------------------------- geometria */
  function segDist(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  const bboxCache = new WeakMap();
  function bbox(s) {
    let b = bboxCache.get(s);
    if (!b) {
      b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const q of s.pts) {
        if (q[0] < b[0]) b[0] = q[0];
        if (q[1] < b[1]) b[1] = q[1];
        if (q[0] > b[2]) b[2] = q[0];
        if (q[1] > b[3]) b[3] = q[1];
      }
      bboxCache.set(s, b);
    }
    return b;
  }

  function hitStroke(s, p, r) {
    const rr = r + s.w / 2;
    const b = bbox(s);
    if (p[0] < b[0] - rr || p[0] > b[2] + rr || p[1] < b[1] - rr || p[1] > b[3] + rr) return false;
    if (s.pts.length === 1) return dist(p, s.pts[0]) <= rr;
    for (let i = 0; i < s.pts.length - 1; i++) if (segDist(p, s.pts[i], s.pts[i + 1]) <= rr) return true;
    return false;
  }

  function inPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  function lineDist(p, a, b) {
    const l = dist(a, b);
    if (l < 1e-6) return dist(p, a);
    return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / l;
  }

  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    let maxd = 0;
    let idx = 0;
    const a = pts[0];
    const b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = lineDist(pts[i], a, b);
      if (d > maxd) { maxd = d; idx = i; }
    }
    if (maxd > eps) {
      const left = rdp(pts.slice(0, idx + 1), eps);
      const right = rdp(pts.slice(idx), eps);
      return left.slice(0, -1).concat(right);
    }
    return [a, b];
  }

  /* Riconosce linea, triangolo, rettangolo, ellisse. Restituisce i punti "ideali" oppure null. */
  function recognize(pts) {
    const P = pts.map((q) => [q[0], q[1]]);
    const n = P.length;
    if (n < 8) return null;
    let len = 0;
    for (let i = 1; i < n; i++) len += dist(P[i - 1], P[i]);
    if (len < 40) return null;
    const a = P[0];
    const b = P[n - 1];
    const chord = dist(a, b);
    const xs = P.map((q) => q[0]);
    const ys = P.map((q) => q[1]);
    const minx = Math.min(...xs);
    const maxx = Math.max(...xs);
    const miny = Math.min(...ys);
    const maxy = Math.max(...ys);
    const w = maxx - minx;
    const h = maxy - miny;
    const diag = Math.hypot(w, h);
    const out = (arr) => arr.map((q) => [q[0], q[1], 0.5]);

    const closed = chord < 0.22 * len;
    if (!closed) {
      let maxd = 0;
      for (const q of P) maxd = Math.max(maxd, lineDist(q, a, b));
      if (chord > 40 && maxd < 0.07 * chord) return out([a, b]);
      return null;
    }
    if (diag < 40) return null;
    const closedPath = P.concat([P[0]]);
    const simp = rdp(closedPath, 0.07 * diag);
    const corners = simp.length - 1;
    if (corners === 3) return out(simp);
    if (corners === 4) {
      let aligned = true;
      for (let i = 0; i < 4; i++) {
        const dx = Math.abs(simp[i + 1][0] - simp[i][0]);
        const dy = Math.abs(simp[i + 1][1] - simp[i][1]);
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (ang > 14 && ang < 76) aligned = false;
      }
      if (aligned) return out([[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy], [minx, miny]]);
      return out(simp);
    }
    const cx = (minx + maxx) / 2;
    const cy = (miny + maxy) / 2;
    const rx = w / 2;
    const ry = h / 2;
    if (rx < 12 || ry < 12) return null;
    const rad = P.map((q) => Math.hypot((q[0] - cx) / rx, (q[1] - cy) / ry));
    const mean = rad.reduce((s, v) => s + v, 0) / rad.length;
    const sd = Math.sqrt(rad.reduce((s, v) => s + (v - mean) * (v - mean), 0) / rad.length);
    if (Math.abs(mean - 1) > 0.18 || sd > 0.2) return null;
    const el = [];
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      el.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
    return out(el);
  }

  /* ---------------------------------------------------------------- tratti: disegno e (de)serializzazione */
  function outline(pts, w) {
    const n = pts.length;
    if (n === 1) {
      const r = (w * (0.1 + 1.0 * pts[0][2])) / 2;
      const x = pts[0][0];
      const y = pts[0][1];
      return 'M' + r1(x - r) + ' ' + r1(y) + 'a' + r1(r) + ' ' + r1(r) + ' 0 1 0 ' + r1(2 * r) + ' 0a' + r1(r) + ' ' + r1(r) + ' 0 1 0 ' + r1(-2 * r) + ' 0Z';
    }
    const L = [];
    const R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const r = (w * (0.1 + 1.0 * pts[i][2])) / 2;
      L.push([pts[i][0] - dy * r, pts[i][1] + dx * r]);
      R.push([pts[i][0] + dy * r, pts[i][1] - dx * r]);
    }
    const all = L.concat(R.reverse());
    return 'M' + all.map((q) => r1(q[0]) + ' ' + r1(q[1])).join('L') + 'Z';
  }

  function strokeD(s) {
    const p = s.pts;
    if (s.t === 'hl') {
      if (p.length === 1) return 'M' + r1(p[0][0]) + ' ' + r1(p[0][1]) + 'l0.1 0';
      return 'M' + p.map((q) => r1(q[0]) + ' ' + r1(q[1])).join('L');
    }
    return outline(p, s.w);
  }

  const ptsStr = (pts) => pts.map((q) => r1(q[0]) + ',' + r1(q[1]) + ',' + r2(q[2])).join(';');

  function buildStrokeEl(s, forFile) {
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', strokeD(s));
    el.setAttribute('data-t', s.t);
    el.setAttribute('data-c', s.c);
    el.setAttribute('data-w', s.w);
    if (forFile) el.setAttribute('data-p', ptsStr(s.pts));
    const col = forFile ? hexOf(s.c) : (s.c === 'ink' ? 'var(--ink)' : s.c);
    const paint = (prop, val) => { if (forFile) el.setAttribute(prop, val); else el.style[prop] = val; };
    if (s.t === 'hl') {
      paint('fill', 'none');
      paint('stroke', col);
      el.setAttribute('stroke-width', s.w);
      el.setAttribute('stroke-opacity', '0.38');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
    } else {
      paint('fill', col);
      paint('stroke', col);
      el.setAttribute('stroke-width', r2(s.w * 0.4));
      el.setAttribute('stroke-linejoin', 'round');
    }
    return el;
  }

  const toData = (s) => ({ t: s.t, c: s.c, w: s.w, p: ptsStr(s.pts) });
  function fromData(d) {
    const pts = String(d.p || '').split(';').map((x) => x.split(',').map(Number)).filter((a) => a.length >= 2 && !a.some(Number.isNaN)).map((a) => [a[0], a[1], a[2] == null ? 0.5 : a[2]]);
    return { id: nextId(), t: d.t === 'hl' ? 'hl' : 'pen', c: d.c || 'ink', w: Number(d.w) || 4, pts: pts.length ? pts : [[0, 0, 0.5]] };
  }

  function drawingSvg(strokes, W, H) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('data-quaderno', '1');
    strokes.forEach((s) => svg.append(buildStrokeEl(s, true)));
    return new XMLSerializer().serializeToString(svg);
  }
  const emptyDrawing = (W, H) => drawingSvg([], W, H);

  function parseDrawing(text) {
    try {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const rootEl = doc.documentElement;
      if (!rootEl || rootEl.nodeName !== 'svg' || doc.querySelector('parsererror')) return null;
      const vb = (rootEl.getAttribute('viewBox') || '0 0 1000 420').split(/\s+/).map(Number);
      const strokes = [...rootEl.querySelectorAll('path[data-p]')].map((p) => fromData({ t: p.getAttribute('data-t'), c: p.getAttribute('data-c'), w: p.getAttribute('data-w'), p: p.getAttribute('data-p') }));
      return { strokes, W: vb[2] || 1000, H: vb[3] || 420 };
    } catch (e) { return null; }
  }

  function renderStatic(svg, strokes, W, H, overlay) {
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    if (!overlay) svg.style.aspectRatio = W + ' / ' + H;
    svg.replaceChildren(...strokes.map((s) => buildStrokeEl(s, false)));
  }

  /* ---------------------------------------------------------------- editor */
  class Editor {
    constructor(o) {
      this.svg = o.svg;
      this.W = o.W || 1000;
      this.H = o.H || 420;
      this.fixedH = !!o.fixedH;
      this.overlay = !!o.overlay;
      this.strokes = o.strokes || [];
      this.onChange = o.onChange || (() => {});
      this.onSel = o.onSel || (() => {});
      this.scroller = o.scroller || null;
      this.hist = [];
      this.redoS = [];
      this.sel = new Set();
      this.active = false;
      this.mode = null;
      this.pid = null;
      this.cur = null;
      this.ts = null;
      this.layer = document.createElementNS(NS, 'g');
      this.selLayer = document.createElementNS(NS, 'g');
      this.svg.replaceChildren(this.layer, this.selLayer);
      this.setH(this.H);
      this.renderAll();
      this._down = (e) => this.onDown(e);
      this._move = (e) => this.onMove(e);
      this._up = (e) => this.onUp(e);
      this._ctx = (e) => { if (this.active) e.preventDefault(); };
      this.svg.addEventListener('pointerdown', this._down);
      this.svg.addEventListener('pointermove', this._move);
      this.svg.addEventListener('pointerup', this._up);
      this.svg.addEventListener('pointercancel', this._up);
      this.svg.addEventListener('contextmenu', this._ctx);
    }

    /* Safari ignora touch-action sugli elementi SVG: lo imposto anche sui contenitori HTML e blocco lo scorrimento a mano. */
    start() {
      this.active = true;
      this.svg.classList.add('inking');
      const p1 = this.svg.parentElement;
      this.lockEls = [this.svg, p1, p1 && p1.parentElement].filter(Boolean);
      this.lockEls.forEach((el) => { el.style.touchAction = 'none'; });
      this._tp = (e) => { if (this.active && e.cancelable) e.preventDefault(); };
      this.svg.addEventListener('touchstart', this._tp, { passive: false });
      this.svg.addEventListener('touchmove', this._tp, { passive: false });
    }

    lockScroll() {
      if (this.scroller && !this.scrollLocked) {
        this.scrollLocked = true;
        this.prevOverflow = this.scroller.style.overflowY;
        this.scroller.style.overflowY = 'hidden';
      }
    }

    unlockScroll() {
      if (this.scroller && this.scrollLocked) {
        this.scrollLocked = false;
        this.scroller.style.overflowY = this.prevOverflow || '';
      }
    }

    stop() {
      this.active = false;
      clearTimeout(this.timer);
      this.sel.clear();
      this.renderSel();
      this.svg.classList.remove('inking');
      this.unlockScroll();
      if (this.lockEls) this.lockEls.forEach((el) => { el.style.touchAction = ''; });
      this.svg.removeEventListener('touchstart', this._tp);
      this.svg.removeEventListener('touchmove', this._tp);
      this.svg.removeEventListener('pointerdown', this._down);
      this.svg.removeEventListener('pointermove', this._move);
      this.svg.removeEventListener('pointerup', this._up);
      this.svg.removeEventListener('pointercancel', this._up);
      this.svg.removeEventListener('contextmenu', this._ctx);
    }

    setH(h) {
      this.H = h;
      this.svg.setAttribute('viewBox', '0 0 ' + this.W + ' ' + h);
      if (!this.overlay) this.svg.style.aspectRatio = this.W + ' / ' + h;
    }

    maxY() { return this.strokes.reduce((m, s) => Math.max(m, bbox(s)[3] + s.w), 0); }

    trim(minH) {
      if (this.fixedH) return;
      this.setH(Math.max(minH, Math.ceil((this.maxY() + 100) / 20) * 20));
      this.onChange(this.strokes, this.H);
    }

    pt(e) {
      const rc = this.svg.getBoundingClientRect();
      const press = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
      return [((e.clientX - rc.left) * this.W) / (rc.width || 1), ((e.clientY - rc.top) * this.H) / (rc.height || 1), press];
    }

    renderAll() {
      this.layer.replaceChildren(...this.strokes.map((s) => buildStrokeEl(s, false)));
      this.renderSel();
    }

    renderSel() {
      this.selLayer.replaceChildren();
      if (!this.sel.size) return;
      const b = this.selBox();
      if (!b) return;
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', b[0] - 10);
      r.setAttribute('y', b[1] - 10);
      r.setAttribute('width', b[2] - b[0] + 20);
      r.setAttribute('height', b[3] - b[1] + 20);
      r.setAttribute('rx', 10);
      r.setAttribute('fill', 'none');
      r.setAttribute('stroke-width', 2.5);
      r.setAttribute('stroke-dasharray', '8 6');
      r.style.stroke = 'var(--accent)';
      r.style.fill = 'var(--accent)';
      r.style.fillOpacity = '0.07';
      this.selLayer.append(r);
    }

    selBox() {
      let b = null;
      for (const s of this.strokes) {
        if (!this.sel.has(s.id)) continue;
        const sb = bbox(s);
        b = b ? [Math.min(b[0], sb[0]), Math.min(b[1], sb[1]), Math.max(b[2], sb[2]), Math.max(b[3], sb[3])] : sb.slice();
      }
      return b;
    }

    snap() {
      this.hist.push(this.strokes.slice());
      if (this.hist.length > 120) this.hist.shift();
      this.redoS.length = 0;
    }

    undo() {
      if (!this.hist.length) return;
      this.redoS.push(this.strokes);
      this.strokes = this.hist.pop();
      this.clearSel(true);
      this.renderAll();
      this.onChange(this.strokes, this.H);
    }

    redo() {
      if (!this.redoS.length) return;
      this.hist.push(this.strokes);
      this.strokes = this.redoS.pop();
      this.clearSel(true);
      this.renderAll();
      this.onChange(this.strokes, this.H);
    }

    clearSel(silent) {
      if (!this.sel.size) return;
      this.sel.clear();
      this.renderSel();
      if (!silent) this.onSel(false);
      else this.onSel(false);
    }

    deleteSel() {
      if (!this.sel.size) return;
      this.snap();
      this.strokes = this.strokes.filter((s) => !this.sel.has(s.id));
      this.sel.clear();
      this.renderAll();
      this.onSel(false);
      this.onChange(this.strokes, this.H);
    }

    duplicateSel() {
      if (!this.sel.size) return;
      this.snap();
      const copies = [];
      for (const s of this.strokes) {
        if (this.sel.has(s.id)) copies.push({ ...s, id: nextId(), pts: s.pts.map((q) => [q[0] + 28, q[1] + 28, q[2]]) });
      }
      this.strokes = this.strokes.concat(copies);
      this.sel = new Set(copies.map((c) => c.id));
      this.renderAll();
      this.onSel(true);
      this.onChange(this.strokes, this.H);
    }

    /* ----- input ----- */
    onDown(e) {
      if (!this.active) return;
      if (e.pointerType === 'touch') {
        if (this.mode || penBusy() || state.finger === false) {
          if (!penBusy() && !this.mode && this.scroller && !this.ts) {
            this.ts = { id: e.pointerId, y: e.clientY };
            try { this.svg.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
          }
          return;
        }
      }
      if (this.mode) return;
      if (e.pointerType === 'pen') penUntil = Infinity;
      e.preventDefault();
      try { this.svg.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      this.pid = e.pointerId;
      this.lockScroll();
      const p = this.pt(e);
      const tool = state.tool;

      if (tool === 'eraser') {
        this.mode = 'erase';
        this.erased = false;
        this.snap();
        this.eraseAt(p);
      } else if (tool === 'lasso') {
        const b = this.sel.size ? this.selBox() : null;
        if (b && p[0] > b[0] - 14 && p[0] < b[2] + 14 && p[1] > b[1] - 14 && p[1] < b[3] + 14) {
          this.mode = 'move';
          this.moveStart = p;
          this.moveOrig = this.strokes.slice();
          this.snap();
        } else {
          this.clearSel();
          this.mode = 'lasso';
          this.lasso = [p];
          this.lassoEl = document.createElementNS(NS, 'path');
          this.lassoEl.setAttribute('fill', 'none');
          this.lassoEl.setAttribute('stroke-width', 2.5);
          this.lassoEl.setAttribute('stroke-dasharray', '8 6');
          this.lassoEl.style.stroke = 'var(--accent)';
          this.selLayer.append(this.lassoEl);
        }
      } else {
        this.mode = 'draw';
        this.held = false;
        const hl = tool === 'hl';
        this.cur = { id: nextId(), t: hl ? 'hl' : 'pen', c: state.color, w: (hl ? HL : PEN)[state.size], pts: [p] };
        this.liveEl = buildStrokeEl(this.cur, false);
        this.layer.append(this.liveEl);
        this.holdAnchor = p;
        this.armHold();
      }
    }

    armHold() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.mode !== 'draw' || !this.cur || this.held) return;
        const r = recognize(this.cur.pts);
        if (r) {
          this.cur.pts = r;
          this.held = true;
          this.liveEl.setAttribute('d', strokeD(this.cur));
        }
      }, 550);
    }

    onMove(e) {
      if (this.ts && e.pointerId === this.ts.id) {
        const dy = e.clientY - this.ts.y;
        this.ts.y = e.clientY;
        if (this.scroller) this.scroller.scrollTop -= dy;
        return;
      }
      if (!this.mode || e.pointerId !== this.pid) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      const list = evs.length ? evs : [e];
      for (const ev of list) this.step(this.pt(ev));
    }

    step(p) {
      if (this.mode === 'draw') {
        if (this.held) return;
        const last = this.cur.pts[this.cur.pts.length - 1];
        if (dist(p, last) < 1.2) return;
        p[2] = last[2] * 0.5 + p[2] * 0.5;
        this.cur.pts.push(p);
        this.liveEl.setAttribute('d', strokeD(this.cur));
        if (dist(p, this.holdAnchor) > 5) { this.holdAnchor = p; this.armHold(); }
        if (!this.fixedH && p[1] > this.H - 80) this.setH(this.H + 300);
      } else if (this.mode === 'erase') {
        this.eraseAt(p);
      } else if (this.mode === 'lasso') {
        this.lasso.push(p);
        this.lassoEl.setAttribute('d', 'M' + this.lasso.map((q) => r1(q[0]) + ' ' + r1(q[1])).join('L'));
      } else if (this.mode === 'move') {
        const dx = p[0] - this.moveStart[0];
        const dy = p[1] - this.moveStart[1];
        this.strokes = this.moveOrig.map((s) => (this.sel.has(s.id) ? { ...s, pts: s.pts.map((q) => [q[0] + dx, q[1] + dy, q[2]]) } : s));
        this.renderAll();
      }
    }

    eraseAt(p) {
      const kept = this.strokes.filter((s) => !hitStroke(s, p, ERASER));
      if (kept.length !== this.strokes.length) {
        this.strokes = kept;
        this.erased = true;
        this.renderAll();
      }
    }

    onUp(e) {
      if (this.ts && e.pointerId === this.ts.id) { this.ts = null; return; }
      if (e.pointerType === 'pen') penUntil = Date.now() + 700;
      if (!this.mode || e.pointerId !== this.pid) return;
      clearTimeout(this.timer);
      const mode = this.mode;
      const cancelled = e.type === 'pointercancel';
      this.mode = null;
      this.pid = null;
      this.unlockScroll();
      if (cancelled && (mode === 'draw' || mode === 'lasso' || mode === 'move')) {
        /* il browser ha interrotto il gesto (per esempio per scorrere): scarto, niente puntini */
        if (mode === 'draw') { if (this.liveEl) this.liveEl.remove(); this.cur = null; }
        else if (mode === 'lasso') { if (this.lassoEl) this.lassoEl.remove(); this.lassoEl = null; this.lasso = null; }
        else { this.strokes = this.moveOrig; this.hist.pop(); this.renderAll(); }
        return;
      }
      if (mode === 'draw') {
        const s = this.cur;
        this.cur = null;
        if (!this.held && state.tool === 'shape') {
          const r = recognize(s.pts);
          if (r) s.pts = r;
        }
        this.snap();
        this.strokes = this.strokes.concat([s]);
        this.renderAll();
        const need = bbox(s)[3] + 160;
        if (!this.fixedH && need > this.H) this.setH(Math.ceil(need / 60) * 60);
        this.onChange(this.strokes, this.H);
      } else if (mode === 'erase') {
        if (this.erased) this.onChange(this.strokes, this.H);
        else this.hist.pop();
      } else if (mode === 'lasso') {
        const poly = this.lasso;
        this.lassoEl.remove();
        this.lassoEl = null;
        this.lasso = null;
        if (poly.length > 4) {
          const picked = this.strokes.filter((s) => {
            let inside = 0;
            for (const q of s.pts) if (inPolygon(q, poly)) inside++;
            return inside / s.pts.length >= 0.5;
          });
          this.sel = new Set(picked.map((s) => s.id));
        }
        this.renderSel();
        this.onSel(this.sel.size > 0);
      } else if (mode === 'move') {
        this.renderAll();
        this.onChange(this.strokes, this.H);
      }
    }
  }

  const api = { COLORS, PEN, HL, state, saveState, Editor, parseDrawing, drawingSvg, emptyDrawing, renderStatic, toData, fromData, recognize, penBusy, hexOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.INK = api;
})(typeof window !== 'undefined' ? window : globalThis);
