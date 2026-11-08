import React from 'react';

/**
 * Renders the assistant's answer: paragraphs, bullet/numbered lists, simple pipe tables and **bold**.
 * Builds React elements only (no innerHTML), so model output can never inject markup.
 */

const renderInline = (text, keyPrefix) => {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
  );
};

const isTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
const isSeparator = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export const toBlocks = (text) => {
  const lines = String(text || '').split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    if (isTableLine(line)) {
      const rows = [];
      while (i < lines.length && isTableLine(lines[i])) {
        if (!isSeparator(lines[i])) rows.push(cells(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', header: rows[0] || [], rows: rows.slice(1) });
      continue;
    }

    const bullet = /^\s*[-*•]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const re = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(lines[i].match(re)[1]);
        i += 1;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }

    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    const para = [];
    if (heading) {
      blocks.push({ type: 'h', text: heading[1] });
      i += 1;
      continue;
    }
    while (i < lines.length && lines[i].trim() && !isTableLine(lines[i])
      && !bullet.test(lines[i]) && !numbered.test(lines[i]) && !/^\s*#{1,6}\s+/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'p', text: para.join('\n') });
  }
  return blocks;
};

export default function AnswerText({ text }) {
  const blocks = toBlocks(text);
  return (
    <div className="answer">
      {blocks.map((b, bi) => {
        if (b.type === 'table') {
          return (
            <div className="table-wrap" key={bi}>
              <table>
                <thead><tr>{b.header.map((h, i) => <th key={i}>{renderInline(h, `h${bi}${i}`)}</th>)}</tr></thead>
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c, `c${bi}${ri}${ci}`)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.type === 'ul' || b.type === 'ol') {
          const List = b.type;
          return <List key={bi}>{b.items.map((it, ii) => <li key={ii}>{renderInline(it, `l${bi}${ii}`)}</li>)}</List>;
        }
        if (b.type === 'h') return <p className="heading" key={bi}>{renderInline(b.text, `t${bi}`)}</p>;
        return <p key={bi}>{renderInline(b.text, `p${bi}`)}</p>;
      })}
      <style jsx>{`
        .answer :global(p) { margin: 0 0 8px; white-space: pre-wrap; line-height: 1.5; }
        .answer :global(p:last-child) { margin-bottom: 0; }
        .answer :global(.heading) { font-weight: 700; }
        .answer :global(ul), .answer :global(ol) { margin: 0 0 8px; padding-left: 20px; }
        .answer :global(li) { margin: 2px 0; line-height: 1.45; }
        .table-wrap { overflow-x: auto; margin: 4px 0 8px; }
        .answer :global(table) { border-collapse: collapse; font-size: 13px; min-width: 60%; }
        .answer :global(th), .answer :global(td) { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
        .answer :global(th) { background: #f8fafc; font-weight: 600; color: #0f172a; }
      `}</style>
    </div>
  );
}
