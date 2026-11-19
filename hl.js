/* Colorazione della sintassi markdown nell'editor (testo sotto una textarea trasparente). */
const HL = (() => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const span = (cls, html) => '<span class="' + cls + '">' + html + '</span>';
  const mark = (s) => span('s-mark', esc(s));
  const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(~~[^~\n]+~~)|(!?\[\[[^\]\n]+\]\])|(!?\[[^\]\n]*\]\([^)\n]*\))|(\B#[\p{L}\p{N}_/-]+)|(==[^=\n]+==)|(\$\$[^$\n]+\$\$|\$[^\s$](?:[^$\n]*?[^\s$\\])?\$(?![\w$]))/gu;

  function inline(s) {
    let out = '';
    let last = 0;
    s.replace(INLINE, (m, code, bold, ital, del, wiki, link, tag, hi, math, idx) => {
      out += esc(s.slice(last, idx));
      last = idx + m.length;
      if (code) out += span('s-code', mark('`') + esc(m.slice(1, -1)) + mark('`'));
      else if (bold) out += span('s-b', mark('**') + esc(m.slice(2, -2)) + mark('**'));
      else if (ital) out += span('s-i', mark('*') + esc(m.slice(1, -1)) + mark('*'));
      else if (del) out += span('s-del', mark('~~') + esc(m.slice(2, -2)) + mark('~~'));
      else if (wiki) { const emb = m[0] === '!' ? 1 : 0; out += span('s-wiki', mark(m.slice(0, emb + 2)) + esc(m.slice(emb + 2, -2)) + mark(']]')); }
      else if (link) {
        const k = m.indexOf('](');
        out += span('s-link', mark(m.slice(0, m[0] === '!' ? 2 : 1)) + esc(m.slice(m[0] === '!' ? 2 : 1, k)) + mark('](') + span('s-url', esc(m.slice(k + 2, -1))) + mark(')'));
      } else if (tag) out += span('s-tag', esc(m));
      else if (hi) out += span('s-hi', mark('==') + esc(m.slice(2, -2)) + mark('=='));
      else if (math) out += span('s-math', esc(m));
      return m;
    });
    return out + esc(s.slice(last));
  }

  function html(text) {
    let fence = false;
    const lines = text.split('\n').map((line) => {
      if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return span('s-fence', esc(line)); }
      if (fence) return span('s-codeline', esc(line));
      let m = /^(#{1,6})(\s.*)?$/.exec(line);
      if (m) return span('s-h s-h' + m[1].length, mark(m[1]) + inline(m[2] || ''));
      if ((m = /^(\s*>+\s?)(.*)$/.exec(line))) return span('s-quote', mark(m[1]) + inline(m[2]));
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return mark(line);
      if ((m = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\])?(\s?)(.*)$/.exec(line))) {
        const task = m[4] ? span(/x/i.test(m[4]) ? 's-done' : 's-todo', esc(m[4])) : '';
        return esc(m[1]) + span('s-bullet', esc(m[2])) + esc(m[3]) + task + esc(m[5]) + inline(m[6]);
      }
      return inline(line);
    });
    return lines.join('\n') + '\n ';
  }

  /* Mantiene il cursore sempre in vista: calcola dove si trova il cursore con un clone invisibile
     e fa scorrere la textarea, tenendo conto della tastiera (visualViewport). */
  let mirror = null;
  function caretTop(ta) {
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.setAttribute('aria-hidden', 'true');
      mirror.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;overflow:hidden;height:auto;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;box-sizing:border-box;';
      document.body.appendChild(mirror);
    }
    const cs = getComputedStyle(ta);
    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach((k) => { mirror.style[k] = cs[k]; });
    mirror.style.width = ta.clientWidth + 'px';
    const end = ta.selectionEnd == null ? ta.value.length : ta.selectionEnd;
    mirror.textContent = ta.value.slice(0, end);
    const mark = document.createElement('span');
    mark.textContent = '\u200b';
    mirror.appendChild(mark);
    return mark.offsetTop;
  }
  function follow(ta) {
    if (!ta || !ta.isConnected || ta.offsetParent === null) return;
    const rect = ta.getBoundingClientRect();
    const vv = window.visualViewport;
    const visTop = Math.max(rect.top, vv ? vv.offsetTop : 0);
    const visBottom = Math.min(rect.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
    if (visBottom - visTop < 60) return;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 26;
    const y = rect.top + caretTop(ta) - ta.scrollTop;
    const margin = Math.min(lh * 1.5, (visBottom - visTop) / 4);
    if (y + lh + margin > visBottom) ta.scrollTop += y + lh + margin - visBottom;
    else if (y - margin < visTop) ta.scrollTop -= visTop + margin - y;
  }
  function attach(ta) {
    const run = () => { requestAnimationFrame(() => follow(ta)); setTimeout(() => follow(ta), 120); setTimeout(() => follow(ta), 400); };
    ['input', 'keyup', 'focus', 'click', 'touchend', 'compositionend', 'paste', 'cut'].forEach((ev) => ta.addEventListener(ev, run));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => { if (document.activeElement === ta) run(); });
      window.visualViewport.addEventListener('scroll', () => { if (document.activeElement === ta) { window.scrollTo(0, 0); run(); } });
    }
    document.addEventListener('selectionchange', () => { if (document.activeElement === ta) requestAnimationFrame(() => follow(ta)); });
    ta.addEventListener('beforeinput', () => setTimeout(() => follow(ta), 30));
    ta.addEventListener('focus', () => { setTimeout(() => window.scrollTo(0, 0), 50); setTimeout(() => window.scrollTo(0, 0), 350); });
  }

  /* Fa scorrere l'anteprima fino al punto che corrisponde alla riga in cui si trova il cursore. */
  function followPreview(ta, pv, force) {
    if (!ta || !pv || !pv.isConnected || pv.offsetParent === null) return;
    const els = pv.querySelectorAll('[data-sl]');
    const total = ta.value.split('\n').length;
    const caretLine = ta.value.slice(0, ta.selectionEnd == null ? ta.value.length : ta.selectionEnd).split('\n').length - 1;
    const base = pv.getBoundingClientRect().top - pv.scrollTop;
    let target = 0;
    if (els.length) {
      let idx = -1;
      for (let i = 0; i < els.length; i++) { if (Number(els[i].dataset.sl) <= caretLine) idx = i; else break; }
      if (idx >= 0) {
        const el = els[idx];
        const start = Number(el.dataset.sl);
        const next = els[idx + 1] ? Number(els[idx + 1].dataset.sl) : total;
        const frac = Math.min(1, (caretLine - start + 0.5) / Math.max(1, next - start));
        const r = el.getBoundingClientRect();
        target = r.top - base + frac * r.height;
      }
    }
    if (caretLine >= total - 2) { const last = pv.lastElementChild; target = last ? last.getBoundingClientRect().bottom - base + 24 : pv.scrollHeight; }
    const h = pv.clientHeight;
    const margin = Math.min(90, h / 4);
    if (force || target < pv.scrollTop + margin || target > pv.scrollTop + h - margin) {
      pv.scrollTop = Math.max(0, target - h * 0.55);
    }
  }
  return { html, follow, attach, followPreview };
})();
if (typeof module !== 'undefined') module.exports = HL;
