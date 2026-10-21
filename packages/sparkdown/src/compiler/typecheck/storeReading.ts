import type { SyntaxNode, Tree } from "@lezer/common";
import { storyStoreOf } from "./LuauUnitNodes";
import { luauPositionOffset, readLuauBlock, type LuauSyntaxError } from "./readLuauAst";
import { lineCountOf, syntaxErrorEnd } from "./syntaxErrorRange";
import { VARIABLE_DEFINITION_NAMES } from "../utils/variableDefinitionNames";

/**
 * A story `store` declaration's syntax errors as Luau reads the declaration
 * alone (`storyStoreOf`, I-1370), in Luau's words: every error of its
 * reading, as the declaration spelled with Luau's `local` reports them. An
 * error at a token that is Sparkdown's own (`LuauSyntaxError.sparkdown`),
 * one past the end of the chunk (`pastChunkEnd`), and one in Sparkdown's own
 * constructs in the value (a double-quoted string's interpolation, a divert
 * target) are none of Luau's.
 */
export function storeReadingErrors(
  store: SyntaxNode,
  documentText: string,
  read: (from: number, to: number) => string,
): LuauSyntaxError[] {
  let root = store;
  while (root.parent) root = root.parent;
  // Where the tree ends the declaration before a token on its line
  // (`store a, const = 1, 2`, whose `const` the tree begins a statement
  // at), the reading of it alone meets its end of input before that token,
  // which Luau reads on to. A declaration the tree ends with its line break
  // (an operator's) ends its line.
  const lineEnd = documentText[store.to - 1] === "\n" ? store.to : documentText.indexOf("\n", store.to);
  const rest = documentText.slice(store.to, lineEnd < 0 ? documentText.length : lineEnd);
  const endsLine = /^\s*(--.*)?$/.test(rest);
  return readLuauBlock([store], documentText).errors.filter((error) => {
    if (error.sparkdown || error.pastChunkEnd) return false;
    if (!endsLine && /got <eof>(?=;|$)/.test(error.message)) return false;
    const from = luauPositionOffset(error.location.begin, documentText);
    // The token the error is at, or, at the end of the declaration (a value
    // missing at the end of its line), the one before it.
    const at = from < store.to ? root.resolveInner(from, 1) : root.resolveInner(from, -1);
    const owner = storyStoreOf(at, read);
    return from >= store.from && owner?.from === store.from && owner.to === store.to;
  });
}

/** A syntax error of a story store's reading, at its document range. */
export interface StoreSyntaxError {
  message: string;
  /** The range of the store it is reported for. */
  store: { from: number; to: number };
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/**
 * Every story store's syntax errors in a document (`storeReadingErrors`),
 * each ranged as the type checker ranges an error of its reading
 * (`syntaxErrorEnd`).
 */
export function storeSyntaxErrors(tree: Tree, documentText: string): StoreSyntaxError[] {
  const read = (from: number, to: number) => documentText.slice(from, to);
  const found: StoreSyntaxError[] = [];
  tree.iterate({
    enter: (ref) => {
      if (!VARIABLE_DEFINITION_NAMES.has(ref.name)) return true;
      const node = ref.node;
      const store = storyStoreOf(node, read);
      if (!store || store.from !== node.from || store.to !== node.to) return true;
      for (const error of storeReadingErrors(store, documentText, read)) {
        const { begin, end } = error.location;
        const start = { line: begin.line, character: begin.column };
        found.push({
          message: error.message,
          store: { from: store.from, to: store.to },
          start,
          end: syntaxErrorEnd(start, { line: end.line, character: end.column }, error.message, () => lineCountOf(documentText)),
        });
      }
      return false;
    },
  });
  return found;
}
