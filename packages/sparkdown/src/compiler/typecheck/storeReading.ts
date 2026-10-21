import type { SyntaxNode } from "@lezer/common";
import { loweredLuauStoreOf } from "./LuauUnitNodes";
import { luauPositionOffset, readLuauBlock, type LuauSyntaxError } from "./readLuauAst";

// Luau's error for a block its input ends inside.
const OPEN_BLOCK = /^Expected '(end|until)' \(to close .*\), got <eof>$/;

/**
 * A `store` declaration's syntax errors as its lowerer reports them
 * (`loweredLuauStoreOf`, I-1370): every error of Luau's reading of the
 * declaration alone, in Luau's words at Luau's range, as the declaration
 * spelled with Luau's `local` reports them. An error at a token that is
 * Sparkdown's own (`LuauSyntaxError.sparkdown`), one past the end of the
 * chunk (`pastChunkEnd`), and one in Sparkdown's own constructs in the value
 * (a double-quoted string's interpolation, a divert target) are none of
 * Luau's. A block left open, and a token on the declaration's line that the
 * tree reads apart from it, are the validator's to report.
 */
export function storeReadingErrors(
  store: SyntaxNode,
  documentText: string,
  read: (from: number, to: number) => string,
): LuauSyntaxError[] {
  let root = store;
  while (root.parent) root = root.parent;
  // Where the tree ends the declaration before a token on its line
  // (`store a = 1, return`), the reading of it alone meets its end of input
  // before that token, which Luau reads on to: the validator names the token.
  // A declaration the tree ends with its line break (an operator's) ends its line.
  const lineEnd = documentText[store.to - 1] === "\n" ? store.to : documentText.indexOf("\n", store.to);
  const rest = documentText.slice(store.to, lineEnd < 0 ? documentText.length : lineEnd);
  const endsLine = /^\s*(--.*)?$/.test(rest);
  return readLuauBlock([store], documentText).errors.filter((error) => {
    if (error.sparkdown || error.pastChunkEnd) return false;
    if (!endsLine && /got <eof>(?=;|$)/.test(error.message)) return false;
    // A function value the store leaves open is Sparkdown's to report, on
    // its header (`luauReportsOpenBlockAt` in `validateBlockEnds.ts`).
    if (OPEN_BLOCK.test(error.message)) return false;
    const from = luauPositionOffset(error.location.begin, documentText);
    // The token the error is at, or, at the end of the declaration (a value
    // missing at the end of its line), the one before it.
    const at = from < store.to ? root.resolveInner(from, 1) : root.resolveInner(from, -1);
    const owner = loweredLuauStoreOf(at, read);
    return from >= store.from && owner?.from === store.from && owner.to === store.to;
  });
}
