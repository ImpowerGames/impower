import type { SyntaxNode, Tree } from "@lezer/common";
import { inLuauFunction, luauReadingReportsAllAt, SPARKDOWN_EXPRESSIONS, SPARKDOWN_ONLY, storyStoreOf } from "./LuauUnitNodes";
import { luauPositionOffset, readLuauBlock, readLuauStatementCandidate, type LuauSyntaxError } from "./readLuauAst";
import { lineCountOf, syntaxErrorEnd } from "./syntaxErrorRange";
import { unclosedIslandEnd } from "../utils/storyIslands";
import { VARIABLE_DEFINITION_NAMES } from "../utils/variableDefinitionNames";

export function storeReadingErrors(
  store: SyntaxNode,
  documentText: string,
  read: (from: number, to: number) => string,
): DeclarationReading {
  let root = store;
  while (root.parent) root = root.parent;
  const { story, errors, lineErrors, readTo } = readDeclarationLine(store, documentText);
  const cut = unclosedIslandEnd(store, documentText) !== undefined;
  const own = errors.filter((error) => {
    const from = luauPositionOffset(error.location.begin, documentText);
    if (!cut && holdsDoubleQuotedInterpolation(root, from, luauPositionOffset(error.location.end, documentText))) return false;
    if (story && from >= store.to) return true;
    const at = from < store.to ? root.resolveInner(from, 1) : root.resolveInner(from, -1);
    const owner = storyStoreOf(at, read);
    return from >= store.from && owner?.from === store.from && owner.to === store.to;
  });
  return { errors: own, story, lineErrors, readTo };
}

function holdsDoubleQuotedInterpolation(root: SyntaxNode, from: number, to: number): boolean {
  let found = false;
  root.toTree().iterate({
    from,
    to,
    enter: (ref) => {
      if (found) return false;
      if (ref.from >= from && ref.to <= to && ref.name.startsWith("LuauDoubleQuotedStringInterpolation")) found = true;
      return !found;
    },
  });
  return found;
}

interface DeclarationReading {
  errors: LuauSyntaxError[];
  story: boolean;
  lineErrors: LuauSyntaxError[];
  readTo: number;
}

function readDeclarationLine(declaration: SyntaxNode, documentText: string, storyOnly = false): DeclarationReading {
  const found = documentText[declaration.to - 1] === "\n" ? declaration.to : documentText.indexOf("\n", declaration.to);
  const lineEnd = found < 0 ? documentText.length : found;
  let storyEnd = declaration.to;
  for (let n = declaration.nextSibling; n && n.from < lineEnd && n.name !== "Newline" && !n.name.startsWith("Luau"); n = n.nextSibling) {
    storyEnd = Math.min(n.to, lineEnd);
  }
  const story = /\S/.test(documentText.slice(declaration.to, storyEnd));
  if (storyOnly && !story) return { story, errors: [], lineErrors: [], readTo: declaration.to };
  const readTo = story ? storyEnd : declaration.to;
  const endsLine = /^\s*(--.*)?$/.test(documentText.slice(readTo, lineEnd));
  const options = { eofOnNextLine: endsLine && lineEnd < documentText.length };
  const reading = story
    ? readLuauStatementCandidate(declaration, documentText, declaration.from, readTo, options)
    : readLuauBlock([declaration], documentText, false, options);
  const errors = reading.errors.filter(
    (error) => !error.sparkdown && !error.pastChunkEnd && (endsLine || !/got <eof>(?=;|$)/.test(error.message)),
  );
  return { story, errors, lineErrors: errors, readTo };
}

function storyLocalRunOnErrors(local: SyntaxNode, documentText: string): DeclarationReading {
  const { errors, story, lineErrors, readTo } = readDeclarationLine(local, documentText, true);
  return { errors: errors.filter((error) => luauPositionOffset(error.location.begin, documentText) >= local.to), story, lineErrors, readTo };
}

function isStoryLocal(node: SyntaxNode, read: (from: number, to: number) => string): boolean {
  const begin = node.getChild(`${node.name}_begin`);
  if (!begin || !/^\s*local\b/.test(read(begin.from, begin.to))) return false;
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (SPARKDOWN_ONLY.has(n.name) || SPARKDOWN_EXPRESSIONS.has(n.name)) return false;
  }
  return !inLuauFunction(node) && !luauReadingReportsAllAt(node, read);
}

export interface StoreSyntaxError {
  message: string;
  ofString?: true;
  start: { line: number; character: number };
  end: { line: number; character: number };
  opener?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface DeclarationSyntaxErrors {
  declaration: { from: number; to: number; readTo: number };
  found: StoreSyntaxError[];
  reported: StoreSyntaxError[];
}

export function storeSyntaxErrors(tree: Tree, documentText: string): DeclarationSyntaxErrors[] {
  const read = (from: number, to: number) => documentText.slice(from, to);
  const declarations: DeclarationSyntaxErrors[] = [];
  tree.iterate({
    enter: (ref) => {
      if (!VARIABLE_DEFINITION_NAMES.has(ref.name)) return true;
      const node = ref.node;
      const store = storyStoreOf(node, read);
      const local = !store && isStoryLocal(node, read);
      if (!local && (!store || store.from !== node.from || store.to !== node.to)) return true;
      const declaration = store ?? node;
      const { errors, lineErrors, readTo } = store ? storeReadingErrors(store, documentText, read) : storyLocalRunOnErrors(node, documentText);
      if (errors.length === 0) return false;
      const ranged = new Map<LuauSyntaxError, StoreSyntaxError>();
      for (const error of lineErrors) {
        const { begin, end } = error.location;
        const start = { line: begin.line, character: begin.column };
        ranged.set(error, {
          message: error.message,
          start,
          end: syntaxErrorEnd(start, { line: end.line, character: end.column }, error.message, () => lineCountOf(documentText)),
          ...(error.ofString ? { ofString: true as const } : {}),
          ...(error.opener
            ? {
                opener: {
                  start: { line: error.opener.begin.line, character: error.opener.begin.column },
                  end: { line: error.opener.end.line, character: error.opener.end.column },
                },
              }
            : {}),
        });
      }
      declarations.push({
        declaration: { from: declaration.from, to: declaration.to, readTo },
        found: [...ranged.values()],
        reported: errors.map((error) => ranged.get(error)!),
      });
      return false;
    },
  });
  return declarations;
}
