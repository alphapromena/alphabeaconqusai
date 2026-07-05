import type { ReactNode } from "react";

/** Inline **bold** → <strong>. No raw HTML — builds React nodes, so it's injection-safe. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={`${keyBase}-b${i++}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Minimal Markdown → React for LinkedIn-style post copy: paragraphs, `- ` / `• ` bullets, and
 * **bold**. Deliberately tiny (no dependency); good enough for the review queue.
 */
export function Markdown({ text }: { text: string }): ReactNode {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let bullets: string[] = [];
  let k = 0;
  const flushBullets = () => {
    if (!bullets.length) return;
    const items = bullets;
    blocks.push(
      <ul key={`ul${k++}`} style={{ margin: "0 0 0.7rem", paddingLeft: 20 }}>
        {items.map((b, i) => (
          <li key={i}>{inline(b, `li${k}-${i}`)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-•]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
    } else if (line.trim() === "") {
      flushBullets();
    } else {
      flushBullets();
      blocks.push(
        <p key={`p${k++}`} style={{ margin: "0 0 0.6rem", lineHeight: 1.55 }}>
          {inline(line, `p${k}`)}
        </p>,
      );
    }
  }
  flushBullets();
  return <>{blocks}</>;
}
