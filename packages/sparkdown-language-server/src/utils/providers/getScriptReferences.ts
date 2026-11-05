import { Reference } from "@impower/sparkdown/src/compiler/classes/annotators/ReferenceAnnotator";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { resolveDivertPath } from "../annotations/resolveDivertPath";
import { resolveSymbolId } from "../annotations/resolveSymbolId";
import { walkReferences } from "./getReferences";

export interface ScriptReference {
  from: string;
  to: string;
  divert: boolean;
}

const DECLARED_BY_SCRIPT = new Set<Reference["declaration"]>([
  "scene",
  "branch",
  "label",
  "function",
  "define_type_name",
  "define_variable_name",
]);

const ACCESS_PATH = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/;
const MAX_ACCESS_PATH = 256;

type ScriptReferencesWorkspace = Pick<
  SparkdownLanguageServerWorkspace,
  "document" | "annotations" | "uris" | "compilerConfig"
>;

const prefixesOf = (path: string): string[] => {
  const parts = path.split(".");
  return parts.map((_, i) => parts.slice(0, parts.length - i).join("."));
};

export const getScriptReferences = (
  workspace: ScriptReferencesWorkspace,
  program: SparkProgram | undefined,
): ScriptReference[] => {
  const uris = [...workspace.uris()];
  const resolve = (id: string, reference: Reference, scopePath: string) => {
    const resolved = resolveSymbolId(
      id,
      reference,
      scopePath,
      program,
      workspace.compilerConfig,
    );
    return resolved && reference.usage === "divert"
      ? resolveDivertPath(resolved, scopePath)
      : resolved;
  };

  const declaredIn = new Map<string, string[]>();
  for (const uri of uris) {
    const document = workspace.document(uri);
    const variableLines = new Set<number>();
    walkReferences(workspace, uri, (r) => {
      if (r.value!.type.declaration === "define_variable_name" && document) {
        variableLines.add(document.positionAt(r.from).line);
      }
    });
    walkReferences(workspace, uri, (r, scopePath) => {
      const reference = r.value!.type;
      if (!DECLARED_BY_SCRIPT.has(reference.declaration)) {
        return;
      }
      if (
        reference.declaration === "define_type_name" &&
        document &&
        variableLines.has(document.positionAt(r.from).line)
      ) {
        return;
      }
      for (const id of reference.symbolIds ?? []) {
        const resolved = resolve(id, reference, scopePath);
        const declarers = resolved ? (declaredIn.get(resolved) ?? []) : [];
        if (resolved && !declarers.includes(uri)) {
          declaredIn.set(resolved, [...declarers, uri]);
        }
      }
    });
  }

  const references: ScriptReference[] = [];
  const seen = new Set<string>();
  for (const uri of uris) {
    const document = workspace.document(uri);
    walkReferences(workspace, uri, (r, scopePath) => {
      const reference = r.value!.type;
      if (reference.declaration) {
        return;
      }
      const divert = reference.usage === "divert";
      const accessPath =
        !divert && document
          ? (document.read(r.from, r.from + MAX_ACCESS_PATH).match(ACCESS_PATH)?.[0] ?? "")
          : "";
      const candidates = [
        ...(accessPath.includes(".") ? prefixesOf(accessPath) : []),
        ...(reference.symbolIds ?? []).map((id) => resolve(id, reference, scopePath)),
      ];
      for (const candidate of candidates) {
        const declarers = candidate ? declaredIn.get(candidate) : undefined;
        if (!declarers) {
          continue;
        }
        if (!declarers.includes(uri)) {
          for (const to of declarers) {
            const key = `${uri}\n${to}\n${divert}`;
            if (!seen.has(key)) {
              seen.add(key);
              references.push({ from: uri, to, divert });
            }
          }
        }
        break;
      }
    });
  }
  return references;
};
