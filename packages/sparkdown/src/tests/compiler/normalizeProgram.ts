
const IGNORED = new Set([
  "functionLocations",
  "sceneLocations",
  "branchLocations",
  "knotLocations",
  "labelLocations",
  "colorAnnotations",
  "files",
  "compiledBuffer",
  "chunks",
  "changes",
  "contextRevision",
]);

const isSpan = (value: unknown): boolean =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as any).from === "number" &&
  typeof (value as any).to === "number";

function readLayoutTree(value: unknown, names: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => readLayoutTree(v, names));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === "span" && isSpan(v)) continue;
    if (key === "exprId" && typeof v === "string" && !names.has(v)) {
      names.set(v, `__generated_name_${names.size}`);
    }
    out[key] = readLayoutTree(v, names);
  }
  return out;
}

function renameGenerated(value: unknown, names: Map<string, string>): unknown {
  const rename = (s: string) => {
    const exact = names.get(s);
    if (exact) return exact;
    const dot = s.indexOf(".");
    const prefix = dot > 0 ? names.get(s.slice(0, dot)) : undefined;
    return prefix ? prefix + s.slice(dot) : s;
  };
  if (typeof value === "string") return rename(value);
  if (Array.isArray(value)) return value.map((v) => renameGenerated(v, names));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[rename(key)] = renameGenerated(v, names);
  }
  return out;
}

export function normalizeProgram(program: any) {
  const names = new Map<string, string>();
  const out: Record<string, unknown> = {};
  out["sparkle"] = readLayoutTree(program.sparkle, names);
  for (const key of Object.keys(program)) {
    if (IGNORED.has(key) || key === "diagnostics" || key === "sparkle") continue;
    out[key] = program[key];
  }
  const normalized = renameGenerated(JSON.parse(JSON.stringify(out)), names) as Record<
    string,
    unknown
  >;
  normalized["diagnostics"] = Object.fromEntries(
    Object.entries(program.diagnostics ?? {}).map(([uri, list]) => [
      uri,
      (list as any[])
        .map((d) => {
          const message = typeof d.message === "string" ? d.message : d.message?.value;
          return `${d.severity} ${d.code ?? ""} ${message}`;
        })
        .sort(),
    ]),
  );
  return normalized;
}
