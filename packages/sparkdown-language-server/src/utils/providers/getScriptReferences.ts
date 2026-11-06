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

const BINDS_IN_SCOPE = new Set<Reference["declaration"]>(["var", "const", "param"]);

const scopeChain = (scopePath: string): string[] => {
  const parts = scopePath ? scopePath.split(".") : [];
  return parts.map((_, i) => parts.slice(0, parts.length - i).join(".")).concat("");
};

type ScriptReferencesWorkspace = Pick<
  SparkdownLanguageServerWorkspace,
  "document" | "annotations" | "uris" | "compilerConfig"
>;

export const getScriptReferences = (
  workspace: ScriptReferencesWorkspace,
  program: SparkProgram | undefined,
): ScriptReference[] => {
  const uris = [...workspace.uris()];
  const resolvedIds = (reference: Reference, scopePath: string) =>
    (reference.symbolIds ?? [])
      .map((id) => {
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
      })
      .filter((id): id is string => !!id);

  const lineOf = (uri: string, offset: number) =>
    workspace.document(uri)?.positionAt(offset).line ?? -1;
  const variableLines = new Map<string, Set<number>>();
  for (const uri of uris) {
    const lines = new Set<number>();
    walkReferences(workspace, uri, (r) => {
      if (r.value!.type.declaration === "define_variable_name") {
        lines.add(lineOf(uri, r.from));
      }
    });
    variableLines.set(uri, lines);
  }
  const isTypeUse = (uri: string, reference: Reference, from: number) =>
    reference.declaration === "define_type_name" &&
    !!variableLines.get(uri)?.has(lineOf(uri, from));

  const declaredIn = new Map<string, string[]>();
  const ownIn = new Map<string, Set<string>>();
  const boundIn = new Map<string, Set<string>>();
  for (const uri of uris) {
    const own = new Set<string>();
    const bound = new Set<string>();
    ownIn.set(uri, own);
    boundIn.set(uri, bound);
    walkReferences(workspace, uri, (r, scopePath, text) => {
      const reference = r.value!.type;
      if (BINDS_IN_SCOPE.has(reference.declaration)) {
        bound.add(`${scopePath}\n${text.trim()}`);
        return;
      }
      if (
        !DECLARED_BY_SCRIPT.has(reference.declaration) ||
        isTypeUse(uri, reference, r.from)
      ) {
        return;
      }
      for (const id of resolvedIds(reference, scopePath)) {
        own.add(id);
        const declarers = declaredIn.get(id) ?? [];
        if (!declarers.includes(uri)) {
          declaredIn.set(id, [...declarers, uri]);
        }
      }
    });
  }

  const references: ScriptReference[] = [];
  const seen = new Set<string>();
  for (const uri of uris) {
    const own = ownIn.get(uri)!;
    const bound = boundIn.get(uri)!;
    walkReferences(workspace, uri, (r, scopePath, text) => {
      const reference = r.value!.type;
      if (reference.declaration && !isTypeUse(uri, reference, r.from)) {
        return;
      }
      const name = text.trim();
      if (
        reference.usage !== "divert" &&
        scopeChain(scopePath).some((scope) => bound.has(`${scope}\n${name}`))
      ) {
        return;
      }
      const ids = resolvedIds(reference, scopePath);
      if (ids.some((id) => own.has(id))) {
        return;
      }
      const divert = reference.usage === "divert";
      for (const id of ids) {
        const declarers = declaredIn.get(id);
        if (!declarers) {
          continue;
        }
        for (const to of declarers) {
          const key = `${uri}\n${to}\n${divert}`;
          if (!seen.has(key)) {
            seen.add(key);
            references.push({ from: uri, to, divert });
          }
        }
        break;
      }
    });
  }
  return references;
};
