import { useEffect, useState } from "react";
import type { Draft } from "@alphabeacon/shared";
import { getTone } from "@alphabeacon/shared";
import { api } from "../lib/api.js";
import { Markdown } from "../lib/markdown.js";

/**
 * The heart of the human-in-the-loop flow: the day's shortlist. Each draft shows copy, image,
 * "why this post", sources, and guardrail status, with the paths out — approve/publish, inline
 * edit, give feedback, or skip — plus an on-demand (redirect) generation box.
 */
export function ReviewQueue() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api
      .listDrafts()
      .then((d) => setDrafts(d.length ? d : SAMPLE))
      .catch(() => setDrafts(SAMPLE))
      .finally(() => setLoading(false));
  }, []);

  async function generateOnDemand() {
    if (!instruction.trim() || !api.hasBackend) return;
    setBusy(true);
    setNotice("");
    try {
      await api.onDemand(instruction.trim());
      setNotice("On-demand run started — new drafts appear here in a couple of minutes. Refresh to see them.");
      setInstruction("");
    } catch {
      setNotice("Could not start the run.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ color: "#8A8893" }}>Loading today's drafts…</p>;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Generate on-demand — e.g. 'data governance for banks in the GCC'"
          style={{ flex: 1, padding: "0.6rem 0.8rem", borderRadius: 8, border: "1px solid #d9d6df", fontSize: 14 }}
          onKeyDown={(e) => e.key === "Enter" && generateOnDemand()}
        />
        <button style={btnPrimary} disabled={busy || !instruction.trim()} onClick={generateOnDemand}>
          {busy ? "Starting…" : "Generate"}
        </button>
      </div>
      {notice && <p style={{ fontSize: 13, color: "#0a7a3f", margin: 0 }}>{notice}</p>}
      {drafts.map((d) => (
        <DraftCard key={d.draftId} draft={d} />
      ))}
    </div>
  );
}

function DraftCard({ draft }: { draft: Draft }) {
  const tone = getTone(draft.toneProfileId);
  const [status, setStatus] = useState(draft.status);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.editedBody ?? draft.body);
  const [fbOpen, setFbOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");
  const flagged = status === "flagged";

  const act = async (fn: () => Promise<unknown>, done: string) => {
    if (api.hasBackend) await fn().catch(() => {});
    setMsg(done);
  };

  if (status === "skipped") {
    return (
      <article style={{ ...card, opacity: 0.55 }}>
        <span style={{ fontSize: 13, color: "#8A8893" }}>Skipped — {tone?.name ?? draft.toneProfileId}</span>
      </article>
    );
  }

  return (
    <article style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#D11048" }}>
          {tone?.name ?? draft.toneProfileId}
        </span>
        <GuardBadges g={draft.guardrails} />
      </div>

      {draft.image && (
        <div style={{ position: "relative", marginBottom: 12 }}>
          <img
            src={draft.image.url ?? draft.image.s3Key}
            alt={draft.image.prompt}
            style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 8, display: "block", background: "#17121b" }}
          />
          {draft.image.model === "placeholder" && (
            <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(0,0,0,0.55)", color: "#fff" }}>
              image model pending
            </span>
          )}
        </div>
      )}

      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          style={{ width: "100%", padding: "0.6rem", borderRadius: 8, border: "1px solid #d9d6df", fontSize: 14, fontFamily: "inherit", marginBottom: 10 }}
        />
      ) : (
        <div style={{ marginBottom: 4 }}>
          <Markdown text={text} />
        </div>
      )}

      <p style={{ fontSize: 13, color: "#4E4C57", margin: "0 0 0.6rem" }}>
        <strong>Why this post:</strong> {draft.rationale}
      </p>

      {draft.citations.length > 0 && (
        <ul style={{ fontSize: 12, color: "#4E4C57", margin: "0 0 0.8rem", paddingLeft: 18 }}>
          {draft.citations.map((c, i) => (
            <li key={i} style={{ color: c.verified ? "#4E4C57" : "#D11048" }}>
              {c.claim} {c.sourceUrl ? <a href={c.sourceUrl}>source</a> : "— unverified"}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {editing ? (
          <>
            <button style={btnPrimary} onClick={() => { setEditing(false); act(() => api.editDraft(draft.runId, draft.draftId, text), "Saved edit."); }}>Save</button>
            <button style={btn} onClick={() => { setText(draft.editedBody ?? draft.body); setEditing(false); }}>Cancel</button>
          </>
        ) : (
          <>
            <button style={btnPrimary} disabled={flagged} onClick={() => { setStatus("approved"); act(() => api.publish(draft.draftId), "Approved — LinkedIn publish is pending API approval; copy is ready."); }}>
              Approve &amp; publish
            </button>
            <button style={btn} onClick={() => setEditing(true)}>Edit</button>
            <button style={btn} onClick={() => setFbOpen((v) => !v)}>Give feedback</button>
            <button style={btnGhost} onClick={() => { setStatus("skipped"); act(() => api.setStatus(draft.runId, draft.draftId, "skipped"), ""); }}>Skip</button>
          </>
        )}
      </div>

      {fbOpen && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional note…" style={{ flex: 1, minWidth: 180, padding: "0.4rem 0.6rem", borderRadius: 7, border: "1px solid #d9d6df", fontSize: 13 }} />
          <button style={btn} onClick={() => { setFbOpen(false); act(() => api.feedback(draft.draftId, "up", comment || undefined), "Thanks — feedback saved."); setComment(""); }}>👍 Up</button>
          <button style={btn} onClick={() => { setFbOpen(false); act(() => api.feedback(draft.draftId, "down", comment || undefined), "Thanks — feedback saved."); setComment(""); }}>👎 Down</button>
        </div>
      )}

      {msg && <p style={{ fontSize: 12, color: "#0a7a3f", margin: "8px 0 0" }}>{msg}</p>}
    </article>
  );
}

function GuardBadges({ g }: { g: Draft["guardrails"] }) {
  const items = [
    { ok: g.brandSafety.passed, label: "brand-safe" },
    { ok: g.claimCheck.passed, label: "claims" },
    { ok: g.repetition.passed, label: "fresh" },
    { ok: g.style.passed, label: "on-voice" },
  ];
  return (
    <span style={{ display: "flex", gap: 6 }}>
      {items.map((it) => (
        <span key={it.label} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 999, background: it.ok ? "#eafaf0" : "#FFEAF0", color: it.ok ? "#0a7a3f" : "#D11048" }}>
          {it.ok ? "✓" : "!"} {it.label}
        </span>
      ))}
    </span>
  );
}

