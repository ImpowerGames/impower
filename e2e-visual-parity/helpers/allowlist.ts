import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { StyleDelta } from "./style-diff";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ALLOWLIST_PATH = path.resolve(here, "..", "allowlist.yaml");

export interface AllowlistEntry {
  id: string;
  reason: string;
  owner: string;
  created: string;
  expires: string;
  review_pr: string;
  scope: {
    scenario: string;
    checkpoint?: string;
    layer: "computed-style" | "pixel" | "both";
    selector?: string;
    property?: string;
    expect?: { baseline: string; port: string };
    region_selector?: string;
    region?: { x: number; y: number; width: number; height: number };
    max_region_ratio?: number;
  };
}

export interface Allowlist {
  version: number;
  entries: AllowlistEntry[];
}

export function loadAllowlist(): Allowlist {
  const data = YAML.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8")) ?? {};
  return { version: data.version ?? 1, entries: data.entries ?? [] };
}

const REQUIRED = ["id", "reason", "owner", "created", "expires", "review_pr", "scope"] as const;
const REGION_RATIO_CEILING = 0.05;

export interface ValidationIssue {
  id: string;
  problem: string;
}

/** Schema + guardrail validation (spec §9). Empty result = valid. */
export function validateAllowlist(al: Allowlist, now: Date): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const e of al.entries) {
    const id = e.id || "(no id)";
    for (const f of REQUIRED) {
      if (!(e as Record<string, unknown>)[f]) issues.push({ id, problem: `missing required field '${f}'` });
    }
    if (seen.has(id)) issues.push({ id, problem: "duplicate id" });
    seen.add(id);
    for (const f of ["reason", "review_pr"] as const) {
      const v = (e as Record<string, unknown>)[f];
      if (typeof v === "string" && /TODO/i.test(v)) {
        issues.push({ id, problem: `field '${f}' still contains TODO` });
      }
    }
    const s = e.scope ?? ({} as AllowlistEntry["scope"]);
    if (!s.scenario) issues.push({ id, problem: "scope.scenario required" });
    if (!s.layer) issues.push({ id, problem: "scope.layer required" });
    if (s.layer === "computed-style" || s.layer === "both") {
      if (!s.selector) issues.push({ id, problem: "computed-style entry needs scope.selector" });
      if (!s.property) issues.push({ id, problem: "computed-style entry needs scope.property" });
      if (s.property === "*") issues.push({ id, problem: "property wildcard '*' not allowed" });
      if (!s.expect) issues.push({ id, problem: "computed-style entry needs scope.expect{baseline,port}" });
    }
    if (s.layer === "pixel" || s.layer === "both") {
      if (!s.region_selector && !s.region) issues.push({ id, problem: "pixel entry needs region_selector or region" });
      const cap = s.max_region_ratio ?? REGION_RATIO_CEILING;
      if (cap > REGION_RATIO_CEILING) issues.push({ id, problem: `max_region_ratio ${cap} exceeds ${REGION_RATIO_CEILING} ceiling` });
    }
    if (e.expires && isNaN(Date.parse(e.expires))) {
      issues.push({ id, problem: `invalid expires date '${e.expires}'` });
    }
  }
  return issues;
}

/** Fail-closed: an expired entry no longer suppresses. */
export function isExpired(e: AllowlistEntry, now: Date): boolean {
  const t = Date.parse(e.expires);
  return !isNaN(t) && now.getTime() > t + 24 * 3600 * 1000;
}

export interface StyleSuppressionResult {
  kept: StyleDelta[];
  suppressed: { delta: StyleDelta; by: string }[];
  applied: string[];
}

/** Style-layer suppression — exact-match only (spec §9). */
export function applyStyleAllowlist(
  deltas: StyleDelta[],
  ctx: { scenario: string; checkpoint: string; selector: string },
  al: Allowlist,
  now: Date,
): StyleSuppressionResult {
  const kept: StyleDelta[] = [];
  const suppressed: { delta: StyleDelta; by: string }[] = [];
  const applied: string[] = [];
  for (const d of deltas) {
    const entry = al.entries.find((e) => {
      const s = e.scope;
      if (s.layer !== "computed-style" && s.layer !== "both") return false;
      if (s.scenario !== ctx.scenario) return false;
      if (s.checkpoint && s.checkpoint !== ctx.checkpoint) return false;
      if (s.selector !== ctx.selector) return false;
      if (s.property !== d.prop) return false;
      if (!s.expect || s.expect.baseline !== d.baseline || s.expect.port !== d.port) return false;
      return !isExpired(e, now);
    });
    if (entry) {
      suppressed.push({ delta: d, by: entry.id });
      if (!applied.includes(entry.id)) applied.push(entry.id);
    } else {
      kept.push(d);
    }
  }
  return { kept, suppressed, applied };
}

/** Pixel entries applicable to a checkpoint (non-expired). */
export function pixelEntriesFor(
  al: Allowlist,
  scenario: string,
  checkpoint: string,
  now: Date,
): AllowlistEntry[] {
  return al.entries.filter((e) => {
    const s = e.scope;
    if (s.layer !== "pixel" && s.layer !== "both") return false;
    if (s.scenario !== scenario) return false;
    if (s.checkpoint && s.checkpoint !== checkpoint) return false;
    return !isExpired(e, now);
  });
}
