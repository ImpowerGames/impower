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
const GROUPING_PAREN = /\(\s*$/;
const CALLABLE_END = /[\w)\]]\s*$/;
const MAX_ACCESS_PATH = 256;

type ScriptReferencesWorkspace = Pick<
  SparkdownLanguageServerWorkspace,
  "document" | "annotations" | "uris" | "compilerConfig"
>;

const groupingDepth = (before: string): number => {
  let depth = 0;
  let rest = before;
  for (let open = GROUPING_PAREN.exec(rest); open; open = GROUPING_PAREN.exec(rest)) {
    rest = rest.slice(0, open.index);
    if (CALLABLE_END.test(rest)) {
      break;
    }
    depth += 1;
  }
  return depth;
};

export const accessPathAt = (before: string, after: string): string => {
  const root = IDENTIFIER.exec(after);
  if (!root) {
    return "";
  }
  const parts = [root[0]];
  let rest = after.slice(root[0].length);
  let depth = groupingDepth(before);
  for (;;) {
    const segment = ACCESS_SEGMENT.exec(rest);
    if (segment) {
      parts.push(segment[1] ?? segment[3]!);
      rest = rest.slice(segment[0].length);
      continue;
    }
    const close = depth > 0 ? CLOSE_PAREN.exec(rest) : null;
    if (!close) {
      break;
    }
    depth -= 1;
    rest = rest.slice(close[0].length);
  }
  return parts.join(".");
};

const prefixesOf = (path: string): string[] => {
  const parts = path.split(".");
  return parts.map((_, i) => parts.slice(0, parts.length - i).join("."));
};

const scopeRootOf = (scopePath: string) => scopePath.split(".")[0] ?? "";

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

  const lineOf = (uri: string, offset: number) =>
    workspace.document(uri)?.positionAt(offset).line ?? -1;

  const typeUseLines = new Map<string, Set<number>>();
  for (const uri of uris) {
    const lines = new Set<number>();
    walkReferences(workspace, uri, (r) => {
      if (r.value!.type.declaration === "define_variable_name") {
        lines.add(lineOf(uri, r.from));
      }
    });
    typeUseLines.set(uri, lines);
  }
  const isTypeUse = (uri: string, reference: Reference, from: number) =>
    reference.declaration === "define_type_name" &&
    !!typeUseLines.get(uri)?.has(lineOf(uri, from));
  const isFileWide = (reference: Reference, scopePath: string) =>
    DECLARED_BY_SCRIPT.has(reference.declaration) || !scopePath;

  const declaredIn = new Map<string, string[]>();
  const fileWideIn = new Map<string, Set<string>>();
  for (const uri of uris) {
    const fileWide = new Set<string>();
    fileWideIn.set(uri, fileWide);
    walkReferences(workspace, uri, (r, scopePath) => {
      const reference = r.value!.type;
      if (!reference.declaration || isTypeUse(uri, reference, r.from)) {
        return;
      }
      if (!isFileWide(reference, scopePath)) {
        return;
      }
      for (const id of resolvedIds(reference, scopePath)) {
        fileWide.add(id);
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
    const fileWide = fileWideIn.get(uri)!;
    const scoped = new Map<string, { id: string; from: number }[]>();
    walkReferences(workspace, uri, (r, scopePath) => {
      const reference = r.value!.type;
      const line = lineOf(uri, r.from);
      const scopeRoot = scopeRootOf(scopePath);
      if (reference.declaration && !isTypeUse(uri, reference, r.from)) {
        if (!isFileWide(reference, scopePath)) {
          const bindings = scoped.get(scopeRoot) ?? [];
          const from = reference.declaration === "param" ? line : line + 1;
          for (const id of resolvedIds(reference, scopePath)) {
            bindings.push({ id, from });
          }
          scoped.set(scopeRoot, bindings);
        }
        return;
      }
      const ids = resolvedIds(reference, scopePath);
      const visible = (id: string) =>
        fileWide.has(id) ||
        !!scoped.get(scopeRoot)?.some((b) => b.id === id && b.from <= line);
      if (!reference.declaration && ids.some(visible)) {
        return;
      }
      const divert = reference.usage === "divert";
      const accessPath =
        !divert && !reference.declaration && document
          ? accessPathAt(
              document.read(Math.max(0, r.from - MAX_ACCESS_PATH), r.from),
              document.read(r.from, r.from + MAX_ACCESS_PATH),
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
