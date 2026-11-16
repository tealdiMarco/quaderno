/* Piccolo renderer markdown per Quaderno. Niente dipendenze.
   Tutto l'HTML scritto dall'utente viene neutralizzato (escape) prima del rendering. */
(function (root) {
  'use strict';

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function safeUrl(u) {
    u = u.trim();
    if (/^(https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '#';
    return u;
  }

  function inline(text) {
    const stash = [];
    const hold = (html) => '\u0000' + (stash.push(html) - 1) + '\u0000';
    text = text.replace(/`([^`]+)`/g, (m, c) => hold('<code>' + esc(c) + '</code>'));
    text = esc(text);
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, alt, src) =>
      '<span class="embed" data-src="' + src + '" data-alt="' + alt + '"></span>');
    text = text.replace(/!\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (m, t, a) => {
      if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|pdf)$/i.test(t.trim())) {
        return '<span class="embed" data-src="' + t.trim() + '" data-alt="' + (a || '') + '" data-wiki="1"></span>';
      }
      return '<a href="#" class="wiki" data-wiki="' + t.trim() + '">' + (a || t) + '</a>';
    });
    text = text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (m, t, a) =>
      '<a href="#" class="wiki" data-wiki="' + t.trim() + '">' + (a || t) + '</a>');
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) =>
      '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>');
    text = text.replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
    text = text.replace(/(^|[\s(>])#([\p{L}][\p{L}\d_\/-]*)/gu, '$1<a href="#" class="tag" data-tag="$2">#$2</a>');
    return text.replace(/\u0000(\d+)\u0000/g, (m, n) => stash[+n]);
  }

  const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const fenceRe = /^\s*```/;
  const headRe = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
  const hrRe = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const tableSepRe = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  function splitRow(line) {
    line = line.trim();
    if (line.startsWith('|')) line = line.slice(1);
    if (line.endsWith('|')) line = line.slice(0, -1);
    return line.split('|').map((c) => c.trim());
  }

  function render(md, opts) {
    opts = opts || {};
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    if (lines[0] === '---') {
      const end = lines.indexOf('---', 1);
      if (end > 0) {
        out.push('<div class="meta">' + esc(lines.slice(1, end).join('\n')) + '</div>');
        i = end + 1;
      }
    }

    const isBlockStart = (l) =>
      fenceRe.test(l) || headRe.test(l) || hrRe.test(l) || /^\s*>/.test(l) || listRe.test(l);

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      if (fenceRe.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !fenceRe.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }

      let m = line.match(headRe);
      if (m) {
        const n = m[1].length;
        out.push('<h' + n + '>' + inline(m[2]) + '</h' + n + '>');
        i++;
        continue;
      }

      if (hrRe.test(line)) { out.push('<hr>'); i++; continue; }

      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*> ?/, ''));
        out.push('<blockquote>' + render(buf.join('\n'), { noLines: true }) + '</blockquote>');
        continue;
      }

      if (listRe.test(line)) {
        const items = [];
        while (i < lines.length) {
          const lm = lines[i].match(listRe);
          if (!lm) break;
          const indent = lm[1].replace(/\t/g, '    ').length;
          let text = lm[3];
          let task = null;
          const tm = text.match(/^\[( |x|X)\]\s+(.*)$/);
          if (tm) { task = tm[1] !== ' '; text = tm[2]; }
          items.push({ indent, ordered: /\d/.test(lm[2]), text, task, line: i });
          i++;
        }
        let pos = 0;
        const level = (indent) => {
          const ordered = items[pos].ordered;
          const tag = ordered ? 'ol' : 'ul';
          let html = '<' + tag + '>';
          while (pos < items.length && items[pos].indent >= indent) {
            const it = items[pos];
            if (it.indent > indent) break;
            if (it.ordered !== ordered) break;
            pos++;
            let li = inline(it.text);
            if (it.task !== null) {
              const attr = opts.noLines ? ' disabled' : ' data-line="' + it.line + '"';
              li = '<input type="checkbox" aria-label="Attività"' + attr + (it.task ? ' checked' : '') + '> ' + li;
            }
            if (pos < items.length && items[pos].indent > indent) li += level(items[pos].indent);
            html += '<li' + (it.task !== null ? ' class="task"' : '') + '>' + li + '</li>';
          }
          return html + '</' + tag + '>';
        };
        while (pos < items.length) out.push(level(items[pos].indent));
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && tableSepRe.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
        let html = '<div class="table-wrap"><table><thead><tr>' + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
        rows.forEach((r) => { html += '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>'; });
        out.push(html + '</tbody></table></div>');
        continue;
      }

      const buf = [];
      while (i < lines.length && lines[i].trim() && !(buf.length && isBlockStart(lines[i]))) buf.push(lines[i++]);
      out.push('<p>' + buf.map(inline).join('<br>') + '</p>');
    }
    return out.join('\n');
  }

  /* Testo "visibile": senza blocchi di codice e senza front matter. */
  function prose(md) {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const keep = [];
    let fence = false;
    let i = 0;
    if (lines[0] === '---') {
      const end = lines.indexOf('---', 1);
      if (end > 0) i = end + 1;
    }
    for (; i < lines.length; i++) {
      if (fenceRe.test(lines[i])) { fence = !fence; continue; }
      if (!fence) keep.push(lines[i].replace(/`[^`]*`/g, ' '));
    }
    return keep.join('\n');
  }

  function extractTags(md) {
    const found = new Set();
    const re = /(^|[\s(])#([\p{L}][\p{L}\d_\/-]*)/gu;
    let m;
    const text = prose(md);
    while ((m = re.exec(text))) found.add(m[2]);
    return [...found];
  }

  function extractWikiLinks(md) {
    const found = [];
    const re = /(^|[^!])\[\[([^\]|#]+?)(?:[#|][^\]]*)?\]\]/g;
    let m;
    const text = prose(md);
    while ((m = re.exec(text))) found.push(m[2].trim());
    return found;
  }

  const api = { render, extractTags, extractWikiLinks, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MD = api;
})(typeof window !== 'undefined' ? window : globalThis);
