/* Quaderno: note in markdown con disegni, immagini e PDF, sincronizzate su GitHub. Nessuna dipendenza, nessun build. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const SETTINGS_KEY = 'quaderno.settings';
  const OPEN_KEY = 'quaderno.open';
  const LAST_KEY = 'quaderno.last';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAX_BIN = ATT.MAX;
  const MAX_PULL = 40 * 1024 * 1024;
  const MIME = ATT.MIME;
  const SYNC_RE = /(\.(md|svg|png|jpe?g|gif|webp|avif|bmp|pdf)|\.p\d+\.note\.txt)$/i;

  /* ------------------------------------------------------------------ utilità */
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const baseOf = (p) => p.split('/').pop().replace(/\.md$/i, '');
  const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
  const timeStr = (ts) => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const extOf = (p) => ((p.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  const isMd = (n) => !n.kind || n.kind === 'md';

  function cleanPath(p) {
    p = p.trim().replace(/\\/g, '/').replace(/[:*?"<>|]/g, '-');
    return p.split('/').map((s) => s.trim()).filter((s) => s && s !== '.' && s !== '..').join('/');
  }
  function normPath(p) {
    p = cleanPath(p);
    if (!p) return '';
    return /\.md$/i.test(p) ? p : p + '.md';
  }

  function icon(id, cls) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

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

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
  }

  /* ------------------------------------------------------------------ archivio locale (IndexedDB) */
  const idb = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('quaderno', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('notes', { keyPath: 'path' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('notes', mode);
        const rq = fn(t.objectStore('notes'));
        t.oncomplete = () => res(rq && rq.result);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    };
    return {
      all: () => tx('readonly', (s) => s.getAll()),
      put: (n) => tx('readwrite', (s) => s.put(n)).catch(() => {}),
      del: (p) => tx('readwrite', (s) => s.delete(p)).catch(() => {}),
    };
  })();

  /* ------------------------------------------------------------------ stato */
  /* "notes" contiene TUTTI i file: note (kind md), disegni e annotazioni (kind text, .svg), immagini e PDF (kind bin). */
  const notes = new Map();
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { settings = {}; }
  let current = null;
  let mode = 'preview';
  try { if (localStorage.getItem('quaderno.mode') === 'split') mode = 'split'; } catch (e) { /* ok */ }
  let query = '';
  let tagFilter = null;
  let open = new Set();
  try { open = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); } catch (e) { open = new Set(); }
  const tagCache = new WeakMap();

  const isPageNote = (p) => /\.pdf\.p\d+(?: \([^)]*\))?\.md$/i.test(p);
  const live = () => [...notes.values()].filter((n) => !n.deleted && isMd(n) && !isPageNote(n.path)).sort((a, b) => a.path.localeCompare(b.path, 'it', { numeric: true }));
  const hasCfg = () => !!(settings.owner && settings.repo && settings.token);

  function persist(n) {
    n.updated = Date.now();
    return idb.put(n);
  }

  function tagsOf(n) {
    let c = tagCache.get(n);
    if (!c || c.content !== n.content) { c = { content: n.content, tags: MD.extractTags(n.content) }; tagCache.set(n, c); }
    return c.tags;
  }

  function wikiIndex() {
    const idx = new Map();
    for (const n of live()) {
      const full = n.path.replace(/\.md$/i, '').toLowerCase();
      if (!idx.has(full)) idx.set(full, n.path);
      const base = baseOf(n.path).toLowerCase();
      if (!idx.has(base)) idx.set(base, n.path);
    }
    return idx;
  }
  const resolveWiki = (t, idx) => (idx || wikiIndex()).get(t.split('#')[0].trim().replace(/\.md$/i, '').replace(/\\/g, '/').toLowerCase()) || null;

  /* ------------------------------------------------------------------ operazioni sui file */
  function createNote(path, content) {
    const old = notes.get(path);
    const n = { path, kind: 'md', content, sha: old && old.deleted ? old.sha : null, dirty: true, deleted: false, updated: Date.now() };
    notes.set(path, n);
    persist(n);
    return n;
  }

  function removeNote(path) {
    const n = notes.get(path);
    if (!n) return;
    if (n.sha) { n.deleted = true; n.dirty = false; persist(n); }
    else { notes.delete(path); idb.del(path); }
  }

  function newNote(prefill) {
    const startDir = current ? dirOf(current) : '';
    const raw = prompt('Nome della nota (puoi usare cartelle, per esempio Progetti/Idea)', prefill != null ? prefill : startDir);
    if (raw == null) return;
    const path = normPath(raw);
    if (!path) return;
    if (notes.has(path) && !notes.get(path).deleted) { openNote(path); return; }
    createNote(path, '# ' + baseOf(path) + '\n\n');
    openNote(path, 'edit');
    scheduleSync();
  }

  function renameNote() {
    const n = current && notes.get(current);
    if (!n) return;
    const raw = prompt('Nuovo nome o percorso', n.path.replace(/\.md$/i, ''));
    if (raw == null) return;
    const path = normPath(raw);
    if (!path || path === n.path) return;
    if (notes.has(path) && !notes.get(path).deleted) { toast('Esiste già una nota con quel nome'); return; }
    ATT.stopInk();
    let content = n.content;
    const oldA = ATT.assetsDir(n.path);
    const newA = ATT.assetsDir(path);
    if (oldA !== newA) {
      for (const f of [...notes.values()]) {
        if (f.deleted || !f.path.startsWith(oldA)) continue;
        const np = newA + f.path.slice(oldA.length);
        const prev = notes.get(np);
        const moved = { ...f, path: np, sha: prev && prev.deleted ? prev.sha : null, dirty: true, deleted: false };
        notes.set(np, moved);
        persist(moved);
        removeNote(f.path);
      }
      content = content.split(ATT.refDir(n.path)).join(ATT.refDir(path));
    }
    createNote(path, content);
    removeNote(n.path);
    openNote(path);
    scheduleSync();
  }

  function deleteNote() {
    const n = current && notes.get(current);
    if (!n) return;
    if (!confirm('Eliminare "' + baseOf(n.path) + '" con i suoi disegni e allegati? Verrà eliminata anche dal repository GitHub alla prossima sincronizzazione.')) return;
    ATT.stopInk(true);
    const dir = ATT.assetsDir(n.path);
    for (const f of [...notes.values()]) if (!f.deleted && f.path.startsWith(dir)) removeNote(f.path);
    removeNote(n.path);
    current = null;
    localStorage.removeItem(LAST_KEY);
    renderMain();
    renderSidebar();
    updateStatus();
    scheduleSync();
  }

  /* Ponte verso attach.js */
  const Q = {
    files: notes,
    get scroller() { return effMode() === 'split' ? $('#preview') : $('#noteView'); },
    toast,
    note: () => (current && notes.get(current)) || null,
    getFile: (p) => { const n = notes.get(p); return n && !n.deleted ? n : null; },
    writeText(path, text) {
      let n = notes.get(path);
      if (n) { n.deleted = false; n.kind = 'text'; n.content = text; delete n.data; }
      else n = { path, kind: 'text', content: text, sha: null, deleted: false };
      n.dirty = true;
      notes.set(path, n);
      persist(n);
      updateStatus();
      scheduleSync();
    },
    writeBin(path, data, mime) {
      let n = notes.get(path);
      if (n) { n.deleted = false; n.kind = 'bin'; n.data = data; n.mime = mime; delete n.content; }
      else n = { path, kind: 'bin', data, mime, sha: null, deleted: false };
      n.dirty = true;
      notes.set(path, n);
      persist(n);
      updateStatus();
      scheduleSync();
    },
    writeMd(path, content) {
      let n = notes.get(path);
      if (n) { n.deleted = false; n.kind = 'md'; n.content = content; delete n.data; }
      else n = { path, kind: 'md', content, sha: null, deleted: false };
      n.dirty = true;
      notes.set(path, n);
      persist(n);
      updateStatus();
      scheduleSync();
    },
    openWiki(target) {
      const p = resolveWiki(target, wikiIndex());
      if (!p) { toast('Nota non trovata: ' + target); return; }
      ATT.closeReader();
      openNote(p);
    },
    removeFile(path) { removeNote(path); updateStatus(); scheduleSync(); },
    removeLinesContaining(sub, path) {
      const n = path ? notes.get(path) : Q.note();
      if (!n) return;
      const lines = n.content.split('\n').filter((l) => !(l.includes('![') && l.includes(sub)));
      n.content = lines.join('\n');
      n.dirty = true;
      persist(n);
      updateStatus();
      scheduleSync();
    },
    insertBlock(md) {
      const n = Q.note();
      if (!n) return;
      if (mode !== 'preview') {
        const ta = $('#editor');
        const s = ta.selectionStart;
        const before = ta.value.slice(0, s);
        const after = ta.value.slice(ta.selectionEnd);
        const pre = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
        n.content = before + pre + md + '\n\n' + after;
      } else {
        n.content = n.content.replace(/\s*$/, '') + '\n\n' + md + '\n';
      }
      n.dirty = true;
      persist(n);
      updateStatus();
      scheduleSync();
      if (mode === 'edit') mode = 'preview';
      renderMain();
      renderSidebar();
    },
  };
  ATT.init(Q);
  $('#appVer').textContent = 'v8 (cursore sempre in vista)';

  /* ------------------------------------------------------------------ barra laterale */
  function buildTree(list) {
    const root = { dirs: new Map(), files: [] };
    for (const n of list) {
      const parts = n.path.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const name = parts[i];
        if (!node.dirs.has(name)) node.dirs.set(name, { path: parts.slice(0, i + 1).join('/'), dirs: new Map(), files: [] });
        node = node.dirs.get(name);
      }
      node.files.push(n);
    }
    return root;
  }
  const countFiles = (node) => node.files.length + [...node.dirs.values()].reduce((a, d) => a + countFiles(d), 0);

  function fileRow(n, depth) {
    const b = h('button', { class: 'row' + (n.path === current ? ' active' : '') + (n.dirty ? ' dirty' : ''), type: 'button', style: 'padding-left:' + (8 + depth * 16) + 'px', on: { click: () => openNote(n.path) } },
      icon('i-file'), h('span', { class: 'name' }, baseOf(n.path)));
    if (n.path === current) b.setAttribute('aria-current', 'true');
    return b;
  }

  function renderNode(node, depth, parent) {
    [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0], 'it')).forEach(([name, d]) => {
      const isOpen = open.has(d.path);
      parent.append(h('button', {
        class: 'row folder' + (isOpen ? ' open' : ''), type: 'button', 'aria-expanded': String(isOpen), style: 'padding-left:' + (8 + depth * 16) + 'px',
        on: { click: () => { if (open.has(d.path)) open.delete(d.path); else open.add(d.path); localStorage.setItem(OPEN_KEY, JSON.stringify([...open])); renderSidebar(); } },
      }, icon('i-chevron', 'chev'), icon('i-folder'), h('span', { class: 'name' }, name), h('span', { class: 'count' }, String(countFiles(d)))));
      if (isOpen) renderNode(d, depth + 1, parent);
    });
    node.files.forEach((n) => parent.append(fileRow(n, depth)));
  }

  function snippet(text, q) {
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return null;
    const a = Math.max(0, i - 35);
    const pre = text.slice(a, i).replace(/\s+/g, ' ');
    const hit = text.slice(i, i + q.length).replace(/\s+/g, ' ');
    const post = text.slice(i + q.length, i + q.length + 70).replace(/\s+/g, ' ');
    return h('span', { class: 'snip' }, (a > 0 ? '…' : '') + pre, h('mark', {}, hit), post);
  }

  function renderSidebar() {
    const box = $('#tree');
    box.replaceChildren();
    const list = live();
    const q = query.trim().toLowerCase();

    if (q) {
      const res = [];
      for (const n of list) {
        const inPath = n.path.toLowerCase().includes(q);
        const inText = n.content.toLowerCase().includes(q);
        if (inPath || inText) res.push(n);
        if (res.length >= 60) break;
      }
      if (!res.length) box.append(h('div', { class: 'list-note' }, 'Nessun risultato.'));
      res.forEach((n) => {
        box.append(h('button', { class: 'row hit' + (n.path === current ? ' active' : ''), type: 'button', on: { click: () => { openNote(n.path); } } },
          h('span', { class: 'name' }, n.path.replace(/\.md$/i, '')), snippet(n.content, q)));
      });
    } else if (tagFilter) {
      box.append(h('button', { class: 'row', type: 'button', on: { click: () => setTag(null) } }, h('span', { class: 'name' }, '← Tutte le note, tag #' + tagFilter)));
      const res = list.filter((n) => tagsOf(n).includes(tagFilter));
      if (!res.length) box.append(h('div', { class: 'list-note' }, 'Nessuna nota con questo tag.'));
      res.forEach((n) => box.append(fileRow(n, 0)));
    } else if (!list.length) {
      box.append(h('div', { class: 'list-note' }, 'Ancora nessuna nota. Creane una con il pulsante +, oppure importa i tuoi file .md.'));
    } else {
      if (current) {
        const parts = current.split('/');
        for (let i = 1; i < parts.length; i++) open.add(parts.slice(0, i).join('/'));
      }
      renderNode(buildTree(list), 0, box);
    }

    const counts = new Map();
    list.forEach((n) => tagsOf(n).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    const tags = $('#tags');
    tags.replaceChildren();
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it')).forEach(([t, c]) => {
      tags.append(h('button', { class: 'chip' + (tagFilter === t ? ' on' : ''), type: 'button', 'aria-pressed': String(tagFilter === t), on: { click: () => setTag(tagFilter === t ? null : t) } }, '#' + t + ' ' + c));
    });
    $('#tagsBox').hidden = counts.size === 0;
  }

  function setTag(t) {
    tagFilter = t;
    query = '';
    $('#search').value = '';
    renderSidebar();
  }

  /* ------------------------------------------------------------------ area principale */
  function openNote(path, newMode) {
    ATT.stopInk();
    const n = notes.get(path);
    current = n && !n.deleted && isMd(n) ? path : null;
    mode = newMode || (mode === 'split' ? 'split' : 'preview');
    if (current) localStorage.setItem(LAST_KEY, current);
    query = '';
    $('#search').value = '';
    renderMain();
    renderSidebar();
    closeDrawer();
    if (current && mode === 'edit') focusEditor(true);
  }

  function focusEditor(toEnd) {
    const ed = $('#editor');
    ed.focus({ preventScroll: true });
    if (toEnd) { ed.setSelectionRange(ed.value.length, ed.value.length); ed.scrollTop = ed.scrollHeight; }
  }

  const narrowMq = window.matchMedia('(max-width: 699px)');
  const effMode = () => (mode === 'split' && narrowMq.matches ? 'edit' : mode);

  function setMode(m) {
    if (!current) return;
    ATT.stopInk();
    mode = m;
    try { localStorage.setItem('quaderno.mode', m); } catch (e) { /* ok */ }
    renderMain();
    if (m !== 'preview') focusEditor(false);
  }
  narrowMq.addEventListener('change', () => { if (current && mode === 'split') { ATT.stopInk(); renderMain(); } });

  function renderMain() {
    const n = current && notes.get(current);
    const has = !!(n && !n.deleted);
    $('#empty').hidden = has;
    $('#noteView').hidden = !has;
    $('#modeSwitch').hidden = !has;
    $('#btnNoteMenu').hidden = !has;
    const em = effMode();
    $('#toolbar').hidden = !(has && em !== 'preview');
    $('#addRow').hidden = !(has && em === 'preview');
    $('#noteView').classList.toggle('split', has && em === 'split');
    ensureSplitter();
    const crumbs = $('#crumbs');
    crumbs.replaceChildren();
    if (!has) return;
    const parts = n.path.replace(/\.md$/i, '').split('/');
    crumbs.append(parts.slice(0, -1).join(' / ') + (parts.length > 1 ? ' / ' : ''), h('strong', { style: 'color:var(--text);font-weight:500' }, parts[parts.length - 1]));
    [['#modePreview', 'preview'], ['#modeEdit', 'edit'], ['#modeSplit', 'split']].forEach(([sel, m]) => {
      $(sel).classList.toggle('on', em === m);
      $(sel).setAttribute('aria-pressed', String(em === m));
    });
    const ed = $('#editor');
    const pv = $('#preview');
    $('#edwrap').hidden = em === 'preview';
    pv.hidden = em === 'edit';
    if (em !== 'preview') { if (ed.value !== n.content) ed.value = n.content; paintHl(); }
    if (em === 'edit') {
      $('#backlinks').hidden = true;
    } else {
      renderPreview(n);
      if (em === 'preview') renderBacklinks(n);
    }
  }

  function renderPreview(n) {
    const pv = $('#preview');
    if (!n.content.trim()) { pv.innerHTML = '<p class="img-note">Nota vuota. Passa a "Markdown" per scrivere.</p>'; return; }
    pv.innerHTML = MD.render(n.content);
    const idx = wikiIndex();
    pv.querySelectorAll('a.wiki').forEach((a) => { if (!resolveWiki(a.dataset.wiki, idx)) a.classList.add('missing'); });
    ATT.hydrate(pv, n.path);
  }

  function renderBacklinks(n) {
    const box = $('#backlinks');
    const idx = wikiIndex();
    const from = live().filter((m) => m.path !== n.path && MD.extractWikiLinks(m.content).some((t) => resolveWiki(t, idx) === n.path));
    box.replaceChildren();
    box.hidden = from.length === 0;
    if (!from.length) return;
    box.append(h('div', { class: 'section-label' }, 'Collegata da'),
      h('div', { class: 'links' }, from.map((m) => h('button', { type: 'button', on: { click: () => openNote(m.path) } }, baseOf(m.path)))));
  }

  /* modifiche dall'editor */
  const afterEdit = debounce(() => { renderSidebar(); updateStatus(); scheduleSync(); }, 500);
  HL.attach($('#editor'));
  const paintHl = () => { $('#hl').innerHTML = HL.html($('#editor').value); $('#hl').scrollTop = $('#editor').scrollTop; };
  $('#editor').addEventListener('scroll', () => { $('#hl').scrollTop = $('#editor').scrollTop; });
  $('#editor').addEventListener('input', () => {
    const n = current && notes.get(current);
    if (!n) return;
    paintHl();
    n.content = $('#editor').value;
    n.dirty = true;
    persist(n);
    updateStatus();
    afterEdit();
    if (effMode() === 'split') livePreview();
  });

  /* vista affiancata: anteprima aggiornata mentre scrivi, scorrimento sincronizzato e divisore */
  const livePreview = debounce(() => {
    const n = current && notes.get(current);
    if (!n || effMode() !== 'split' || ATT.inking()) return;
    const pv = $('#preview');
    const top = pv.scrollTop;
    renderPreview(n);
    pv.scrollTop = top;
  }, 250);

  let syncLock = 0;
  const follow = (from, to) => {
    if (effMode() !== 'split' || Date.now() < syncLock) return;
    const max = from.scrollHeight - from.clientHeight;
    const r = max > 0 ? from.scrollTop / max : 0;
    syncLock = Date.now() + 80;
    to.scrollTop = r * (to.scrollHeight - to.clientHeight);
  };
  $('#editor').addEventListener('scroll', () => follow($('#editor'), $('#preview')));
  $('#preview').addEventListener('scroll', () => { if (!ATT.inking()) follow($('#preview'), $('#editor')); });

  function setSplit(pct) {
    pct = Math.max(25, Math.min(75, pct));
    $('#noteView').style.setProperty('--split', pct + '%');
    try { localStorage.setItem('quaderno.split', String(Math.round(pct))); } catch (e) { /* ok */ }
  }
  function ensureSplitter() {
    let sp = $('#splitter');
    if (!sp) {
      sp = h('div', { id: 'splitter', class: 'splitter', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Trascina per ridimensionare', tabindex: '0' }, h('i', {}, h('b'), h('b'), h('b')));
      $('#edwrap').after(sp);
      let drag = false;
      sp.addEventListener('pointerdown', (e) => { drag = true; sp.setPointerCapture(e.pointerId); e.preventDefault(); });
      sp.addEventListener('pointerup', () => { drag = false; });
      sp.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const r = $('#noteView').getBoundingClientRect();
        setSplit(((e.clientX - r.left) / r.width) * 100);
      });
      sp.addEventListener('keydown', (e) => {
        const cur = parseFloat(($('#noteView').style.getPropertyValue('--split') || '50')) || 50;
        if (e.key === 'ArrowLeft') setSplit(cur - 3);
        if (e.key === 'ArrowRight') setSplit(cur + 3);
      });
      const saved = Number(localStorage.getItem('quaderno.split'));
      if (saved) setSplit(saved);
    }
    sp.hidden = effMode() !== 'split';
  }

  /* clic nell'anteprima: link tra note, tag, checklist */
  $('#preview').addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.classList.contains('wiki')) {
      e.preventDefault();
      const target = a.dataset.wiki;
      const p = resolveWiki(target);
      if (p) { openNote(p); return; }
      const name = target.split('#')[0].trim();
      if (name && confirm('La nota "' + name + '" non esiste. Crearla?')) {
        const path = normPath(name);
        createNote(path, '# ' + baseOf(path) + '\n\n');
        openNote(path, 'edit');
        scheduleSync();
      }
    } else if (a.classList.contains('tag')) {
      e.preventDefault();
      setTag(a.dataset.tag);
      openDrawer();
    }
  });

  $('#preview').addEventListener('change', (e) => {
    const cb = e.target;
    const n = current && notes.get(current);
    if (!n || !cb.matches('input[type=checkbox][data-line]')) return;
    const lines = n.content.replace(/\r\n?/g, '\n').split('\n');
    const i = Number(cb.dataset.line);
    if (lines[i] === undefined) return;
    lines[i] = lines[i].replace(/\[( |x|X)\]/, cb.checked ? '[x]' : '[ ]');
    n.content = lines.join('\n');
    n.dirty = true;
    persist(n);
    updateStatus();
    scheduleSync();
    if (ATT.inking()) return;
    renderPreview(n);
  });

  /* barra di formattazione */
  function applyFmt(kind) {
    if (kind === 'draw') { ATT.addDrawing(); return; }
    if (kind === 'attach') { ATT.pickAttachment(); return; }
    ATT.fmt($('#editor'), kind);
  }
  $('#toolbar').addEventListener('mousedown', (e) => e.preventDefault());
  $('#toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-fmt]');
    if (b) applyFmt(b.dataset.fmt);
  });
  $('#addDraw').addEventListener('click', () => ATT.addDrawing());
  $('#addFile').addEventListener('click', () => ATT.pickAttachment());

  /* ------------------------------------------------------------------ stato di sincronizzazione */
  let syncing = false;
  let syncAgain = false;
  let lastError = '';

  function setStatus(state, text) {
    const b = $('#syncStatus');
    b.dataset.state = state;
    $('#syncText').textContent = text;
    const tb = $('#btnSync');
    tb.dataset.state = state;
    tb.setAttribute('aria-label', 'Sincronizza ora. ' + text);
    tb.title = text;
    tb.querySelector('use').setAttribute('href', state === 'ok' ? '#i-cloudok' : '#i-cloud');
  }

  function updateStatus() {
    if (syncing) return;
    const pending = [...notes.values()].filter((n) => n.dirty || n.deleted).length;
    if (!hasCfg()) { setStatus('off', 'Collega GitHub per sincronizzare'); return; }
    if (lastError) { setStatus('err', lastError); return; }
    if (!navigator.onLine) { setStatus('err', 'Offline' + (pending ? ' · ' + pending + ' da inviare' : '')); return; }
    if (pending) { setStatus('pending', pending === 1 ? '1 modifica da inviare' : pending + ' modifiche da inviare'); return; }
    setStatus('ok', settings.lastSync ? 'Sincronizzato alle ' + timeStr(settings.lastSync) : 'Sincronizzato');
  }

  const scheduleSync = debounce(() => { if (hasCfg() && navigator.onLine) sync(false); }, 6000);

  /* ------------------------------------------------------------------ GitHub */
  const repoBase = () => '/repos/' + encodeURIComponent(settings.owner) + '/' + encodeURIComponent(settings.repo);

  async function gh(path, opts) {
    opts = opts || {};
    const headers = { Authorization: 'Bearer ' + settings.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch('https://api.github.com' + path, { method: opts.method || 'GET', headers, body: opts.body, cache: 'no-store' });
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).message || ''; } catch (e) { /* nessun corpo */ }
      const err = new Error(msg || 'Errore HTTP ' + r.status);
      err.status = r.status;
      throw err;
    }
    return r.status === 204 ? null : r.json();
  }

  const bytesToB64 = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const toB64 = (s) => bytesToB64(new TextEncoder().encode(s));
  const b64ToBytes = (b) => {
    const bin = atob(b.replace(/\s/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const dec = new TextDecoder();

  const payloadB64 = (n) => (n.kind === 'bin' ? bytesToB64(new Uint8Array(n.data)) : toB64(n.content));

  async function pool(items, limit, fn) {
    let i = 0;
    const worker = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  function friendly(e) {
    if (e.status === 401) return 'Token non valido o scaduto';
    if (e.status === 403 && /rate limit/i.test(e.message)) return 'Troppe richieste a GitHub, riprova tra poco';
    if (e.status === 403) return 'Permesso negato: il token deve avere Contents in lettura e scrittura';
    if (e.status === 404) return 'Repository o branch non trovato: controlla nome, branch e permessi del token';
    if (e.status === 422) return 'GitHub ha rifiutato un file: ' + e.message;
    if (e instanceof TypeError) return 'Impossibile raggiungere GitHub';
    return e.message || 'Errore di sincronizzazione';
  }

  function recordFromRemote(path, bytes) {
    const base = { path, deleted: false, dirty: false, updated: Date.now() };
    if (/\.md$/i.test(path)) return { ...base, kind: 'md', content: dec.decode(bytes) };
    if (/\.p\d+\.note\.txt$/i.test(path)) return { ...base, kind: 'text', content: dec.decode(bytes) };
    if (/\.svg$/i.test(path)) {
      const t = dec.decode(bytes);
      if (t.includes('data-quaderno')) return { ...base, kind: 'text', content: t };
      return { ...base, kind: 'bin', data: bytes.buffer, mime: MIME.svg };
    }
    return { ...base, kind: 'bin', data: bytes.buffer, mime: MIME[extOf(path)] || 'application/octet-stream' };
  }

  async function sync(manual) {
    if (!hasCfg()) { if (manual) openSettings(); return; }
    if (!navigator.onLine) { updateStatus(); if (manual) toast('Sei offline: le modifiche restano sul dispositivo'); return; }
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    lastError = '';
    setStatus('busy', 'Sincronizzazione…');
    const branch = settings.branch || 'main';
    const base = repoBase();
    const changed = new Set();
    let pushed = 0;
    let pulled = 0;
    let removed = 0;
    try {
      /* 1. stato remoto */
      const remote = new Map();
      try {
        const t = await gh(base + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1');
        if (t.truncated) throw new Error('Repository troppo grande per la sincronizzazione semplice');
        t.tree.forEach((x) => { if (x.type === 'blob' && SYNC_RE.test(x.path)) remote.set(x.path, { sha: x.sha, size: x.size || 0 }); });
      } catch (e) {
        if (e.status === 409) { /* repository vuoto: va bene */ }
        else if (e.status === 404) {
          await gh(base);
          throw new Error('Branch "' + branch + '" non trovato nel repository');
        } else throw e;
      }

      /* 2. invio delle modifiche locali */
      const todo = [...notes.values()].filter((n) => n.deleted || n.dirty);
      let k = 0;
      for (const n of todo) {
        k++;
        if (todo.length > 3) setStatus('busy', 'Invio ' + k + '/' + todo.length);
        const r = remote.get(n.path);
        if (n.deleted) {
          if (r) {
            await gh(base + '/contents/' + encPath(n.path), { method: 'DELETE', body: JSON.stringify({ message: 'Elimina ' + n.path, sha: r.sha, branch }) });
            removed++;
          }
          notes.delete(n.path);
          await idb.del(n.path);
          changed.add(n.path);
          continue;
        }
        const rsha = r && r.sha;
        if (rsha && rsha !== n.sha && isMd(n)) {
          /* la nota è cambiata anche su GitHub: tengo una copia della versione remota */
          const blob = await gh(base + '/git/blobs/' + rsha);
          const rc = dec.decode(b64ToBytes(blob.content));
          if (rc === n.content) { n.sha = rsha; n.dirty = false; await idb.put(n); continue; }
          let cp = n.path.replace(/\.md$/i, '') + ' (versione remota).md';
          for (let i = 2; notes.has(cp); i++) cp = n.path.replace(/\.md$/i, '') + ' (versione remota ' + i + ').md';
          createNote(cp, rc);
          syncAgain = true;
          toast('Conflitto su "' + baseOf(n.path) + '": salvata anche la versione remota');
        }
        if (n.kind === 'bin' && n.data.byteLength > MAX_BIN) { n.dirty = false; await idb.put(n); toast('"' + n.path.split('/').pop() + '" supera i 25 MB e non viene sincronizzato'); continue; }
        const sentContent = n.content;
        const sentData = n.data;
        const body = { message: (rsha ? 'Aggiorna ' : 'Crea ') + n.path, content: payloadB64(n), branch };
        if (rsha) body.sha = rsha;
        const res = await gh(base + '/contents/' + encPath(n.path), { method: 'PUT', body: JSON.stringify(body) });
        n.sha = res.content.sha;
        remote.set(n.path, { sha: n.sha, size: 0 });
        if (n.content === sentContent && n.data === sentData) n.dirty = false;
        await idb.put(n);
        pushed++;
      }

      /* 3. scarico delle novità remote */
      const toPull = [];
      for (const [path, r] of remote) {
        const n = notes.get(path);
        if (n && (n.dirty || n.sha === r.sha)) continue;
        if (r.size > MAX_PULL) continue;
        toPull.push([path, r.sha]);
      }
      let done = 0;
      await pool(toPull, 5, async ([path, sha]) => {
        const blob = await gh(base + '/git/blobs/' + sha);
        const cur = notes.get(path);
        if (cur && cur.dirty) return;
        const rec = recordFromRemote(path, b64ToBytes(blob.content));
        rec.sha = sha;
        notes.set(path, rec);
        await idb.put(rec);
        changed.add(path);
        pulled++;
        done++;
        if (toPull.length > 4) setStatus('busy', 'Scarico file ' + done + '/' + toPull.length);
      });

      /* 4. file cancellati su GitHub */
      for (const n of [...notes.values()]) {
        if (!n.deleted && !n.dirty && n.sha && !remote.has(n.path)) {
          notes.delete(n.path);
          await idb.del(n.path);
          changed.add(n.path);
          if (current === n.path) current = null;
        }
      }

      settings.lastSync = Date.now();
      saveSettings();
      if (manual) toast(pushed || pulled || removed ? 'Sincronizzato: ' + pushed + ' inviati, ' + pulled + ' scaricati' : 'Tutto già aggiornato');
    } catch (e) {
      lastError = friendly(e);
      if (manual) toast(lastError);
    } finally {
      syncing = false;
      refreshAfterSync(changed);
      updateStatus();
      if (syncAgain) { syncAgain = false; setTimeout(() => sync(false), 400); }
    }
  }

  function refreshAfterSync(changed) {
    const cur = current && notes.get(current);
    if (current && (!cur || cur.deleted)) current = null;
    renderSidebar();
    const n = current && notes.get(current);
    if (!n) { ATT.stopInk(true); renderMain(); return; }
    if (effMode() !== 'edit') {
      if (ATT.inking()) return;
      const dir = ATT.assetsDir(current);
      if (effMode() === 'split' && !n.dirty && $('#editor').value !== n.content) { $('#editor').value = n.content; paintHl(); }
      if ([...changed].some((p) => p === current || p.startsWith(dir) || !/\.md$/i.test(p))) renderMain();
    } else if (!n.dirty && $('#editor').value !== n.content) { $('#editor').value = n.content; paintHl(); }
  }

  /* ------------------------------------------------------------------ impostazioni */
  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

  function openSettings() {
    $('#setOwner').value = settings.owner || '';
    $('#setRepo').value = settings.repo || '';
    $('#setBranch').value = settings.branch || 'main';
    $('#setToken').value = settings.token || '';
    $('#settingsMsg').textContent = lastError || '';
    $('#setClear').hidden = !hasCfg();
    $('#settingsDlg').showModal();
  }

  function resetRemoteState() {
    for (const n of notes.values()) {
      if (n.deleted) { notes.delete(n.path); idb.del(n.path); continue; }
      n.sha = null;
      n.dirty = true;
      idb.put(n);
    }
  }

  $('#settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    let owner = $('#setOwner').value.trim();
    let repo = $('#setRepo').value.trim();
    if (repo.includes('/')) { [owner, repo] = repo.split('/'); }
    owner = owner.replace(/^https?:\/\/github\.com\//i, '');
    const branch = $('#setBranch').value.trim() || 'main';
    const token = $('#setToken').value.trim();
    if (!owner || !repo || !token) { $('#settingsMsg').textContent = 'Compila utente, repository e token.'; return; }
    const changedRepo = owner !== settings.owner || repo !== settings.repo || branch !== settings.branch;
    if (changedRepo && settings.owner) resetRemoteState();
    settings = { owner, repo, branch, token, lastSync: changedRepo ? 0 : settings.lastSync };
    saveSettings();
    lastError = '';
    $('#settingsDlg').close();
    sync(true);
  });
  $('#setCancel').addEventListener('click', () => $('#settingsDlg').close());
  $('#setClear').addEventListener('click', () => {
    if (!confirm('Scollegare GitHub da questo dispositivo? Le note restano qui, il token viene rimosso.')) return;
    resetRemoteState();
    settings = {};
    saveSettings();
    lastError = '';
    $('#settingsDlg').close();
    renderSidebar();
    updateStatus();
  });

  /* ------------------------------------------------------------------ importazione */
  async function importFiles(fileList, fromFolder) {
    const items = [];
    let skipped = 0;
    for (const f of [...fileList]) {
      let p = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
      if (fromFolder && f.webkitRelativePath) p = p.split('/').slice(1).join('/');
      if (!p || p.split('/').some((s) => s.startsWith('.'))) continue;
      const ext = extOf(p);
      if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
        const path = normPath(p.replace(/\.(markdown|txt)$/i, '.md'));
        if (path) items.push({ kind: 'md', path, text: await f.text() });
      } else if (MIME[ext]) {
        if (f.size > MAX_BIN) { skipped++; continue; }
        const path = cleanPath(p);
        if (!path) continue;
        if (ext === 'svg') {
          const t = await f.text();
          if (t.includes('data-quaderno')) items.push({ kind: 'text', path, text: t });
          else items.push({ kind: 'bin', path, data: new TextEncoder().encode(t).buffer, mime: MIME.svg });
        } else {
          items.push({ kind: 'bin', path, data: await f.arrayBuffer(), mime: MIME[ext] });
        }
      }
    }
    if (!items.length) { toast('Nessun file .md, immagine o PDF trovato'); return; }
    const clash = items.filter((it) => { const n = notes.get(it.path); return it.kind === 'md' && n && !n.deleted && n.content !== it.text; });
    const overwrite = clash.length ? confirm(clash.length + ' note esistono già con contenuto diverso. Sovrascriverle? (Annulla per saltarle)') : false;
    let nNotes = 0;
    let nFiles = 0;
    for (const it of items) {
      const n = notes.get(it.path);
      const exists = n && !n.deleted;
      if (it.kind === 'md') {
        if (exists) {
          if (n.content === it.text || !overwrite) continue;
          n.content = it.text;
          n.dirty = true;
          persist(n);
        } else createNote(it.path, it.text);
        nNotes++;
      } else if (it.kind === 'text') {
        if (exists && n.content === it.text) continue;
        Q.writeText(it.path, it.text);
        nFiles++;
      } else {
        if (exists && n.data && n.data.byteLength === it.data.byteLength) continue;
        Q.writeBin(it.path, it.data, it.mime);
        nFiles++;
      }
    }
    toast('Importate ' + nNotes + ' note e ' + nFiles + ' allegati' + (skipped ? ' (' + skipped + ' oltre 25 MB saltati)' : ''));
    renderSidebar();
    renderMain();
    updateStatus();
    scheduleSync();
  }

  /* ------------------------------------------------------------------ barra laterale (fissa, a scomparsa o cassetto) e tema */
  const isMobile = () => window.matchMedia('(max-width: 800px)').matches;
  const SIDE_KEY = 'quaderno.side';
  let sideHidden = false;
  try {
    const v = localStorage.getItem(SIDE_KEY);
    sideHidden = v ? v === 'hidden' : window.innerWidth < 1000;
  } catch (e) { sideHidden = false; }

  function applySide() {
    const hide = sideHidden && !isMobile();
    document.body.classList.toggle('side-hidden', hide);
    if (!hide && !isMobile()) { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; }
    syncSideUi();
  }
  function syncSideUi() {
    const open = $('#sidebar').classList.contains('open');
    $('#sideHandle').hidden = !(document.body.classList.contains('side-hidden') && !open);
    const pin = $('#btnPin');
    const hiddenMode = document.body.classList.contains('side-hidden');
    pin.setAttribute('aria-label', hiddenMode ? 'Fissa la barra laterale' : 'Nascondi la barra laterale');
    pin.title = pin.getAttribute('aria-label');
    pin.querySelector('use').setAttribute('href', hiddenMode ? '#i-pin' : '#i-hide');
  }
  function openDrawer() {
    if (!isMobile() && !document.body.classList.contains('side-hidden')) return;
    $('#sidebar').classList.add('open');
    $('#scrim').hidden = false;
    syncSideUi();
  }
  function closeDrawer() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; syncSideUi(); }
  function setSideHidden(v) {
    sideHidden = v;
    try { localStorage.setItem(SIDE_KEY, v ? 'hidden' : 'shown'); } catch (e) { /* ok */ }
    closeDrawer();
    applySide();
  }
  window.addEventListener('resize', debounce(applySide, 150));

  $('#btnMenu').addEventListener('click', () => {
    if (isMobile()) { openDrawer(); return; }
    if (!sideHidden) setSideHidden(true);
    else if ($('#sidebar').classList.contains('open')) closeDrawer();
    else openDrawer();
  });
  $('#btnPin').addEventListener('click', () => setSideHidden(!document.body.classList.contains('side-hidden')));
  $('#sideHandle').addEventListener('click', openDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  // trascinando dal bordo sinistro si apre la barra
  let edge = null;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    edge = t && t.clientX < 18 && !ATT.inking() ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (edge && t && t.clientX - edge.x > 60 && Math.abs(t.clientY - edge.y) < 60) openDrawer();
    edge = null;
  }, { passive: true });

  // con la tastiera aperta l'app segue l'area visibile: niente salti di pagina e il cursore resta in vista
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const fit = () => {
      const r = document.documentElement.style;
      if (vv.scale > 1.02) return;
      const kb = window.innerHeight - vv.height > 80;
      r.setProperty('--vvh', kb ? vv.height + 'px' : '100%');
      r.setProperty('--vvt', kb ? vv.offsetTop + 'px' : '0px');
      document.body.classList.toggle('kb-open', kb);
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
  }

  const THEME_KEY = 'quaderno.theme';
  let theme = 'auto';
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') theme = t; } catch (e) { /* ok */ }
  function applyTheme() {
    const root = document.documentElement;
    if (theme === 'auto') delete root.dataset.theme; else root.dataset.theme = theme;
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const col = dark ? '#1D1A16' : '#F6F1E7';
    ['#metaTheme', '#metaThemeDark'].forEach((id) => { const m = $(id); if (m) { m.setAttribute('content', col); m.removeAttribute('media'); } });
    const icon = theme === 'light' ? '#i-sun' : theme === 'dark' ? '#i-moon' : '#i-auto';
    const label = 'Tema: ' + (theme === 'light' ? 'chiaro' : theme === 'dark' ? 'scuro' : 'come il dispositivo');
    ['#btnTheme', '#btnTheme2'].forEach((id) => { const b = $(id); b.querySelector('use').setAttribute('href', icon); b.setAttribute('aria-label', label); b.title = label; });
    document.querySelectorAll('#themeMenu [data-theme]').forEach((b) => {
      b.classList.toggle('on', b.dataset.theme === theme);
      b.setAttribute('aria-checked', String(b.dataset.theme === theme));
    });
  }
  function setTheme(t) {
    theme = t;
    try { if (t === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) { /* ok */ }
    applyTheme();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (theme === 'auto') applyTheme(); });
  const themeMenu = $('#themeMenu');
  function closeThemeMenu() { themeMenu.hidden = true; $('#btnTheme').setAttribute('aria-expanded', 'false'); }
  function toggleThemeMenu(btn) {
    if (!themeMenu.hidden) { closeThemeMenu(); return; }
    const r = btn.getBoundingClientRect();
    themeMenu.hidden = false;
    const w = themeMenu.offsetWidth;
    themeMenu.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    const below = r.bottom + 6;
    themeMenu.style.top = (below + themeMenu.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - themeMenu.offsetHeight - 6) : below) + 'px';
    btn.setAttribute('aria-expanded', 'true');
  }
  $('#btnTheme').addEventListener('click', (e) => { e.stopPropagation(); toggleThemeMenu($('#btnTheme')); });
  $('#btnTheme2').addEventListener('click', (e) => { e.stopPropagation(); toggleThemeMenu($('#btnTheme2')); });
  themeMenu.addEventListener('click', (e) => { const b = e.target.closest('[data-theme]'); if (b) { setTheme(b.dataset.theme); closeThemeMenu(); } });
  document.addEventListener('click', (e) => { if (!themeMenu.hidden && !themeMenu.contains(e.target)) closeThemeMenu(); });
  applyTheme();
  applySide();

  $('#btnNew').addEventListener('click', () => newNote());
  $('#emptyNew').addEventListener('click', () => newNote());
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnSettings2').addEventListener('click', () => { closeDrawer(); openSettings(); });
  $('#syncStatus').addEventListener('click', () => sync(true));
  $('#btnSync').addEventListener('click', () => sync(true));
  $('#modePreview').addEventListener('click', () => setMode('preview'));
  $('#modeEdit').addEventListener('click', () => setMode('edit'));
  $('#modeSplit').addEventListener('click', () => setMode('split'));

  const importDlg = $('#importDlg');
  const askImport = () => importDlg.showModal();
  $('#btnImport').addEventListener('click', askImport);
  $('#emptyImport').addEventListener('click', askImport);
  $('#impCancel').addEventListener('click', () => importDlg.close());
  $('#impFiles').addEventListener('click', () => { importDlg.close(); $('#fileFiles').click(); });
  $('#impFolder').addEventListener('click', () => { importDlg.close(); $('#fileFolder').click(); });
  $('#fileFiles').addEventListener('change', (e) => { importFiles(e.target.files, false); e.target.value = ''; });
  $('#fileFolder').addEventListener('change', (e) => { importFiles(e.target.files, true); e.target.value = ''; });

  const menuDlg = $('#menuDlg');
  $('#btnNoteMenu').addEventListener('click', () => menuDlg.showModal());
  $('#actClose').addEventListener('click', () => menuDlg.close());
  $('#actRename').addEventListener('click', () => { menuDlg.close(); renameNote(); });
  $('#actDelete').addEventListener('click', () => { menuDlg.close(); deleteNote(); });

  $('#search').addEventListener('input', debounce((e) => { query = e.target.value; tagFilter = null; renderSidebar(); }, 150));
  $('#search').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; query = ''; renderSidebar(); } });

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') { closeDrawer(); closeThemeMenu(); }
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'k') { e.preventDefault(); openDrawer(); $('#search').focus(); }
    else if (k === 'e' && current) { e.preventDefault(); setMode(mode === 'preview' ? 'edit' : 'preview'); }
    else if (k === 's') { e.preventDefault(); sync(true); }
  });

  window.addEventListener('online', () => { lastError = ''; updateStatus(); if (hasCfg()) sync(false); });
  window.addEventListener('offline', updateStatus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && hasCfg() && navigator.onLine && Date.now() - (settings.lastSync || 0) > 30000) sync(false);
  });

  /* ------------------------------------------------------------------ avvio */
  const WELCOME = `# Benvenuto in Quaderno

Qui scrivi in **markdown** e ritrovi tutto da telefono, iPad e computer. Le note sono file \`.md\` in un tuo repository GitHub.

## Per iniziare

- [x] Aprire Quaderno
- [ ] Collegare GitHub (icona con i cursori in alto a destra)
- [ ] Importare le vecchie note (icona con la freccia in su)

## Cosa puoi fare

- Collegare note tra loro con le doppie parentesi quadre, per esempio [[Idee]]
- Organizzare con cartelle (scrivi \`Cartella/Nota\` come nome) e con etichette, come #benvenuto
- Cercare in tutto il testo, anche offline
- Spuntare le checklist direttamente dall'anteprima
- Inserire disegni a penna, immagini e PDF (da "Markdown" usa i pulsanti in basso, da "Anteprima" quelli a fine nota) e annotarli con l'Apple Pencil
`;

  async function init() {
    let stored = [];
    try { stored = await idb.all(); } catch (e) { stored = []; }
    stored.forEach((n) => notes.set(n.path, n));
    if (!stored.length && !hasCfg()) {
      const w = { path: 'Benvenuto.md', kind: 'md', content: WELCOME, sha: null, dirty: false, deleted: false, updated: Date.now() };
      notes.set(w.path, w);
      idb.put(w);
    }
    const last = localStorage.getItem(LAST_KEY);
    current = last && notes.has(last) && !notes.get(last).deleted && isMd(notes.get(last)) ? last : (notes.has('Benvenuto.md') ? 'Benvenuto.md' : null);
    renderMain();
    renderSidebar();
    updateStatus();
    if (hasCfg() && navigator.onLine) sync(false);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init();
})();
