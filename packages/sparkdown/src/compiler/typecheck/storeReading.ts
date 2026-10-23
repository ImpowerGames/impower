import type { SyntaxNode, Tree } from "@lezer/common";
import { inLuauFunction, luauReadingReportsAllAt, SPARKDOWN_EXPRESSIONS, SPARKDOWN_ONLY, storyStoreOf } from "./LuauUnitNodes";
import { luauPositionOffset, readLuauBlock, readLuauStatementCandidate, type LuauSyntaxError } from "./readLuauAst";
import { lineCountOf, syntaxErrorEnd } from "./syntaxErrorRange";
import { unclosedIslandEnd } from "../utils/storyIslands";
import { VARIABLE_DEFINITION_NAMES } from "../utils/variableDefinitionNames";

/**
 * A story `store` declaration's syntax errors as Luau reads the declaration
 * alone (`storyStoreOf`, I-1370), in Luau's words: every error of its
 * reading, as the declaration spelled with Luau's `local` reports them, with
 * the rest of its line where the tree reads that as story (I-1407). An
 * error at a token that is Sparkdown's own (`LuauSyntaxError.sparkdown`),
 * one past the end of the chunk (`pastChunkEnd`), and one in Sparkdown's own
 * constructs in the value (a double-quoted string's interpolation, a divert
 * target) are none of Luau's.
 */
export function storeReadingErrors(
  store: SyntaxNode,
  documentText: string,
  read: (from: number, to: number) => string,
): DeclarationReading {
  let root = store;
  while (root.parent) root = root.parent;
  const { story, errors, lineErrors, readTo } = readDeclarationLine(store, documentText);
  // A store cut at its unclosed bracket's line is Luau whose reading of the
  // line alone reports every error in it; no check of Sparkdown's own
  // reports in it (`cutIslands`, I-1532).
  const cut = unclosedIslandEnd(store, documentText) !== undefined;
  const own = errors.filter((error) => {
    const from = luauPositionOffset(error.location.begin, documentText);
    // A double-quoted string that holds an interpolation is Sparkdown's
    // own: Luau reads it as one string, the interpolation's text and its
    // backtick strings' escapes included, which report their own errors.
    if (!cut && holdsDoubleQuotedInterpolation(root, from, luauPositionOffset(error.location.end, documentText))) return false;
    // The story it reads on through is the declaration's.
    if (story && from >= store.to) return true;
    // The token the error is at, or, at the end of the declaration (a value
    // missing at the end of its line), the one before it.
    const at = from < store.to ? root.resolveInner(from, 1) : root.resolveInner(from, -1);
    const owner = storyStoreOf(at, read);
    return from >= store.from && owner?.from === store.from && owner.to === store.to;
  });
  return { errors: own, story, lineErrors, readTo };
}

/** Whether a double-quoted string's interpolation, Sparkdown's own, lies inside a range of the document. */
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

/**
 * A story declaration's syntax errors, whether its line runs on into story,
 * every error the reading of its line finds (`lineErrors`, its reported
 * errors among them), and where the reading stops (`readTo`: the end of
 * that story, or the declaration's).
 */
interface DeclarationReading {
  errors: LuauSyntaxError[];
  story: boolean;
  lineErrors: LuauSyntaxError[];
  readTo: number;
}

/**
 * The errors of Luau's reading of a story declaration's line
 * (`storeReadingErrors`), but those at a token that is Sparkdown's own
 * (`LuauSyntaxError.sparkdown`), one past the end of the chunk
 * (`pastChunkEnd`), and one at an end of input the reading meets before a
 * token of its line, and whether it reads on through story. With
 * `storyOnly`, a declaration whose line does not run on into story is not
 * read, and has none.
 */
function readDeclarationLine(declaration: SyntaxNode, documentText: string, storyOnly = false): DeclarationReading {
  const found = documentText[declaration.to - 1] === "\n" ? declaration.to : documentText.indexOf("\n", declaration.to);
  const lineEnd = found < 0 ? documentText.length : found;
  // Where the tree reads the rest of the line as story (`store a, b = 1 2`,
  // whose `2` it begins a line of story at), no statement of Luau's there
  // reports it, and Luau reads the declaration on through that story, up to
  // the first token the tree reads as Luau's or as Sparkdown's own after it
  // (a scene's `end`).
  let storyEnd = declaration.to;
  for (let n = declaration.nextSibling; n && n.from < lineEnd && n.name !== "Newline" && !n.name.startsWith("Luau"); n = n.nextSibling) {
    storyEnd = Math.min(n.to, lineEnd);
  }
  const story = /\S/.test(documentText.slice(declaration.to, storyEnd));
  if (storyOnly && !story) return { story, errors: [], lineErrors: [], readTo: declaration.to };
  const readTo = story ? storyEnd : declaration.to;
  // Where the tree ends the reading before a token on its line (`store a,
  // const = 1, 2`, whose `const` the tree begins a statement at), the
  // reading meets its end of input before that token, which Luau reads on
  // to. A declaration the tree ends with its line break (an operator's)
  // ends its line, and Luau's end of input after it is on the next line,
  // where there is one (I-1477).
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

/**
 * A story `local` declaration's syntax errors in the rest of its line that
 * the tree reads as story (`local a = 1 2`, I-1424), which no statement of
 * Luau's there reports, as Luau reads the declaration on through it. The
 * declaration's own errors are its statement's reading's.
 */
function storyLocalRunOnErrors(local: SyntaxNode, documentText: string): DeclarationReading {
  const { errors, story, lineErrors, readTo } = readDeclarationLine(local, documentText, true);
  return { errors: errors.filter((error) => luauPositionOffset(error.location.begin, documentText) >= local.to), story, lineErrors, readTo };
}

/**
 * Whether a declaration is a story `local`: one outside every Luau function
 * and every construct of Sparkdown's own, as a story store is
 * (`storyStoreOf`).
 */
function isStoryLocal(node: SyntaxNode, read: (from: number, to: number) => string): boolean {
  const begin = node.getChild(`${node.name}_begin`);
  if (!begin || !/^\s*local\b/.test(read(begin.from, begin.to))) return false;
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (SPARKDOWN_ONLY.has(n.name) || SPARKDOWN_EXPRESSIONS.has(n.name)) return false;
  }
  return !inLuauFunction(node) && !luauReadingReportsAllAt(node, read);
}

/** A syntax error of a story store's reading, at its document range. */
export interface StoreSyntaxError {
  message: string;
  /** Whether it is one of a backtick string's own errors (`LuauSyntaxError.ofString`), which no other reporter reports. */
  ofString?: true;
  start: { line: number; character: number };
  end: { line: number; character: number };
  /** Where the opener a missing closer's error names is (`LuauSyntaxError.opener`). */
  opener?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

/** A story store's, or story local's, reading of its line. */
export interface DeclarationSyntaxErrors {
  /** The declaration's range, and where the reading of its line stops (the end of the story it runs on into, or the declaration's). */
  declaration: { from: number; to: number; readTo: number };
  /** Every error the reading of its line finds. */
  found: StoreSyntaxError[];
  /** The ones that are the declaration's to report, among `found`. */
  reported: StoreSyntaxError[];
}

/**
 * Every story store's syntax errors in a document (`storeReadingErrors`),
 * and every story local's in the story its line runs on into
 * (`storyLocalRunOnErrors`), each ranged as the type checker ranges an
 * error of its reading (`syntaxErrorEnd`), with every error the reading of
 * its line finds.
 */
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
