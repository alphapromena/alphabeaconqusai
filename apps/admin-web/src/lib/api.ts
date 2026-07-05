import type { Draft, DraftStatus, TenantConfig } from "@alphabeacon/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";
const TENANT = "alpha-pro-mena";

/** Thin API client for the admin app. Endpoints are served by services/backend. */
export const api = {
  tenant: TENANT,
  hasBackend: Boolean(BASE),

  async listDrafts(runId?: string): Promise<Draft[]> {
    // No backend configured → load the fixture written by `local-run.mts` (a real generated run).
    if (!BASE) {
      const res = await fetch("/drafts.json", { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.drafts ?? [];
    }
    // With a backend: a specific run's drafts, else the latest completed run's drafts.
    const url = runId
      ? `${BASE}/drafts?tenantId=${TENANT}&runId=${encodeURIComponent(runId)}`
      : `${BASE}/runs/latest?tenantId=${TENANT}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.drafts ?? [];
  },
  async publish(draftId: string) {
    return post("/publish", { tenantId: TENANT, draftId });
  },
  async onDemand(instruction: string) {
    return post("/on-demand", { tenantId: TENANT, instruction });
  },
  async feedback(draftId: string, rating: "up" | "down", comment?: string) {
    return post("/feedback", { tenantId: TENANT, draftId, rating, comment });
  },
  async editDraft(runId: string, draftId: string, editedBody: string) {
    return post("/draft/edit", { tenantId: TENANT, runId, draftId, editedBody });
  },
  async setStatus(runId: string, draftId: string, status: DraftStatus) {
    return post("/draft/status", { tenantId: TENANT, runId, draftId, status });
  },
  async getConfig(): Promise<TenantConfig | null> {
    if (!BASE) return null;
    const res = await fetch(`${BASE}/config?tenantId=${TENANT}`);
    const data = await res.json();
    return data.config ?? null;
  },
  async putConfig(config: TenantConfig) {
    return put("/config", { config });
  },
};

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function put(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