const card: React.CSSProperties = { border: "1px solid #e5e2ea", borderRadius: 10, padding: "1.1rem 1.25rem", background: "#fff" };
const btn: React.CSSProperties = { padding: "0.5rem 0.9rem", borderRadius: 7, border: "1px solid #d9d6df", background: "#fff", fontSize: 13, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { ...btn, background: "#FF1E57", borderColor: "#FF1E57", color: "#fff", fontWeight: 600 };
const btnGhost: React.CSSProperties = { ...btn, borderColor: "transparent", color: "#8A8893" };

/** Sample data so the UI renders before the backend is wired. */
const SAMPLE: Draft[] = [
  {
    tenantId: "alpha-pro-mena", draftId: "s1", runId: "r1", toneProfileId: "data-driven",
    body: "Poor data quality quietly costs enterprises ~$12.9M a year. AI doesn't fix that — it scales it.\n\n**Clean inputs first**, then let the models earn their keep. 👉 Is your data AI-ready?",
    rationale: "Anchored on a widely-cited Gartner data-quality cost figure to open with a hard number.",
    citations: [{ claim: "$12.9M annual cost of poor data quality", sourceUrl: "https://www.gartner.com/en/newsroom", sourceTitle: "Gartner", verified: true }],
    guardrails: { brandSafety: { passed: true, hits: [] }, claimCheck: { passed: true, unverified: [] }, repetition: { passed: true, score: 0.1 }, style: { passed: true, buzzwords: [] } },
    status: "needs_review", createdAt: new Date().toISOString(),
  },
  {
    tenantId: "alpha-pro-mena", draftId: "s2", runId: "r1", toneProfileId: "provocative",
    body: "\"Garbage in, garbage out\" isn't a cliché — it's your AI roadmap's biggest risk. Most failed AI pilots didn't have a model problem. They had a **data problem**.",
    rationale: "Leans into the brand's signature provocation on data quality vs. AI hype.",
    citations: [],
    guardrails: { brandSafety: { passed: true, hits: [] }, claimCheck: { passed: false, unverified: ["Most failed AI pilots had a data problem"] }, repetition: { passed: true, score: 0.2 }, style: { passed: true, buzzwords: [] } },
    status: "flagged", createdAt: new Date().toISOString(),
  },
];
