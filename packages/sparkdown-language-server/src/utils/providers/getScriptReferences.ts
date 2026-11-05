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

const IDENTIFIER = /^[A-Za-z_]\w*/;
const ACCESS_SEGMENT = /^\s*(?:\.\s*([A-Za-z_]\w*)|\[\s*(["'])([A-Za-z_]\w*)\2\s*\])/;
const CLOSE_PAREN = /^\s*\)/;
const MAX_ACCESS_PATH = 256;

type ScriptReferencesWorkspace = Pick<
  SparkdownLanguageServerWorkspace,
  "document" | "annotations" | "uris" | "compilerConfig"
>;

export const accessPathAt = (text: string, parenthesized: boolean): string => {
  const root = IDENTIFIER.exec(text);
  if (!root) {
    return "";
  }
  const parts = [root[0]];
  let rest = text.slice(root[0].length);
  if (parenthesized) {
    const close = CLOSE_PAREN.exec(rest);
    if (!close) {
      return root[0];
    }
    rest = rest.slice(close[0].length);
  }
  for (let segment = ACCESS_SEGMENT.exec(rest); segment; segment = ACCESS_SEGMENT.exec(rest)) {
    parts.push(segment[1] ?? segment[3]!);
    rest = rest.slice(segment[0].length);
  }
  return parts.join(".");
};

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
  const resolvedIds = (reference: Reference, scopePath: string) =>
    (reference.symbolIds ?? [])
      .map((id) => resolve(id, reference, scopePath))
      .filter((id): id is string => !!id);

  const typeUseLines = new Map<string, Set<number>>();
  for (const uri of uris) {
    const document = workspace.document(uri);
    const lines = new Set<number>();
    walkReferences(workspace, uri, (r) => {
      if (r.value!.type.declaration === "define_variable_name" && document) {
        lines.add(document.positionAt(r.from).line);
      }
    });
    typeUseLines.set(uri, lines);
  }
  const isTypeUse = (uri: string, reference: Reference, from: number) => {
    const document = workspace.document(uri);
    return (
      reference.declaration === "define_type_name" &&
      !!document &&
      !!typeUseLines.get(uri)?.has(document.positionAt(from).line)
    );
  };

  const declaredIn = new Map<string, string[]>();
  const boundIn = new Map<string, Set<string>>();
  for (const uri of uris) {
    const bound = new Set<string>();
    boundIn.set(uri, bound);
    walkReferences(workspace, uri, (r, scopePath) => {
      const reference = r.value!.type;
      if (!reference.declaration || isTypeUse(uri, reference, r.from)) {
        return;
      }
      for (const id of resolvedIds(reference, scopePath)) {
        bound.add(id);
        if (DECLARED_BY_SCRIPT.has(reference.declaration)) {
          const declarers = declaredIn.get(id) ?? [];
          if (!declarers.includes(uri)) {
            declaredIn.set(id, [...declarers, uri]);
          }
        }
      }
    });
  }

  const references: ScriptReference[] = [];
  const seen = new Set<string>();
  for (const uri of uris) {
    const document = workspace.document(uri);
    const bound = boundIn.get(uri)!;
    walkReferences(workspace, uri, (r, scopePath) => {
      const reference = r.value!.type;
      if (reference.declaration && !isTypeUse(uri, reference, r.from)) {
        return;
      }
      const ids = resolvedIds(reference, scopePath);
      if (!reference.declaration && ids.some((id) => bound.has(id))) {
        return;
      }
      const divert = reference.usage === "divert";
      const accessPath =
        !divert && !reference.declaration && document
          ? accessPathAt(
              document.read(r.from, r.from + MAX_ACCESS_PATH),
              r.from > 0 && document.read(r.from - 1, r.from) === "(",
            )
          : "";
      const candidates = [
        ...(accessPath.includes(".") ? prefixesOf(accessPath) : []),
        ...ids,
      ];
      for (const candidate of candidates) {
        const declarers = declaredIn.get(candidate);
        if (!declarers) {
          continue;
        }
        for (const to of declarers) {
          const key = `${uri}\n${to}\n${divert}`;
          if (to !== uri && !seen.has(key)) {
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
