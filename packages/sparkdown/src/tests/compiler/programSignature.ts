import { describeRoot } from "../program/describeRoot";

export const PROGRAM_FIELDS = [
  "functionLocations",
  "sceneLocations",
  "knotLocations",
  "branchLocations",
  "labelLocations",
  "flowEnds",
  "context",
  "diagnostics",
  "ui",
] as const;

export function stable(value: unknown): string {
  const seen = new WeakSet();
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export function fieldSig(program: any): Record<string, string> {
  const sig: Record<string, string> = {};
  sig["chunks"] = JSON.stringify(program.chunks ? describeRoot(program.chunks) : null);
  for (const f of PROGRAM_FIELDS) sig[f] = stable(program[f]);
  return sig;
}

export function divergedFields(a: Record<string, string>, b: Record<string, string>): string[] {
  return Object.keys(a).filter((f) => a[f] !== b[f]);
}
