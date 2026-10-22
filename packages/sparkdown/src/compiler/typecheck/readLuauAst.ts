import { isExplicitRuleName } from "../utils/explicitRuleNames";
import { continuesPastLine, isStoryHeaderOnlyLoop, isStoryStatementIsland, lastLineEnd } from "../utils/storyIslands";
// Luau's syntax tree (`Ast.ts`), read from Sparkdown's syntax tree (#1285).
//
// Sparkdown's grammar is a TextMate grammar built for highlighting. It decides
// which of a document's text is Luau, where each token of that Luau begins and
// ends and what kind of token it is (a name, a keyword, an operator, a number,
// a string, a comment), and which spans inside Luau are Sparkdown's own
// constructs. It cannot decide what a regex grammar cannot express: operator
// precedence and associativity (an operation is a flat run of operands and
// operators), how far a call or method chain runs, call sugar (`f "s"`,
// `f {}`), and where a statement that continues on the next line ends (the
// grammar ends the line's node and puts the continuation beside it). This
// module reads the tree's tokens in document order and decides those once, as
// Luau's parser decides them (`Ast/src/Parser.cpp`), building the same AST the
// type checker's passes read, with every location in document lines and
// UTF-16 characters.
//
// Normal units read the tree: a token is a leaf of the tree (a
// leaf whose text holds several tokens, such as ` . Button`, is split at
// their boundaries), a string, number or comment is the node the tree made of
// it, and text the tree marks as narrative or as Sparkdown's own is never a
// Luau token. The bounded statement-diagnostic recovery operation below also
// reads uncovered/narrative/error spans through this module's lexer, because
// an invalid candidate can need the token on a later line to explain its error.
// Sparkdown's own constructs inside Luau become the
// `AstExprSparkdown*` and `AstStatSparkdown*` classes of `Ast.ts`.
//
// The units are the type checker's (`LuauDocumentChecker.ts`): a `.sd` file's
// prelude and one unit per scene, or branch outside any scene, each read as
// the body of a function whose parameters are the flow's; and a `run` file,
// read from the document the compiler wraps it in. `readLuauExpression` reads
// the one expression a Sparkdown context holds (an interpolation, a choice's
// condition, a struct's value), for the lowerers. Definitions are official AST
// JSON prepared at build time; the tests use that same pinned C++ parser to
// check this module's reading of the full Luau fixture corpus.

import type { SyntaxNode, Tree } from "@lezer/common";
import {
  AstAttr,
  AstAttrType,
  AstExpr,
  AstExprBinary,
  AstExprCall,
  AstExprConstantBool,
  AstExprConstantNil,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprError,
  AstExprFunction,
  AstExprGlobal,
  AstExprGroup,
  AstExprIfElse,
  AstExprIndexExpr,
  AstExprIndexName,
  AstExprInstantiate,
  AstExprInterpString,
  AstExprLocal,
  AstExprSparkdownCallShorthand,
  AstExprSparkdownConditionalAlternator,
  AstExprSparkdownDivertTarget,
  AstExprSparkdownFlowArgument,
  AstExprSparkdownInterpString,
  AstExprSparkdownNew,
  AstExprSparkdownRegex,
  AstExprSparkdownSequentialAlternator,
  AstExprTable,
  AstExprTypeAssertion,
  AstExprUnary,
  AstExprVarargs,
  AstGenericType,
  AstGenericTypePack,
  AstLocal,
  AstStat,
  AstStatAssign,
  AstStatBlock,
  AstStatBreak,
  AstStatCompoundAssign,
  AstStatContinue,
  AstStatError,
  AstStatExpr,
  AstStatFor,
  AstStatForIn,
  AstStatFunction,
  AstStatIf,
  AstStatLocal,
  AstStatLocalFunction,
  AstStatRepeat,
  AstStatReturn,
  AstStatSparkdownChoose,
  AstStatSparkdownExplicit,
  AstStatSparkdownStore,
  AstStatTypeAlias,
  AstStatTypeFunction,
  AstStatWhile,
  AstType,
  AstTypeError,
  AstTypeFunction,
  AstTypeGroup,
  AstTypeIntersection,
  AstTypeOptional,
  AstTypePack,
  AstTypePackExplicit,
  AstTypePackGeneric,
  AstTypePackVariadic,
  AstTypeReference,
  AstTypeSingletonBool,
  AstTypeSingletonString,
  AstTypeTable,
  AstTypeTypeof,
  AstTypeUnion,
  BinaryOp,
  QuoteStyle,
  TableItemKind,
  UnaryOp,
  AstTableAccess,
  type AstArgumentName,
  type AstExprTableItem,
  type AstTableIndexer,
  type AstTableProp,
  type AstTypeList,
  type AstTypeOrPack,
  type SparkdownSource,
} from "./Ast";
import { Location, Position } from "./Location";
import { breaksAcrossLine, breaksStatement, COMMENT, endsStatementBefore, FLOW_HEADERS, LUAU_SCOPE_MODIFIERS, LUAU_STATEMENTS, NEUTRAL, isSparkdownExpression, SPARKDOWN_ONLY } from "./LuauUnitNodes";
import type { HotComment } from "./Module";
import { RUN_WRAPPER_SUFFIX } from "../utils/runWrapper";
import { containsUnreadToken, UNREAD_TOKENS } from "../utils/unreadTokens";

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * A syntax error the reading found, located in the document. The type
 * checker reports every one of a unit's errors but those at Sparkdown's own
 * tokens (`sparkdown`), in Luau's words at Luau's range (I-1322), as a
 * lowerer reports them for a body the checker does not read
 * (`reportBodySyntaxErrors`, I-1368); the other flags say which of them are
 * reported in a story statement's Luau, which ends at its line, and which
 * statements the validator leaves to the reading (`unreadStatements`).
 */
export interface LuauSyntaxError {
  location: Location;
  message: string;
  /**
   * Not part of Luau: the token the error names is Sparkdown's own (a line
   * of story where the tree ends the statement, a statement's `&` mark, a
   * `store`, a `choose` block's own keywords, a divert), which is no token
   * of Luau's; Sparkdown's own syntax reports what is wrong there.
   */
  sparkdown?: true;
  /**
   * Not part of Luau: the error is in what the reading goes on to read after
   * the end of the chunk, where Luau's parser stops at its `Expected <eof>`
   * error, so Luau reports none of it: the location of the token it last
   * stopped at. Each statement the reading reads on into (a later function
   * of a `.sd` document) is read as Luau would read it alone, so a stop in
   * it is its own, and the errors after that stop carry that location.
   */
  pastChunkEnd?: Location;
  /**
   * Not part of Luau: what the error finds malformed, where only Luau's
   * reading of the tokens sees it and Sparkdown's grammar, which reads a
   * type or an expression only far enough to find where it ends, does not
   * (see `MalformedConstruct`). Absent for every other error, and for an
   * error at a token that is not Luau's (a line of story, a statement's `&`
   * mark, a `choose` block's own keywords) or in a `store` declaration or a
   * double-quoted string's interpolation, which are Sparkdown's own syntax.
   */
  malformed?: MalformedConstruct;
  /**
   * Not part of Luau: the error is one of a statement that holds a token the
   * grammar left unread (`LuauUnreadToken`), which no rule of the grammar
   * reports. Luau's reading owns the statement's errors, its recovery's
   * included, as Luau reports them.
   */
  unread?: true;
  /**
   * Not part of Luau: the error is one of a backtick string's own, which the
   * reading gives while it reads the string as a string: an empty `{}`, a
   * section Luau's lexer could not finish, an interpolation left open or
   * holding a stray token, a malformed escape. The reading of the
   * statement the string stands in is its one owner (I-1435): no reading of
   * the string alone reports it, and where the statement rejects the
   * string before reading it, the reading gives none of these. Every
   * reading that reads the string reports it, whatever the context.
   */
  ofString?: true;
}

/**
 * A construct whose error only Luau's reading sees: a type that is missing
 * or cannot begin with the token where one must stand (`type`); an
 * annotation written with `::` where its `:` stands, or with no name before
 * its `:` (`annotation`); an expression that is missing or cannot begin with
 * the token found, a member access with no name after its `.` or `:`, a
 * method call with no arguments, or a function value with a name
 * (`expression`); a statement that is a value but not a call
 * (`statement`); a local declaration's name list with a name missing
 * where a token of its line stands (`local = 1`, `local a, = 1`), which the
 * grammar reads as names and an assignment however few names it holds
 * (`declaration`); and an attribute Luau does not know, repeats, or gives
 * arguments it does not take, such as a value that is not a literal
 * (`attribute`), where the grammar reads the attribute and its arguments
 * as it reads any.
 */
export type MalformedConstruct = "type" | "annotation" | "expression" | "statement" | "declaration" | "attribute";

/** A node of the syntax tree, by its name and document offsets (a `SyntaxNode` is not kept, since the tree makes a new one on every visit). */
export interface TreeNodeRef {
  name: string;
  from: number;
  to: number;
}

/**
 * One of a unit's statements and the top-level nodes of the syntax tree it
 * was read from, in document order: the node it begins in, then any node
 * after it that continues it (a line that begins with an operator, the value
 * after a line-ending comma). A lowerer that reaches the first node reads
 * the statement and skips the others.
 */
export interface LuauStatementSource {
  statement: AstStat;
  nodes: TreeNodeRef[];
}

/** Some of a document's Luau, read as one block, as the type checker's units divide it. */
export interface LuauAstUnit {
  /** A `run` file, a `.sd` file's prelude, one of its flows, or a block a lowerer reads (`readLuauBlock`). */
  kind: "file" | "prelude" | "flow" | "block";
  /**
   * The unit's statements. A flow's block holds one statement, the local
   * function `__flow` whose parameters are the flow's and whose body is the
   * flow's Luau, as the type checker reads a flow.
   */
  root: AstStatBlock;
  errors: LuauSyntaxError[];
  /**
   * The `--!` comments among the unit's Luau, with `header` set on those
   * before its first token. They select a `run` file's mode; a `.sd` file's
   * comments between its statements belong to no unit, and the type checker
   * reads no mode from a `.sd` file's units.
   */
  hotcomments: HotComment[];
  /** The statements of the unit's own block (a flow's function body), each with the tree nodes it was read from. */
  statements: LuauStatementSource[];
  /**
   * Not part of Luau: the document ranges, first token to last, of the
   * statements at any depth whose errors are Luau's reading's to report
   * (`LuauSyntaxError.unread`), which the validator leaves to it.
   */
  unreadStatements?: readonly { from: number; to: number }[];
  /** A flow's header: its scene, or its branch outside any scene. */
  header?: TreeNodeRef;
  /**
   * Read with `unitLines` (see `ReadOptions`): the document line of each of
   * the unit's lines, in order, which every location of the unit counts in
   * place of the document's lines.
   */
  lines?: number[];
  /**
   * Read with `unitLines`: the unit's tokens with their unit locations, and
   * its `--!` comments. Two units with the same key read as the same AST,
   * with the same locations, wherever their lines stand in the document.
   */
  key?: string;
}

/** How a unit is read. */
export interface ReadOptions {
  /**
   * Count every location in the unit's own lines rather than the document's:
   * line `n` is the `n`th document line that holds the unit's Luau, so the
   * unit's AST does not change when lines that hold none of it (narrative,
   * other units) move around it. The type checker reads units this way, so
   * that a cached check stays valid. A `run` file's lines run on unbroken
   * from its first, as the file's own do.
   */
  unitLines?: boolean;
}

/** The Luau of a `.sd` file. */
export interface LuauAstUnits {
  prelude: LuauAstUnit;
  /** One unit per scene, and per branch outside any scene, that holds Luau statements. */
  flows: LuauAstUnit[];
}

/** The statement of a unit read from a node of the tree, when one begins in it. */
export function statementAt(unit: LuauAstUnit, node: TreeNodeRef): AstStat | undefined {
  for (const source of unit.statements) {
    const first = source.nodes[0];
    if (first && first.from === node.from && first.name === node.name) return source.statement;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/** The line starts of a document, for turning offsets into lines and characters. */
class LineIndex {
  readonly starts: number[];

  constructor(
    readonly text: string,
    starts?: number[],
  ) {
    this.starts = starts ?? [0];
    if (!starts) for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) this.starts.push(i + 1);
  }

  lineAt(offset: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  lineEnd(line: number): number {
    const next = this.starts[line + 1];
    return next === undefined ? this.text.length : next - 1;
  }

  position(offset: number): Position {
    const line = this.lineAt(offset);
    return new Position(line, offset - this.starts[line]!);
  }
}

/**
 * A document's positions counted in a unit's own lines (see
 * `ReadOptions.unitLines`): the document line `lines[n]` is line `n`, and a
 * line between two of the unit's counts as the one before it.
 */
class UnitLineIndex extends LineIndex {
  constructor(
    index: LineIndex,
    readonly lines: number[],
  ) {
    super(index.text, index.starts);
  }

  unitPosition(position: Position): Position {
    let lo = 0;
    let hi = this.lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lines[mid]! <= position.line) lo = mid;
      else hi = mid - 1;
    }
    return new Position(lo, position.column);
  }

  override position(offset: number): Position {
    return this.unitPosition(super.position(offset));
  }
}

// The index of the last document read, since the lowerers read many expressions of one document.
let lastIndex: LineIndex | undefined;

function lineIndex(text: string): LineIndex {
  const last = lastIndex;
  if (last?.text === text) return last;
  const edit = editTo(indexEdit, text);
  indexEdit = undefined;
  lastIndex = last && edit ? editedLineIndex(last, text, edit) : new LineIndex(text);
  return lastIndex;
}

/**
 * `last`'s line starts carried over to `text` through `edit`: the starts in
 * the text both begin with are kept, those in the text both end with are
 * shifted by the length the edit added, and only the text between is
 * searched for newlines. A new array, since unit indexes share the last one's.
 */
