const ADDR = /^0x[0-9a-f]{40}$/;

export function normAddr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const a = v.trim().toLowerCase();
  return ADDR.test(a) ? a : null;
}

export function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? Math.trunc(v) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export const PREF_KEYS = ["raided", "result", "hungry12", "hungry2", "forage", "avenge", "season"] as const;

export function sanitizePrefs(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const src = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  for (const k of PREF_KEYS) out[k] = typeof src[k] === "boolean" ? (src[k] as boolean) : true;
  return out;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
