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
  return { html };
})();
if (typeof module !== 'undefined') module.exports = HL;
