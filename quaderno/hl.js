/* Colorazione della sintassi markdown nell'editor (testo sotto una textarea trasparente). */
const HL = (() => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const span = (cls, html) => '<span class="' + cls + '">' + html + '</span>';
  const mark = (s) => span('s-mark', esc(s));
  const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(~~[^~\n]+~~)|(!?\[\[[^\]\n]+\]\])|(!?\[[^\]\n]*\]\([^)\n]*\))|(\B#[\p{L}\p{N}_/-]+)/gu;

  function inline(s) {
    let out = '';
    let last = 0;
    s.replace(INLINE, (m, code, bold, ital, del, wiki, link, tag, idx) => {
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
      if (m) return span('s-h', mark(m[1]) + inline(m[2] || ''));
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
  return { html, follow, attach };
})();
if (typeof module !== 'undefined') module.exports = HL;
