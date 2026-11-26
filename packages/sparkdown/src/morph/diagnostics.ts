import { getContextEntry } from "../compiler/utils/getContextEntry";
import { layeredMorphArtwork } from "./layered";
import type { MorphBakeDiagnostic, MorphRef } from "./types";

type Context = { [type: string]: { [name: string]: any } };

export interface MorphArtworkFiles {
  uri?: string;
  files?: Record<string, string>;
}

export type MorphDiagnosticLike = Pick<MorphBakeDiagnostic, "severity" | "message" | "morphs" | "layer" | "path" | "uri"> & { code: string };

export interface MorphDiagnosticConsumer extends MorphArtworkFiles {
  variant: string;
  diagnostics: readonly MorphDiagnosticLike[];
}

export interface MorphEditorDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity: 1 | 2;
  code: string;
  source: "sparkdown";
  message: string;
}

export function morphArtworkFiles(context: Context | undefined, ref: Pick<MorphRef, "image" | "layered">): MorphArtworkFiles | undefined {
  const image = ref.layered ? undefined : getContextEntry(context, "image", ref.image);
  if (image) return typeof image.uri === "string" ? { uri: image.uri } : {};
  const artwork = layeredMorphArtwork(context, getContextEntry(context, "layered_image", ref.image));
  if (!artwork) return undefined;
  const files: Record<string, string> = Object.create(null);
  for (const [path, index] of Object.entries(artwork.paths)) {
    const uri = artwork.files[index]?.uri;
    if (uri) files[path] = uri;
  }
  return { ...(artwork.uri === undefined ? {} : { uri: artwork.uri }), files };
}

export const morphDiagnosticUri = (artwork: MorphArtworkFiles, diagnostic: MorphDiagnosticLike): string | undefined =>
  (diagnostic.path !== undefined && artwork.files?.[diagnostic.path]) || artwork.uri;

export function changeLookName(ref: MorphRef): string {
  let selection: Record<string, unknown> = {};
  try {
    selection = JSON.parse(ref.selection) ?? {};
  } catch {
    selection = {};
  }
  const attributes = ref.groups.flatMap((group) => (typeof selection[group] === "string" ? [`${group}.${selection[group]}`] : []));
  return attributes.length ? `${ref.image}:${attributes.join(":")}` : ref.image;
}

export function morphEditorDiagnostics(consumers: Iterable<MorphDiagnosticConsumer>): Map<string, MorphEditorDiagnostic[]> {
  type Group = { uri: string; diagnostic: MorphDiagnosticLike; variants: string[] };
  const grouped = new Map<string, Group>();
  for (const consumer of consumers) {
    for (const d of consumer.diagnostics) {
      const uri = morphDiagnosticUri(consumer, d);
      if (!uri) continue;
      const key = JSON.stringify([uri, d.morphs, d.code, d.severity, d.layer, d.message]);
      const group: Group = grouped.get(key) ?? { uri, diagnostic: d, variants: [] };
      if (!group.variants.includes(consumer.variant)) group.variants.push(consumer.variant);
      grouped.set(key, group);
    }
  }
  const out = new Map<string, MorphEditorDiagnostic[]>();
  for (const { uri, diagnostic: d, variants } of grouped.values()) {
    const shown = variants.slice(0, 3).map((v) => `\`${v}\``).join(", ");
    const more = variants.length > 3 ? ` and ${variants.length - 3} more` : "";
    const where = d.layer ? ` (layer "${d.layer}")` : "";
    const list = out.get(uri) ?? [];
    list.push({
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      severity: d.severity === "error" ? 1 : 2,
      code: `morph-${d.code}`,
      source: "sparkdown",
      message: `${d.morphs.length > 1 ? "Morphs" : "Morph"} ${d.morphs.map((m) => `\`${m}\``).join(" and ")} on ${shown}${more}${where}: ${d.message}`,
    });
    out.set(uri, list);
  }
  return out;
}
