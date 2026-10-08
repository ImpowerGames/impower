
import { programListing } from "../programListing";

// Tables of source positions, a per-compiler revision counter, the binary
// buffer, and the chunks, whose instructions are compared without their line
// tables (`program`, below), which hold source positions too. A compile with
// chunks has no `compiled`.
const IGNORED = new Set([
  "compiled",
  "pathLocations",
  "functionLocations",
  "sceneLocations",
  "branchLocations",
  "knotLocations",
  "stitchLocations",
  "labelLocations",
  "dataLocations",
  "colorAnnotations",
  "files",
  "compiledBuffer",
  "chunks",
  "changes",
  "contextRevision",
]);

/** A layout tree node's source position: `{ line, from, to }`. */
const isSpan = (value: unknown): boolean =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as any).from === "number" &&
  typeof (value as any).to === "number";

/**
 * The layout tree (`program.sparkle`) without its nodes' source positions,
 * and the generated names it holds. A binding, condition or loop is compiled
 * into a function named after its source offset
 * (`__binding_<uri>__layout_main_2310`), which the tree names in `exprId`
 * and the compiled story and scene assets hold as a key.
 */
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

/** `value` with every key or string that is exactly a generated name, or
 *  such a name followed by a `.path`, replaced by its number. */
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

/**
 * A program without source positions or the names derived from them, as
 * plain data: location tables dropped, the layout tree's spans dropped, the
 * generated names its `exprId`s hold numbered in the order the tree holds
 * them and renamed wherever they appear exactly (authored text is never
 * renamed), the program's code as each instruction of its chunks
 * (`programListing`), with those names renamed wherever the instruction
 * names them, and each diagnostic as its severity, code and message. A
 * compile that builds no chunks fails (`programListing` throws).
 */
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
  // An instruction names a generated name inside its text (`Sym "<name>"`),
  // so each is renamed wherever it occurs, longest first.
  const generated = [...names.entries()].sort((a, b) => b[0].length - a[0].length);
  normalized["program"] = programListing(program.chunks).map((line) =>
    generated.reduce((text, [name, alias]) => text.split(name).join(alias), line),
  );
  // A diagnostic's range is a source position, and the text it underlines
  // can be the converted syntax itself (`- targets:` becomes `{`), so a
  // diagnostic is compared by its severity, code and message.
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