function editedLineIndex(last: LineIndex, text: string, edit: DocumentEdit): LineIndex {
  const old = last.text;
  const prefix = edit.from;
  const suffix = edit.suffix;
  const oldEnd = old.length - suffix;
  const newEnd = text.length - suffix;
  const delta = text.length - old.length;
  const oldStarts = last.starts;
  // A start follows its newline: one at or before `prefix` follows a newline before it.
  const kept = last.lineAt(prefix) + 1;
  const starts = oldStarts.slice(0, kept);
  for (let i = text.indexOf("\n", prefix); i >= 0 && i < newEnd; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  // A start after `oldEnd` follows a newline in the common suffix.
  let from = kept;
  while (from < oldStarts.length && oldStarts[from]! <= oldEnd) from++;
  for (let i = from; i < oldStarts.length; i++) starts.push(oldStarts[i]! + delta);
  return new LineIndex(text, starts);
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

/**
 * The edits made to the document a reader last read, since it read it: the
 * text they led to, which begins with `from` characters of the text read
 * and ends with its last `suffix` characters, the two not overlapping in
 * either text. The reader carries what it read over to `text` outside
 * those, without comparing the two texts.
 */
interface DocumentEdit {
  readonly text: string;
  readonly from: number;
  readonly suffix: number;
}

// The edits since the line index's and the token lookups' last documents.
let indexEdit: DocumentEdit | undefined;
let aheadEdit: DocumentEdit | undefined;

/**
 * Notes that `after` is `before` with the characters from `from` to `toA`
 * replaced by those from `from` to `toB` of `after`, as the document
 * registry knows from each change it applies. A reader whose last document
 * is `before`, or was edited into it, reads `after` by carrying over what
 * lies outside the changes; one that reaches a document without the edits
 * that led to it noted reads it from scratch.
 */
export function noteLuauDocumentEdit(before: string, after: string, from: number, toA: number, toB: number): void {
  const suffix = before.length - toA;
  const valid = from >= 0 && from <= toA && from <= toB && suffix >= 0 && suffix === after.length - toB;
  indexEdit = valid ? followEdit(lastIndex?.text, indexEdit, before, after, from, suffix) : undefined;
  aheadEdit = valid ? followEdit(lastAhead?.text, aheadEdit, before, after, from, suffix) : undefined;
}

/**
 * A reader's edits once `before` is edited into `after`: added to those
 * already noted when they led to `before`. Where two edits leave the texts
 * the same, so does the two together, within the lesser of their extents.
 * The strings compared are the registry's one string of each version
 * (`documentString`), so each comparison is of identity.
 */
function followEdit(read: string | undefined, edit: DocumentEdit | undefined, before: string, after: string, from: number, suffix: number): DocumentEdit | undefined {
  if (edit && edit.text === before) return { text: after, from: Math.min(edit.from, from), suffix: Math.min(edit.suffix, suffix) };
  if (read !== undefined && read === before) return { text: after, from, suffix };
  return undefined;
}

/** A reader's edits, when they lead to `text`. */
function editTo(edit: DocumentEdit | undefined, text: string): DocumentEdit | undefined {
  return edit && edit.text === text ? edit : undefined;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type TokenKind =
  | "eof"
  | "unfinishedComment"
  | "name"
  | "keyword"
  | "symbol"
  /** Luau's `Attribute` lexeme: `@` with the name written right after it, or a bare `@` (no name). */
  | "attribute"
  /** Luau's `AttributeOpen` lexeme, `@[`. */
  | "attributeOpen"
  | "number"
  | "string"
  | "rawstring"
  | "interp"
  /** One of Sparkdown's own expressions: a divert target, a regular expression, an alternator. */
  | "sparkdown"
  /** `new ClassName`. */
  | "new"
  /** The `&` that marks a statement. */
  | "mark"
  /** A `store` scope modifier. */
  | "store"
  /** The `choose`, `then` and `end` of a `choose` block. */
  | "choose"
  | "chooseThen"
  | "chooseEnd"
  /** The value a branch's caller passes for a parameter (see `AstExprSparkdownFlowArgument`). */
  | "flowArgument"
  /** A character the tree holds in Luau that begins no Luau token. */
  | "unknown"
  /**
   * Where the tree ends a statement that Luau's parser would read on: the
   * first word of story between two of a unit's tokens (see
   * `insertStoryBreaks`), or of a statement the tree begins that Luau would
   * read as part of the one before it (`STATEMENT_BREAKS`). No statement
   * reads past one.
   */
  | "break";

// The tokens that are not Luau's: Sparkdown's own marks, keywords and
// expressions, and where the tree ends a statement. An error at one of them
// is Sparkdown's own syntax's to report.
const SPARKDOWN_TOKENS: ReadonlySet<TokenKind> = new Set(["mark", "store", "choose", "chooseThen", "chooseEnd", "break", "sparkdown", "new"]);

// The keywords that end or divide a block (see `parseIndexName`).
const BLOCK_DELIMITERS: ReadonlySet<string> = new Set(["end", "else", "then", "do"]);

// The brackets a reading can give up on closing (see `parseBlockNoScope`).
const CLOSERS: ReadonlySet<string> = new Set([")", "]", "}"]);


interface Token {
  kind: TokenKind;
  /** A name, keyword or symbol as written; a literal's or construct's whole text. */
  text: string;
  from: number;
  to: number;
  location: Location;
  /** The node a string, number or Sparkdown construct was read from. */
  node?: SyntaxNode;
  /** The index of the top-level node, among those a unit reads, the token was read from; -1 for a token the unit writes itself. */
  source: number;
  /** A story boundary, or the scene closer ending a flow's synthetic function. */
  story?: true;
  /** The grammar-owned EOF of a marked narrative island. */
  authoredEnd?: true;
  /** That EOF ends a story loop header with no `do` on its line (#1907), where Luau's error is the loop's diagnostic. */
  loopHeaderEnd?: true;
  /** A token of such a header, where Luau's error is the loop's diagnostic too (`while true print(1)`). */
  loopHeader?: true;
  /** The `:` of a method access the grammar reads outside an access path (`readMethodColon`), where Luau's error is the expression's. */
  methodColon?: true;
  /** End offset of the grammar-owned marked narrative island containing this token. */
  authoredIsland?: number;
  /** A token the grammar left unread in a pure-Luau body or bracket (`LuauUnreadToken`). */
  unread?: true;
  /** The first of a backtick string's lexemes (`interpLexemes`): the string, and how many lexemes it is. */
  lexemesOf?: { token: Token; count: number };
  /** A string section Luau's lexer could not finish on its line, which it reads as a malformed string (I-1421). */
  broken?: true;
  /** A section of a backtick string lexed from text (`Tokenizer.interpSection`), one of Luau's lexemes. */
  section?: true;
  /** Not part of Luau: the lookups' lexer's interpolations open after the token (`AheadTokenizer`), where an edit's lex goes on from. */
  openInterpolations?: number[];
  /** The implicit `function` of a function the author wrote without it (a `define` method, a handler's closure), read as Luau reads the function it stands for. */
  written?: true;
  /** A `store` that Luau code's `LuauVariableDefinition` begins, which is a name when no name or `function` follows it (see `parseStat`). */
  luauCodeStore?: true;
}


const KEYWORDS = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);

// The keywords that close a block, which the grammar reads only as closers.
const BLOCK_CLOSERS = new Set(["end", "else", "elseif", "until"]);

// The symbols that close a bracket, before each of which the grammar closes
// a bracket that did not open it (`LUAU_NOT_PARENTHESIS_CLOSER` and the
// like), a type's included (`Array<(number>`).
const BRACKET_CLOSERS = new Set([")", "]", "}", ">"]);

// The loops of Luau code whose body is a `do` block.
const LUAU_LOOPS = new Set(["LuauWhileLoop", "LuauForLoop"]);
// The rules holding the `:` of a method access outside an access path (`readMethodColon`).
const METHOD_COLON_RULES = new Set(["LuauLoopHeaderMethodColon", "LuauIfHeaderMethodColon", "LuauExpressionKeywordMethodAccessor"]);

// The reserved words a type can hold, among a `local`'s annotated names.
const TYPE_KEYWORDS = new Set(["nil", "true", "false"]);

// The rules of an if expression that read its `else` and `elseif`.
const IF_EXPRESSION_RULES = ["LuauTernaryExpression", "LuauElseOperator"];

/** Whether a keyword is read by an if expression, as the first rule around it (not a part of one, whose name has `_`) shows. */
function isIfExpressionKeyword(node: SyntaxNode | undefined): boolean {
  let rule = node?.parent;
  while (rule && rule.name.includes("_")) rule = rule.parent;
  return !!rule && IF_EXPRESSION_RULES.some((name) => isExplicitRuleName(rule!.name, name));
}

// The closers each block of a pure-Luau body takes, or yields to as a part
// of its own construct (an `elseif` to its `if`'s `else`). The grammar
// closes a block before any other closer, with nothing in its `_end`, and
// leaves it to the block around (`LUAU_BRANCH_OR_UNTIL_AHEAD` and the like).
// A bracket takes none: its own closer is in its `_end`, and it closes with
// nothing there before any other closer, a bracket's included (I-1318).
const OWN_CLOSERS: Readonly<Record<string, ReadonlySet<string>>> = (() => {
  const end = new Set(["end"]);
  const branches = new Set(["end", "else", "elseif"]);
  const none = new Set<string>();
  return {
    LuauIfBlock: branches,
    LuauElseifBlock: branches,
    LuauElseBlock: end,
    LuauRepeatLoop: new Set(["until"]),
    LuauForLoop: end,
    LuauWhileLoop: end,
    LuauDoBlock: end,
    LuauFunctionBody: end,
    LuauFunctionDefinition: end,
    LuauFunctionTypeDeclaration: end,
    LuauMethodDefinition: end,
    LuauDefine: end,
    LuauAlternatorArms: end,
    LuauFunctionCallParameters: none,
    LuauFunctionParameters: none,
    LuauParenthetical: none,
    LuauPropertyIndexer: none,
    LuauTable: none,
    LuauTableIndexDeclaration: none,
    LuauTypeofFunctionParameters: none,
    LuauSparkleHandlerClosure: none,
    LuauTypeFunctionParameters: none,
    LuauTypeTableStruct: none,
    LuauTypeTableIndexer: none,
    LuauNamedTypeArguments: none,
    LuauTypeGenerics: none,
    LuauGenericsDeclaration: none,
    LuauGenericsInstantiation: none,
  };
})();

// Luau's symbols, longest first, so that a symbol's text is read whole.
const SYMBOLS = [
  "...",
  "..=",
  "//=",
  "..",
  "::",
  "==",
  "~=",
  "<=",
  ">=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "^=",
  "->",
  "//",
  "&&",
  "||",
  "!=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "#",
  "<",
  ">",
  "=",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ";",
  ":",
  ",",
  ".",
  "|",
  "&",
  "?",
  "@",
  "!",
];

// Strings, numbers and comments, which the tree reads whole.
const QUOTED_STRING = /^Luau(DoubleQuoted|SingleQuoted)String$/;
const RAW_STRING = "LuauMultilineString";
const INTERPOLATED_STRING = "LuauInterpolatedString";
const NUMBER = /^LuauNumeric\w+$/;
const LINE_COMMENT = /^Luau(Doc)?LineComment$/;

/**
 * A test of a node's type name, decided once per node type: the tokenizer
 * asks it of every node of a document on every edit.
 */
function nameTest(pattern: RegExp): (node: SyntaxNode) => boolean {
  const results: (boolean | undefined)[] = [];
  return (node) => (results[node.type.id] ??= pattern.test(node.type.name));
}
const isQuotedString = nameTest(QUOTED_STRING);
// The nodes of an intersection member line that are read from the tree, not
// by Luau's lexer (`Tokenizer.read`): a string, which the tree reads with
// its interpolation, a `new`, Sparkdown's own expressions, and a value.
const readsFromTree = (node: SyntaxNode): boolean =>
  isQuotedString(node) ||
  node.name === RAW_STRING ||
  node.name === INTERPOLATED_STRING ||
  node.name === "LuauNewExpression" ||
  isSparkdownExpression(node) ||
  node.name === "LuauAssignmentOperation";
const isNumber = nameTest(NUMBER);
const isComment = nameTest(COMMENT);
const isNeutral = nameTest(NEUTRAL);

// The parts of a string that Sparkdown reads as interpolations.
const DOUBLE_QUOTED_INTERPOLATION = "LuauDoubleQuotedStringInterpolation";
const BACKTICK_INTERPOLATION = "LuauBacktickStringInterpolation";
const CALL_SHORTHANDS = new Set(["LuauDoubleQuotedFunctionCallShorthand", "LuauBacktickFunctionCallShorthand"]);

/** The node's range without the whitespace at its ends. */
function trimmedRange(text: string, from: number, to: number): [number, number] {
  while (from < to && /\s/.test(text[from]!)) from++;
  while (to > from && /\s/.test(text[to - 1]!)) to--;
  return [from, to];
}

/** A return's trailing trivia owns complete opaque comments, never later prose. */
function returnSuffixSpan(text: string, index: LineIndex, from: number): { to: number; triviaEnd: number; unfinished?: number } {
  let to = index.lineEnd(index.lineAt(from));
  let at = from;
  while (at < to) {
    if (/\s/.test(text[at]!) || text[at] === ";") { at++; continue; }
    const long = /^--\[(=*)\[/.exec(text.slice(at, to));
    if (!long) {
      if (text.startsWith("--", at)) at = to;
      break;
    }
    const delimiter = `]${long[1]}]`;
    const close = text.indexOf(delimiter, at + long[0].length);
    if (close < 0) return { to: text.length, triviaEnd: text.length, unfinished: at };
    at = close + delimiter.length;
    to = index.lineEnd(index.lineAt(at));
  }
  return { to, triviaEnd: at };
}

/** Reads a unit's tokens from the tree. */
class Tokenizer {
  readonly tokens: Token[] = [];
  /** Raw return-comment lines whose diagnostic positions must survive unit compression. */
  readonly returnSourceLines: Location[] = [];
  /** Actual trailing trivia, excluding a written closer or follower. */
  readonly returnTriviaSpans: { from: number; to: number }[] = [];
  readonly hotcomments: HotComment[] = [];
  /** Where each story declaration's or reassignment's Luau ends (#1907), for `insertStoryBreaks`. */
  readonly storyIslandEnds: { from: number; end: number; source: number; loop?: true; continued?: true }[] = [];
  /** The index of the top-level node being read. */
  source = -1;
  /**
   * Whether text the tree could not finish reading (an error node) is read
   * as Luau, as a `run` file's text is: Luau throughout.
   */
  luauThroughout = false;
  /**
   * Where the tree has just closed a block before a closer that is not its
   * own (`OWN_CLOSERS`), or before one it could not read (an error node):
   * the index the next token takes, and the closers the block owns. Such a
   * closer closes a block around it, as Luau closes it.
   */
  private closedBefore?: { at: number; owned: ReadonlySet<string> };
  /** The index of the token after a Luau loop with no `do` block (`readHeaderOnlyLoop`), where Luau may find the `do` missing. */
  private headerOnlyLoopEnd?: number;
  /**
   * For each interpolation of a backtick string lexed from text that is
   * open (`lexOne`), innermost last: how many braces opened in it are open.
   */
  protected interpBraces: number[] = [];

  constructor(
    readonly text: string,
    readonly index: LineIndex,
  ) {}

  location(from: number, to: number): Location {
    return new Location(this.index.position(from), this.index.position(to));
  }

  push(kind: TokenKind, from: number, to: number, node?: SyntaxNode): void {
    // Luau's lexer reads `@` as an attribute lexeme: with the name written
    // right after it (`@native`), with `[` (`@[`), or alone, with no name.
    if (kind === "symbol" && this.text.slice(from, to) === "@") kind = "attribute";
    const last = this.tokens[this.tokens.length - 1];
    if (last?.kind === "attribute" && last.text === "@" && last.to === from && to > from) {
      const text = this.text.slice(from, to);
      const glued: TokenKind | undefined = kind === "name" || kind === "keyword" ? "attribute" : kind === "symbol" && text === "[" ? "attributeOpen" : undefined;
      if (glued) {
        this.tokens[this.tokens.length - 1] = { ...last, kind: glued, text: last.text + text, to, location: this.location(last.from, to) };
        return;
      }
    }
    const token: Token = { kind, text: this.text.slice(from, to), from, to, location: this.location(from, to), source: this.source };
    if (node) token.node = node;
    // A closer right after a block the tree closed before it (`until` after
    // an `if` with no `end`, #1209) is where Luau reports the block left
    // open, so the errors there are Luau's to report, as at a token the
    // grammar left unread.
    // A bracket closer right after a bracket the tree closed before it
    // (`{ f(1 }`, I-1318) is where Luau reports the bracket left open too.
    const closed = this.closedBefore;
    const closer = (kind === "keyword" && BLOCK_CLOSERS.has(token.text)) || (kind === "symbol" && BRACKET_CLOSERS.has(token.text));
    if (closed?.at === this.tokens.length && closer && !closed.owned.has(token.text)) {
      token.unread = true;
    }
    // The token after a Luau loop with no `do` block is where Luau may
    // report the `do` missing (`readHeaderOnlyLoop`).
    if (this.headerOnlyLoopEnd === this.tokens.length) {
      token.loopHeader = true;
      this.headerOnlyLoopEnd = undefined;
    }
    // So is a reserved word where a `local` needs its name (`local end`,
    // #1906): the grammar ends the declaration with no name, and the word
    // begins whatever it begins, as in Luau.
    // So is one after a comma of its names (`local a, nil`). `local
    // function` is a function declaration.
    const afterLocal = this.tokens[this.tokens.length - 1]?.kind === "keyword" && this.tokens[this.tokens.length - 1]!.text === "local";
    if (kind === "keyword" && !(afterLocal && token.text === "function") && this.atLocalName(token)) token.unread = true;
    this.tokens.push(token);
  }

  /**
   * Whether a token stands where a `local` needs a name: right after the
   * `local`, or after a comma in the `local`'s names, before any `=`
   * (`local a: number, nil`), on any line. A type's own words (`nil`,
   * `true`, `false`) can stand among the names; any other keyword ends the
   * search, and so do two names in a row, which are two statements
   * (`local x` then `f(a, nil)`). A word on a later line than the comma
   * counts only if it is one of those, since the validator reports a
   * statement that begins a later line (`local a,` before `end`).
   */
  private atLocalName(token: Token): boolean {
    const isLocal = (t: Token | undefined) => t?.kind === "keyword" && t.text === "local";
    const last = this.tokens[this.tokens.length - 1];
    if (isLocal(last)) return true;
    if (last?.kind !== "symbol" || last.text !== ",") return false;
    if (token.location.begin.line !== last.location.end.line && !TYPE_KEYWORDS.has(token.text)) return false;
    for (let i = this.tokens.length - 2; i >= 0; i--) {
      const t = this.tokens[i]!;
      if (isLocal(t)) return true;
      if (t.kind === "symbol" && t.text === "=") return false;
      if (t.kind === "keyword" && !TYPE_KEYWORDS.has(t.text)) return false;
      if (t.kind !== "name" && t.kind !== "symbol" && t.kind !== "keyword" && t.kind !== "string") return false;
      if (t.kind === "name" && this.tokens[i + 1]?.kind === "name") return false;
    }
    return false;
  }

  /** Writes a token the unit needs that the text does not hold, at an offset, as part of the node being read. */
  synthetic(kind: TokenKind, text: string, at: number, written?: true): void {
    this.tokens.push({ kind, text, from: at, to: at, location: this.location(at, at), source: this.source, ...(written && { written }) });
  }

  /** Reads the tokens of a node and everything under it. */
  read(node: SyntaxNode): void {
    const name = node.name;
    if (isExplicitRuleName(name, "LuauReturnStatement")) {
      const suffix = returnSuffixSpan(this.text, this.index, node.to);
      this.returnSourceLines.push(this.location(node.from, suffix.to));
      this.returnTriviaSpans.push({ from: node.to, to: suffix.triviaEnd });
    }
    if (isComment(node)) {
      this.comment(node);
      return;
    }
    // An if expression's `else` or `elseif` is the expression's own, not a
    // closer: after its unfinished condition the grammar reports the missing
    // `then` itself.
    if ((name === "LuauElseifKeyword" || name === "LuauElseKeyword") && isIfExpressionKeyword(node)) this.closedBefore = undefined;
    const [from, to] = trimmedRange(this.text, node.from, node.to);
    if (this.luauThroughout && node.type.isError) {
      this.lex(from, to);
      return;
    }
    if (from === to) {
      // Several blocks can close before the same closer (a call's
      // parentheses and the function body around them before the function's
      // `end`): it is foreign when any of them does not own it.
      const owned = node.type.isError ? new Set<string>() : name.endsWith("_end") ? OWN_CLOSERS[name.slice(0, -"_end".length)] : undefined;
      if (owned) {
        const before = this.closedBefore?.at === this.tokens.length ? this.closedBefore.owned : undefined;
        this.closedBefore = { at: this.tokens.length, owned: before ? new Set([...owned].filter((c) => before.has(c))) : owned };
      }
      if (node.type.isError) return;
    }
    // An intersection member line (`& { y: string }`) is read as Luau's
    // lexer reads it, its `&` included: the grammar cannot see whether a type
    // comes before the line, so Luau's reading decides, and where none does
    // every error of that reading, its recovery's included, is Luau's to
    // report (#1374). What the tree reads with meaning of its own, a string
    // (its interpolation), a `new` or one of Sparkdown's own expressions, and
    // the `= value` the line ends with, is read from the tree as anywhere
    // else, so a statement after the member on its line keeps it.
    if (name === "LuauTypeOperatorLineContinuation" && containsUnreadToken(node)) {
      // Only what Luau's lexer reads is unread: what the tree reads reports
      // its own errors as anywhere else.
      const lexUnread = (start: number, end: number): void => {
        const first = this.tokens.length;
        this.lex(start, end);
        for (let i = first; i < this.tokens.length; i++) this.tokens[i]!.unread = true;
      };
      let at = from;
      const visit = (parent: SyntaxNode): void => {
        for (let child = parent.firstChild; child; child = child.nextSibling) {
          if (child.to <= at) continue;
          if (child.from >= to) return;
          if (readsFromTree(child)) {
            lexUnread(at, Math.max(at, child.from));
            this.read(child);
            at = Math.max(at, child.to);
          } else {
            visit(child);
          }
        }
      };
      visit(node);
      lexUnread(at, to);
      return;
    }
    // A token the grammar left unread is read as Luau's lexer reads it, as is
    // the `&` that begins an intersection member line (`UNREAD_TOKENS`).
    if (UNREAD_TOKENS.has(name)) {
      const first = this.tokens.length;
      this.lex(from, to);
      for (let i = first; i < this.tokens.length; i++) this.tokens[i]!.unread = true;
      return;
    }
    // A structural word's rule that holds no arms is read as Luau, through
    // its children: the word is a name (`match(1)` is a call, I-1310).
    if (isSparkdownExpression(node)) {
      if (to > from) this.push("sparkdown", from, to, node);
      return;
    }
    if (name === "LuauNewExpression") {
      this.push("new", from, to, node);
      return;
    }
    if (name === "LuauExplicitStatementMark") {
      this.push("mark", from, to);
      return;
    }
    if (name === "LuauSparkdownExplicitStatement") {
      const first = this.tokens.length;
      this.readChildren(node);
      for (let i = first; i < this.tokens.length; i++) this.tokens[i]!.authoredIsland ??= node.to;
      // Only the narrative island wrapper owns this EOF. Nested marked
      // statements still yield to their written block's closer; genuine
      // functions and opaque constructs extend this wrapper's own span.
      // A bracket left open takes in the line break before the next header
      // (#1907), so the EOF stands at the end of the island's last line,
      // before that break, as it does after a statement that ends its line.
      // A token that takes the break in (an unfinished block comment) still
      // ends where it does, before the EOF.
      let eof = node.to;
      if (this.text[eof - 1] === "\n") eof--;
      if (this.text[eof - 1] === "\r") eof--;
      if (this.tokens.length > first) eof = Math.max(eof, this.tokens[this.tokens.length - 1]!.to);
      // A marked loop with no `do` on its line meets this EOF where the `do`
      // should be, as a story loop does (#1907): Luau's error in its header
      // is the loop's diagnostic. Every loop the statement holds directly
      // counts, not only its first (`& while false do end while true`).
      const loops = node.getChild("LuauSparkdownExplicitStatement_content")?.getChildren("LuauSparkdownExplicitLoop") ?? [];
      const headerOnly = loops.filter((loop) => isStoryHeaderOnlyLoop(loop));
      for (const loop of headerOnly) {
        for (let i = first; i < this.tokens.length; i++) {
          const token = this.tokens[i]!;
          if (token.from >= loop.from && token.from < loop.to) token.loopHeader = true;
        }
      }
      this.tokens.push({ kind: "break", text: "", from: eof, to: eof, location: this.location(eof, eof), source: this.source, story: true, authoredEnd: true, ...(headerOnly.length ? { loopHeaderEnd: true as const } : {}) });
      return;
    }
    // A story declaration or reassignment ends at its line as a marked
    // statement does (#1907), so it is an island with the same EOF. A token
    // later on its line is still one Luau's reading meets, so the EOF stands
    // at the end of that line, where `insertStoryBreaks` puts it, unless a
    // statement that begins later on that line goes on past it, whose own
    // end then ends the reading.
    if (isStoryStatementIsland(node)) {
      const first = this.tokens.length;
      this.readChildren(node);
      const end = lastLineEnd(this.text, node.to);
      const loop = isStoryHeaderOnlyLoop(node);
      for (let i = first; i < this.tokens.length; i++) {
        this.tokens[i]!.authoredIsland ??= end;
        if (loop) this.tokens[i]!.loopHeader = true;
      }
      this.storyIslandEnds.push({ from: node.from, end, source: this.source, ...(loop ? { loop: true as const } : {}), ...(continuesPastLine(node, this.text) ? { continued: true as const } : {}) });
      return;
    }
    if (name === "LuauSparkdownChooseBlock_begin") {
      this.markKeyword("choose", node, "choose");
      return;
    }
    if (name === "LuauSparkdownChooseThenClause_begin") {
      this.markKeyword("chooseThen", node, "then");
      return;
    }
    if (name === "LuauSparkdownChooseBlock_end") {
      this.markKeyword("chooseEnd", node, "end");
      return;
    }
    if (endsStatementBefore(name, this.tokens[this.tokens.length - 1]?.text)) this.statementBreak(from, to);
    if (SPARKDOWN_ONLY.has(name)) return;
    if (name === "LuauScopeModifier") {
      const modifier = this.text.slice(from, to);
      if (LUAU_SCOPE_MODIFIERS.has(modifier)) this.lex(from, to);
      else if (modifier === "store") {
        this.push("store", from, to);
        let rule = node.parent;
        while (rule && rule.name.includes("_")) rule = rule.parent;
        if (rule?.name === "LuauVariableDefinition") this.tokens[this.tokens.length - 1]!.luauCodeStore = true;
      }
      return;
    }
    if (!name.startsWith("Luau") && !isNeutral(node)) return;
    if (isQuotedString(node)) {
      if (to > from) this.push("string", from, to, node);
      return;
    }
    if (name === RAW_STRING) {
      if (to > from) this.push("rawstring", from, to, node);
      return;
    }
    if (name === INTERPOLATED_STRING) {
      if (to > from) this.push("interp", from, to, node);
      return;
    }
    if (isNumber(node)) {
      if (to > from) this.push("number", from, to, node);
      return;
    }
    if (name === "LuauFunctionDefinition") {
      this.readFunctionDefinition(node);
      return;
    }
    if (LUAU_LOOPS.has(name) && !node.getChild(`${name}_content`)?.getChild("LuauDoBlock")) {
      this.readHeaderOnlyLoop(node);
      return;
    }
    if (METHOD_COLON_RULES.has(name)) {
      this.readMethodColon(node);
      return;
    }
    this.readChildren(node);
  }

  /**
   * The `:` of a method access whose name is a header's keyword or a
   * reserved word the grammar reads outside an access path
   * (`LuauLoopHeaderMethodColon`, `LuauIfHeaderMethodColon`,
   * `LuauExpressionKeywordMethodAccessor`, I-1318). After a value Luau calls
   * no method on (`while 1: do`, `for k = 1 : then`), Luau's first error is at
   * the `:`, and the validator leaves it to the type checker, so the errors
   * there are the expression's. After a value Luau calls a method on, Luau
   * reads the `:` and reports nothing at it.
   */
  private readMethodColon(node: SyntaxNode): void {
    const first = this.tokens.length;
    this.readChildren(node);
    for (let i = first; i < this.tokens.length; i++) {
      if (this.tokens[i]!.text === ":") this.tokens[i]!.methodColon = true;
    }
  }

  /**
   * A `while` or `for` loop in Luau code with no `do` block ends at its
   * header's line, or before a closer it does not own (`while true` before
   * the function's `end`, I-1318). Luau's error for the missing `do` (or
   * `in`) is at a token of the header or at the token after it, which no
   * rule of the grammar reports, so the errors there are the loop's, as a
   * story loop's are (#1907); the lowerer reports nothing for it.
   */
  private readHeaderOnlyLoop(node: SyntaxNode): void {
    const first = this.tokens.length;
    this.readChildren(node);
    for (let i = first; i < this.tokens.length; i++) this.tokens[i]!.loopHeader = true;
    this.headerOnlyLoopEnd = this.tokens.length;
  }

  /**
   * Reads a node's children, and the text between them, which no child
   * covers. `handle` may read a child itself, and says whether it did.
   */
  readChildren(node: SyntaxNode, handle?: (child: SyntaxNode) => boolean): void {
    let at = node.from;
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.from > at) this.lex(at, child.from);
      if (!handle?.(child)) this.read(child);
      at = Math.max(at, child.to);
    }
    if (node.to > at) this.lex(at, node.to);
  }

  /**
   * Not part of Luau: a `break` where the tree begins a statement whose
   * first word Luau's parser would read as part of the statement before it
   * (`STATEMENT_BREAKS`): a name (`goto`, `type`, `const`, `define`) or
   * `function`. A keyword that begins a statement ends the one before it
   * in Luau too.
   */
  private statementBreak(from: number, to: number): void {
    // A Luau file is read as Luau reads it.
    if (this.luauThroughout) return;
    // The statement's first words are enough.
    const text = this.text.slice(from, Math.min(to, from + 256));
    if (!breaksStatement(text)) return;
    // A function's attributes begin its statement.
    const at = this.attributesStart();
    const before = this.tokens[at - 1];
    // A statement marked with `&` begins at the mark. Sparkdown ends the
    // statement before only at the end of a line.
    if (!before || before.kind === "mark") return;
    const begin = at === this.tokens.length ? from : this.tokens[at]!.from;
    if (!breaksAcrossLine(this.text.slice(before.to, begin))) return;
    if (at === this.tokens.length) {
      this.push("break", from, from + /^[A-Za-z_][A-Za-z0-9_]*/.exec(text)![0].length);
      return;
    }
    this.tokens.splice(at, 0, { kind: "break", text: "", from: begin, to: begin, location: this.location(begin, begin), source: this.source });
  }

  /** The index of the first of the attributes (`@name`, `@[...]`) the tokens read so far end with. */
  private attributesStart(): number {
    const tokens = this.tokens;
    let at = tokens.length;
    for (;;) {
      const last = tokens[at - 1];
      if (!last) return at;
      if (last.kind === "attribute" && last.text !== "@") {
        at--;
        continue;
      }
      if (last.kind !== "symbol" || last.text !== "]") return at;
      let depth = 0;
      let open = at - 1;
      for (; open >= 0; open--) {
        const token = tokens[open]!;
        if (token.kind === "symbol" && token.text === "]") depth++;
        else if (((token.kind === "symbol" && token.text === "[") || token.kind === "attributeOpen") && --depth === 0) break;
      }
      if (open < 0 || tokens[open]!.kind !== "attributeOpen") return at;
      at = open;
    }
  }

  /** The text of a keyword that marks Sparkdown's own structure, as one token. */
  private markKeyword(kind: TokenKind, node: SyntaxNode, keyword: string): void {
    const text = this.text.slice(node.from, node.to);
    const at = text.indexOf(keyword);
    if (at < 0) return;
    this.push(kind, node.from + at, node.from + at + keyword.length);
  }

  /**
   * A function Sparkdown declares with no parameter list (`function greet`
   * with its body on the lines after) is Luau's `function greet()`: the list
   * is read at the end of the header's line, or in place of a comment that
   * ends it (`function greet -- note`), as the type checker reads it.
   */
  private readFunctionDefinition(node: SyntaxNode): void {
    const content = node.getChild("LuauFunctionDefinition_content");
    const body = content?.getChild("LuauFunctionBody");
    let listAt: number | undefined;
    if (content && body && !content.getChild("LuauFunctionParameters")) {
      let last = body.prevSibling;
      while (last && NEUTRAL.test(last.name)) last = last.prevSibling;
      if (last) {
        const line = this.index.lineAt(Math.max(last.from, last.to - 1));
        if (COMMENT.test(last.name)) {
          if (this.index.lineAt(last.from) === line) listAt = last.from;
        } else if (!this.text.slice(last.to, this.index.lineEnd(line)).trim()) {
          listAt = last.to;
        }
      }
    }
    if (listAt === undefined) {
      this.readChildren(node);
      return;
    }
    const at = listAt;
    this.readChildren(node, (child) => {
      if (child.name !== "LuauFunctionDefinition_content") return false;
      this.readChildren(child, (part) => {
        if (part.name === "LuauFunctionBody") {
          this.synthetic("symbol", "(", at);
          this.synthetic("symbol", ")", at);
        }
        return false;
      });
      return true;
    });
  }

  /** A comment, which is trivia, unless it is a `--!` comment, which Luau's frontend reads. */
  private comment(node: SyntaxNode): void {
    const long = /^--\[(=*)\[/.exec(this.text.slice(node.from, node.to));
    if (long && this.text.indexOf(`]${long[1]}]`, node.from + long[0].length) < 0) {
      this.push("unfinishedComment", node.from, node.to);
      return;
    }
    if (!LINE_COMMENT.test(node.name)) return;
    const [from, to] = trimmedRange(this.text, node.from, node.to);
    const text = this.text.slice(from, to);
    if (!text.startsWith("--!")) return;
    // A hot comment's content is held one character per UTF-8 byte, as Luau's lexer reads it.
    this.hotcomments.push({ header: this.tokens.length === 0, location: this.location(from, to), content: byteString(utf8Encoder.encode(text.slice(3).trimEnd())) });
  }

  /** Splits text into Luau tokens: the text of a leaf, or text between a node's children. */
  lex(from: number, to: number, openInterpolations: readonly number[] = []): void {
    this.interpBraces = [...openInterpolations];
    let i = from;
    while (i < to) i = this.lexOne(i, to);
  }

  /**
   * Reads what begins at `i`, no further than `to`: whitespace, a comment or
   * one token, pushing the token. Returns where the next one begins.
   *
   * What is read depends on the text from `i` to the returned offset, the
   * character there, and at most the 64 characters from `i` (a long
   * bracket's opening); a read clipped at `to` depends on `to` as well.
   */
  lexOne(i: number, to: number): number {
    const text = this.text;
    const ch = text[i]!;
    if (/\s/.test(ch)) return i + 1;
    if (text.startsWith("--", i)) return skipComment(text, i, to);
    // A string, in text the grammar could not read (`luauThroughout`): a
    // long string, or a quoted one, whose interpolations are read as text.
    const long = /^\[(=*)\[/.exec(text.slice(i, i + 64));
    if (long) {
      const close = text.indexOf(`]${long[1]}]`, i + long[0].length);
      const end = close < 0 || close >= to ? to : close + long[1]!.length + 2;
      this.push("rawstring", i, end);
      return end;
    }
    // A backtick string with an interpolation is Luau's lexemes: a section
    // to the interpolation's `{` (`` `a { ``), the interpolation's tokens,
    // and from its `}` the next section (`} b {`, `` } b` ``) (I-1429).
    const braces = this.interpBraces;
    if (ch === "{" && braces.length > 0) braces[braces.length - 1]!++;
    if (ch === "}" && braces.length > 0) {
      if (braces[braces.length - 1]! > 0) braces[braces.length - 1]!--;
      else {
        braces.pop();
        return this.interpSection(i, to);
      }
    }
    if (ch === "`") {
      // One with no interpolation is one string to its closing backtick, or
      // to its line's end, read as far as the section was (`sectionEnd`).
      const { end, opens } = sectionEnd(text, i, to);
      if (opens) return this.interpSection(i, to);
      this.push("string", i, end);
      return end;
    }
    if (ch === '"' || ch === "'") {
      let end = i + 1;
      while (end < to && text[end] !== ch && text[end] !== "\n") end += text[end] === "\\" ? 2 : 1;
      end = Math.min(to, text[end] === ch ? end + 1 : end);
      this.push("string", i, end);
      return end;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i, to));
    if (name) {
      this.push(KEYWORDS.has(name[0]) ? "keyword" : "name", i, i + name[0].length);
      return i + name[0].length;
    }
    const number = /^(?:0[xXbB][0-9A-Za-z_]*|(?:[0-9][0-9_]*\.?[0-9_]*|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9_]*)?[0-9A-Za-z_]*)/.exec(text.slice(i, to));
    if (number && /^\.?[0-9]/.test(text.slice(i, i + 2))) {
      this.push("number", i, i + number[0].length);
      return i + number[0].length;
    }
    const symbol = SYMBOLS.find((s) => text.startsWith(s, i) && i + s.length <= to);
    if (symbol) {
      this.push("symbol", i, i + symbol.length);
      return i + symbol.length;
    }
    const code = text.codePointAt(i)!;
    const length = code > 0xffff ? 2 : 1;
    this.push("unknown", i, i + length);
    return i + length;
  }

  /**
   * Pushes the section of a backtick string that begins at `i`, its opening
   * backtick or an interpolation's `}`, as Luau's lexer reads it: to an
   * interpolation's `{`, which opens one, to the closing backtick, or, with
   * neither on its line, to the line's end, a section it could not finish.
   */
  private interpSection(i: number, to: number): number {
    const { end, opens, finished } = sectionEnd(this.text, i, to);
    this.push("interp", i, end);
    const token = this.tokens[this.tokens.length - 1]!;
    token.section = true;
    if (!finished) token.broken = true;
    if (opens) this.interpBraces.push(0);
    return end;
  }
}

/**
 * Where a backtick string's section that begins at `at` ends, as Luau's
 * lexer reads it: after an interpolation's `{` (`opens`), after the closing
 * backtick, or at the line's end or `to`, unfinished.
 */
function sectionEnd(text: string, at: number, to: number): { end: number; opens: boolean; finished: boolean } {
  let end = at + 1;
  while (end < to && text[end] !== "`" && text[end] !== "{" && text[end] !== "\n") {
    if (text[end] !== "\\") end++;
    // A `\u{` escape's brace opens no interpolation, and `\z` skips the
    // whitespace after it, line breaks included (Luau's
    // `readInterpolatedStringSection`, `readBackslashInString`).
    else if (text.startsWith("u{", end + 1)) end += 3;
    else if (text[end + 1] === "z") {
      end += 2;
      // Luau's whitespace: a space or `\t` through `\r`, not a Unicode space.
      while (end < to && /[ \t-\r]/.test(text[end]!)) end++;
    } else if (text.startsWith("\r\n", end + 1)) end += 3;
    else end += 2;
  }
  if (end >= to || text[end] === "\n") return { end: Math.min(end, to), opens: false, finished: false };
  return { end: end + 1, opens: text[end] === "{", finished: true };
}

/**
 * Appends every item of a list to another. A spread argument
 * (`push(...items)`) passes each item on the call stack, which a document
 * with tens of thousands of tokens overflows.
 */
function appendAll<T>(target: T[], items: readonly T[]): void {
  for (const item of items) target.push(item);
}

/** Where a comment that begins at `at` ends, no further than `to`. */
function skipComment(text: string, at: number, to: number): number {
  const long = /^--\[(=*)\[/.exec(text.slice(at, at + 64));
  if (long) {
    const close = text.indexOf(`]${long[1]}]`, at + long[0].length);
    return close < 0 || close >= to ? to : close + long[1]!.length + 2;
  }
  const end = text.indexOf("\n", at);
  return end < 0 || end > to ? to : end;
}

/** A token's description in an error, as Luau's `Lexeme::toString` writes it. */
function describe(token: Token): string {
  if (token.story && token.kind !== "keyword") return "<eof>";
  switch (token.kind) {
    case "attribute":
      return `'${token.text.slice(1)}'`;
    case "eof":
      return "<eof>";
    case "unfinishedComment":
      return "unfinished comment";
    case "string":
    case "rawstring":
      // A backtick string lexed from text with no interpolation is Luau's
      // interpolated string lexeme, written as it is (I-1429).
      if (token.text.startsWith("`")) return isFinished(token) ? token.text : "malformed string";
      return `"${token.text.replace(/^\[=*\[|^["']|["']$|\]=*\]$/g, "")}"`;
    case "interp":
      // A section Luau's lexer could not finish, or a whole string it could
      // not (`(1 `a {x`)`'s ```)``, I-1435), not a split string's first
      // lexeme, is Luau's malformed string.
      return token.broken || (!token.lexemesOf && !token.section && token.text.startsWith("`") && !isFinished(token)) ? "malformed string" : token.text;
    default:
      return `'${token.text}'`;
  }
}

/** A token's kind in an error, as Luau's `Lexeme::toString` writes a lexeme of its type alone. */
function describeKind(token: Token): string {
  switch (token.kind) {
    case "name":
      return "identifier";
    case "number":
      return "number";
    case "string":
    case "rawstring":
      return "string";
    case "eof":
      return "<eof>";
    case "interp":
      // A backtick string's lexemes (`interpLexemes`), or the whole string,
      // which Luau's lexer reads as its first lexeme (I-1419).
      if (token.broken || (!token.lexemesOf && !token.section && token.text.startsWith("`") && !isFinished(token))) return "malformed string";
      if (token.node) return stringPartNodes(token.node, BACKTICK_INTERPOLATION).length > 0 ? "the beginning of an interpolated string" : "interpolated string";
      if (token.text.startsWith("`")) return "the beginning of an interpolated string";
      return token.text.endsWith("{") ? "the middle of an interpolated string" : "the end of an interpolated string";
    default:
      return `'${token.text}'`;
  }
}

// ---------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------

const utf8Encoder = new TextEncoder();

/** A string's characters as bytes, one character per byte, as `Ast.ts` holds a string's value. */
function byteString(bytes: ArrayLike<number>): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

function unescape(ch: string): number {
  switch (ch) {
    case "a":
      return 0x07;
    case "b":
      return 0x08;
    case "f":
      return 0x0c;
    case "n":
      return 0x0a;
    case "r":
      return 0x0d;
    case "t":
      return 0x09;
    case "v":
      return 0x0b;
    default:
      return ch.charCodeAt(0);
  }
}

function utf8(code: number): number[] | undefined {
  if (code < 0x80) return [code];
  if (code < 0x800) return [0xc0 | (code >>> 6), 0x80 | (code & 0x3f)];
  if (code < 0x10000) return [0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f)];
  if (code < 0x110000) return [0xf0 | (code >>> 18), 0x80 | ((code >>> 12) & 0x3f), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f)];
  return undefined;
}

/**
 * The value of a quoted string's text between its quotes, with its escapes
 * read as Luau reads them (`Lexer::fixupQuotedString`), or undefined when an
 * escape is malformed.
 */
function quotedValue(raw: string): string | undefined {
  const bytes = utf8Encoder.encode(raw);
  const out: number[] = [];
  const isHex = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
  const hexValue = (c: number) => (c <= 57 ? c - 48 : (c | 0x20) - 87);
  for (let i = 0; i < bytes.length; ) {
    if (bytes[i] !== 0x5c) {
      out.push(bytes[i]!);
      i++;
      continue;
    }
    if (i + 1 === bytes.length) return undefined;
    const escape = bytes[i + 1]!;
    i += 2;
    if (escape === 0x0a) out.push(0x0a);
    else if (escape === 0x0d) {
      out.push(0x0a);
      if (bytes[i] === 0x0a) i++;
    } else if (escape === 0) return undefined;
    else if (escape === 0x78) {
      if (i + 2 > bytes.length || !isHex(bytes[i]!) || !isHex(bytes[i + 1]!)) return undefined;
      out.push(hexValue(bytes[i]!) * 16 + hexValue(bytes[i + 1]!));
      i += 2;
    } else if (escape === 0x7a) {
      while (i < bytes.length && (bytes[i] === 0x20 || (bytes[i]! >= 0x09 && bytes[i]! <= 0x0d))) i++;
    } else if (escape === 0x75) {
      if (i + 3 > bytes.length || bytes[i] !== 0x7b) return undefined;
      i++;
      if (bytes[i] === 0x7d) return undefined;
      let code = 0;
      for (let j = 0; j < 16; j++) {
        if (i === bytes.length) return undefined;
        if (bytes[i] === 0x7d) break;
        if (!isHex(bytes[i]!)) return undefined;
        code = (16 * code + hexValue(bytes[i]!)) >>> 0;
        i++;
      }
      if (i === bytes.length || bytes[i] !== 0x7d) return undefined;
      i++;
      const encoded = utf8(code);
      if (!encoded) return undefined;
      out.push(...encoded);
    } else if (escape >= 0x30 && escape <= 0x39) {
      let code = escape - 0x30;
      for (let j = 0; j < 2; j++) {
        if (i === bytes.length || bytes[i]! < 0x30 || bytes[i]! > 0x39) break;
        code = 10 * code + (bytes[i]! - 0x30);
        i++;
      }
      if (code > 0xff) return undefined;
      out.push(code);
    } else {
      out.push(unescape(String.fromCharCode(escape)));
    }
  }
  return byteString(out);
}

/** The value of a long string (`[[...]]`), as Luau reads it (`Lexer::fixupMultilineString`). */
function rawValue(text: string): string {
  const open = /^\[=*\[/.exec(text)?.[0] ?? "[[";
  const close = open.replace(/\[/g, "]");
  let body = text.slice(open.length, text.endsWith(close) ? text.length - close.length : text.length);
  if (body.startsWith("\r\n")) body = body.slice(2);
  else if (body.startsWith("\n")) body = body.slice(1);
  body = body.replace(/\r\n/g, "\n");
  const nul = body.indexOf("\0");
  if (nul >= 0) body = body.slice(0, nul);
  return byteString(utf8Encoder.encode(body));
}

const ULLONG_MAX = (1n << 64n) - 1n;

/** A number constant's value, as Luau's `parseDouble` reads its text, or undefined when it is malformed. */
function numberValue(text: string): number | undefined {
  const data = text.replaceAll("_", "");
  if (/^0[bB]./.test(data)) {
    const digits = data.slice(2);
    if (!/^[01]+$/.test(digits)) return undefined;
    const value = BigInt(`0b${digits}`);
    return Number(value > ULLONG_MAX ? ULLONG_MAX : value);
  }
  if (/^0[xX]./.test(data)) {
    const digits = data.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(digits)) return undefined;
    const value = BigInt(`0x${digits}`);
    return Number(value > ULLONG_MAX ? ULLONG_MAX : value);
  }
  const match = /^(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(data);
  if (!match || match[0].length !== data.length) return undefined;
  return Number(match[0]);
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

interface BinaryOpPriority {
  left: number;
  right: number;
}

// Luau's operator priorities (`Parser::parseExpr`), by `BinaryOp`.
const BINARY_PRIORITY: readonly BinaryOpPriority[] = [
  { left: 6, right: 6 }, // '+'
  { left: 6, right: 6 }, // '-'
  { left: 7, right: 7 }, // '*'
  { left: 7, right: 7 }, // '/'
  { left: 7, right: 7 }, // '//'
  { left: 7, right: 7 }, // '%'
  { left: 10, right: 9 }, // '^', right associative
  { left: 5, right: 4 }, // '..', right associative
  { left: 3, right: 3 }, // '~='
  { left: 3, right: 3 }, // '=='
  { left: 3, right: 3 }, // '<'
  { left: 3, right: 3 }, // '<='
  { left: 3, right: 3 }, // '>'
  { left: 3, right: 3 }, // '>='
  { left: 2, right: 2 }, // 'and'
  { left: 1, right: 1 }, // 'or'
];

const UNARY_PRIORITY = 8;

// The tables below are read with a token's text, so they are Maps: an
// object would also answer for the names it inherits (`constructor`).
const BINARY_OPS = new Map<string, BinaryOp>([
  ["+", BinaryOp.Add],
  ["-", BinaryOp.Sub],
  ["*", BinaryOp.Mul],
  ["/", BinaryOp.Div],
  ["//", BinaryOp.FloorDiv],
  ["%", BinaryOp.Mod],
  ["^", BinaryOp.Pow],
  ["..", BinaryOp.Concat],
  ["~=", BinaryOp.CompareNe],
  ["==", BinaryOp.CompareEq],
  ["<", BinaryOp.CompareLt],
  ["<=", BinaryOp.CompareLe],
  [">", BinaryOp.CompareGt],
  [">=", BinaryOp.CompareGe],
]);

const COMPOUND_OPS = new Map<string, BinaryOp>([
  ["+=", BinaryOp.Add],
  ["-=", BinaryOp.Sub],
  ["*=", BinaryOp.Mul],
  ["/=", BinaryOp.Div],
  ["//=", BinaryOp.FloorDiv],
  ["%=", BinaryOp.Mod],
  ["^=", BinaryOp.Pow],
  ["..=", BinaryOp.Concat],
]);

// Other languages' operators, which Luau reads as its own and reports.
const CONFUSABLE_BINARY_OPS = new Map<string, [BinaryOp, string]>([
  ["&&", [BinaryOp.And, "and"]],
  ["||", [BinaryOp.Or, "or"]],
  ["!=", [BinaryOp.CompareNe, "~="]],
]);

interface Name {
  name: string;
  location: Location;
}

interface Binding {
  name: Name;
  annotation: AstType | undefined;
  isConst: boolean;
}

interface FunctionState {
  vararg: boolean;
  loopDepth: number;
  /** A written Luau function, rather than the synthetic scene-flow wrapper. */
  luau?: boolean;
}

/** What a parser reads besides its tokens: the document, for the text of Sparkdown's constructs and of strings. */
interface ReadContext {
  text: string;
  index: LineIndex;
}

/** The name Luau's parser gives a name it expected and did not find. */
const ERROR_NAME = "%error-id%";

// Luau's `FInt::LuauRecursionLimit`, `FInt::LuauTypeLengthLimit` and `FInt::LuauParseErrorLimit`.
const RECURSION_LIMIT = 1000;
const TYPE_LENGTH_LIMIT = 1000;
const ERROR_LIMIT = 100;

/** An error that ends the reading, as Luau's `ParseErrors` exception ends a parse: a limit reached. */
class FatalReadError extends Error {
  constructor(
    readonly location: Location,
    message: string,
  ) {
    super(message);
  }
}

// The attributes Luau knows (`kAttributeEntries`), by name.
const ATTRIBUTES = new Map<string, AstAttrType>([
  ["checked", AstAttrType.Checked],
  ["native", AstAttrType.Native],
  ["deprecated", AstAttrType.Deprecated],
]);

function isConstantLiteral(expr: AstExpr): boolean {
  return expr instanceof AstExprConstantNil || expr instanceof AstExprConstantBool || expr instanceof AstExprConstantNumber || expr instanceof AstExprConstantString;
}

function isLiteralTable(expr: AstExpr): boolean {
  if (!(expr instanceof AstExprTable)) return false;
  for (const item of expr.items) {
    if (item.kind === TableItemKind.General) return false;
    if (!isConstantLiteral(item.value) && !isLiteralTable(item.value)) return false;
  }
  return true;
}

/** The errors in the arguments of `@deprecated`, as Luau's `deprecatedArgsValidator` finds them. */
function deprecatedArgsErrors(attrLoc: Location, args: AstExpr[]): [Location, string][] {
  if (args.length === 0) return [];
  if (args.length > 1) return [[attrLoc, "@deprecated can be parametrized only by 1 argument"]];
  const arg = args[0]!;
  if (!(arg instanceof AstExprTable)) return [[arg.location, "Unknown argument type for @deprecated"]];
  const errors: [Location, string][] = [];
  for (const item of arg.items) {
    if (item.kind === TableItemKind.Record) {
      const key = (item.key as AstExprConstantString).value;
      if (key !== "use" && key !== "reason") {
        errors.push([item.key!.location, `Unknown argument '${key}' for @deprecated. Only string constants for 'use' and 'reason' are allowed`]);
      } else if (!(item.value instanceof AstExprConstantString)) {
        errors.push([item.value.location, `Only constant string allowed as value for '${key}'`]);
      }
    } else {
      errors.push([item.value.location, "Only constants keys 'use' and 'reason' are allowed for @deprecated attribute"]);
    }
  }
  return errors;
}

/** A statement a block read: its tokens, by index into the token list it was read from, and its errors, by index. */
interface StatementSpan {
  tokens: Token[];
  first: number;
  end: number;
  errorsFrom: number;
  errorsTo: number;
}

/**
 * Luau's recursive descent over the tree's tokens. A Luau construct is read
 * as `Parser.cpp` reads it, with its node's location spanning the same
 * tokens; a syntax error is reported with Luau's message and recovered from
 * more simply than Luau does, since no consumer reads the recovery's shape.
 */
class Parser {
  private pos = 0;
  readonly errors: LuauSyntaxError[] = [];
  readonly sourceDependencies = new Set<string>();
  private readonly functionStack: FunctionState[] = [{ vararg: true, loopDepth: 0 }];
  private readonly localMap = new Map<string, AstLocal | undefined>();
  private readonly localStack: AstLocal[] = [];
  private eof: Token;
  private blockDepth = 0;
  private recursionCounter = 0;
  private recursionContext = "block";
  /** The function depth of the type function being read, which may not reference the locals outside it. */
  private typeFunctionDepth = 0;
  private readonly declaredExportBindings = new Map<string, Location>();
  private hasModuleReturn = false;
  private returnFunction?: FunctionState;
  // Not part of Luau: how many of Sparkdown's own constructs whose syntax
  // Sparkdown reports are being read (a `store` declaration, a double-quoted
  // string's interpolation; see `report`), the index of the token the last error was reported at, and
  // the closing brackets given up on in the blocks being read (see
  // `parseBlockNoScope`).
  private sparkdownDepth = 0;
  // Not part of Luau: whether the error being reported is one of a backtick
  // string's own (`LuauSyntaxError.ofString`, `reportStringError`).
  private stringError = false;
  // Not part of Luau: whether the reading has gone on past the end of the
  // chunk Luau's parser stops at (`parseChunk`).
  private pastChunkEnd: Location | undefined;
  // Not part of Luau: how many attribute lists (`@[...]`) are being read;
  // every error met in one is the list's (`MalformedConstruct` "attribute").
  private attributeListDepth = 0;
  // Not part of Luau: how many errors the reading has met, a second at one
  // location included, and the index of the token the last was met at.
  private reports = 0;
  private errorPos = -1;
  private errorLine = -1;
  // Not part of Luau: the index of the last token read because the reading
  // expected it there (a `then`, a closing bracket), which reads on as
  // written after an error at it (see `parseBlockNoScope`).
  private expectedPos = -1;
  private skippedPos = -1;
  // Not part of Luau: the token where an assigned value or an if
  // expression's arm begins, whose absence Sparkdown's own syntax reports
  // where a `:` stands instead (`nameMalformed`).
  private valuePos = -1;
  // Not part of Luau: the statement being read, where it begins and whether
  // its first error is there (see `report`).
  private statementState: { begin: Position; hasError: boolean; startsAtError: boolean } | undefined;
  // Not part of Luau: where the statement being read begins when it begins
  // on the line where the statement before it stopped at an error (see
  // `parseBlockNoScope`).
  private followerStart: Position | undefined;
  // Not part of Luau: where the last error of the statement being read begins (see `report`).
  private statementErrorBegin: Position | undefined;
  private readonly abandonedClosers: { text: string }[] = [];
  // The opener of the last block whose closer stood on another line and in
  // another column than it, which an `end` Luau finds missing later may
  // have been meant to close (Luau's `endMismatchSuspect`).
  private endMismatchSuspect: Token | undefined;
  // Not part of Luau: for each statement being read, the statements read
  // in it so far, by their tokens and errors, and the errors reported at a
  // token the grammar left unread (see `markUnreadErrors`).
  private readonly statementSpans: StatementSpan[][] = [];
  private readonly errorsAtUnread = new Set<number>();
  /** Not part of Luau: the document ranges of the statements whose errors are Luau's to report (`markUnreadErrors`). */
  readonly unreadStatements: { from: number; to: number }[] = [];

  /** The block depth whose statements are recorded in `statements`, with the tokens each was read from. */
  recordDepth = -1;
  /**
   * Not part of Luau: how many of the functions being read, outermost first,
   * hold the story's own statements rather than a Luau function's body: the
   * chunk, and in a flow the flow's wrapper too. A `run` file has none, since
   * all of its text is the body of the function a `run` calls. A `const`
   * declared in a Luau function is Luau's, a local that cannot be
   * reassigned; one declared in the story is the story's published constant,
   * which the compiler reports on itself (`isLuauConst`).
   */
  storyFunctions = 1;
  readonly statements: { statement: AstStat; first: number; end: number }[] = [];

  constructor(
    private tokens: Token[],
    private readonly ctx: ReadContext,
    private previous: Location,
    eofAt?: Position,
  ) {
    const last = tokens[tokens.length - 1];
    const end = eofAt ?? (last ? last.location.end : previous.end);
    this.eof = { kind: "eof", text: "", from: last?.to ?? 0, to: last?.to ?? 0, location: new Location(end, end), source: -1 };
  }

  // -- Tokens --------------------------------------------------------------

  private current(): Token {
    return this.tokens[this.pos] ?? this.eof;
  }

  /**
   * The current token, as an error that rejects it describes and ranges
   * it: a backtick string with interpolations is Luau's lexemes, read on
   * one at a time after its first (`` `a { ``, I-1419).
   */
  private rejected(): Token {
    const lexemes = this.interpLexemes(this.current());
    if (lexemes) this.tokens.splice(this.pos, 1, ...lexemes);
    return this.current();
  }

  private lookahead(): Token {
    return this.tokens[this.pos + 1] ?? this.eof;
  }

  private next(): void {
    const token = this.tokens[this.pos];
    if (token) {
      this.previous = token.location;
      this.pos++;
    }
  }

  private previousLocation(): Location {
    return this.previous;
  }

  /** Source read outside the unit's tokens must also invalidate its cached check. */
  recordSourceDependency(from: number, to: number): void {
    this.sourceDependencies.add(JSON.stringify([
      this.ctx.index.position(from), this.ctx.index.position(to), this.ctx.text.slice(from, to),
    ]));
  }

  private is(text: string, token = this.current()): boolean {
    return (token.kind === "symbol" || token.kind === "keyword") && token.text === text;
  }

  private isName(token = this.current()): boolean {
    return token.kind === "name";
  }

  /**
   * Reads tokens of their own (a string's interpolation) as part of this
   * parse, with the same locals and functions in scope. They end at `end`,
   * where the reading meets its own end of input, so an error at the end of
   * the tokens is placed there rather than after the rest of the unit.
   */
  private withTokens<T>(tokens: Token[], end: Location, read: () => T): T {
    const saved = { tokens: this.tokens, pos: this.pos, previous: this.previous, eof: this.eof };
    this.tokens = tokens;
    this.pos = 0;
    this.eof = { kind: "eof", text: "", from: 0, to: 0, location: end, source: -1 };
    try {
      return read();
    } finally {
      this.tokens = saved.tokens;
      this.pos = saved.pos;
      this.previous = saved.previous;
      this.eof = saved.eof;
    }
  }

  // -- Errors --------------------------------------------------------------

  private report(location: Location, message: string, malformed?: MalformedConstruct): void {
    this.reports++;
    // The token the error is at: the current one, or the one read last when
    // the error is about tokens already read (a malformed number).
    const aboutRead = !location.begin.equals(location.end) && !location.end.gt(this.previousLocation().end) && this.pos > 0;
    const errorPos = aboutRead ? this.pos - 1 : this.pos;
    // Not part of Luau: an error about tokens read before the last error's
    // (a `const` declaration missing its value after a malformed annotation)
    // leaves the reading at the later error.
    if (errorPos >= this.errorPos) {
      this.errorPos = errorPos;
      this.errorLine = location.end.line;
    }
    // Luau keeps one error of a location, the first.
    const last = this.errors[this.errors.length - 1];
    if (last && last.location.equals(location)) return;
    const error: LuauSyntaxError = { location, message };
    // Not part of Luau: what is malformed, unless the token found is
    // Sparkdown's own, the error is in a `store` declaration or a
    // double-quoted string's interpolation (`sparkdownDepth`), it is at the
    // first token of a statement that follows one stopped at an error (see
    // `parseBlockNoScope`), or the statement's earlier error leads to it,
    // which Luau reports from the same token or an earlier one (a method
    // call's missing arguments after its missing name).
    const follows = this.followerStart !== undefined && location.begin.equals(this.followerStart);
    // A statement whose first error is at its first token is read on in
    // Luau's recovery (`, 2` after `g += 1` reads as an assignment), and
    // every later error in it is that recovery's.
    const statement = this.statementState;
    if (statement && !statement.hasError) {
      statement.hasError = true;
      statement.startsAtError = location.begin.equals(statement.begin);
    }
    const recovering = statement?.startsAtError === true && location.begin.gt(statement.begin);
    const consequence = recovering || (this.statementErrorBegin !== undefined && !location.begin.gt(this.statementErrorBegin));
    // A type, an annotation or an attribute's function that story ends
    // before is malformed where the end of the unit's Luau would leave it
    // so; Sparkdown's own syntax does not read one (`local x:` or
    // `store f = @native` before a line of story).
    // A marked narrative statement owns its missing value/closer at its
    // authored EOF. The following prose only supplies a synthetic break;
    // delegating this error to story grammar would drop it entirely.
    // Genuine Luau functions keep their existing multiline recovery.
    const boundedStoryEnd = !this.currentFunction().luau && this.current().kind === "break" && this.current().authoredEnd === true;
    // An error met in an attribute list is the list's, and Luau's attribute
    // errors are Luau's own even in a `store` declaration's value, since
    // Sparkdown's syntax does not read an attribute's meaning.
    malformed ??= this.attributeListDepth > 0 ? "attribute" : undefined;
    // A story loop header with no `do` on its line meets its end of input
    // where the `do` should be (#1907): Luau's error there is the loop's.
    malformed ??= (boundedStoryEnd && this.current().loopHeaderEnd) || this.current().loopHeader ? "statement" : undefined;
    // So is one at the `:` of a method access after a value Luau calls no
    // method on (`while 1: do`, `readMethodColon`).
    malformed ??= this.current().methodColon ? "expression" : undefined;
    const sparkdownOwned = this.sparkdownDepth > 0 && malformed !== "attribute";
    const atSparkdown = !boundedStoryEnd && (SPARKDOWN_TOKENS.has(this.current().kind) || (this.current().story && this.current().kind === "keyword")) && !(this.current().story && (malformed === "type" || malformed === "annotation" || malformed === "attribute"));
    if (malformed && !follows && !consequence && !sparkdownOwned && !atSparkdown && !this.atAbandonedCloser()) {
      error.malformed = malformed;
      this.statementErrorBegin = location.begin;
    }
    // A backtick string's own error is the string's, whatever token the
    // reading meets after it (I-1435).
    if (this.stringError) error.ofString = true;
    else if (atSparkdown) error.sparkdown = true;
    if (this.pastChunkEnd) error.pastChunkEnd = this.pastChunkEnd;
    if (this.tokens[errorPos]?.unread) this.errorsAtUnread.add(this.errors.length);
    this.errors.push(error);
    if (this.errors.length >= ERROR_LIMIT) throw new FatalReadError(location, `Reached error limit (${ERROR_LIMIT})`);
  }

  /**
   * Not part of Luau: whether the reading stands at a closer of a bracket
   * it gave up on, where an error is the recovery's from the error at that
   * bracket (`{nil=_,}` reads `_,` and then expects a value at the `}`).
   */
  private atAbandonedCloser(): boolean {
    const current = this.current();
    return current.kind === "symbol" && this.abandonedClosers.some((closer) => closer.text === current.text);
  }

  /**
   * Not part of Luau: ends the statement just read, marking its errors as
   * `unread` when a token of its own, not of a statement nested in it, is
   * one the grammar left unread, when one of its own errors is at such a
   * token (`{ 1 ? 2 }` ends at the `?`), when such a token follows it on
   * its line, or when it was read in the recovery from such errors
   * (`recovery`). Luau's reading then reports
   * every error of the statement and of its recovery, since no rule of the
   * grammar reports any of them; a statement nested in it marks its own.
   * Returns whether the statement's errors are Luau's to report.
   */
  private markUnreadErrors(span: StatementSpan, recovery: boolean): boolean {
    const nested = this.statementSpans.pop() ?? [];
    let unread = recovery;
    const own = (e: number) => !nested.some((inner) => inner.errorsFrom <= e && e < inner.errorsTo);
    for (let e = span.errorsFrom; e < span.errorsTo && !unread; e++) if (this.errorsAtUnread.has(e) && own(e)) unread = true;
    let n = 0;
    for (let i = span.first; i < span.end && !unread; i++) {
      while (n < nested.length && (nested[n]!.tokens !== span.tokens || nested[n]!.end <= i)) n++;
      const inner = nested[n];
      if (inner && inner.first <= i) {
        i = inner.end - 1;
        continue;
      }
      if (span.tokens[i]?.unread) unread = true;
    }
    // A statement that a token the grammar left unread follows on its line
    // (`return 0x` before `.i`), as the validator leaves it to this reading.
    const last = span.tokens[span.end - 1];
    const after = span.tokens[span.end];
    if (after?.unread && last && after.location.begin.line === last.location.end.line) unread = true;
    if (unread) {
      for (let e = span.errorsFrom; e < span.errorsTo; e++) if (own(e)) this.errors[e]!.unread = true;
      const first = span.tokens[span.first];
      if (first && last) this.unreadStatements.push({ from: first.from, to: last.to });
    }
    this.statementSpans[this.statementSpans.length - 1]?.push(span);
    return unread;
  }

  /** Counts one more level of nesting, as Luau's `incrementRecursionCounter` does, ending the reading past its limit. */
  private incrementRecursionCounter(context: string): void {
    this.recursionCounter++;
    this.recursionContext = context;
    if (this.recursionCounter > RECURSION_LIMIT) {
      throw new FatalReadError(this.current().location, `Exceeded allowed recursion depth; simplify your ${context} to make the code compile`);
    }
  }

  /**
   * The error that ends a reading which threw: a limit Luau reaches, or a
   * JavaScript stack that runs out below the recursion limit, which ends the
   * reading as the limit would. Anything else is rethrown.
   */
  fatalError(caught: unknown): LuauSyntaxError {
    if (caught instanceof FatalReadError) return { location: caught.location, message: caught.message };
    const stackExhausted = caught instanceof RangeError || (caught instanceof Error && caught.name === "InternalError"); // not a node name
    if (!stackExhausted) throw caught;
    return { location: this.current().location, message: `Exceeded allowed recursion depth; simplify your ${this.recursionContext} to make the code compile` };
  }

  private reportExprError(location: Location, expressions: AstExpr[], message: string, malformed?: MalformedConstruct): AstExprError {
    this.report(location, message, malformed);
    return new AstExprError(location, expressions, this.errors.length - 1);
  }

  /** Reports one of a backtick string's own errors (`LuauSyntaxError.ofString`). */
  private reportStringError(location: Location, expressions: AstExpr[], message: string, malformed?: MalformedConstruct): AstExprError {
    this.stringError = true;
    try {
      return this.reportExprError(location, expressions, message, malformed);
    } finally {
      this.stringError = false;
    }
  }

  private reportStatError(location: Location, expressions: AstExpr[], statements: AstStat[], message: string, malformed?: MalformedConstruct): AstStatError {
    this.report(location, message, malformed);
    return new AstStatError(location, expressions, statements, this.errors.length - 1);
  }

  private reportTypeError(location: Location, types: AstType[], message: string, malformed?: MalformedConstruct): AstTypeError {
    this.report(location, message, malformed);
    return new AstTypeError(location, types, false, this.errors.length - 1);
  }

  private expectAndConsume(text: string, context?: string, malformed?: MalformedConstruct): boolean {
    if (this.is(text)) {
      this.nextExpected();
      return true;
    }
    this.expectAndConsumeFail(text, context, malformed);
    // An extra token before the one expected is skipped.
    if (this.is(text, this.lookahead())) {
      this.next();
      this.nextExpected();
    }
    return false;
  }

  /** Reads a token the reading expected where it stands (see `expectedPos`). */
  private nextExpected(): void {
    this.expectedPos = this.pos;
    this.next();
  }

  /**
   * Not part of Luau: whether the reading stands at its last error: at the
   * error's token, or just past it where it read that token without
   * expecting it there (`local x: ?number` reads the `?`), unless the token
   * is a `;`, which ends a statement wherever it stands.
   */
  private standsAtError(): boolean {
    if (this.errorPos < 0) return false;
    const at = this.errorPos === this.pos || this.errorPos === this.skippedPos || (this.errorPos === this.pos - 1 && this.expectedPos !== this.errorPos);
    return at && this.tokens[this.errorPos]?.text !== ";";
  }

  /**
   * Not part of Luau: whether a `::` stands where an annotation's `:` does,
   * after a name, a scope modifier or a function's parameters, rather than
   * as a cast after a value Luau reports otherwise (a table type's indexer).
   */
  private isAnnotationColon(): boolean {
    if (!this.is("::")) return false;
    const before = this.tokens[this.pos - 1];
    if (!before) return false;
    return before.kind === "name" || this.is(")", before) || this.is("local", before) || before.kind === "store";
  }

  private expectAndConsumeFail(text: string, context?: string, malformed?: MalformedConstruct): void {
    const got = describe(this.rejected());
    const message = context !== undefined ? `Expected '${text}' when parsing ${context}, got ${got}` : `Expected '${text}', got ${got}`;
    // Not part of Luau: a `::` where a token was expected is an annotation written with it.
    this.report(this.current().location, message, malformed ?? (this.isAnnotationColon() ? "annotation" : undefined));
  }

  private expectMatchAndConsume(text: string, begin: Token, searchForMissing = false, construct?: MalformedConstruct): boolean {
    if (this.is(text)) {
      this.nextExpected();
      return true;
    }
    this.expectMatchAndConsumeFail(text, begin, "", construct);
    if (searchForMissing) {
      const line = this.previousLocation().end.line;
      while (this.current().kind !== "eof" && this.current().location.begin.line === line && !this.is(text) && !this.is("end")) this.next();
      if (this.is(text)) {
        this.nextExpected();
        return true;
      }
    } else if (this.is(text, this.lookahead())) {
      this.next();
      this.nextExpected();
      return true;
    }
    // Not part of Luau: the bracket is given up on (see `parseBlockNoScope`).
    if (CLOSERS.has(text)) this.abandonedClosers.push({ text });
    return false;
  }

  private expectMatchAndConsumeFail(text: string, begin: Token, extra = "", construct?: MalformedConstruct): void {
    const location = this.rejected().location;
    const got = `${describe(this.current())}${extra}`;
    const open = begin.kind === "chooseThen" || begin.kind === "choose" ? "choose" : begin.text;
    // Not part of Luau: a `::` where the closer was expected is an annotation written with it.
    // A written expression delimiter cannot be repaired by the next story
    // line. Keyword closers retain their separate diagnostic ownership.
    const boundedDelimiter = CLOSERS.has(text) && begin.from < begin.to && begin.authoredIsland !== undefined && !this.currentFunction().luau;
    const malformed = construct ?? (this.isAnnotationColon() ? "annotation" : boundedDelimiter ? "expression" : undefined);
    if (location.begin.line === begin.location.begin.line)
      this.report(location, `Expected '${text}' (to close '${open}' at column ${begin.location.begin.column + 1}), got ${got}`, malformed);
    else this.report(location, `Expected '${text}' (to close '${open}' at line ${begin.location.begin.line + 1}), got ${got}`, malformed);
  }

  private expectMatchEndAndConsume(text: string, begin: Token): boolean {
    if (this.is(text)) {
      // A closer on another line and in another column than its opener is
      // indented as if it closed something else.
      const at = this.current().location.begin;
      const opened = begin.location.begin;
      // A unit's own opener (a flow's wrapper function) is no author's.
      if (begin.from < begin.to && at.line !== opened.line && at.column !== opened.column && (this.endMismatchSuspect?.location.begin.line ?? 0) < opened.line) {
        this.endMismatchSuspect = begin;
      }
      this.nextExpected();
      return true;
    }
    // A written else/elseif after else is not a later narrative branch and cannot
    // repair this Luau island. Its grammar has a written outer end, so only
    // the converter owns the native misplaced-branch diagnostic. Keep EOF
    // and other keyword-closer diagnostics under their existing ownership.
    const misplacedElseBranch = begin.authoredIsland !== undefined && !this.currentFunction().luau && begin.from < begin.to && begin.text === "else" && (this.is("else") || this.is("elseif")) && this.current().from < this.current().to;
    const suspect = this.endMismatchSuspect;
    const suggestion = suspect && suspect.location.begin.line > begin.location.begin.line ? `; did you forget to close ${describeKind(suspect)} at line ${suspect.location.begin.line + 1}?` : "";
    this.expectMatchAndConsumeFail(text, begin, suggestion, misplacedElseBranch ? "statement" : undefined);
    if (this.current().kind === "unfinishedComment") {
      this.next();
      return false;
    }
    if (this.is(text, this.lookahead())) {
      this.next();
      this.nextExpected();
      return true;
    }
    return false;
  }

  // -- Locals --------------------------------------------------------------

  private currentFunction(): FunctionState {
    return this.functionStack[this.functionStack.length - 1]!;
  }

  private pushLocal(binding: Binding): AstLocal {
    const name = binding.name;
    const local = new AstLocal(
      name.name,
      name.location,
      this.localMap.get(name.name),
      this.functionStack.length - 1,
      this.currentFunction().loopDepth,
      binding.annotation,
      binding.isConst,
    );
    this.localMap.set(name.name, local);
    this.localStack.push(local);
    return local;
  }

  private saveLocals(): number {
    return this.localStack.length;
  }

  private restoreLocals(offset: number): void {
    for (let i = this.localStack.length; i > offset; --i) {
      const l = this.localStack[i - 1]!;
      this.localMap.set(l.name, l.shadow);
    }
    this.localStack.length = offset;
  }

  // -- Blocks and statements -----------------------------------------------

  private blockFollow(token: Token): boolean {
    if (token.kind === "eof" || token.kind === "unfinishedComment" || token.kind === "chooseThen" || token.kind === "chooseEnd") return true;
    return token.kind === "keyword" && (token.text === "else" || token.text === "elseif" || token.text === "end" || token.text === "until");
  }

  /** Whether the tokens are a function's parameter list, brackets included, and nothing else. */
  readsAsParameterList(): boolean {
    const open = this.current();
    if (!this.is("(")) return false;
    this.next();
    if (!this.is(")")) this.parseBindingList([], true);
    this.expectMatchAndConsume(")", open);
    return this.errors.length === 0 && this.current().kind === "eof";
  }

  /** One expression, which must be all the tokens hold. */
  parseLoneExpression(): AstExpr {
    const expr = this.parseExpr();
    if (this.current().kind !== "eof") this.report(this.rejected().location, `Expected the end of the expression, got ${describe(this.current())}`);
    return expr;
  }

  parseChunk(): AstStatBlock {
    const result = this.parseBlock();
    while (this.current().kind !== "eof") {
      this.report(this.rejected().location, `Expected <eof>, got ${describe(this.current())}`);
      // Not part of Luau, whose parser stops there: the rest is read on for
      // Sparkdown's own use, and its errors are none of Luau's, up to the
      // next place it stops, which the errors after it name.
      this.pastChunkEnd = this.current().location;
      this.next();
      const rest = this.parseBlock();
      appendAll(result.body, rest.body);
    }
    return result;
  }

  private parseBlock(begin?: Token, closer = "end"): AstStatBlock {
    const localsBegin = this.saveLocals();
    const result = this.parseBlockNoScope(begin, closer);
    this.restoreLocals(localsBegin);
    return result;
  }

  private parseBlockNoScope(begin?: Token, closer = "end"): AstStatBlock {
    const body: AstStat[] = [];
    const prevPosition = this.previousLocation().end;
    this.blockDepth++;
    const record = this.blockDepth === this.recordDepth;
    // Not part of Luau: a bracket given up on in this block is closed in it
    // or not at all; one given up on before it began may be closed in it.
    const inherited = new Set(this.abandonedClosers);
    // A block that begins where its holder stopped at an error (a function
    // whose return type is malformed) begins in that error's recovery, and
    // so does one whose holder began in a recovery, on the holder's line
    // (`if c then 2 else 3` after a line `local a,`).
    let followerLine = this.reports > 0 && this.standsAtError() ? this.errorLine : this.followerStart?.line;
    // Not part of Luau: whether the statement before had errors that are
    // marked `unread` (see `markUnreadErrors`).
    let unreadErrors = false;
    while (!this.blockFollow(this.current())) {
      const current = this.current();
      // Not part of Luau: where the tree ends the statement before, no statement begins.
      if (current.kind === "break") {
        this.next();
        continue;
      }
      const oldRecursionCount = this.recursionCounter;
      this.incrementRecursionCounter("block");
      const first = this.pos;
      const start = this.current();
      const reportsBefore = this.reports;
      const errorsBefore = this.errors.length;
      this.statementSpans.push([]);
      const outerFollowerStart = this.followerStart;
      const outerErrorBegin = this.statementErrorBegin;
      const outerStatement = this.statementState;
      this.followerStart = followerLine === start.location.begin.line ? start.location.begin : undefined;
      // A statement read in the recovery from an error marked `unread` is
      // part of that error's cascade.
      const unreadRecovery: boolean = unreadErrors && this.followerStart !== undefined;
      this.statementErrorBegin = undefined;
      this.statementState = { begin: start.location.begin, hasError: false, startsAtError: false };
      const stat = this.parseStat();
      // Whether the statement was read in the recovery from an earlier error.
      const inRecovery = this.followerStart !== undefined || this.statementState?.startsAtError === true;
      this.followerStart = outerFollowerStart;
      this.statementErrorBegin = outerErrorBegin;
      this.statementState = outerStatement;
      this.recursionCounter = oldRecursionCount;
      // Not part of Luau: whether the statement was read up to the token of
      // its last error and no further.
      let stoppedAtError = this.reports > reportsBefore && this.standsAtError();
      const errorLine = this.errorLine;
      let semicolon = false;
      if (this.is(";")) {
        this.next();
        stat.hasSemicolon = true;
        stat.location = new Location(stat.location.begin, this.previousLocation().end);
        // The marker wraps the authored Luau statement; its written separator
        // belongs to that statement's native range as well as the wrapper.
        if (stat instanceof AstStatSparkdownExplicit) {
          stat.statement.hasSemicolon = true;
          stat.statement.location = new Location(stat.statement.location.begin, this.previousLocation().end);
        }
        stoppedAtError = false;
        semicolon = true;
      }
      // A token no statement begins with is skipped, so the reading goes on.
      // (By its place: a string met there may be split into Luau's lexemes,
      // the first of them standing in its place, `parsePrefixExpr`.)
      if (this.pos === first) this.next();
      // A statement whose error Luau keeps only once (at the same token as
      // the error before it) goes on with the cascade all the same.
      unreadErrors = this.markUnreadErrors({ tokens: this.tokens, first, end: this.pos, errorsFrom: errorsBefore, errorsTo: this.errors.length }, unreadRecovery) && this.reports > reportsBefore;
      // Not part of Luau: a statement that begins on the line where this one
      // stopped at its error begins in the reading's recovery, as Luau's
      // parser recovers by reading a statement from the token after an
      // error; an error at its first token is that recovery's, not a mistake
      // of its own (`x + 1` is one mistake, at `x`), and is not marked
      // malformed (`report`). So does one that begins on the line where a
      // statement read in that recovery ends (`g += 1, 2` after a line `a,`
      // reads `a, g`, then `+= 1`, then `, 2`).
      if (stoppedAtError) followerLine = errorLine;
      else followerLine = inRecovery && !semicolon && this.tokens[this.pos - 1]?.text !== ";" ? this.previousLocation().end.line : undefined;
      body.push(stat);
      if (record) this.statements.push({ statement: stat, first, end: this.pos });
      // Keep reading for Sparkdown's block ownership and unreachable lint,
      // while reporting the token where Luau requires this block to close.
      // The scene-flow wrapper is synthetic: a marked statement there
      // covers one story line. Written Luau functions require final returns,
      // including statements marked with `&` in their nested blocks.
      const returned = stat instanceof AstStatSparkdownExplicit ? stat.statement : stat;
      if (begin && returned instanceof AstStatReturn && this.currentFunction().luau) {
        while (this.current().kind === "break" && !this.current().story) this.next();
        const following = this.pos;
        if (this.current().kind === "mark") this.next();
        if (!this.blockFollow(this.current())) this.expectMatchAndConsumeFail(closer, begin, "", "statement");
        this.pos = following;
      } else if (returned instanceof AstStatReturn && this.reports === reportsBefore &&
        (stat instanceof AstStatSparkdownExplicit || start.authoredIsland !== undefined)) {
        // A story discard line is its own Luau island; later prose or a
        // new marked line is outside it, but a same-line follower is not.
        // The grammar can leave the optional semicolon and its follower
        // as story. Complete opaque comments still own their closing line,
        // including its follower; ordinary prose on the next line does not.
        const line = this.ctx.index instanceof UnitLineIndex
          ? this.ctx.index.lines[returned.location.end.line]!
          : returned.location.end.line;
        const from = this.ctx.index.starts[line]! + returned.location.end.column;
        const { to, unfinished } = returnSuffixSpan(this.ctx.text, this.ctx.index, from);
        this.recordSourceDependency(from, to);
        const tokenizer = new Tokenizer(this.ctx.text, this.ctx.index);
        tokenizer.lex(from, to);
        if (unfinished !== undefined) tokenizer.push("unfinishedComment", unfinished, to);
        const follower = tokenizer.tokens[!returned.hasSemicolon && tokenizer.tokens[0]?.text === ";" ? 1 : 0];
        // Written blocks own their closer even when their return has an
        // explicit marker. Scene-flow function openers are synthetic spans.
        const nested = begin && begin.from < begin.to;
        const closes = nested && follower && (this.is(closer, follower) ||
          (begin.text === "then" && (this.is("else", follower) || this.is("elseif", follower))));
        if (follower && follower.kind !== "eof" && !closes) {
          this.withTokens([follower], follower.location, () => {
            if (nested) this.expectMatchAndConsumeFail(closer, begin, "", "statement");
            else this.report(follower.location, `Expected <eof>, got ${describe(follower)}`, "statement");
          });
          // Native Luau ends this island at its first invalid return suffix.
          // Consume its recovery tokens so chunk recovery does not report a
          // second error for an unfinished comment after that same suffix.
          if (!nested) while (this.current().kind !== "eof" && this.current().from < to) this.next();
        }
      }
      // Not part of Luau, whose parser ends a block at a `return`, `break` or
      // `continue` (marked with `&` or not): Sparkdown reads the statements
      // after one as its block's, never run, and the unreachable-code lint
      // reports them.
    }
    this.blockDepth--;
    for (let i = this.abandonedClosers.length - 1; i >= 0; i--) if (!inherited.has(this.abandonedClosers[i]!)) this.abandonedClosers.splice(i, 1);
    return new AstStatBlock(new Location(prevPosition, this.current().location.begin), body);
  }

  private parseStat(): AstStat {
    const token = this.current();
    if (token.kind === "keyword") {
      switch (token.text) {
        case "if":
          return this.parseIf();
        case "while":
          return this.parseWhile();
        case "do":
          return this.parseDo();
        case "for":
          return this.parseFor();
        case "repeat":
          return this.parseRepeat();
        case "function":
          return this.parseFunctionStat([]);
        case "local":
          return this.parseLocal(token.location, [], false);
        case "return":
          return this.parseReturn();
        case "break":
          return this.parseBreak();
      }
    } else if (this.isAttribute()) {
      return this.parseAttributeStat();
    } else if (token.kind === "mark") {
      return this.parseExplicit();
    } else if (token.kind === "store") {
      // Luau code begins a store before a comment that spans lines, which
      // hides the token after it from the grammar; with no name or
      // `function` after the comment (`store --[[ c`, then `]] = 3`) the
      // word is the name Luau reads (#1328).
      if (!token.luauCodeStore || this.isName(this.lookahead()) || this.is("function", this.lookahead())) return this.parseStore();
      this.tokens[this.pos] = { ...token, kind: "name" };
    } else if (token.kind === "choose") {
      return this.parseChoose();
    }

    const start = token.location;
    const expr = this.parsePrimaryExpr(true);

    if (expr instanceof AstExprCall) return new AstStatExpr(expr.location, expr);

    if (this.is(",") || this.is("=")) return this.parseAssignment(expr);

    const compound = this.current().kind === "symbol" ? COMPOUND_OPS.get(this.current().text) : undefined;
    if (compound !== undefined) return this.parseCompoundAssignment(expr, compound);

    const ident = expr instanceof AstExprGlobal ? expr.name : expr instanceof AstExprLocal ? expr.local.name : undefined;
    if (ident === "type") return this.parseTypeAlias(expr.location, false);
    if (ident === "export") {
      const current = this.current();
      if (this.is("local") || this.is("function") || (this.isName() && current.text === "const")) return this.parseExportValue(expr.location, []);
      if (this.isName() && current.text === "type") {
        this.next();
        return this.parseTypeAlias(expr.location, true);
      }
    }
    if (ident === "continue") return this.parseContinue(expr.location);
    if (ident === "const") return this.parseLocal(expr.location, [], true);

    if (start.equals(this.current().location)) {
      // A skipped opening bracket leaves its closer in recovery too.
      // For example, a table cannot begin a statement, even across lines.
      const closer = this.is("{") ? "}" : this.is("[") ? "]" : undefined;
      if (closer) this.abandonedClosers.push({ text: closer });
      this.skippedPos = this.pos;
      this.next();
    }
    const incomplete = this.reportStatError(expr.location, [expr], [], "Incomplete statement: expected assignment or a function call", "statement");
    // Not part of Luau: the statement stops at the token after its value.
    this.errorPos = this.pos;
    return incomplete;
  }

  /** `&` and the statement it marks. */
  private parseExplicit(): AstStat {
    const mark = this.current().location;
    this.next();
    if (this.blockFollow(this.current())) {
      return this.reportStatError(mark, [], [], `Expected a statement after '&', got ${describe(this.rejected())}`);
    }
    const statement = this.parseStat();
    return new AstStatSparkdownExplicit(Location.span(mark, statement.location), statement, mark);
  }

  /** `store` names [`=` values], or `store function` and a function the story's globals hold, as `function` declares it. */
  private parseStore(): AstStat {
    const start = this.current().location;
    this.next();
    if (this.is("function")) {
      const stat = this.parseFunctionStat([]) as AstStatFunction;
      return new AstStatFunction(Location.span(start, stat.location), stat.name, stat.func);
    }
    const names: Binding[] = [];
    let equalsSignLocation: Location | undefined;
    const values: AstExpr[] = [];
    // Not part of Luau: a `store` declaration's errors are Sparkdown's own (see `report`).
    this.sparkdownDepth++;
    try {
      this.parseBindingList(names);
      if (this.is("=")) {
        equalsSignLocation = this.current().location;
        this.next();
        this.parseExprList(values);
      }
    } finally {
      this.sparkdownDepth--;
    }
    const vars = names.map((b) => new AstExprGlobal(b.name.location, b.name.name));
    const end = values.length === 0 ? this.previousLocation() : values[values.length - 1]!.location;
    return new AstStatSparkdownStore(Location.span(start, end), vars, names.map((b) => b.annotation), values, equalsSignLocation);
  }

  /** A `choose` block's statements, and its `then` clause's. */
  private parseChoose(): AstStat {
    const begin = this.current();
    this.next();
    const body = this.parseBlockNoScope();
    let gather: AstStatBlock | undefined;
    let match = begin;
    if (this.current().kind === "chooseThen") {
      match = this.current();
      this.next();
      gather = this.parseBlockNoScope();
    }
    const end = this.current().location;
    if (this.current().kind === "chooseEnd") this.next();
    else this.expectMatchAndConsumeFail("end", match);
    return new AstStatSparkdownChoose(Location.span(begin.location, end), body, gather);
  }

  /**
   * Whether the reading stands at an attribute: `@name`, `@[` opening a list
   * of them, or a `@` with neither after it, which Luau's lexer reads as an
   * attribute with no name.
   */
  private isAttribute(): boolean {
    const kind = this.current().kind;
    return kind === "attribute" || kind === "attributeOpen";
  }

  private validateAttribute(loc: Location, name: string, attributes: AstAttr[], args: AstExpr[]): AstAttrType | undefined {
    const type = ATTRIBUTES.get(name);
    if (type === undefined) {
      this.report(loc, name.length === 0 ? "Attribute name is missing" : `Invalid attribute '@${name}'`, "attribute");
      return undefined;
    }
    for (const attr of attributes) if (attr.type === type) this.report(loc, `Cannot duplicate attribute '@${name}'`, "attribute");
    if (type === AstAttrType.Deprecated) for (const [errorLoc, message] of deprecatedArgsErrors(loc, args)) this.report(errorLoc, message, "attribute");
    return type;
  }

  /** `@name`, or `@[` attribute {`,` attribute} `]` with arguments, any number of times. */
  private parseAttributes(): AstAttr[] {
    const attributes: AstAttr[] = [];
    while (this.isAttribute()) {
      const at = this.current();
      this.next();
      if (at.kind === "attribute") {
        // The name written right after the `@`, or none (`@ function`).
        const text = at.text.slice(1);
        attributes.push(new AstAttr(at.location, this.validateAttribute(at.location, text, attributes, []) ?? AstAttrType.Unknown, [], text));
        continue;
      }
      // Luau's parser closes the list's `[`, the second character of `@[`.
      const begin = new Position(at.location.begin.line, at.location.begin.column + 1);
      const open: Token = { ...at, kind: "symbol", text: "[", from: at.from + 1, location: new Location(begin, at.location.end) };
      this.attributeListDepth++;
      try {
        this.parseAttributeList(at, open, attributes);
      } finally {
        this.attributeListDepth--;
      }
    }
    return attributes;
  }

  /** The names and arguments of an attribute list after its `[`, and its `]`. */
  private parseAttributeList(at: Token, open: Token, attributes: AstAttr[]): void {
    if (this.is("]")) {
      const loc = Location.span(at.location, this.current().location);
      this.report(loc, "Attribute list cannot be empty");
      attributes.push(new AstAttr(loc, AstAttrType.Unknown, [], ERROR_NAME));
    } else {
      for (;;) {
        const name = this.parseName("attribute name");
        if (this.is("(") || this.is("{") || this.current().kind === "string" || this.current().kind === "rawstring") {
          const [args, argsLocation] = this.parseCallList();
          for (const arg of args) {
            if (!isConstantLiteral(arg) && !isLiteralTable(arg)) this.report(argsLocation, "Only literals can be passed as arguments for attributes");
          }
          const type = this.validateAttribute(name.location, name.name, attributes, args);
          attributes.push(new AstAttr(Location.span(name.location, argsLocation), type ?? AstAttrType.Unknown, args, name.name));
        } else {
          attributes.push(new AstAttr(name.location, this.validateAttribute(name.location, name.name, attributes, []) ?? AstAttrType.Unknown, [], name.name));
        }
        if (!this.is(",")) break;
        this.next();
      }
    }
    this.expectMatchAndConsume("]", open);
  }

  /** An attribute list's arguments: a parenthesized list, a table or a string. */
  private parseCallList(): [AstExpr[], Location] {
    if (this.is("(")) {
      const matchParen = this.current();
      const argStart = matchParen.location.end;
      this.next();
      const args: AstExpr[] = [];
      if (!this.is(")")) this.parseExprList(args);
      const argEnd = this.current().location.end;
      this.expectMatchAndConsume(")", matchParen);
      return [args, new Location(argStart, argEnd)];
    }
    if (this.is("{")) {
      const argStart = this.current().location.end;
      const expr = this.parseTableConstructor();
      return [[expr], new Location(argStart, this.previousLocation().end)];
    }
    const argLocation = this.current().location;
    return [[this.parseString()], argLocation];
  }

  /** attributes `function`, `local function`, `const function` or `export function`. */
  private parseAttributeStat(): AstStat {
    const startLocation = this.current().location;
    const attributes = this.parseAttributes();
    const start = attributes[0]?.location ?? startLocation;
    if (this.is("function")) return this.parseFunctionStat(attributes);
    if (this.is("local")) return this.parseLocal(start, attributes, false);
    if (this.isName() && this.current().text === "export") {
      this.next();
      return this.parseExportValue(start, attributes);
    }
    if (this.isName() && this.current().text === "const") {
      this.next();
      return this.parseLocal(start, attributes, true);
    }
    return this.reportStatError(
      this.rejected().location,
      [],
      [],
      `Expected 'function', 'local function', 'const function', 'declare function' or a function type declaration after attribute, but got ${describe(this.current())} instead`,
      "attribute",
    );
  }

  /** `export` `local`, `function` or `const`, at the top of a chunk. */
  private parseExportValue(start: Location, attributes: AstAttr[]): AstStat {
    if (this.functionStack.length !== 1 || this.recursionCounter !== 1) this.report(start, "'export' may only be applied to top-level statements");
    if (this.hasModuleReturn) this.report(start, "Exporting values is not compatible with top-level return (export/return conflict)");
    const checkDuplicateExport = (name: string, location: Location): boolean => {
      if (this.declaredExportBindings.has(name)) return false;
      this.declaredExportBindings.set(name, location);
      return true;
    };
    const exportLocalStat = (stat: AstStat, keywordLocation: Location): AstStat => {
      if (stat instanceof AstStatLocal) {
        stat.isExported = true;
        for (const local of stat.vars) {
          if (!checkDuplicateExport(local.name, local.location)) {
            this.report(local.location, `Duplicate exported identifier '${local.name}'`);
            continue;
          }
          local.isExported = true;
        }
        stat.keywordLocation = keywordLocation;
      }
      return stat;
    };
    if (attributes.length !== 0 && !this.is("function")) {
      this.report(this.rejected().location, `Expected 'function' after export declaration with attribute, but got ${describe(this.current())} instead`, "attribute");
    }
    if (this.is("local")) {
      const keywordLocation = this.current().location;
      if (this.is("function", this.lookahead())) {
        this.report(start, "'export' must be followed by an identifier or 'function'; try removing 'local'");
        return this.parseLocal(start, [], true);
      }
      return exportLocalStat(this.parseLocal(start, [], false), keywordLocation);
    }
    if (this.is("function")) {
      const funcStat = this.parseLocal(start, attributes, true);
      if (!(funcStat instanceof AstStatLocalFunction)) return funcStat;
      if (!checkDuplicateExport(funcStat.name.name, funcStat.name.location)) this.report(funcStat.name.location, `Duplicate exported identifier '${funcStat.name.name}'`);
      funcStat.name.isExported = true;
      funcStat.name.isConst = true;
      return funcStat;
    }
    if (this.isName() && this.current().text === "const") {
      const keywordLocation = this.current().location;
      this.next();
      if (this.is("function")) {
        this.report(start, "'export' must be followed by an identifier or 'function'");
        return this.parseLocal(start, [], true);
      }
      return exportLocalStat(this.parseLocal(start, [], true), keywordLocation);
    }
    return this.reportStatError(start, [], [], "'export' must be followed by an identifier or 'function'");
  }

  private parseIf(): AstStat {
    const start = this.current().location;
    this.next(); // if / elseif
    const cond = this.parseExpr();
    const matchThen = this.current();
    let thenLocation: Location | undefined;
    if (this.expectAndConsume("then", "if statement")) thenLocation = matchThen.location;
    const thenbody = this.parseBlock(matchThen);

    let elsebody: AstStat | undefined;
    let end = start;
    let elseLocation: Location | undefined;
    if (this.is("elseif")) {
      thenbody.hasEnd = true;
      const oldRecursionCount = this.recursionCounter;
      this.incrementRecursionCounter("elseif");
      elseLocation = this.current().location;
      elsebody = this.parseIf();
      end = elsebody.location;
      this.recursionCounter = oldRecursionCount;
    } else {
      let matchThenElse = matchThen;
      if (this.is("else")) {
        thenbody.hasEnd = true;
        elseLocation = this.current().location;
        matchThenElse = this.current();
        this.next();
        const elseBlock = this.parseBlock(matchThenElse);
        elseBlock.location = new Location(matchThenElse.location.end, elseBlock.location.end);
        elsebody = elseBlock;
      }
      end = this.current().location;
      const hasEnd = this.expectMatchEndAndConsume("end", matchThenElse);
      if (elsebody instanceof AstStatBlock) elsebody.hasEnd = hasEnd;
      else thenbody.hasEnd = hasEnd;
    }
    return new AstStatIf(Location.span(start, end), cond, thenbody, elsebody, thenLocation, elseLocation);
  }

  private parseWhile(): AstStat {
    const start = this.current().location;
    this.next();
    const cond = this.parseExpr();
    const matchDo = this.current();
    const hasDo = this.expectAndConsume("do", "while loop");
    this.currentFunction().loopDepth++;
    const body = this.parseBlock(matchDo);
    this.currentFunction().loopDepth--;
    const end = this.current().location;
    body.hasEnd = this.expectMatchEndAndConsume("end", matchDo);
    return new AstStatWhile(Location.span(start, end), cond, body, hasDo, matchDo.location);
  }

  private parseRepeat(): AstStat {
    const start = this.current().location;
    const matchRepeat = this.current();
    this.next();
    const localsBegin = this.saveLocals();
    this.currentFunction().loopDepth++;
    const body = this.parseBlockNoScope(matchRepeat, "until");
    this.currentFunction().loopDepth--;
    body.hasEnd = this.expectMatchEndAndConsume("until", matchRepeat);
    // Once an unfinished comment consumed the missing closer, native Luau
    // leaves the absent condition in that recovery without a second error.
    const cond = !body.hasEnd && this.previousLocation().end.equals(this.current().location.begin) && this.tokens[this.pos - 1]?.kind === "unfinishedComment"
      ? new AstExprError(this.current().location, [], this.errors.length - 1)
      : this.parseExpr();
    this.restoreLocals(localsBegin);
    return new AstStatRepeat(Location.span(start, cond.location), cond, body);
  }

  private parseDo(): AstStat {
    const start = this.current().location;
    const matchDo = this.current();
    this.next();
    const body = this.parseBlock(matchDo);
    body.location = new Location(start.begin, body.location.end);
    const endLocation = this.current().location;
    body.hasEnd = this.expectMatchEndAndConsume("end", matchDo);
    if (body.hasEnd) body.location = new Location(body.location.begin, endLocation.end);
    return body;
  }

  private parseBreak(): AstStat {
    const start = this.current().location;
    this.next();
    if (this.currentFunction().loopDepth === 0) return this.reportStatError(start, [], [new AstStatBreak(start)], "break statement must be inside a loop");
    return new AstStatBreak(start);
  }

  private parseContinue(start: Location): AstStat {
    if (this.currentFunction().loopDepth === 0)
      return this.reportStatError(start, [], [new AstStatContinue(start)], "continue statement must be inside a loop");
    return new AstStatContinue(start);
  }

  private parseFor(): AstStat {
    const start = this.current().location;
    this.next();
    const varname = this.parseBinding();
    if (this.is("=")) {
      this.next();
      const from = this.parseExpr();
      this.expectAndConsume(",", "index range");
      const to = this.parseExpr();
      let step: AstExpr | undefined;
      if (this.is(",")) {
        this.next();
        step = this.parseExpr();
      }
      const matchDo = this.current();
      const hasDo = this.expectAndConsume("do", "for loop");
      const localsBegin = this.saveLocals();
      this.currentFunction().loopDepth++;
      const variable = this.pushLocal(varname);
      const body = this.parseBlock(matchDo);
      this.currentFunction().loopDepth--;
      this.restoreLocals(localsBegin);
      const end = this.current().location;
      body.hasEnd = this.expectMatchEndAndConsume("end", matchDo);
      return new AstStatFor(Location.span(start, end), variable, from, to, step, body, hasDo, matchDo.location);
    }
    const names: Binding[] = [varname];
    if (this.is(",")) {
      this.next();
      this.parseBindingList(names);
    }
    const inLocation = this.current().location;
    const hasIn = this.expectAndConsume("in", "for loop");
    const values: AstExpr[] = [];
    this.parseExprList(values);
    const matchDo = this.current();
    const hasDo = this.expectAndConsume("do", "for loop");
    const localsBegin = this.saveLocals();
    this.currentFunction().loopDepth++;
    const vars = names.map((name) => this.pushLocal(name));
    const body = this.parseBlock(matchDo);
    this.currentFunction().loopDepth--;
    this.restoreLocals(localsBegin);
    const end = this.current().location;
    body.hasEnd = this.expectMatchEndAndConsume("end", matchDo);
    return new AstStatForIn(Location.span(start, end), vars, values, body, hasIn, inLocation, hasDo, matchDo.location);
  }

  private parseFunctionName(out: { hasself: boolean; debugname: string }): AstExpr {
    if (this.isName()) out.debugname = this.current().text;
    // Not part of Luau: `function` before a `(` is a function value written as a statement.
    let expr = this.parseNameExpr("function name", this.is("(") ? "statement" : undefined);
    const oldRecursionCount = this.recursionCounter;
    while (this.is(".")) {
      const opPosition = this.current().location.begin;
      this.next();
      const name = this.parseName("field name", "expression");
      out.debugname = name.name;
      expr = new AstExprIndexName(Location.span(expr.location, name.location), expr, name.name, name.location, opPosition, ".");
      this.incrementRecursionCounter("function name");
    }
    this.recursionCounter = oldRecursionCount;
    if (this.is(":")) {
      const opPosition = this.current().location.begin;
      this.next();
      const name = this.parseName("method name", "expression");
      out.debugname = name.name;
      expr = new AstExprIndexName(Location.span(expr.location, name.location), expr, name.name, name.location, opPosition, ":");
      out.hasself = true;
    }
    return expr;
  }

  private isExprLValue(expr: AstExpr): boolean {
    return (expr instanceof AstExprLocal && !expr.local.isConst) || expr instanceof AstExprGlobal || expr instanceof AstExprIndexExpr || expr instanceof AstExprIndexName;
  }

  private reportLValueError(expr: AstExpr): AstExprError {
    if (expr instanceof AstExprLocal && expr.local.isConst)
      return this.reportExprError(expr.location, [expr], `Variable '${expr.local.name}' is constant and may not be reassigned`, this.isLuauConst(expr.local) ? "statement" : undefined);
    return this.reportExprError(expr.location, [expr], "Assigned expression must be a variable or a field", "expression");
  }

  /**
   * Not part of Luau: whether a `const`'s name is Luau's own, declared in a
   * Luau function, whose errors (a name with no value, a reassignment) are
   * the statement's to report as Luau reports them, rather than the story's
   * published constant (see `storyFunctions`).
   */
  private isLuauConst(local: AstLocal): boolean {
    return local.functionDepth >= this.storyFunctions;
  }

  private parseFunctionStat(attributes: AstAttr[]): AstStat {
    const start = attributes[0]?.location ?? this.current().location;
    const matchFunction = this.current();
    this.next();
    const name = { hasself: false, debugname: "" };
    let expr = this.parseFunctionName(name);
    if (!this.isExprLValue(expr)) expr = this.reportLValueError(expr);
    const body = this.parseFunctionBody(name.hasself, matchFunction, name.debugname, undefined, attributes)[0];
    return new AstStatFunction(Location.span(start, body.location), expr, body);
  }

  private parseLocal(start: Location, attributes: AstAttr[], isConst: boolean): AstStat {
    if (!isConst) this.next(); // local
    if (this.is("function")) {
      let matchFunction = this.current();
      this.next();
      // `local function` reads as beginning where `local` begins, as Luau patches its token.
      if (matchFunction.location.begin.line === start.begin.line) {
        matchFunction = { ...matchFunction, location: new Location(new Position(matchFunction.location.begin.line, start.begin.column), matchFunction.location.end) };
      }
      const name = this.parseName("variable name", this.is(":") ? "annotation" : undefined);
      const [body, variable] = this.parseFunctionBody(false, matchFunction, name.name, name, attributes, isConst);
      return new AstStatLocalFunction(new Location(start.begin, body.location.end), variable!, body, isConst);
    }
    if (attributes.length !== 0) {
      return this.reportStatError(this.rejected().location, [], [], `Expected 'function' after local declaration with attribute, but got ${describe(this.current())} instead`, "attribute");
    }
    const names: Binding[] = [];
    this.parseBindingList(names, false, isConst, true);
    const values: AstExpr[] = [];
    let equalsSignLocation: Location | undefined;
    if (this.is("=")) {
      equalsSignLocation = this.current().location;
      this.next();
      this.parseExprList(values, true);
    }
    const vars = names.map((name) => this.pushLocal(name));
    const end = values.length === 0 ? this.previousLocation() : values[values.length - 1]!.location;
    const node = new AstStatLocal(Location.span(start, end), vars, values, equalsSignLocation, isConst);
    if (isConst && !isEnoughValues(values, vars.length)) {
      this.report(node.location, "Missing initializer in const declaration", vars[0] && this.isLuauConst(vars[0]) ? "statement" : undefined);
      // Not part of Luau: a `::` after the names is an annotation written
      // with it (`const x :: number = 1`), the author's own mistake, which
      // the statement read from it reports; the declaration did not stop at
      // an error of its own there (see `parseBlockNoScope`).
      if (this.isAnnotationColon()) {
        this.errorPos = -1;
        if (this.statementState) this.statementState.startsAtError = false;
      }
    }
    return node;
  }

  private parseReturn(): AstStat {
    const start = this.current().location;
    this.next();
    const list: AstExpr[] = [];
    const outerReturn = this.returnFunction;
    this.returnFunction = this.currentFunction().luau ? this.currentFunction() : undefined;
    try {
      // A narrative island ends before the story resumes. Its bare return
      // has no value; the story boundary is not a missing expression. Luau
      // line breaks in written functions still permit multiline values.
      const storyEnd = this.current().kind === "break" && this.current().story;
      if (!storyEnd && !this.blockFollow(this.current()) && !this.is(";")) this.parseExprList(list);
    } finally {
      this.returnFunction = outerReturn;
    }
    const end = list.length === 0 ? start : list[list.length - 1]!.location;
    const node = new AstStatReturn(Location.span(start, end), list);
    // A written semicolon belongs to the return's native range, including
    // the inner return of a marked statement. Story grammar can leave it
    // outside the statement's tokens; read only that same-line suffix.
    let delimiter = this.is(";") ? this.current() : undefined;
    if (!delimiter && !this.currentFunction().luau) {
      const line = this.ctx.index instanceof UnitLineIndex ? this.ctx.index.lines[end.end.line]! : end.end.line;
      const from = this.ctx.index.starts[line]! + end.end.column;
      const tokenizer = new Tokenizer(this.ctx.text, this.ctx.index);
      tokenizer.lex(from, this.ctx.index.lineEnd(line));
      if (tokenizer.tokens[0]?.text === ";") delimiter = tokenizer.tokens[0];
    }
    if (delimiter) {
      node.hasSemicolon = true;
      node.location = new Location(node.location.begin, delimiter.location.end);
    }
    if (this.functionStack.length === 1) {
      if (this.declaredExportBindings.size !== 0) this.report(node.location, "Exporting values is not compatible with top-level return (export/return conflict)");
      this.hasModuleReturn = true;
    }
    return node;
  }

  private parseTypeAlias(start: Location, exported: boolean): AstStat {
    if (this.is("function")) return this.parseTypeFunction(start, exported);
    let name = this.parseNameOpt("type name");
    if (!name) name = { name: ERROR_NAME, location: this.current().location };
    const [generics, genericPacks] = this.parseGenericTypeList(true);
    this.expectAndConsume("=", "type alias");
    const type = this.parseType();
    return new AstStatTypeAlias(Location.span(start, type.location), name.name, name.location, generics, genericPacks, type, exported);
  }

  /** `type function` Name funcbody: a function run on types, which may not reference the locals around it. */
  private parseTypeFunction(start: Location, exported: boolean): AstStat {
    const matchFn = this.current();
    this.next();
    const errorsAtStart = this.errors.length;
    let fnName = this.parseNameOpt("type function name");
    if (!fnName) fnName = { name: ERROR_NAME, location: this.current().location };
    const oldTypeFunctionDepth = this.typeFunctionDepth;
    this.typeFunctionDepth = this.functionStack.length;
    const body = this.parseFunctionBody(false, matchFn, fnName.name, undefined, [])[0];
    this.typeFunctionDepth = oldTypeFunctionDepth;
    const hasErrors = this.errors.length > errorsAtStart;
    return new AstStatTypeFunction(Location.span(start, body.location), fnName.name, fnName.location, body, exported, hasErrors);
  }

  private parseAssignment(initial: AstExpr): AstStat {
    if (!this.isExprLValue(initial)) initial = this.reportLValueError(initial);
    const vars: AstExpr[] = [initial];
    while (this.is(",")) {
      this.next();
      let expr = this.parsePrimaryExpr(true);
      if (!this.isExprLValue(expr)) expr = this.reportLValueError(expr);
      vars.push(expr);
    }
    // Sparkdown already reports an accessor whose name is on a later
    // line. An unfinished assignment through that target is its recovery.
    let danglingTarget = false;
    for (let target of vars) {
      while (target instanceof AstExprIndexName) {
        if (target.indexLocation.begin.line > target.opPosition.line) danglingTarget = true;
        target = target.expr;
      }
    }
    // A target list read while recovering from an earlier malformed
    // construct (such as a for-loop annotation) is not a new mistake.
    this.expectAndConsume("=", "assignment", danglingTarget || this.followerStart ? undefined : "statement");
    const values: AstExpr[] = [];
    this.parseExprList(values, true);
    return new AstStatAssign(Location.span(initial.location, values[values.length - 1]!.location), vars, values);
  }

  private parseCompoundAssignment(initial: AstExpr, op: BinaryOp): AstStat {
    if (!this.isExprLValue(initial)) initial = this.reportLValueError(initial);
    this.next();
    const value = this.parseValue();
    return new AstStatCompoundAssign(Location.span(initial.location, value.location), op, initial, value);
  }

  // -- Functions -----------------------------------------------------------

  private parseFunctionBody(
    hasself: boolean,
    matchFunction: Token,
    debugname: string,
    localName: Name | undefined,
    attributes: AstAttr[],
    isConst = false,
  ): [AstExprFunction, AstLocal | undefined] {
    const start = attributes[0]?.location ?? matchFunction.location;
    const [generics, genericPacks] = this.parseGenericTypeList(false);
    const matchParen = this.current();
    // Not part of Luau: a name right after `function` is a function value's.
    this.expectAndConsume("(", "function", this.previousLocation().equals(matchFunction.location) ? "expression" : undefined);
    const args: Binding[] = [];
    let vararg = false;
    let varargLocation = new Location();
    let varargAnnotation: AstTypePack | undefined;
    if (!this.is(")")) [vararg, varargLocation, varargAnnotation] = this.parseBindingList(args, true);
    let argLocation: Location | undefined;
    if (this.is("(", matchParen) && this.is(")")) argLocation = new Location(matchParen.location.begin, this.current().location.end);
    this.expectMatchAndConsume(")", matchParen, true);
    const typelist = this.parseOptionalReturnType();

    let funLocal: AstLocal | undefined;
    if (localName) funLocal = this.pushLocal({ name: localName, annotation: undefined, isConst });

    const localsBegin = this.saveLocals();
    this.functionStack.push({ vararg, loopDepth: 0, luau: matchFunction.from < matchFunction.to || matchFunction.written === true });
    let self: AstLocal | undefined;
    if (hasself) self = this.pushLocal({ name: { name: "self", location: start }, annotation: undefined, isConst: false });
    const vars = args.map((arg) => this.pushLocal(arg));
    const body = this.parseBlock(matchFunction);
    this.functionStack.pop();
    this.restoreLocals(localsBegin);

    const end = this.current().location;
    body.hasEnd = this.expectMatchEndAndConsume("end", matchFunction);

    const node = new AstExprFunction(
      Location.span(start, end),
      attributes,
      generics,
      genericPacks,
      self,
      vars,
      vararg,
      varargLocation,
      body,
      this.functionStack.length,
      debugname,
      typelist,
      varargAnnotation,
      argLocation,
    );
    return [node, funLocal];
  }

  /** A list of expressions; of values (`parseValue`) where the list is assigned. */
  private parseExprList(result: AstExpr[], values = false): void {
    const parse = () => (values ? this.parseValue() : this.parseExpr());
    result.push(parse());
    while (this.is(",")) {
      this.next();
      if (this.is(")")) {
        this.report(this.current().location, "Expected expression after ',' but got ')' instead", "expression");
        break;
      }
      result.push(parse());
    }
  }

  /** Not part of Luau: an expression whose start is a value's (see `valuePos`). */
  private parseValue(): AstExpr {
    this.valuePos = this.pos;
    return this.parseExpr();
  }

  /** `declaration` is whether the binding is a local declaration's (see `MalformedConstruct`). */
  private parseBinding(isConst = false, declaration = false): Binding {
    // Not part of Luau: a `:` with no name before it is an annotation with
    // no name, and a local declaration's name missing before a token of its
    // line leaves the declaration malformed. One missing at its line's end
    // is Sparkdown's own syntax's to report.
    const kind = this.current().kind;
    const missing = this.is(":") ? "annotation" : declaration && kind !== "eof" && kind !== "break" ? "declaration" : undefined;
    let name = this.parseNameOpt("variable name", missing);
    if (!name) name = { name: ERROR_NAME, location: this.current().location };
    const annotation = this.parseOptionalType();
    return { name, annotation, isConst };
  }

  /** Returns whether the list ends in `...`, the location of the `...`, and its annotation. `declaration` is whether it is a local declaration's names. */
  parseBindingList(result: Binding[], allowDot3 = false, isConst = false, declaration = false): [boolean, Location, AstTypePack | undefined] {
    for (;;) {
      if (this.is("...") && allowDot3) {
        const varargLocation = this.current().location;
        this.next();
        let tailAnnotation: AstTypePack | undefined;
        if (this.is(":")) {
          this.next();
          tailAnnotation = this.parseVariadicArgumentTypePack();
        }
        return [true, varargLocation, tailAnnotation];
      }
      result.push(this.parseBinding(isConst, declaration));
      if (!this.is(",")) break;
      this.next();
    }
    return [false, new Location(), undefined];
  }

  // -- Types ---------------------------------------------------------------

  private shouldParseTypePack(): boolean {
    if (this.is("...")) return true;
    return this.isName() && this.is("...", this.lookahead());
  }

  private parseOptionalType(): AstType | undefined {
    if (!this.is(":")) return undefined;
    this.next();
    return this.parseType();
  }

  private parseTypeList(result: AstType[], resultNames: (AstArgumentName | undefined)[]): AstTypePack | undefined {
    for (;;) {
      if (this.shouldParseTypePack()) return this.parseTypePack();
      if (this.isName() && this.is(":", this.lookahead())) {
        while (resultNames.length < result.length) resultNames.push(undefined);
        resultNames.push({ name: this.current().text, location: this.current().location });
        this.next();
        this.expectAndConsume(":");
      } else if (resultNames.length !== 0) {
        resultNames.push(undefined);
      }
      result.push(this.parseType());
      if (!this.is(",")) break;
      this.next();
      if (this.is(")")) {
        this.report(this.current().location, "Expected type after ',' but got ')' instead");
        break;
      }
    }
    return undefined;
  }

  private parseOptionalReturnType(): AstTypePack | undefined {
    if (!this.is(":") && !this.is("->")) return undefined;
    if (this.is("->")) this.report(this.current().location, "Function return type annotations are written after ':' instead of '->'");
    this.next();
    const oldRecursionCount = this.recursionCounter;
    const result = this.parseReturnType();
    if (this.is(",")) {
      this.report(this.current().location, "Expected a statement, got ','; did you forget to wrap the list of return types in parentheses?");
      this.next();
    }
    this.recursionCounter = oldRecursionCount;
    return result;
  }

  private parseReturnType(): AstTypePack {
    const reportsBefore = this.reports;
    this.incrementRecursionCounter("type annotation");
    const begin = this.current();
    if (!this.is("(")) {
      if (this.shouldParseTypePack()) return this.parseTypePack();
      const type = this.parseType();
      return new AstTypePackExplicit(type.location, typeList([type], undefined));
    }
    this.next();
    const result: AstType[] = [];
    const resultNames: (AstArgumentName | undefined)[] = [];
    let varargAnnotation: AstTypePack | undefined;
    if (!this.is(")")) varargAnnotation = this.parseTypeList(result, resultNames);
    const location = Location.span(begin.location, this.current().location);
    this.expectMatchAndConsume(")", begin, true, this.reports === reportsBefore ? "type" : undefined);

    if (!this.is("->") && resultNames.length === 0) {
      if (result.length === 1) {
        let inner: AstType;
        if (varargAnnotation === undefined) inner = new AstTypeGroup(location, result[0]!);
        else inner = result[0]!;
        const returnType = this.parseTypeSuffix(inner, begin.location);
        const endPos = result.length === 1 ? location.end : returnType.location.end;
        return new AstTypePackExplicit(new Location(location.begin, endPos), typeList([returnType], varargAnnotation));
      }
      return new AstTypePackExplicit(location, typeList(result, varargAnnotation));
    }
    const tail = this.parseFunctionTypeTail(begin, [], [], result, resultNames, varargAnnotation);
    return new AstTypePackExplicit(Location.span(location, tail.location), typeList([tail], undefined));
  }

  private isTypeFollow(): boolean {
    return this.is("|") || this.is("?") || this.is("&");
  }

  private parseTableIndexer(access: AstTableAccess, accessLocation: Location | undefined, begin: Token): AstTableIndexer {
    const reportsBefore = this.reports;
    const index = this.parseType();
    this.expectMatchAndConsume("]", begin, false, this.reports === reportsBefore ? "type" : undefined);
    this.expectAndConsume(":", "table field");
    const result = this.parseType();
    const indexer: AstTableIndexer = { indexType: index, resultType: result, location: Location.span(begin.location, result.location), access };
    if (accessLocation) indexer.accessLocation = accessLocation;
    return indexer;
  }

  private parseTableType(): AstType {
    const reportsBefore = this.reports;
    this.incrementRecursionCounter("type annotation");
    const props: AstTableProp[] = [];
    let indexer: AstTableIndexer | undefined;
    const start = this.current().location;
    const matchBrace = this.current();
    this.expectAndConsume("{", "table type");
    while (!this.is("}")) {
      let access = AstTableAccess.ReadWrite;
      let accessLocation: Location | undefined;
      if (this.isName() && !this.is(":", this.lookahead())) {
        if (this.current().text === "read") {
          accessLocation = this.current().location;
          access = AstTableAccess.Read;
          this.next();
        } else if (this.current().text === "write") {
          accessLocation = this.current().location;
          access = AstTableAccess.Write;
          this.next();
        }
      }
      if (this.is("[")) {
        const begin = this.current();
        this.next();
        if ((this.current().kind === "string" || this.current().kind === "rawstring") && this.is("]", this.lookahead())) {
          const token = this.current();
          const chars = this.charArray(token);
          this.next();
          this.expectMatchAndConsume("]", begin);
          this.expectAndConsume(":", "table field");
          const type = this.parseType();
          if (chars !== undefined && !chars.includes("\0")) {
            const prop: AstTableProp = { name: chars, location: begin.location, type, access };
            if (accessLocation) prop.accessLocation = accessLocation;
            props.push(prop);
          } else this.report(begin.location, "String literal contains malformed escape sequence or \\0");
        } else if (indexer) {
          const badIndexer = this.parseTableIndexer(access, accessLocation, begin);
          this.report(badIndexer.location, "Cannot have more than one table indexer");
        } else {
          indexer = this.parseTableIndexer(access, accessLocation, begin);
        }
      } else if (props.length === 0 && !indexer && !(this.isName() && this.is(":", this.lookahead()))) {
        const type = this.parseType();
        // Match the official parser at the conformance pin: the implicit key
        // inherits its element type's range (#1347).
        const index = new AstTypeReference(type.location, undefined, "number", undefined, type.location);
        indexer = { indexType: index, resultType: type, location: type.location, access };
        if (accessLocation) indexer.accessLocation = accessLocation;
        break;
      } else {
        const name = this.parseNameOpt("table field", this.is(":") ? "annotation" : undefined);
        if (!name) break;
        this.expectAndConsume(":", "table field");
        const type = this.parseType();
        const prop: AstTableProp = { name: name.name, location: name.location, type, access };
        if (accessLocation) prop.accessLocation = accessLocation;
        props.push(prop);
      }
      if (this.is(",") || this.is(";")) this.next();
      else if (!this.is("}")) break;
    }
    let end = this.current().location;
    if (!this.expectMatchAndConsume("}", matchBrace, true, this.reports === reportsBefore ? "type" : undefined)) end = this.previousLocation();
    return new AstTypeTable(Location.span(start, end), props, indexer);
  }

  private parseFunctionType(allowPack: boolean): AstTypeOrPack {
    const reportsBefore = this.reports;
    this.incrementRecursionCounter("type annotation");
    let forceFunctionType = this.is("<");
    const begin = this.current();
    const [generics, genericPacks] = this.parseGenericTypeList(false);
    const parameterStart = this.current();
    this.expectAndConsume("(", "function parameters");
    const params: AstType[] = [];
    const names: (AstArgumentName | undefined)[] = [];
    let varargAnnotation: AstTypePack | undefined;
    if (!this.is(")")) varargAnnotation = this.parseTypeList(params, names);
    const closeArgsLocation = this.current().location;
    this.expectMatchAndConsume(")", parameterStart, true, this.reports === reportsBefore ? "type" : undefined);
    if (names.length !== 0) forceFunctionType = true;
    const returnTypeIntroducer = this.is("->") || this.is(":");
    if (params.length === 1 && !varargAnnotation && !forceFunctionType && !returnTypeIntroducer) {
      if (allowPack) return { typePack: new AstTypePackExplicit(begin.location, typeList(params, undefined)) };
      return { type: new AstTypeGroup(Location.span(parameterStart.location, closeArgsLocation), params[0]!) };
    }
    if (!forceFunctionType && !returnTypeIntroducer && allowPack) {
      return { typePack: new AstTypePackExplicit(begin.location, typeList(params, varargAnnotation)) };
    }
    return { type: this.parseFunctionTypeTail(begin, generics, genericPacks, params, names, varargAnnotation) };
  }

  private parseFunctionTypeTail(
    begin: Token,
    generics: AstGenericType[],
    genericPacks: AstGenericTypePack[],
    params: AstType[],
    paramNames: (AstArgumentName | undefined)[],
    varargAnnotation: AstTypePack | undefined,
  ): AstType {
    this.incrementRecursionCounter("type annotation");
    if (this.is(":")) {
      this.report(this.current().location, "Return types in function type annotations are written after '->' instead of ':'");
      this.next();
    } else if (!this.is("->") && generics.length === 0 && genericPacks.length === 0 && params.length === 0) {
      this.report(Location.span(begin.location, this.previousLocation()), "Expected '->' after '()' when parsing function type; did you mean 'nil'?");
      return new AstTypeReference(begin.location, undefined, "nil", undefined, begin.location);
    } else {
      this.expectAndConsume("->", "function type");
    }
    const returnType = this.parseReturnType();
    return new AstTypeFunction(Location.span(begin.location, returnType.location), [], generics, genericPacks, typeList(params, varargAnnotation), paramNames, returnType);
  }

  private parseTypeSuffix(type: AstType | undefined, begin: Location): AstType {
    const parts: AstType[] = [];
    if (type !== undefined) parts.push(type);
    this.incrementRecursionCounter("type annotation");
    let isUnion = false;
    let isIntersection = false;
    let optionalCount = 0;
    for (;;) {
      if (this.is("|")) {
        this.next();
        const oldRecursionCount = this.recursionCounter;
        parts.push(this.parseSimpleType(false).type!);
        this.recursionCounter = oldRecursionCount;
        isUnion = true;
      } else if (this.is("?")) {
        const loc = this.current().location;
        this.next();
        parts.push(new AstTypeOptional(loc));
        optionalCount++;
        isUnion = true;
      } else if (this.is("&")) {
        this.next();
        const oldRecursionCount = this.recursionCounter;
        parts.push(this.parseSimpleType(false).type!);
        this.recursionCounter = oldRecursionCount;
        isIntersection = true;
      } else if (this.is("...")) {
        this.report(this.current().location, "Unexpected '...' after type annotation");
        this.next();
      } else break;
      if (parts.length > TYPE_LENGTH_LIMIT + optionalCount) {
        throw new FatalReadError(parts[parts.length - 1]!.location, "Exceeded allowed type length; simplify your type annotation to make the code compile");
      }
    }
    if (parts.length === 1 && !isUnion && !isIntersection) return parts[0]!;
    if (parts.length === 0) return this.reportTypeError(begin, [], `Expected type, got ${describe(this.rejected())}`, "type");
    if (isUnion && isIntersection) {
      return this.reportTypeError(
        Location.span(begin, parts[parts.length - 1]!.location),
        parts,
        "Mixing union and intersection types is not allowed; consider wrapping in parentheses.",
      );
    }
    const location = new Location(begin.begin, parts[parts.length - 1]!.location.end);
    return isUnion ? new AstTypeUnion(location, parts) : new AstTypeIntersection(location, parts);
  }

  private parseSimpleTypeOrPack(): AstTypeOrPack {
    const oldRecursionCount = this.recursionCounter;
    const begin = this.current().location;
    const { type, typePack } = this.parseSimpleType(true);
    if (typePack) return { typePack };
    this.recursionCounter = oldRecursionCount;
    return { type: this.parseTypeSuffix(type, begin) };
  }

  parseType(): AstType {
    const oldRecursionCount = this.recursionCounter;
    const begin = this.current().location;
    let type: AstType | undefined;
    if (!this.is("|") && !this.is("&")) {
      type = this.parseSimpleType(false).type;
      this.recursionCounter = oldRecursionCount;
    }
    const typeWithSuffix = this.parseTypeSuffix(type, begin);
    this.recursionCounter = oldRecursionCount;
    return typeWithSuffix;
  }

  private parseSimpleType(allowPack: boolean): AstTypeOrPack {
    this.incrementRecursionCounter("type annotation");
    const start = this.current().location;
    const token = this.current();
    // Luau reads attributes before a function type only in a declaration
    // file's context, which a `.sd` file and a `run` file are not. The type
    // is missing there, as the checker reports a missing type (`malformed`).
    if (this.isAttribute()) return { type: this.reportTypeError(start, [], "attributes are not allowed in declaration context", "type") };
    // Not part of Luau: a type that begins with `->`, which no Luau type
    // does, is Sparkdown's divert-target type (`function f(target: ->)`).
    // A divert target is Sparkdown's own value, read as `any`, as the value
    // is (`SparkdownReading.ts`).
    if (this.is("->")) {
      this.next();
      return { type: new AstTypeReference(start, undefined, "any", undefined, start) };
    }
    if (this.is("nil")) {
      this.next();
      return { type: new AstTypeReference(start, undefined, "nil", undefined, start) };
    }
    if (this.is("true") || this.is("false")) {
      this.next();
      return { type: new AstTypeSingletonBool(start, token.text === "true") };
    }
    if (token.kind === "string" || token.kind === "rawstring") {
      const value = this.charArray(token);
      this.next();
      if (value !== undefined) return { type: new AstTypeSingletonString(start, value) };
      return { type: this.reportTypeError(start, [], "String literal contains malformed escape sequence") };
    }
    if (token.kind === "interp" && token.node) {
      // Luau reads the whole string, with the errors its reading reports,
      // and then reports it at its first lexeme (`` `a { ``, I-1419), where
      // an error of the string's at that lexeme is the one Luau keeps.
      const location = this.interpLexemes(token)?.[0]!.location ?? start;
      this.parseInterpString();
      return { type: this.reportTypeError(location, [], "Interpolated string literals cannot be used as types") };
    }
    if (this.isName()) {
      let prefix: string | undefined;
      let prefixLocation: Location | undefined;
      let name = this.parseName("type name");
      if (this.is(".")) {
        const prefixPointPosition = this.current().location.begin;
        this.next();
        prefix = name.name;
        prefixLocation = name.location;
        name = this.parseIndexName("field name", prefixPointPosition, "type");
      } else if (this.is("...")) {
        this.report(this.current().location, "Unexpected '...' after type name; type pack is not allowed in this context");
        this.next();
      } else if (name.name === "typeof") { // not a node name
        const reportsBefore = this.reports;
        const typeofBegin = this.current();
        this.expectAndConsume("(", "typeof type");
        const expr = this.parseExpr();
        const end = this.current().location;
        this.expectMatchAndConsume(")", typeofBegin, false, this.reports === reportsBefore ? "type" : undefined);
        return { type: new AstTypeTypeof(Location.span(start, end), expr) };
      }
      let hasParameters = false;
      let parameters: AstTypeOrPack[] = [];
      if (this.is("<")) {
        hasParameters = true;
        parameters = this.parseTypeParams();
      }
      const end = this.previousLocation();
      return { type: new AstTypeReference(Location.span(start, end), prefix, name.name, prefixLocation, name.location, hasParameters, parameters) };
    }
    if (this.is("{")) return { type: this.parseTableType() };
    if (this.is("(") || this.is("<")) return this.parseFunctionType(allowPack);
    if (this.is("function")) {
      this.next();
      return {
        type: this.reportTypeError(
          start,
          [],
          "Using 'function' as a type annotation is not supported, consider replacing with a function type annotation e.g. '(...any) -> ...any'",
        ),
      };
    }
    // A missing type is located in the space between the last token and the next.
    const astErrorLocation = new Location(this.previousLocation().end, start.begin);
    this.report(new Location(this.previousLocation().end, start.end), `Expected type, got ${describe(token)}`, "type");
    return { type: new AstTypeError(astErrorLocation, [], true, this.errors.length - 1) };
  }

  private parseVariadicArgumentTypePack(): AstTypePack {
    if (this.isName() && this.is("...", this.lookahead())) {
      const name = this.parseName("generic name");
      const end = this.current().location;
      this.expectAndConsume("...", "generic type pack annotation");
      return new AstTypePackGeneric(Location.span(name.location, end), name.name);
    }
    const variadicAnnotation = this.parseType();
    return new AstTypePackVariadic(variadicAnnotation.location, variadicAnnotation);
  }

  private parseTypePack(): AstTypePack {
    if (this.is("...")) {
      const start = this.current().location;
      this.next();
      const varargTy = this.parseType();
      return new AstTypePackVariadic(Location.span(start, varargTy.location), varargTy);
    }
    const name = this.parseName("generic name");
    const end = this.current().location;
    this.expectAndConsume("...", "generic type pack annotation");
    return new AstTypePackGeneric(Location.span(name.location, end), name.name);
  }

  private parseGenericTypeList(withDefaultValues: boolean): [AstGenericType[], AstGenericTypePack[]] {
    const names: AstGenericType[] = [];
    const namePacks: AstGenericTypePack[] = [];
    if (!this.is("<")) return [names, namePacks];
    const begin = this.current();
    this.next();
    let seenPack = false;
    let seenDefault = false;
    for (;;) {
      const nameLocation = this.current().location;
      const name = this.parseName().name;
      if (this.is("...") || seenPack) {
        seenPack = true;
        if (!this.is("...")) this.report(this.current().location, "Generic types come before generic type packs");
        else this.next();
        if (withDefaultValues && this.is("=")) {
          seenDefault = true;
          this.next();
          if (this.shouldParseTypePack()) {
            namePacks.push(new AstGenericTypePack(nameLocation, name, this.parseTypePack()));
          } else {
            const { type, typePack } = this.parseSimpleTypeOrPack();
            if (type) this.report(type.location, "Expected type pack after '=', got type");
            namePacks.push(new AstGenericTypePack(nameLocation, name, typePack));
          }
        } else {
          if (seenDefault) this.report(this.current().location, "Expected default type pack after type pack name");
          namePacks.push(new AstGenericTypePack(nameLocation, name, undefined));
        }
      } else if (withDefaultValues && this.is("=")) {
        seenDefault = true;
        this.next();
        names.push(new AstGenericType(nameLocation, name, this.parseType()));
      } else {
        if (seenDefault) this.report(this.current().location, "Expected default type after type name");
        names.push(new AstGenericType(nameLocation, name, undefined));
      }
      if (this.is(",")) {
        this.next();
        if (this.is(">")) {
          this.report(this.current().location, "Expected type after ',' but got '>' instead");
          break;
        }
      } else break;
    }
    this.expectMatchAndConsume(">", begin);
    return [names, namePacks];
  }

  private parseTypeParams(): AstTypeOrPack[] {
    const reportsBefore = this.reports;
    const parameters: AstTypeOrPack[] = [];
    if (!this.is("<")) return parameters;
    const begin = this.current();
    this.next();
    for (;;) {
      if (this.shouldParseTypePack()) {
        parameters.push({ typePack: this.parseTypePack() });
      } else if (this.is("(")) {
        const typeBegin = this.current().location;
        const { type, typePack } = this.parseSimpleType(true);
        if (typePack) {
          if (typePack instanceof AstTypePackExplicit && typePack.typeList.tailType === undefined && typePack.typeList.types.length === 1 && this.isTypeFollow()) {
            const parenthesized = typePack.typeList.types[0]!;
            parameters.push({ type: this.parseTypeSuffix(new AstTypeGroup(parenthesized.location, parenthesized), typeBegin) });
          } else {
            parameters.push({ typePack });
          }
        } else {
          parameters.push({ type: this.parseTypeSuffix(type, typeBegin) });
        }
      } else if (this.is(">") && parameters.length === 0) {
        break;
      } else {
        parameters.push({ type: this.parseType() });
      }
      if (this.is(",")) this.next();
      else break;
    }
    this.expectMatchAndConsume(">", begin, false, this.reports === reportsBefore ? "type" : undefined);
    return parameters;
  }

  // -- Expressions ---------------------------------------------------------

  private unaryOp(): UnaryOp | undefined {
    if (this.is("not")) return UnaryOp.Not;
    if (this.is("-")) return UnaryOp.Minus;
    if (this.is("#")) return UnaryOp.Len;
    if (this.is("!")) {
      this.report(this.current().location, "Unexpected '!'; did you mean 'not'?");
      return UnaryOp.Not;
    }
    return undefined;
  }

  private binaryOp(limit: number): BinaryOp | undefined {
    const token = this.current();
    if (token.kind === "keyword") {
      if (token.text === "and") return BinaryOp.And;
      if (token.text === "or") return BinaryOp.Or;
      return undefined;
    }
    if (token.kind !== "symbol") return undefined;
    const op = BINARY_OPS.get(token.text);
    if (op !== undefined) return op;
    const entry = CONFUSABLE_BINARY_OPS.get(token.text);
    if (entry && BINARY_PRIORITY[entry[0]]!.left > limit) {
      this.report(token.location, `Unexpected '${token.text}'; did you mean '${entry[1]}'?`);
      return entry[0];
    }
    return undefined;
  }

  parseExpr(limit = 0): AstExpr {
    // A redundant discard mark on a later function-body line cannot cut
    // short the multiline expression that this return is still reading.
    if (this.returnFunction === this.currentFunction() && this.current().kind === "mark" && this.current().location.begin.line > this.previousLocation().end.line) this.next();
    const oldRecursionCount = this.recursionCounter;
    this.incrementRecursionCounter("expression");
    const start = this.current().location;
    let expr: AstExpr;
    const uop = this.unaryOp();
    if (uop !== undefined) {
      const atValue = this.valuePos === this.pos;
      this.next();
      // A value begins past its unary operators.
      if (atValue) this.valuePos = this.pos;
      const subexpr = this.parseExpr(UNARY_PRIORITY);
      expr = new AstExprUnary(Location.span(start, subexpr.location), uop, subexpr);
    } else {
      expr = this.parseAssertionExpr();
    }
    let op = this.binaryOp(limit);
    while (op !== undefined && BINARY_PRIORITY[op]!.left > limit) {
      this.next();
      const next = this.parseExpr(BINARY_PRIORITY[op]!.right);
      expr = new AstExprBinary(Location.span(start, next.location), op, expr, next);
      op = this.binaryOp(limit);
      // The loop is not recursive, but the tree it builds is as deep.
      this.incrementRecursionCounter("expression");
    }
    this.recursionCounter = oldRecursionCount;
    return expr;
  }

  private parseNameExpr(context?: string, malformed?: MalformedConstruct): AstExpr {
    const name = this.parseNameOpt(context, malformed);
    if (!name) return new AstExprError(this.current().location, [], this.errors.length - 1);
    const local = this.localMap.get(name.name);
    if (local) {
      if (local.functionDepth < this.typeFunctionDepth) return this.reportExprError(this.current().location, [], `Type function cannot reference outer local '${local.name}'`);
      return new AstExprLocal(name.location, local, local.functionDepth !== this.functionStack.length - 1);
    }
    return new AstExprGlobal(name.location, name.name);
  }

  private parsePrefixExpr(): AstExpr {
    if (this.is("(")) {
      const start = this.current().location.begin;
      const matchParen = this.current();
      this.next();
      const expr = this.parseExpr();
      let end = this.current().location.end;
      if (!this.is(")")) {
        const suggestion = this.is("=") ? "; did you mean to use '{' when defining a table?" : "";
        this.expectMatchAndConsumeFail(")", matchParen, suggestion);
        // Not part of Luau: the bracket is given up on (see `parseBlockNoScope`).
        this.abandonedClosers.push({ text: ")" });
        end = this.previousLocation().end;
      } else {
        this.nextExpected();
      }
      return new AstExprGroup(new Location(start, end), expr);
    }
    if (this.current().kind === "new") return this.parseNew();
    // Where no expression can begin, Luau's parser meets a backtick string
    // as its lexer reads it, a lexeme at a time (`` `a { ``, then the
    // interpolation's tokens, then `` } b` ``), not as one string (I-1406,
    // I-1419): `parseNameOpt` rejects it.
    return this.parseNameExpr("expression", "expression");
  }

  private parsePrimaryExpr(asStatement: boolean): AstExpr {
    const start = this.current().location.begin;
    let expr = this.parsePrefixExpr();
    const oldRecursionCount = this.recursionCounter;
    for (;;) {
      if (this.is(".")) {
        const opPosition = this.current().location.begin;
        this.next();
        const index = this.parseIndexName(undefined, opPosition, "expression");
        expr = new AstExprIndexName(new Location(start, index.location.end), expr, index.name, index.location, opPosition, ".");
      } else if (this.is("[")) {
        const matchBracket = this.current();
        this.next();
        const index = this.parseExpr();
        const end = this.current().location.end;
        this.expectMatchAndConsume("]", matchBracket);
        expr = new AstExprIndexExpr(new Location(start, end), expr, index);
      } else if (this.is(":")) {
        const opPosition = this.current().location.begin;
        this.next();
        const index = this.parseIndexName("method name", opPosition, "expression");
        const func = new AstExprIndexName(new Location(start, index.location.end), expr, index.name, index.location, opPosition, ":");
        let typeArguments: AstTypeOrPack[] = [];
        if (this.is("<") && this.is("<", this.lookahead())) typeArguments = this.parseTypeInstantiationExpr();
        const call = this.parseFunctionArgs(func, true);
        if (call instanceof AstExprCall && typeArguments.length > 0) call.typeArguments = typeArguments;
        expr = call;
      } else if (this.is("(")) {
        if (!asStatement && expr.location.end.line !== this.current().location.begin.line) {
          this.reportAmbiguousCallError();
          break;
        }
        expr = this.parseFunctionArgs(expr, false);
      } else if (this.is("{") || this.current().kind === "string" || this.current().kind === "rawstring") {
        expr = this.parseFunctionArgs(expr, false);
      } else if (this.is("<") && this.is("<", this.lookahead())) {
        const end = { value: new Location() };
        const typeArguments = this.parseTypeInstantiationExpr(end);
        expr = new AstExprInstantiate(new Location(start, end.value.end), expr, typeArguments);
      } else {
        break;
      }
      this.incrementRecursionCounter("expression");
    }
    this.recursionCounter = oldRecursionCount;
    return expr;
  }

  /** `<<` types `>>` after a function: its explicit type arguments. `end` receives the location of the closing `>`. */
  private parseTypeInstantiationExpr(end?: { value: Location }): AstTypeOrPack[] {
    const begin = this.current();
    this.next();
    const typeOrPacks = this.parseTypeParams();
    if (end) end.value = this.current().location;
    this.expectMatchAndConsume(">", begin);
    return typeOrPacks;
  }

  private parseAssertionExpr(): AstExpr {
    const start = this.current().location;
    const expr = this.parseSimpleExpr();
    if (this.is("::")) {
      this.next();
      const annotation = this.parseType();
      return new AstExprTypeAssertion(Location.span(start, annotation.location), expr, annotation);
    }
    return expr;
  }

  private parseSimpleExpr(): AstExpr {
    // A string an error rejected (`rejected`) is one string again where an
    // expression begins at its first lexeme, as Luau's parser reads its
    // lexemes there.
    const split = this.current().lexemesOf;
    if (split) this.tokens.splice(this.pos, split.count, split.token);
    const start = this.current().location;
    if (this.isAttribute()) {
      const attributes = this.parseAttributes();
      if (!this.is("function")) {
        return this.reportExprError(start, [], `Expected 'function' declaration after attribute, but got ${describe(this.rejected())} instead`, "attribute");
      }
      const matchFunction = this.current();
      this.next();
      return this.parseFunctionBody(false, matchFunction, "", undefined, attributes)[0];
    }
    const token = this.current();
    if (this.is("nil")) {
      this.next();
      return new AstExprConstantNil(start);
    }
    if (this.is("true") || this.is("false")) {
      this.next();
      return new AstExprConstantBool(start, token.text === "true");
    }
    if (this.is("function")) {
      this.next();
      return this.parseFunctionBody(false, token, "", undefined, [])[0];
    }
    if (token.kind === "number") return this.parseNumber();
    if (token.kind === "string" || token.kind === "rawstring") return this.parseString();
    // A section of a string after an interpolation Luau gave up on (`stringRest`) is no string's start.
    if (token.kind === "interp" && token.node) return this.parseInterpString();
    if (token.kind === "interp" && token.section && token.text.startsWith("`")) return this.parseLexedInterpString();
    if (this.is("...")) {
      this.next();
      if (this.currentFunction().vararg) return new AstExprVarargs(start);
      return this.reportExprError(start, [], "Cannot use '...' outside of a vararg function");
    }
    if (this.is("{")) return this.parseTableConstructor();
    if (this.is("if")) return this.parseIfElseExpr();
    if (token.kind === "sparkdown") {
      this.next();
      return sparkdownExpression(token);
    }
    if (token.kind === "flowArgument") {
      this.next();
      return new AstExprSparkdownFlowArgument(start);
    }
    return this.parsePrimaryExpr(false);
  }

  /** `new ClassName`, and the argument list that follows it. */
  private parseNew(): AstExpr {
    const token = this.current();
    this.next();
    const node = token.node;
    const classNode = node ? findDescendant(node, "LuauNewClassName") : undefined;
    const className = classNode ? this.ctx.text.slice(classNode.from, classNode.to) : "";
    const classLocation = classNode
      ? new Location(this.ctx.index.position(classNode.from), this.ctx.index.position(classNode.to))
      : new Location(token.location.end, token.location.end);
    if (this.is("(")) {
      const matchParen = this.current();
      this.next();
      const args: AstExpr[] = [];
      if (!this.is(")")) this.parseExprList(args);
      const end = this.current().location;
      this.expectMatchAndConsume(")", matchParen);
      return new AstExprSparkdownNew(Location.span(token.location, end), className, classLocation, args, true);
    }
    return new AstExprSparkdownNew(token.location, className, classLocation, [], false);
  }

  private parseFunctionArgs(func: AstExpr, self: boolean): AstExpr {
    if (this.is("(")) {
      const argStart = this.current().location.end;
      if (func.location.end.line !== this.current().location.begin.line) this.reportAmbiguousCallError();
      const matchParen = this.current();
      this.next();
      const args: AstExpr[] = [];
      const reports = this.reports;
      if (!this.is(")")) this.parseExprList(args);
      const end = this.current().location;
      this.expectMatchAndConsume(")", matchParen);
      // Not part of Luau: whether reading the list to its `)` reported an
      // error, a missing argument (`f(1,)`) or a token before the closer
      // (`f(1 'x')`) alike (I-1428).
      const malformed = this.reports > reports;
      return new AstExprCall(Location.span(func.location, end), func, args, self, [], new Location(argStart, end.end), malformed);
    }
    if (this.is("{")) {
      const argStart = this.current().location.end;
      const expr = this.parseTableConstructor();
      const argEnd = this.previousLocation().end;
      return new AstExprCall(Location.span(func.location, expr.location), func, [expr], self, [], new Location(argStart, argEnd));
    }
    if (this.current().kind === "string" || this.current().kind === "rawstring") {
      const argLocation = this.current().location;
      const expr = this.parseString();
      return new AstExprCall(Location.span(func.location, expr.location), func, [expr], self, [], argLocation);
    }
    if (self && this.current().location.begin.line !== func.location.end.line) {
      return this.reportExprError(func.location, [func], "Expected function call arguments after '('");
    }
    return this.reportExprError(
      new Location(func.location.begin, this.current().location.begin),
      [func],
      `Expected '(', '{' or <string> when parsing function call, got ${describe(this.rejected())}`,
      "expression",
    );
  }

  private reportAmbiguousCallError(): void {
    this.report(
      this.current().location,
      "Ambiguous syntax: this looks like an argument list for a function call, but could also be a start of new statement; use ';' to separate statements",
    );
  }

  private parseTableConstructor(): AstExpr {
    const items: AstExprTableItem[] = [];
    const start = this.current().location;
    const matchBrace = this.current();
    this.expectAndConsume("{", "table literal");
    while (!this.is("}")) {
      const itemStart = this.current().location.begin;
      if (this.is("[")) {
        const matchBracket = this.current();
        this.next();
        const key = this.parseExpr();
        this.expectMatchAndConsume("]", matchBracket);
        this.expectAndConsume("=", "table field");
        const value = this.parseExpr();
        items.push({ kind: TableItemKind.General, key, value });
      } else if (this.isName() && this.is("=", this.lookahead())) {
        const name = this.parseName("table field");
        this.expectAndConsume("=", "table field");
        const key = new AstExprConstantString(name.location, name.name, QuoteStyle.Unquoted);
        const value = this.parseExpr();
        if (value instanceof AstExprFunction) value.debugname = name.name;
        items.push({ kind: TableItemKind.Record, key, value });
      } else {
        const expr = this.parseExpr();
        items.push({ kind: TableItemKind.List, key: undefined, value: expr });
      }
      if (this.is(",") || this.is(";")) this.next();
      // An element on a later line in the same column as the one before it
      // is the next element.
      else if ((this.is("[") || this.isName()) && this.current().location.begin.line > this.previousLocation().end.line && this.current().location.begin.column === itemStart.column) {
        this.report(this.current().location, "Expected ',' after table constructor element");
      }
      else if (!this.is("}")) break;
    }
    let end = this.current().location;
    if (!this.expectMatchAndConsume("}", matchBrace)) end = this.previousLocation();
    return new AstExprTable(Location.span(start, end), items);
  }

  private parseIfElseExpr(): AstExpr {
    const start = this.current().location;
    this.next(); // if / elseif
    const condition = this.parseExpr();
    const hasThen = this.expectAndConsume("then", "if then else expression");
    const trueExpr = this.parseValue();
    let falseExpr: AstExpr;
    let hasElse: boolean;
    if (this.is("elseif")) {
      const oldRecursionCount = this.recursionCounter;
      this.incrementRecursionCounter("expression");
      hasElse = true;
      falseExpr = this.parseIfElseExpr();
      this.recursionCounter = oldRecursionCount;
    } else {
      hasElse = this.expectAndConsume("else", "if then else expression");
      falseExpr = this.parseValue();
    }
    return new AstExprIfElse(Location.span(start, falseExpr.location), condition, hasThen, trueExpr, hasElse, falseExpr);
  }

  /** `malformed` is what the name's absence leaves malformed (not part of Luau, see `MalformedConstruct`), an annotation where a `::` stands in its place. */
  private parseNameOpt(context?: string, malformed?: MalformedConstruct): Name | undefined {
    if (!this.isName()) {
      const got = describe(this.rejected());
      const message = context !== undefined ? `Expected identifier when parsing ${context}, got ${got}` : `Expected identifier, got ${got}`;
      this.report(this.current().location, message, this.nameMalformed(malformed));
      return undefined;
    }
    const result = { name: this.current().text, location: this.current().location };
    this.next();
    return result;
  }

  /**
   * Not part of Luau: what is malformed where a name must stand and another
   * token is found. A `:` at the start of an assigned value or an if
   * expression's arm (`valuePos`), the cast's `::` or a method call's `:`
   * with no value before it, is Sparkdown's own syntax's to report, as the
   * value missing there (`typeCheckerReportsMissingValue`). Any other `::`
   * is an annotation written with it.
   */
  private nameMalformed(malformed?: MalformedConstruct): MalformedConstruct | undefined {
    const colon = this.is(":") || (this.is("::") && !this.isAnnotationColon());
    if (colon && malformed === "expression" && this.pos === this.valuePos) return undefined;
    if (this.is("::")) return "annotation";
    return malformed;
  }

  private parseName(context?: string, malformed?: MalformedConstruct): Name {
    const name = this.parseNameOpt(context, malformed);
    if (name) return name;
    const location = this.current().location;
    return { name: ERROR_NAME, location: new Location(location.begin, location.begin) };
  }

  private parseIndexName(context: string | undefined, previous: Position, malformed: MalformedConstruct): Name {
    const name = this.parseNameOpt(context, malformed);
    if (name) return name;
    // A keyword on the same line is read as an unfinished name.
    if (this.current().kind === "keyword" && this.current().location.begin.line === previous.line) {
      const result = { name: this.current().text, location: this.current().location };
      this.next();
      // Not part of Luau: reading the keyword is the recovery from the error
      // at it, so the reading still stands at that error, unless the keyword
      // ends or divides a block, after which the author's next statement
      // begins (`do y = t.a. end 1 +`).
      if (BLOCK_DELIMITERS.has(result.name)) this.expectedPos = this.pos - 1;
      else this.errorPos = this.pos;
      return result;
    }
    const location = this.current().location;
    return { name: ERROR_NAME, location: new Location(location.begin, location.begin) };
  }

  // -- Literals ------------------------------------------------------------

  private parseNumber(): AstExpr {
    const token = this.current();
    this.next();
    // Luau's lexer reads a number on through the letters, digits and `_`
    // written right after it (`0xZ`, `123x`), as one malformed number,
    // where the tree ends the number before them.
    let text = token.text;
    let last = token;
    while ((this.current().kind === "name" || this.current().kind === "keyword" || this.current().kind === "number") && this.current().from === last.to) {
      last = this.current();
      text += last.text;
      this.next();
    }
    const location = Location.span(token.location, last.location);
    const value = numberValue(text);
    if (value === undefined) return this.reportExprError(location, [], "Malformed number");
    return new AstExprConstantNumber(location, value);
  }

  /** A quoted or long string's value, or undefined when an escape is malformed. */
  private charArray(token: Token): string | undefined {
    if (token.kind === "rawstring") return rawValue(token.text);
    return quotedValue(token.text.slice(1, token.text.length - 1));
  }

  private locationOf(from: number, to: number): Location {
    return new Location(this.ctx.index.position(from), this.ctx.index.position(to));
  }

  private parseString(): AstExpr {
    const token = this.current();
    this.next();
    // A backtick string's errors are its own (`LuauSyntaxError.ofString`).
    const report = token.text.startsWith("`") ? this.reportStringError.bind(this) : this.reportExprError.bind(this);
    if (!isFinished(token)) return report(token.location, [], "Malformed string; did you forget to finish it?");
    if (token.kind === "string" && token.text.startsWith('"') && token.node && hasInterpolation(token.node)) {
      return this.parseSparkdownString(token);
    }
    const style = token.kind === "rawstring" ? QuoteStyle.QuotedRaw : QuoteStyle.QuotedSimple;
    const value = this.charArray(token);
    if (value === undefined) return report(token.location, [], "String literal contains malformed escape sequence");
    return new AstExprConstantString(token.location, value, style);
  }

  /**
   * The parts of a string node: the text between its interpolations, and the
   * interpolations; `unclosed` when an interpolation is missing its closing
   * brace, after which the string's own end is not where the tree ends it.
   */
  private stringParts(
    token: Token,
    interpolation: string,
    after?: Token,
  ): { strings: string[]; expressions: AstExpr[]; unclosed: boolean; segment: Location; rest?: Token[]; ended?: Location } | undefined {
    const node = token.node!;
    const strings: string[] = [];
    const expressions: AstExpr[] = [];
    const text = this.ctx.text;
    let at = token.from + 1;
    // Where the string's current section (Luau's lexeme) begins: the opening
    // quote, then each interpolation's closing brace.
    let section = token.from;
    const close = token.to - 1;
    const children = stringPartNodes(node, interpolation);
    const luau = interpolation === BACKTICK_INTERPOLATION;
    for (const [i, child] of children.entries()) {
      const isShorthand = CALL_SHORTHANDS.has(child.name);
      const value = quotedValue(text.slice(at, child.from));
      if (value === undefined) {
        if (!luau) return undefined;
        // Luau's parser gives up on a backtick string at the section that
        // holds a malformed escape, which it reports from the string's
        // start through that section; the interpolation's tokens and the
        // sections after it are read after the string, as they are after a
        // stray token (I-1435).
        const end = child.from + (isShorthand ? 2 : 1);
        expressions.push(this.reportStringError(this.locationOf(token.from, end), [], "Interpolated string literal contains malformed escape sequence"));
        const { body } = this.interpolationTokens(child, isShorthand);
        const rest = this.stringRest(token, body, children.slice(i));
        return { strings, expressions, unclosed: false, segment: this.locationOf(section, end), rest };
      }
      strings.push(value);
      const segment = this.locationOf(section, child.from + (isShorthand ? 2 : 1));
      // The section after the last interpolation of a string with no closing
      // backtick is one Luau's lexer could not finish.
      const brokenNext = luau && i === children.length - 1 && !hasClosingBacktick(text, node);
      const part = this.interpolation(child, isShorthand, segment, after, luau, brokenNext, token);
      expressions.push(part.expr);
      if (part.continued) {
        strings.push(...part.continued.strings);
        expressions.push(...part.continued.expressions);
      }
      if (part.stray) {
        // The grammar read the rest as the string's, so its tokens are ones
        // it left unread as Luau's, and no rule of it reports the statements
        // Luau reads from them (`markUnreadErrors`): their errors, and the
        // string's statement's, are the reading's. A continued string's
        // stray tokens were lexed through the string's end, its sections
        // included.
        const rest = this.stringRest(token, part.stray, part.continued ? [] : children.slice(i));
        // A string that went on through another's sections ends with that
        // one's last, as Luau's parser ends it, with no error of its own.
        const ended = part.continued?.end !== undefined ? this.locationOf(token.from, part.continued.end) : undefined;
        return { strings, expressions, unclosed: false, segment, rest, ended };
      }
      if (part.empty) {
        // Luau's parser gives up on the string at an empty interpolation
        // (`` `a {} b {c} d` ``) once it has read the section after it
        // (`} b {`): the rest is read after the string (I-1420).
        const rest = this.stringRest(token, [], children.slice(i)).slice(1);
        return { strings, expressions, unclosed: false, segment, rest };
      }
      if (!part.closed) {
        strings.push("");
        return { strings, expressions, unclosed: true, segment };
      }
      at = child.to;
      section = child.to - (isShorthand ? 2 : 1);
    }
    const value = quotedValue(text.slice(at, Math.max(at, close)));
    if (value === undefined) {
      if (!luau) return undefined;
      // A last section Luau's lexer could not finish is a malformed string
      // to it, whose escapes it does not read (I-1318). A finished one with
      // a malformed escape is reported over the whole string, as a plain
      // string's where the string has no interpolation (I-1435).
      if (hasClosingBacktick(text, node)) {
        const message = children.length === 0 ? "String literal contains malformed escape sequence" : "Interpolated string literal contains malformed escape sequence";
        expressions.push(this.reportStringError(token.location, [], message));
        return { strings, expressions, unclosed: false, segment: this.locationOf(section, token.to), rest: [] };
      }
    }
    strings.push(value ?? "");
    return { strings, expressions, unclosed: false, segment: this.locationOf(section, token.to) };
  }

  /**
   * The tokens Luau's lexer reads in a backtick string after its parser
   * gave up on the string at an interpolation's stray token: the `stray`
   * tokens of the first of `parts`, then each interpolation's closing brace
   * begins a section to the next one's opening brace (`} b {`) or to the
   * string's end (`` } b` ``), and the interpolations after the first are
   * read token by token. A string among those tokens is one token until
   * the reading meets it where no expression can begin (`interpLexemes`).
   */
  private stringRest(token: Token, stray: Token[], parts: SyntaxNode[]): Token[] {
    // The tokens stand where the string did, in the reading's statements.
    // The grammar read them as the string's, so they are tokens it left
    // unread as Luau's, and no rule of it reports the statements Luau reads
    // from them (`markUnreadErrors`): their errors, and the string's
    // statement's, are the reading's.
    const at = (t: Token): Token => ({ ...t, source: token.source, unread: true, authoredIsland: token.authoredIsland });
    const rest: Token[] = stray.map(at);
    for (const [i, part] of parts.entries()) {
      const shorthand = CALL_SHORTHANDS.has(part.name);
      const { body, closed } = this.interpolationTokens(part, shorthand);
      if (i > 0) rest.push(...body.map(at));
      if (!closed) break;
      const next = parts[i + 1];
      const from = part.to - (shorthand ? 2 : 1);
      const to = next ? next.from + (CALL_SHORTHANDS.has(next.name) ? 2 : 1) : token.to;
      const text = this.ctx.text.slice(from, to);
      const section = at({ kind: "interp", text, from, to, location: this.locationOf(from, to), source: token.source });
      // Without its closing backtick, Luau's lexer reads the string's last
      // section as a string it could not finish (I-1421).
      if (!next && !hasClosingBacktick(this.ctx.text, token.node!)) section.broken = true;
      rest.push(section);
    }
    return rest;
  }

  /**
   * A backtick string with interpolations, as Luau's lexer reads it where
   * its parser does not read it as a string: one lexeme per section
   * (`` `a { ``, `} b {`, `` } c` ``) with each interpolation's tokens
   * between them; with no closing backtick, the last section is one Luau's
   * lexer could not finish (`stringRest`), and after an interpolation left
   * open, the first included (`(1 `a {x)`, I-1435), its tokens and the code
   * Luau's lexer reads on through end them. Undefined for any other token
   * or a string Luau reads as one lexeme.
   */
  private interpLexemes(token: Token): Token[] | undefined {
    const node = token.node;
    if (token.kind !== "interp" || !node) return undefined;
    const parts = stringPartNodes(node, BACKTICK_INTERPOLATION);
    if (parts.length === 0) return undefined;
    const first = parts[0]!;
    const shorthand = CALL_SHORTHANDS.has(first.name);
    const { body, opened } = this.interpolationTokens(first, shorthand);
    if (!opened) return undefined;
    const to = first.from + (shorthand ? 2 : 1);
    const rest = this.stringRest(token, body, parts);
    // After a later interpolation left open, Luau's lexer reads on as code
    // through what the tree takes into the string after that
    // interpolation's tokens (the `)` of `` `a {x} b {y) ``).
    const end = rest[rest.length - 1]?.to ?? to;
    if (end < token.to) {
      const tokenizer = new Tokenizer(this.ctx.text, this.ctx.index);
      tokenizer.lex(end, token.to);
      rest.push(...tokenizer.tokens.map((t) => ({ ...t, source: token.source, unread: true as const, authoredIsland: token.authoredIsland })));
    }
    // The grammar read the string as one, so its first lexeme is a token it
    // left unread too: the errors at it are the reading's (`stringRest`).
    const begin: Token = {
      ...token,
      node: undefined,
      text: this.ctx.text.slice(token.from, to),
      to,
      location: this.locationOf(token.from, to),
      unread: true,
      lexemesOf: { token, count: rest.length + 1 },
    };
    return [begin, ...rest];
  }

  /** An interpolation's tokens between its braces, and whether its opening and closing braces are written. */
  private interpolationTokens(node: SyntaxNode, shorthand: boolean): { body: Token[]; opened: boolean; closed: boolean; closers: Token[] } {
    const tokenizer = new Tokenizer(this.ctx.text, this.ctx.index);
    tokenizer.readChildren(node);
    const inner = tokenizer.tokens;
    // The braces around the expression: one on each side, or two for the shorthand.
    const braces = shorthand ? 2 : 1;
    const isBrace = (token: Token | undefined, brace: string) => token?.kind === "symbol" && token.text === brace;
    const opened = inner.slice(0, braces).every((t) => isBrace(t, "{"));
    const closers = inner.length - braces >= braces ? inner.slice(inner.length - braces) : [];
    const closed = closers.length === braces && closers.every((t) => isBrace(t, "}"));
    const body = inner.slice(opened ? braces : 0, closed ? inner.length - braces : inner.length);
    return { body, opened, closed, closers };
  }

  /**
   * The expression of an interpolation (`{x}`), or of a `{{f}}` shorthand,
   * and whether its closing braces are written.
   */
  private interpolation(
    node: SyntaxNode,
    shorthand: boolean,
    segment?: Location,
    after?: Token,
    luau = false,
    brokenNext = false,
    string?: { from: number; to: number },
  ): { expr: AstExpr; closed: boolean; stray?: Token[]; empty?: true; continued?: ContinuedString } {
    const { body, opened, closed, closers } = this.interpolationTokens(node, shorthand);
    const location = new Location(this.ctx.index.position(node.from), this.ctx.index.position(node.to));
    // The reading of the expression ends at its closing braces, or where the interpolation ends.
    const end = closed ? Location.span(closers[0]!.location, closers[closers.length - 1]!.location) : new Location(location.end, location.end);
    // A backtick string's interpolation left open, which goes on over lines
    // and ends before a closer it did not open (I-1318), is reported as
    // Luau's parser reports it, at the string's section that opened it
    // (`segment`): a string Luau's lexer could not finish on its line right
    // after the `{` (`` `a {"x ``), or a token after the expression other than
    // such a string (`` `a {b `` and then `end`, the token after the
    // interpolation, `after`).
    const broken = (token: Token | undefined) => (token?.kind === "string" || token?.kind === "interp") && !isFinished(token);
    // A backtick string's errors here are its own (`LuauSyntaxError.ofString`),
    // not those of the expression read inside the braces.
    const own = <T>(report: () => T): T => {
      if (!luau) return report();
      this.stringError = true;
      try {
        return report();
      } finally {
        this.stringError = false;
      }
    };
    if (segment && !closed && broken(body[0])) {
      return { expr: own(() => this.reportExprError(segment, [], "Malformed interpolated string; did you forget to add a '`'?")), closed };
    }
    // A backtick string's empty interpolation is Luau's error at the
    // string's section that opened it (I-1420), unless the section after it
    // is one Luau's lexer could not finish, which Luau's parser reports
    // first. Not part of Luau: the error is the reading's to report, as the
    // validator leaves it, in a story statement too.
    if (body.length === 0 && opened && closed && !shorthand && luau && segment) {
      const message = brokenNext ? "Malformed interpolated string; did you forget to add a '`'?" : "Malformed interpolated string, expected expression inside '{}'";
      return { expr: own(() => this.reportExprError(segment, [], message, "expression")), closed, empty: true };
    }
    let stray: Token[] | undefined;
    let continued: ContinuedString | undefined;
    const expr = this.withTokens(body, end, () => {
      if (body.length === 0) return own(() => this.reportExprError(location, [], "Malformed interpolated string, expected expression inside '{}'"));
      const e = this.parseExpr();
      const inner = this.current();
      if (luau && segment && inner.kind === "interp" && inner.node && stringPartNodes(inner.node, BACKTICK_INTERPOLATION).length > 0) {
        // A backtick string with interpolations after the expression
        // (`` `a {1 `b {x} c`} d` ``) begins with an interpolated string's
        // first section, which Luau's parser reads as the string's next
        // section (`parseInterpString`, I-1427): the string goes on through
        // that string's sections and ends at its last, whether or not a `}`
        // follows for the tree to close the interpolation with
        // (`` `a {1 `b {x} c} d` ``), and what follows it is read after the
        // string, as a stray token's rest is. The tree splits the text
        // otherwise than Luau's lexer, which reads on inside this
        // interpolation, so the text from that string through this one's
        // end is lexed as Luau's lexer reads it and read as its lexemes.
        if (string) {
          const tokenizer = new Tokenizer(this.ctx.text, this.ctx.index);
          tokenizer.lex(inner.from, string.to, [0]);
          const lexed = tokenizer.tokens.map((t): Token => ({ ...t, source: inner.source, unread: true, authoredIsland: inner.authoredIsland }));
          const stringEnd = this.locationOf(string.to, string.to);
          this.withTokens(lexed, stringEnd, () => {
            const value = this.parseLexedInterpString(this.locationOf(string.from, string.from));
            const ended = value instanceof AstExprInterpString;
            continued = ended ? { strings: value.strings, expressions: value.expressions, end: this.tokens[this.pos - 1]!.to } : { strings: [], expressions: [value] };
            stray = this.tokens.slice(this.pos);
          });
          return e;
        }
      }
      // Without its closing brace, the interpolation ends where its expression does, as Luau reports it.
      if (!closed && segment && !broken(this.current()) && (this.current().kind !== "eof" || after)) {
        const found = this.current().kind === "eof" ? after! : this.current();
        // Luau's lexer never ends an interpolation left open, so the tokens
        // after its expression are read after the string (`` f(`a {b `` and
        // then `x = 1`), as after a closed one's stray token (I-1343).
        if (luau && this.current().kind !== "eof") {
          stray = body.slice(this.pos);
          return own(() => this.reportExprError(segment, [], `Malformed interpolated string, got ${describe(found)}`));
        }
        own(() => this.report(segment, `Malformed interpolated string, got ${describe(found)}`));
      } else if (!closed) own(() => this.report(this.current().location, "Malformed interpolated string; did you forget to add a '}'?"));
      else if (this.current().kind !== "eof" && luau && segment) {
        // A backtick string's interpolation with a token after its
        // expression (`` `a {1 2} b` ``) ends the string where Luau's
        // parser ends it, at the string's section that opened the
        // interpolation; the tokens from that one on are read after the
        // string, as Luau reads them (`parseInterpString`, I-1406).
        stray = body.slice(this.pos);
        return own(() => this.reportExprError(segment, [], `Malformed interpolated string, got ${describe(this.current())}`));
      } else if (this.current().kind !== "eof") own(() => this.report(this.current().location, `Malformed interpolated string, got ${describe(this.current())}`));
      return e;
    });
    if (stray) return { expr, closed, stray, continued };
    if (!opened) return { expr: own(() => this.reportExprError(location, [expr], "Malformed interpolated string")), closed };
    return { expr: shorthand ? new AstExprSparkdownCallShorthand(location, expr) : expr, closed };
  }

  /**
   * A backtick string with interpolations lexed from text, as Luau's lexemes
   * (`Tokenizer.interpSection`), read as Luau's `parseInterpString` reads
   * them: each section and the interpolation after it, until the closing
   * section. Its errors are the string's own (`LuauSyntaxError.ofString`).
   * `start` is where Luau's string begins: the first section's, or an outer
   * string's that goes on through these sections (I-1427).
   */
  private parseLexedInterpString(start = this.current().location): AstExpr {
    const begin = { location: start };
    const strings: string[] = [];
    const expressions: AstExpr[] = [];
    const isSection = (token: Token) => token.kind === "interp" && token.section === true;
    const isBroken = (token: Token) => token.broken === true || (!token.section && (token.kind === "string" || token.kind === "interp") && !isFinished(token));
    for (;;) {
      const section = this.current();
      const value = quotedValue(section.text.slice(1, section.text.length - 1));
      this.next();
      if (value === undefined) {
        return this.reportStringError(Location.span(begin.location, section.location), expressions, "Interpolated string literal contains malformed escape sequence");
      }
      strings.push(value);
      if (!section.text.endsWith("{")) return new AstExprInterpString(Location.span(begin.location, section.location), strings, expressions);
      const found = this.current();
      if (isBroken(found)) {
        this.next();
        return this.reportStringError(section.location, expressions, "Malformed interpolated string; did you forget to add a '`'?");
      }
      if (isSection(found) && found.text.startsWith("}")) {
        this.next();
        return this.reportStringError(section.location, expressions, "Malformed interpolated string, expected expression inside '{}'");
      }
      expressions.push(this.parseExpr());
      const next = this.current();
      // A section Luau's lexer could not finish (`} b` at the line's end)
      // is the string's last, which Luau's parser reports as it.
      if (isSection(next) && next.broken) {
        this.next();
        return this.reportStringError(next.location, expressions, "Malformed interpolated string; did you forget to add a '`'?");
      }
      if (isBroken(next)) {
        this.next();
        return this.reportStringError(section.location, expressions, "Malformed interpolated string; did you forget to add a '}'?");
      }
      // The input ends in the interpolation: Luau's lexer reads its end as
      // the unfinished interpolation's, which its parser reports at the
      // expression's last token.
      if (next.kind === "eof") return this.reportStringError(this.previousLocation(), expressions, "Malformed interpolated string; did you forget to add a '}'?");
      if (!isSection(next)) return this.reportStringError(section.location, expressions, `Malformed interpolated string, got ${describe(next)}`);
    }
  }

  /** A double-quoted string with interpolations, as Sparkdown reads it. */
  private parseSparkdownString(token: Token): AstExpr {
    const luauValue = quotedValue(token.text.slice(1, token.text.length - 1));
    // Not part of Luau: the interpolation is Sparkdown's own syntax (see `report`).
    this.sparkdownDepth++;
    const parts = (() => {
      try {
        return this.stringParts(token, DOUBLE_QUOTED_INTERPOLATION);
      } finally {
        this.sparkdownDepth--;
      }
    })();
    if (!parts || luauValue === undefined) return this.reportExprError(token.location, [], "String literal contains malformed escape sequence");
    if (parts.unclosed) return new AstExprError(token.location, parts.expressions, this.errors.length - 1);
    return new AstExprSparkdownInterpString(token.location, parts.strings, parts.expressions, luauValue);
  }

  private parseInterpString(): AstExpr {
    const token = this.current();
    this.next();
    const parts = this.stringParts(token, BACKTICK_INTERPOLATION, this.current());
    if (!parts) return this.reportStringError(token.location, [], "Interpolated string literal contains malformed escape sequence");
    if (parts.rest) {
      // Luau's parser reads the rest of the string's tokens after it.
      this.tokens.splice(this.pos, 0, ...parts.rest);
      if (parts.ended) return new AstExprInterpString(parts.ended, parts.strings, parts.expressions);
      return parts.expressions[parts.expressions.length - 1]!;
    }
    if (parts.unclosed) return new AstExprError(token.location, parts.expressions, this.errors.length - 1);
    if (!token.node || !hasClosingBacktick(this.ctx.text, token.node)) {
      // The string ends at its line (I-1318). Luau's lexer reads one with no
      // interpolation as a string it could not finish, and one with an
      // interpolation as its last section, from the last `}`, unfinished.
      if (parts.expressions.length === 0) return this.reportStringError(token.location, [], "Malformed string; did you forget to finish it?");
      return this.reportStringError(parts.segment, parts.expressions, "Malformed interpolated string; did you forget to add a '`'?");
    }
    // A string with no interpolation is a plain string to Luau.
    if (parts.expressions.length === 0) return new AstExprConstantString(token.location, parts.strings[0]!, QuoteStyle.QuotedSimple);
    return new AstExprInterpString(token.location, parts.strings, parts.expressions);
  }
}

/**
 * A backtick string that goes on through another's sections (I-1427): the
 * strings and expressions read from them, and where it ends, unless it ends
 * at an error.
 */
interface ContinuedString {
  strings: string[];
  expressions: AstExpr[];
  end?: number;
}

/** Whether a backtick string's node ends in its closing backtick: its own end's, not a backtick inside it. */
function hasClosingBacktick(text: string, node: SyntaxNode): boolean {
  const end = node.getChild("LuauInterpolatedString_end");
  return !!end && /`/.test(text.slice(end.from, end.to));
}

/** Whether a string's token holds its closing quote or brackets. */
function isFinished(token: Token): boolean {
  const text = token.text;
  if (token.kind === "rawstring") {
    const open = /^\[=*\[/.exec(text)?.[0];
    return open !== undefined && text.length >= open.length * 2 && text.endsWith(open.replace(/\[/g, "]"));
  }
  if (text.length < 2 || text[text.length - 1] !== text[0]) return false;
  // The last quote closes the string unless an odd number of backslashes escapes it.
  let backslashes = 0;
  for (let i = text.length - 2; i > 0 && text[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 0;
}

/** A string node's interpolations and `{{f}}` shorthands, in order, under whatever nodes hold them. */
function stringPartNodes(node: SyntaxNode, interpolation: string, found: SyntaxNode[] = []): SyntaxNode[] {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === interpolation || CALL_SHORTHANDS.has(child.name)) found.push(child);
    else stringPartNodes(child, interpolation, found);
  }
  return found;
}

/** Whether a double-quoted string node holds an interpolation or a `{{f}}` shorthand, which Sparkdown reads. */
function hasInterpolation(node: SyntaxNode): boolean {
  return stringPartNodes(node, DOUBLE_QUOTED_INTERPOLATION).length > 0;
}

/** One of Sparkdown's own expressions, from its token. */
function sparkdownExpression(token: Token): AstExpr {
  const node = token.node!;
  const source: SparkdownSource = { name: node.name, from: node.from, to: node.to, node };
  switch (node.name) {
    case "LuauDivertTargetLiteral":
    case "LuauSparkdownExplicitDivertTargetLiteral":
      return new AstExprSparkdownDivertTarget(token.location, token.text.replace(/^->/, "").replace(/\s+/g, ""), source);
    case "LuauRegexLiteral": {
      const match = /^@\/([\s\S]*)\/([A-Za-z]*)$/.exec(token.text);
      return new AstExprSparkdownRegex(token.location, match?.[1] ?? token.text.slice(2), match?.[2] ?? "", source);
    }
    case "LuauConditionalAlternatorBlock":
    case "LuauConditionalAlternatorLineStart":
    case "LuauSparkdownExplicitConditionalAlternatorBlock":
      return new AstExprSparkdownConditionalAlternator(token.location, source);
    default:
      return new AstExprSparkdownSequentialAlternator(token.location, source);
  }
}

function typeList(types: AstType[], tailType: AstTypePack | undefined): AstTypeList {
  return tailType ? { types, tailType } : { types };
}

function isEnoughValues(values: AstExpr[], expected: number): boolean {
  const last = values[values.length - 1];
  if (last instanceof AstExprCall || last instanceof AstExprVarargs) return true;
  return values.length >= expected;
}

function findDescendant(node: SyntaxNode, name: string): SyntaxNode | undefined {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (isExplicitRuleName(child.name, name)) return child;
    const found = findDescendant(child, name);
    if (found) return found;
  }
  return undefined;
}

/** Every node of a kind under a node, in document order, outside parameters' annotations when `outsideAnnotations` says so. */
function findAll(node: SyntaxNode, name: string, outsideAnnotations = false, found: SyntaxNode[] = []): SyntaxNode[] {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (isExplicitRuleName(child.name, name)) found.push(child);
    else if (!outsideAnnotations || !isExplicitRuleName(child.name, "LuauTypeAnnotationOperation")) findAll(child, name, outsideAnnotations, found);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** Reads a unit's tokens as a block, recording the statements of the block at `recordDepth`. */
function readUnit(
  kind: LuauAstUnit["kind"],
  tokenizer: Tokenizer,
  nodes: TreeNodeRef[],
  recordDepth: number,
  start: Position,
  options: ReadOptions = {},
  eofAt?: number,
): LuauAstUnit {
  let index = tokenizer.index;
  let lines: number[] | undefined;
  // Return suffixes can own a complete comment after the last real token.
  // That written trivia still locates EOF, but later narrative lines do not.
  let retainedEnd: Position | undefined;
  for (const span of tokenizer.returnTriviaSpans) {
    const end = tokenizer.index.position(span.to);
    if (!retainedEnd || end.gt(retainedEnd)) retainedEnd = end;
  }
  if (options.unitLines) {
    // Every location the reading makes comes from a token's, from `start`,
    // or from the index (an interpolation's tokens, a `new`'s class name),
    // so counting those in the unit's lines counts the whole AST in them.
    lines = unitLinesOf(kind, tokenizer, start, eofAt === undefined ? undefined : tokenizer.index.position(eofAt).line);
    const unitIndex = new UnitLineIndex(index, lines);
    const toUnit = (location: Location) => new Location(unitIndex.unitPosition(location.begin), unitIndex.unitPosition(location.end));
    for (const token of tokenizer.tokens) token.location = toUnit(token.location);
    for (const comment of tokenizer.hotcomments) comment.location = toUnit(comment.location);
    if (retainedEnd) retainedEnd = unitIndex.unitPosition(retainedEnd);
    start = unitIndex.unitPosition(start);
    index = unitIndex;
  }
  const ctx: ReadContext = { text: tokenizer.text, index };
  const lastEnd = tokenizer.tokens.at(-1)?.location.end;
  const eof = eofAt !== undefined ? index.position(eofAt)
    : retainedEnd && (!lastEnd || retainedEnd.gt(lastEnd)) ? retainedEnd : undefined;
  const parser = new Parser(tokenizer.tokens, ctx, new Location(start, start), eof);
  for (const span of tokenizer.returnTriviaSpans) parser.recordSourceDependency(span.from, span.to);
  parser.recordDepth = recordDepth;
  parser.storyFunctions = kind === "flow" ? 2 : kind === "file" ? 0 : 1;
  let root: AstStatBlock;
  try {
    root = parser.parseChunk();
  } catch (caught) {
    // A limit ends the reading with no tree, as Luau's frontend substitutes an empty block for one.
    parser.errors.push(parser.fatalError(caught));
    parser.statements.length = 0;
    root = new AstStatBlock(new Location(start, start), []);
  }
  const tokens = tokenizer.tokens;
  const statements: LuauStatementSource[] = parser.statements.map(({ statement, first, end }) => {
    const seen = new Set<number>();
    for (let i = first; i < end; i++) {
      const source = tokens[i]?.source ?? -1;
      if (source >= 0) seen.add(source);
    }
    return { statement, nodes: [...seen].sort((a, b) => a - b).map((i) => nodes[i]!) };
  });
  const unit: LuauAstUnit = { kind, root, errors: parser.errors, hotcomments: tokenizer.hotcomments, statements, unreadStatements: parser.unreadStatements };
  if (lines) {
    unit.lines = lines;
    unit.key = unitKey(tokenizer, start, eof, parser.sourceDependencies, parser.errors);
  }
  return unit;
}

/**
 * The document lines a unit's tokens and `--!` comments stand on, with the
 * line its reading starts on. A `run` file's run unbroken from its first.
 */
function unitLinesOf(kind: LuauAstUnit["kind"], tokenizer: Tokenizer, start: Position, eofLine?: number): number[] {
  const found = new Set<number>([start.line]);
  if (eofLine !== undefined) found.add(eofLine);
  const cover = (location: Location) => {
    for (let line = location.begin.line; line <= location.end.line; line++) found.add(line);
  };
  // An island's EOF may stand on a line no token does, after a block comment
  // that runs over lines (#1907); an error there is placed on that line.
  for (const token of tokenizer.tokens) if (token.kind !== "break" || token.authoredEnd) cover(token.location);
  for (const comment of tokenizer.hotcomments) cover(comment.location);
  for (const location of tokenizer.returnSourceLines) cover(location);
  const lines = [...found].sort((a, b) => a - b);
  if (kind !== "file") return lines;
  const first = lines[0]!;
  return Array.from({ length: lines[lines.length - 1]! - first + 1 }, (_, i) => first + i);
}

/**
 * A unit's key (see `LuauAstUnit.key`): where its reading starts and, for a
 * `run` file, where its Luau ends (an error at the end is placed there),
 * each token's kind (and whether the grammar left it unread), unit location and text, with the shape of the tree
 * under a token read from a node (a string's interpolations, a Sparkdown
 * construct's parts), each `--!` comment, and bounded source reads outside
 * those tokens that affect the parsed unit.
 */
function unitKey(tokenizer: Tokenizer, start: Position, eof: Position | undefined, sourceDependencies: ReadonlySet<string>, errors: readonly LuauSyntaxError[]): string {
  const parts: string[] = [`start ${start}`, `eof ${eof ?? "-"}`];
  // An island's EOF is where an error at its end is placed (#1907), so the
  // place of such an error is part of the reading. Its place alone is not:
  // an edit to a comment after the island's last token moves it and changes
  // nothing the check reports.
  const islandEnds = new Set<string>();
  for (const token of tokenizer.tokens) if (token.kind === "break" && token.authoredEnd) islandEnds.add(`${token.location.begin}`);
  for (const error of errors) if (islandEnds.has(`${error.location.begin}`)) parts.push(`error at island end ${error.location.begin}`);
  for (const token of tokenizer.tokens) {
    // A break ends a statement wherever it stands and whatever it says.
    if (token.kind === "break") {
      parts.push("break");
      continue;
    }
    parts.push(`${token.kind}${token.unread ? " unread" : ""} ${token.location.begin}-${token.location.end} ${token.text}`);
    if (token.node) parts.push(nodeShape(token.node));
  }
  for (const comment of tokenizer.hotcomments) parts.push(`--! ${comment.header} ${comment.location.begin}-${comment.location.end} ${comment.content}`);
  for (const dependency of sourceDependencies) parts.push(`source ${dependency}`);
  return parts.join("\n");
}

/** The names and offsets, from the node's start, of the nodes under a node. */
function nodeShape(node: SyntaxNode): string {
  const out: string[] = [node.name];
  const walk = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      out.push(`${child.name}@${child.from - node.from}-${child.to - node.from}`);
      walk(child);
    }
  };
  walk(node);
  return out.join(" ");
}

function ref(node: SyntaxNode): TreeNodeRef {
  return { name: node.name, from: node.from, to: node.to };
}

/** A `...` parameter, with its annotation and the type that writes ("" for none). */
interface Vararg {
  dots: SyntaxNode;
  annotation: SyntaxNode | undefined;
  type: string;
}

/** How a header's parameter list is read: whole, as written, or, where the grammar ends it early, as the names the runtime binds. */
type ParameterReading =
  | { node: SyntaxNode; whole: true; vararg: Vararg | undefined }
  | { node: SyntaxNode; whole: false; names: SyntaxNode[]; vararg: Vararg | undefined };

/** A part of a flow's body: a statement node, or a branch's parameters, declared where the branch begins. */
type FlowPart = { node: SyntaxNode } | { branch: SyntaxNode; parameters: ParameterReading };

interface Flow {
  header: SyntaxNode;
  parameters: ParameterReading | undefined;
  body: FlowPart[];
  /** The `...` parameters of the flow and of the branches in it, in document order. */
  varargs: Vararg[];
  /** Whether the flow's own parameters end with `...`, which is then the first of `varargs`. */
  variadic: boolean;
  end?: SyntaxNode;
}

const COMMENT_NODE = /^Luau(?!(?:SparkdownExplicit)?TargetTypeCastAfterComment$)\w*Comment$/;

/**
 * Reads a `.sd` file's Luau as units: its prelude, with the Luau statements
 * outside any flow and every function definition, and a unit per scene (its
 * branches included) or branch outside any scene that holds Luau
 * statements, the units the type checker checks (`LuauDocumentChecker.ts`).
 */
export function readLuauUnits(tree: Tree, documentText: string, options: ReadOptions = {}): LuauAstUnits {
  const index = lineIndex(documentText);

  // Whether a header's parameter list is a Luau parameter list as written.
  const isWhole = (node: SyntaxNode): boolean => {
    const tokenizer = new Tokenizer(documentText, index);
    tokenizer.read(node);
    const parser = new Parser(tokenizer.tokens, { text: documentText, index }, new Location());
    try {
      return parser.readsAsParameterList();
    } catch (caught) {
      parser.fatalError(caught);
      return false;
    }
  };

  const varargOf = (parameters: SyntaxNode): Vararg | undefined => {
    const dots = findAll(parameters, "LuauVariadicParameter", true)[0];
    if (!dots) return undefined;
    let annotation = dots.nextSibling;
    while (annotation && (NEUTRAL.test(annotation.name) || COMMENT_NODE.test(annotation.name))) annotation = annotation.nextSibling;
    if (!annotation || !isExplicitRuleName(annotation.name, "LuauTypeAnnotationOperation")) return { dots, annotation: undefined, type: "" };
    return { dots, annotation, type: documentText.slice(annotation.from, annotation.to).replace(/^\s*:/, "").trim() };
  };

  const readParameters = (header: SyntaxNode): ParameterReading | undefined => {
    const node = findDescendant(header, "LuauFunctionParameters");
    if (!node) return undefined;
    if (isWhole(node)) return { node, whole: true, vararg: varargOf(node) };
    const dots = findDescendant(node, "LuauVariadicParameter");
    return { node, whole: false, names: findAll(node, "LuauFunctionParameter"), vararg: dots ? { dots, annotation: undefined, type: "" } : undefined };
  };

  const preludeNodes: SyntaxNode[] = [];
  const flows: Flow[] = [];
  const open: Flow[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (FLOW_HEADERS.has(node.name)) {
      const enclosing = open[open.length - 1];
      if (enclosing && node.name === "Branch") {
        const parameters = readParameters(node);
        if (parameters) {
          if (parameters.vararg) enclosing.varargs.push(parameters.vararg);
          enclosing.body.push({ branch: node, parameters });
        }
        open.push(enclosing);
      } else {
        const parameters = readParameters(node);
        const own = parameters?.vararg;
        const flow: Flow = { header: node, parameters, body: [], varargs: own ? [own] : [], variadic: own !== undefined };
        flows.push(flow);
        open.push(flow);
      }
    } else if (node.name === "LuauEndKeyword") {
      const closed = open.pop();
      if (closed && !open.includes(closed)) closed.end = node;
    } else if (node.name === "LuauFunctionDefinition") {
      preludeNodes.push(node);
    } else if (LUAU_STATEMENTS.has(node.name)) {
      const flow = open[open.length - 1];
      if (flow) flow.body.push({ node });
      else preludeNodes.push(node);
    }
  }

  // The prelude: its statements, as written.
  const preludeTokenizer = new Tokenizer(documentText, index);
  preludeNodes.forEach((node, i) => {
    preludeTokenizer.source = i;
    preludeTokenizer.read(node);
  });
  insertStoryBreaks(preludeTokenizer, tree, documentText.length);
  const preludeStart = preludeNodes[0] ? new Position(index.lineAt(preludeNodes[0].from), 0) : new Position(0, 0);
  const prelude = readUnit("prelude", preludeTokenizer, preludeNodes.map(ref), 1, preludeStart, options);

  const units: LuauAstUnit[] = [];
  for (const flow of flows) {
    const unit = readFlow(flow, tree, documentText, index, options);
    if (unit) units.push(unit);
  }
  return { prelude, flows: units };
}

/**
 * Not part of Luau: puts a `break` token, the first word of the story, where
 * the tree reads story between two of a `.sd` unit's tokens, read from the
 * document (a line of narrative between two statements, a `;` the grammar
 * reads as story after one). A statement does not run on past story, as the
 * runtime does not, so the token ends any statement before it, and an error
 * there is the statement's mistake as Sparkdown's own syntax reads it
 * (`SPARKDOWN_TOKENS`). A token a unit writes itself (a branch's `local`)
 * begins no gap, and a flow's header, whose tokens the unit reads from its
 * scene's and its branches' headers, has none.
 */
function insertStoryBreaks(tokenizer: Tokenizer, tree: Tree, end?: number): void {
  const tokens: Token[] = [];
  let previous: Token | undefined;
  // The prelude's last statement is followed by the rest of the document.
  const last = tokenizer.tokens[tokenizer.tokens.length - 1];
  const after: Token[] = end !== undefined && last ? [{ kind: "eof", text: "", from: end, to: end, location: tokenizer.location(end, end), source: last.source }] : [];
  for (const token of [...tokenizer.tokens, ...after]) {
    if (previous && previous.to > previous.from && previous.to < token.from && (previous.source >= 0 || token.source >= 0)) {
      const at = storyBetween(tree, tokenizer.text, previous.to, token.from);
      if (at !== undefined) {
        const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(tokenizer.text.slice(at, token.from))?.[0] ?? tokenizer.text[at]!;
        // Located where the Luau before it ends, as the end of a unit's Luau is.
        tokens.push({ kind: "break", text: word, from: at, to: at + word.length, location: tokenizer.location(previous.to, previous.to), source: -1, story: true });
      }
    }
    if (token.kind !== "eof") tokens.push(token);
    previous = token;
  }
  // A story declaration's or reassignment's Luau meets its end of input at
  // the end of its last line (#1907), after the tokens later on that line,
  // as a marked statement's does. Where the tree reads story first on that
  // line (`local a = 1 +;`, whose `;` is story), the story's break already
  // ends the statement, and what it is missing is Sparkdown's to report.
  const islands = tokenizer.storyIslandEnds;
  const merged: Token[] = [];
  let lastStoryBreak = -1;
  let next = 0;
  const endIsland = (island: (typeof islands)[number]) => {
    if (island.continued) return;
    if (lastStoryBreak >= island.from) {
      // Two islands that end together share the one EOF, which keeps a
      // story loop header's mark (`local a = 0 while true`).
      const shared = merged[merged.length - 1];
      if (island.loop && shared?.authoredEnd && shared.from === island.end) shared.loopHeaderEnd = true;
      return;
    }
    merged.push({ kind: "break", text: "", from: island.end, to: island.end, location: tokenizer.location(island.end, island.end), source: merged[merged.length - 1]?.source ?? island.source, story: true, authoredEnd: true, ...(island.loop ? { loopHeaderEnd: true as const } : {}) });
    lastStoryBreak = island.end;
  };
  for (const token of tokens) {
    while (next < islands.length && token.from >= islands[next]!.end) {
      const island = islands[next++]!;
      // A marked statement later on the island's line ends its Luau there
      // already, with its own EOF.
      if (token.authoredEnd && token.from === island.end) continue;
      endIsland(island);
    }
    merged.push(token);
    if (token.kind === "break" && token.story) lastStoryBreak = token.from;
  }
  while (next < islands.length) endIsland(islands[next++]!);
  tokenizer.tokens.length = 0;
  appendAll(tokenizer.tokens, merged);
}

/** Where the first text the tree reads as story begins between two offsets, if any does. */
function storyBetween(tree: Tree, text: string, from: number, to: number): number | undefined {
  for (let at = from; at < to; ) {
    if (/\s/.test(text[at]!)) {
      at++;
      continue;
    }
    let node: SyntaxNode | null = tree.resolveInner(at, 1);
    while (node && isNeutral(node)) node = node.parent;
    if (!node || !node.name.startsWith("Luau")) return at;
    at = Math.max(at + 1, node.to);
  }
  return undefined;
}

/** Writes tokens for the names of a parameter list the grammar ended early: each typed `any`, as the runtime binds them. */
function writeAnyParameters(tokenizer: Tokenizer, names: SyntaxNode[]): void {
  names.forEach((name, i) => {
    if (i > 0) tokenizer.synthetic("symbol", ",", name.from);
    tokenizer.push("name", name.from, name.to);
    tokenizer.synthetic("symbol", ":", name.to);
    tokenizer.synthetic("name", "any", name.to);
  });
}

/**
 * A flow's unit: a local function `__flow` whose parameters are the flow's
 * and whose body is the flow's Luau, with each branch's parameters declared
 * as locals where the branch begins, holding the values its caller passes.
 * A flow whose statements are all Sparkdown's own has no unit.
 */
function readFlow(flow: Flow, tree: Tree, documentText: string, index: LineIndex, options: ReadOptions): LuauAstUnit | undefined {
  const tokenizer = new Tokenizer(documentText, index);
  const nodes: TreeNodeRef[] = [];
  const headerText = documentText.slice(flow.header.from, flow.header.to);
  const headerAt = flow.header.from + headerText.length - headerText.trimStart().length;

  tokenizer.synthetic("keyword", "local", headerAt);
  tokenizer.synthetic("keyword", "function", headerAt);
  tokenizer.synthetic("name", "__flow", headerAt);

  // At runtime `...` reads the arguments of whichever of the flow and its
  // branches took a `...` last. Here they are one function, whose `...` has
  // the type they all give theirs, or no type where they differ.
  const agreed = new Set(flow.varargs.map((vararg) => vararg.type)).size === 1;
  const parameters = flow.parameters;
  const own = flow.variadic ? flow.varargs[0] : undefined;
  const branchVararg = flow.variadic ? undefined : flow.varargs[0];
  const named = parameters && (parameters.whole ? findAll(parameters.node, "LuauFunctionParameter", true).length > 0 : parameters.names.length > 0);

  if (parameters?.whole) {
    const list = new Tokenizer(documentText, index);
    list.read(parameters.node);
    let tokens = list.tokens;
    if (own?.annotation && !agreed) {
      const annotation = own.annotation;
      tokens = tokens.filter((t) => t.from < annotation.from || t.from >= annotation.to);
    }
    if (branchVararg) tokens = tokens.slice(0, -1);
    tokenizer.tokens.push(...tokens);
  } else if (parameters) {
    tokenizer.synthetic("symbol", "(", parameters.node.from);
    writeAnyParameters(tokenizer, parameters.names);
    if (flow.variadic) {
      if (parameters.names.length) tokenizer.synthetic("symbol", ",", parameters.node.to);
      tokenizer.synthetic("symbol", "...", parameters.node.to);
    }
    if (!branchVararg) tokenizer.synthetic("symbol", ")", parameters.node.to);
  } else {
    tokenizer.synthetic("symbol", "(", headerAt);
    if (!branchVararg) tokenizer.synthetic("symbol", ")", headerAt);
  }
  // A branch's `...` where the flow has none, as the function's last parameter.
  if (branchVararg) {
    if (named) tokenizer.synthetic("symbol", ",", branchVararg.dots.from);
    tokenizer.read(branchVararg.dots);
    if (branchVararg.annotation && agreed) tokenizer.read(branchVararg.annotation);
    tokenizer.synthetic("symbol", ")", branchVararg.dots.to);
  }

  let statements = 0;
  for (const part of flow.body) {
    if ("node" in part) {
      tokenizer.source = nodes.length;
      nodes.push(ref(part.node));
      const before = tokenizer.tokens.length;
      tokenizer.read(part.node);
      if (tokenizer.tokens.length > before) statements++;
      tokenizer.source = -1;
    } else {
      tokenizer.source = nodes.length;
      nodes.push(ref(part.branch));
      const before = tokenizer.tokens.length;
      declareBranchParameters(tokenizer, part.branch, part.parameters, documentText);
      // A branch's parameters are Luau the flow declares, even in a flow with no other Luau.
      if (tokenizer.tokens.length > before) statements++;
      tokenizer.source = -1;
    }
  }
  // A flow whose statements are all Sparkdown's own has no Luau to check.
  if (statements === 0) return undefined;

  if (flow.end) {
    const [from, to] = trimmedRange(documentText, flow.end.from, flow.end.to);
    tokenizer.push("keyword", from, to);
    // The scene's closer is Sparkdown's syntax. Keep it for parsing the
    // synthetic function, but leave missing-value errors here to Sparkdown.
    tokenizer.tokens[tokenizer.tokens.length - 1]!.story = true;
  } else {
    const last = tokenizer.tokens[tokenizer.tokens.length - 1]!;
    tokenizer.synthetic("keyword", "end", last.to);
  }
  insertStoryBreaks(tokenizer, tree);
  const start = new Position(index.lineAt(flow.header.from), 0);
  const unit = readUnit("flow", tokenizer, nodes, 2, start, options);
  unit.header = ref(flow.header);
  return unit;
}

/**
 * A branch's named parameters, as a `local` where the branch begins, holding
 * the values its caller passes: `branch inner(k: number, m)` reads as
 * `local k: number, m = <argument>, <argument>`. Its `...` is the flow's.
 */
function declareBranchParameters(tokenizer: Tokenizer, header: SyntaxNode, parameters: ParameterReading, documentText: string): void {
  const text = documentText.slice(header.from, header.to);
  const start = header.from + text.length - text.trimStart().length;
  if (!parameters.whole) {
    if (!parameters.names.length) return;
    tokenizer.synthetic("keyword", "local", start);
    writeAnyParameters(tokenizer, parameters.names);
    return;
  }
  // The named parameters end at the comma before the `...`.
  let end = parameters.node.to - 1;
  if (parameters.vararg) {
    let separator = parameters.vararg.dots.prevSibling;
    while (separator && separator.name !== "LuauCommaSeparator") separator = separator.prevSibling;
    end = separator ? separator.from : parameters.vararg.dots.from;
  }
  const named = findAll(parameters.node, "LuauFunctionParameter", true).filter((name) => name.from < end);
  if (!named.length) return;
  const list = new Tokenizer(documentText, tokenizer.index);
  list.read(parameters.node);
  tokenizer.synthetic("keyword", "local", start);
  tokenizer.tokens.push(...list.tokens.filter((t) => t.from > parameters.node.from && t.to <= end).map((t) => ({ ...t, source: tokenizer.source })));
  tokenizer.synthetic("symbol", "=", end);
  named.forEach((name, i) => {
    if (i > 0) tokenizer.synthetic("symbol", ",", name.to);
    tokenizer.tokens.push({ kind: "flowArgument", text: "", from: name.from, to: name.to, location: tokenizer.location(name.from, name.to), source: tokenizer.source });
  });
}

/**
 * Reads a `run` file's Luau from the document the compiler loads it as (the
 * file's text wrapped in a function, `function W()` on the document's second
 * line and its `end` on the last): the wrapper's body, as one unit.
 */
export function readLuauRunFile(tree: Tree, documentText: string, options: ReadOptions = {}): LuauAstUnit | undefined {
  const index = lineIndex(documentText);
  let wrapper: SyntaxNode | null = null;
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name === "LuauFunctionDefinition") {
      wrapper = node;
      break;
    }
  }
  const body = wrapper?.getChild("LuauFunctionDefinition_content")?.getChild("LuauFunctionBody");
  if (!wrapper || !body) return undefined;
  const tokenizer = new Tokenizer(documentText, index);
  tokenizer.luauThroughout = true;
  const nodes: TreeNodeRef[] = [];
  readBodyStatements(tokenizer, nodes, body);
  // The file ends where its wrapper's last line begins, as Luau reads the
  // file's own end.
  const fileEnd = documentText.endsWith(RUN_WRAPPER_SUFFIX) ? documentText.length - RUN_WRAPPER_SUFFIX.length : undefined;
  // Where the grammar ends the wrapper before the file does (at an `end` of
  // the file's own, or at text it cannot read), the rest of the file is
  // still the file's Luau: the `end` it took, and the nodes after it.
  if (fileEnd !== undefined && wrapper.to < fileEnd) {
    tokenizer.lex(body.to, wrapper.to);
    let at = wrapper.to;
    for (let node = wrapper.nextSibling; node && node.from < fileEnd; node = node.nextSibling) {
      if (node.from > at) tokenizer.lex(at, node.from);
      tokenizer.source = nodes.length;
      nodes.push(ref(node));
      if (node.to <= fileEnd && (node.name.startsWith("Luau") || isNeutral(node))) tokenizer.read(node);
      else tokenizer.lex(node.from, Math.min(node.to, fileEnd));
      tokenizer.source = -1;
      at = Math.max(at, node.to);
    }
    if (fileEnd > at) tokenizer.lex(at, fileEnd);
  }
  if (fileEnd !== undefined) {
    const inFile = tokenizer.tokens.filter((token) => token.from < fileEnd);
    tokenizer.tokens.length = 0;
    appendAll(tokenizer.tokens, inFile);
  }
  return readUnit("file", tokenizer, nodes, 1, new Position(index.lineAt(body.from) + 1, 0), options, fileEnd);
}

/**
 * Reads a `.luau` document's Luau from its own tree, which the grammar's
 * `.luau` root reads as a function's body from the first line (GRAMMAR.md
 * §1.5): the document's statements, as one unit that ends where the
 * document does.
 */
export function readLuauFile(tree: Tree, documentText: string, options: ReadOptions = {}): LuauAstUnit {
  const tokenizer = new Tokenizer(documentText, lineIndex(documentText));
  tokenizer.luauThroughout = true;
  const nodes: TreeNodeRef[] = [];
  readBodyStatements(tokenizer, nodes, tree.topNode);
  return readUnit("file", tokenizer, nodes, 1, new Position(0, 0), options, documentText.length);
}

/**
 * Reads a pure-Luau body's statements, which are its children under the
 * wrapper nodes the grammar puts around a rule's parts, recording each
 * statement's node, and lexes the text between them.
 */
function readBodyStatements(tokenizer: Tokenizer, nodes: TreeNodeRef[], parent: SyntaxNode): void {
  let at = parent.from;
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.from > at) tokenizer.lex(at, child.from);
    if (WRAPPER.test(child.name)) {
      readBodyStatements(tokenizer, nodes, child);
    } else {
      tokenizer.source = nodes.length;
      nodes.push(ref(child));
      tokenizer.read(child);
      tokenizer.source = -1;
    }
    at = Math.max(at, child.to);
  }
  if (parent.to > at) tokenizer.lex(at, parent.to);
}

// The nodes the grammar puts around a rule's begin, content and end, and their captures.
const WRAPPER = /_(begin|content|end)(_c\d+)*$/;

/**
 * Reads the Luau statements some sibling nodes hold as one block, for the
 * lowerers, which lower a document a top-level node at a time and a block's
 * statements beside the Sparkdown lines among them: a top-level statement
 * node, or the children of a choice's body or an alternator's arm. Each
 * statement of the block is recorded with the nodes it was read from, so a
 * lowerer that reaches a node takes the statements that begin in it and skips
 * the nodes they continue into. A name the block does not declare is read as
 * a global.
 *
 * `afterType` reads the block as the rest of a type: a function body whose
 * first lines continue its return type as union or intersection members
 * (`function f(): A` then `& B`), which the block's own nodes do not hold.
 * The reading begins with a type alias of its own (`type _ = any`), so Luau
 * reads those lines as members of it, and a statement after one on its line
 * (`& {}a = 9`) begins in that line's node; the alias is no statement of the
 * block.
 */
export function readLuauBlock(nodes: readonly SyntaxNode[], documentText: string, afterType = false): LuauAstUnit {
  const index = lineIndex(documentText);
  const tokenizer = new Tokenizer(documentText, index);
  const refs: TreeNodeRef[] = [];
  const at = nodes[0]?.from;
  if (afterType && at !== undefined) {
    tokenizer.synthetic("name", "type", at);
    tokenizer.synthetic("name", "_", at);
    tokenizer.synthetic("symbol", "=", at);
    tokenizer.synthetic("name", "any", at);
  }
  for (const node of nodes) {
    tokenizer.source = refs.length;
    refs.push(ref(node));
    tokenizer.read(node);
  }
  tokenizer.source = -1;
  const first = tokenizer.tokens[0];
  const unit = readUnit("block", tokenizer, refs, 1, first ? first.location.begin : new Position(0, 0));
  if (!afterType || at === undefined) return unit;
  return { ...unit, statements: unit.statements.slice(1) };
}

/**
 * Diagnostic recovery for a tree-selected statement candidate. The grammar
 * can end an invalid statement before the token that explains its error
 * (`Hi, Bob` before `end`), or classify part of it as narrative. Read the
 * bounded span selected by the diagnostic's existing read-ahead policy:
 * keep enclosed Luau nodes, descend clipped nodes, and lex only text the
 * tree did not provide as Luau. This AST is used for error ownership only;
 * document checking and lowering still read their normal tree units.
 */
export function readLuauStatementCandidate(
  node: SyntaxNode,
  documentText: string,
  from: number,
  to: number,
): Pick<LuauAstUnit, "root" | "errors"> {
  const index = lineIndex(documentText);
  const tokenizer = new Tokenizer(documentText, index);
  tokenizer.luauThroughout = true;
  // Start at the selected statement's path, not the first sibling in the
  // document. Retain the path through clipped wrappers so even a large
  // function body reads only the siblings covered by this candidate.
  const firstChildren = new Map<SyntaxNode, SyntaxNode>();
  let root = node;
  while (root.from > from || root.to < to) {
    const parent = root.parent;
    if (!parent) break;
    firstChildren.set(parent, root);
    root = parent;
  }
  if (from < node.from || from > node.to || to < from || to > Math.min(root.to, documentText.length)) {
    throw new Error("Statement diagnostic span lies outside its document tree");
  }
  const read = (current: SyntaxNode): void => {
    if (current.to <= from || current.from >= to) return;
    // The tree's top node, which a span to the document's end encloses, is
    // descended as a clipped node is: it is no Luau node of its own.
    if (current.parent && current.from >= from && current.to <= to && !WRAPPER.test(current.name)) {
      if (current.name.startsWith("Luau") && !current.type.isError) tokenizer.read(current);
      else tokenizer.lex(current.from, current.to);
      return;
    }
    let at = Math.max(from, current.from);
    for (let child = firstChildren.get(current) ?? current.firstChild; child; child = child.nextSibling) {
      if (child.from >= to) break;
      if (child.to <= from) continue;
      if (child.from > at) tokenizer.lex(at, Math.min(to, child.from));
      read(child);
      at = Math.max(at, Math.min(to, child.to));
    }
    if (at < Math.min(to, current.to)) tokenizer.lex(at, Math.min(to, current.to));
  };
  read(root);
  const result = readUnit("block", tokenizer, [], 1, index.position(from), {}, to);
  return { root: result.root, errors: result.errors };
}

/**
 * Reads the one Luau expression some nodes hold (an interpolation's,
 * a choice's condition, a struct's value), with every name read as a global.
 */
export function readLuauExpression(nodes: SyntaxNode | readonly SyntaxNode[], documentText: string): { expr: AstExpr; errors: LuauSyntaxError[] } {
  const index = lineIndex(documentText);
  const tokenizer = new Tokenizer(documentText, index);
  for (const node of Array.isArray(nodes) ? nodes : [nodes as SyntaxNode]) tokenizer.read(node);
  return parseLoneTokens(tokenizer, documentText, index);
}

// Missing-value diagnostics need Luau's reading beyond the node the
// highlighting grammar ended. Share the converter's lexer and parser rather
// than maintaining a second comment scanner or expression-start table.
//
// The lookups read the tokens a lex of the whole document gives, but lex
// only as far as a lookup has needed, and an edit keeps the tokens it cannot
// have changed and lexes on from the last of them. A lookup after an edit so
// costs the distance from the edit to the token it looks for, not the
// document's length, which every keystroke paid for when an edit lexed the
// whole document again (#1724).

const NO_LOCATION = new Location();

/**
 * Lexes the tokens the lookups read, without their positions: the lookups
 * need none, and a document's line index would cost a pass over all of it.
 * `readLuauExpressionAfter` places the tokens it parses.
 */
class AheadTokenizer extends Tokenizer {
  /**
   * Lexes `text` on after `tokens`, which it takes over, inside the
   * interpolations the last of them leaves open (`Token.openInterpolations`).
   */
  constructor(text: string, tokens: Token[]) {
    super(text, new LineIndex("", [0]));
    (this as { tokens: Token[] }).tokens = tokens;
    this.interpBraces = [...(tokens[tokens.length - 1]?.openInterpolations ?? [])];
  }

  override location(): Location {
    return NO_LOCATION;
  }

  /** Reads as `Tokenizer.lexOne` does, recording on the token it pushes the interpolations open after it. */
  override lexOne(i: number, to: number): number {
    const count = this.tokens.length;
    const end = super.lexOne(i, to);
    const last = this.tokens[this.tokens.length - 1];
    if (last && this.tokens.length > count && this.interpBraces.length > 0) last.openInterpolations = [...this.interpBraces];
    return end;
  }
}

/** The document's tokens before `at`, which is where the lex goes on. */
interface Ahead {
  readonly text: string;
  readonly tokenizer: AheadTokenizer;
  at: number;
  /**
   * Offsets, ascending, that the lex passed between two tokens: where an
   * edit's lex can go on from when comments or whitespace, which leave no
   * token, stand between the last token it keeps and the edit.
   */
  readonly resumes: number[];
}

// How far the lex goes past its last token or resume offset, reading only
// comments and whitespace, before it records another resume offset.
const RESUME_GAP = 64;

let lastAhead: Ahead | undefined;

// How far past a token's end the lexer can have read to read it: the
// character after it, or the 64 characters from its start that a long
// bracket's opening is looked for in (`Tokenizer.lexOne`).
const LEX_LOOKAHEAD = 64;

/** The lookups' tokens of `documentText`, carried over from the last document's where an edit cannot have changed them. */
function aheadOf(documentText: string): Ahead {
  const last = lastAhead;
  if (last?.text === documentText) return last;
  let kept: Token[] = [];
  let resumes: number[] = [];
  const edit = editTo(aheadEdit, documentText);
  aheadEdit = undefined;
  if (last && edit) {
    // A token whose reading looked only at text before the first character
    // the edit changed is the whole document's lex's token in both
    // documents, and so is every token before it; so is a resume offset
    // the lex reached having read only such text. A token clipped at the
    // document's end ends there, past the change.
    const limit = edit.from - LEX_LOOKAHEAD - 1;
    // The last document's tokens and offsets are not read again: keep them in place.
    kept = last.tokenizer.tokens;
    kept.length = countUpTo(kept, (token) => token.to, limit);
    resumes = last.resumes;
    resumes.length = countUpTo(resumes, (offset) => offset, limit);
  }
  const at = Math.max(kept[kept.length - 1]?.to ?? 0, resumes[resumes.length - 1] ?? 0);
  const ahead: Ahead = { text: documentText, tokenizer: new AheadTokenizer(documentText, kept), at, resumes };
  lastAhead = ahead;
  return ahead;
}

/** How many of `items`, ascending by `offset`, have an offset no greater than `limit`. */
function countUpTo<T>(items: readonly T[], offset: (item: T) => number, limit: number): number {
  let count = 0;
  let hi = items.length;
  while (count < hi) {
    const mid = (count + hi) >> 1;
    if (offset(items[mid]!) <= limit) count = mid + 1;
    else hi = mid;
  }
  return count;
}

/** The tokens of `documentText`, lexed at least until one begins at or after `target` or the document ends. */
function lexAhead(documentText: string, target: number): Token[] {
  const ahead = aheadOf(documentText);
  const tokens = ahead.tokenizer.tokens;
  const resumes = ahead.resumes;
  const end = documentText.length;
  while (ahead.at < end) {
    const last = tokens[tokens.length - 1];
    if (last && last.from >= target) break;
    const count = tokens.length;
    ahead.at = ahead.tokenizer.lexOne(ahead.at, end);
    // Past only comments and whitespace since the last token or offset
    // recorded: record where the lex is, which is between two tokens.
    if (tokens.length === count && ahead.at < end && ahead.at - Math.max(last?.to ?? 0, resumes[resumes.length - 1] ?? 0) >= RESUME_GAP) {
      resumes.push(ahead.at);
    }
  }
  return tokens;
}

/** The index of the first of `tokens` that begins at or after `from`. */
function firstFrom(tokens: readonly Token[], from: number): number {
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid]!.from < from) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The tokens a lex of the whole document gives, from start to end, with no
 * cache: what the lookups' tokens must agree with, for their tests.
 */
export function lexLuauDocumentForTesting(documentText: string): readonly { kind: string; text: string; from: number; to: number }[] {
  const tokenizer = new AheadTokenizer(documentText, []);
  tokenizer.lex(0, documentText.length);
  return tokenizer.tokens;
}

/** The next token as Luau reads it, past whitespace and comments. */
export function nextLuauToken(from: number, documentText: string, to = documentText.length): { text: string; from: number } | null {
  const tokens = lexAhead(documentText, from);
  const token = tokens[firstFrom(tokens, from)];
  if (!token || token.from >= to || token.kind === "eof") return null;
  // Diagnostics historically quote a punctuation token's first character.
  return { text: token.kind === "name" || token.kind === "keyword" ? token.text : token.text[0]!, from: token.from };
}

/** Whether Luau's lexer reads the token that begins at `from` as a name, rather than a keyword or a symbol. */
export function isLuauNameAt(from: number, documentText: string): boolean {
  const tokens = lexAhead(documentText, from);
  const token = tokens[firstFrom(tokens, from)];
  return token?.from === from && token.kind === "name";
}

/** Read the expression after an operator the grammar ends without a value. */
export function readLuauExpressionAfter(from: number, documentText: string, to?: number): { expr: AstExpr; errors: LuauSyntaxError[] } {
  const index = lineIndex(documentText);
  const tokenizer = new Tokenizer(documentText, index);
  const tokens = lexAhead(documentText, Math.max(from, to ?? Infinity));
  const start = firstFrom(tokens, from);
  // The lookups' tokens hold no positions; place the ones parsed.
  const place = (token: Token): Token => ({ ...token, location: tokenizer.location(token.from, token.to) });
  if (to === undefined) {
    for (let at = start; at < tokens.length; at++) tokenizer.tokens.push(place(tokens[at]!));
  } else {
    // Keep the full-document lexer cache reusable across authored islands.
    // Clip only their token window; an opaque token crossing the boundary
    // must be read with the same bound rather than borrowing its closer.
    for (let at = start; at < tokens.length && tokens[at]!.from < to; at++) {
      const token = tokens[at]!;
      if (token.to <= to) tokenizer.tokens.push(place(token));
      else {
        // Inside the interpolations the token before it leaves open, as the whole document's lex reads it.
        tokenizer.lex(token.from, to, tokens[at - 1]?.openInterpolations);
        break;
      }
    }
    tokenizer.synthetic("eof", "", to);
  }
  if (tokenizer.tokens.length === 0) tokenizer.synthetic("eof", "", documentText.length);
  return parseLoneTokens(tokenizer, documentText, index);
}

/** Convert an AST position to its document offset. */
export function luauPositionOffset(position: Position, documentText: string): number {
  return (lineIndex(documentText).starts[position.line] ?? documentText.length) + position.column;
}

/**
 * Not part of Luau: reads a method in a `define` (`greet() ... end`, a
 * `LuauMethodDefinition`) as the function value it stands for, the
 * `function` Sparkdown leaves implicit written before its parameters and
 * its name left out. The lints read it (`collectLuauLints.ts`), and so does
 * the define lowerer, for the body's errors (`lowerDefineMethod`).
 */
export function readLuauMethod(node: SyntaxNode, documentText: string): ReturnType<typeof parseLoneTokens> {
  const index = lineIndex(documentText);
  const tokenizer = new Tokenizer(documentText, index);
  const name = findDescendant(node, "LuauFunctionName");
  const parameters = findDescendant(node, "LuauFunctionParameters");
  tokenizer.synthetic("keyword", "function", parameters?.from ?? name?.to ?? node.from, true);
  // Every node but the name, which a function value does not have.
  const readWithoutName = (around: SyntaxNode): void =>
    tokenizer.readChildren(around, (child) => {
      if (!name || child.to <= name.from || child.from >= name.to) return false;
      if (child.from !== name.from || child.to !== name.to) readWithoutName(child);
      return true;
    });
  readWithoutName(node);
  return parseLoneTokens(tokenizer, documentText, index);
}

/**
 * Not part of Luau: reads Luau statements that no unit holds (in a Sparkle
 * handler's `{ ... }`, in a layout) as the body of a function value written
 * around them, `function()` before and `end` after. The lints read them
 * (`collectLuauLints.ts`), and so do a Sparkle closure's lowerer, for the
 * body's errors in a function's context (`lowerSparkleBody.ts`), and the
 * validator, for their owner (`ValidationAnnotator.ts`).
 */
export function readLuauStatements(nodes: readonly SyntaxNode[], documentText: string): ReturnType<typeof parseLoneTokens> {
  const index = lineIndex(documentText);
  const tokenizer = new Tokenizer(documentText, index);
  const from = nodes[0]?.from ?? 0;
  tokenizer.synthetic("keyword", "function", from, true);
  tokenizer.synthetic("symbol", "(", from);
  tokenizer.synthetic("symbol", ")", from);
  for (const node of nodes) tokenizer.read(node);
  tokenizer.synthetic("keyword", "end", nodes[nodes.length - 1]?.to ?? from);
  return parseLoneTokens(tokenizer, documentText, index);
}

/** The one expression a tokenizer's tokens hold (`readLuauExpression`, `readLuauMethod`, `readLuauStatements`). */
function parseLoneTokens(
  tokenizer: Tokenizer,
  documentText: string,
  index: LineIndex,
): { expr: AstExpr; errors: LuauSyntaxError[]; unreadStatements: readonly { from: number; to: number }[] } {
  const first = tokenizer.tokens[0];
  const start = first ? first.location : new Location();
  const parser = new Parser(tokenizer.tokens, { text: documentText, index }, new Location(start.begin, start.begin));
  let expr: AstExpr;
  try {
    expr = parser.parseLoneExpression();
  } catch (caught) {
    const error = parser.fatalError(caught);
    parser.errors.push(error);
    expr = new AstExprError(error.location, [], parser.errors.length - 1);
  }
  return { expr, errors: parser.errors, unreadStatements: parser.unreadStatements };
}
