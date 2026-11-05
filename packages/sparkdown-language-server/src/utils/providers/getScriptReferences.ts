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
  "define_variable_name",
]);

type ScriptReferencesWorkspace = Pick<
  SparkdownLanguageServerWorkspace,
  "document" | "annotations" | "uris" | "compilerConfig"
>;

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
    walkReferences(workspace, uri, (r, scopePath) => {
      const reference = r.value!.type;
      if (!DECLARED_BY_SCRIPT.has(reference.declaration)) {
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
    walkReferences(workspace, uri, (r, scopePath) => {
      const reference = r.value!.type;
      if (reference.declaration) {
        return;
      }
      for (const id of reference.symbolIds ?? []) {
        const resolved = resolve(id, reference, scopePath);
        const declarers = resolved ? declaredIn.get(resolved) : undefined;
        if (!declarers) {
          continue;
        }
        if (!declarers.includes(uri)) {
          const divert = reference.usage === "divert";
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
