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
// The tree is read, never the text reparsed: a token is a leaf of the tree (a
// leaf whose text holds several tokens, such as ` . Button`, is split at
// their boundaries), a string, number or comment is the node the tree made of
// it, and text the tree marks as narrative or as Sparkdown's own is never a
// Luau token. Sparkdown's own constructs inside Luau become the
// `AstExprSparkdown*` and `AstStatSparkdown*` classes of `Ast.ts`.
//
// The units are the type checker's (`LuauDocumentChecker.ts`): a `.sd` file's
// prelude and one unit per scene, or branch outside any scene, each read as
// the body of a function whose parameters are the flow's; and a `run` file,
// read from the document the compiler wraps it in. `readLuauExpression` reads
// the one expression a Sparkdown context holds (an interpolation, a choice's
// condition, a struct's value), and `readLuauStatements` the statements of
// some nodes, for the lowerers. The port of Luau's parser in
// `DefinitionParser.ts` is not used here: it reads definition files, and the
// tests use it to check that this module reads every Luau fixture as Luau
// reads it.

import type { SyntaxNode, Tree } from "@lezer/common";
import {
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
import { FLOW_HEADERS, LUAU_SCOPE_MODIFIERS, LUAU_STATEMENTS, NEUTRAL, SPARKDOWN_EXPRESSIONS, SPARKDOWN_ONLY } from "./LuauUnitNodes";
import type { HotComment } from "./Module";

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** A syntax error the reading found, located in the document. */
export interface LuauSyntaxError {
  location: Location;
  message: string;
}

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
  /** A `run` file, a `.sd` file's prelude, or one of its flows. */
  kind: "file" | "prelude" | "flow";
  /**
   * The unit's statements. A flow's block holds one statement, the local
   * function `__flow` whose parameters are the flow's and whose body is the
   * flow's Luau, as the type checker reads a flow.
   */
  root: AstStatBlock;
  errors: LuauSyntaxError[];
  /** The `--!` comments, with `header` set on those before the unit's first token. */
  hotcomments: HotComment[];
  /** The statements of the unit's own block (a flow's function body), each with the tree nodes it was read from. */
  statements: LuauStatementSource[];
  /** A flow's header: its scene, or its branch outside any scene. */
  header?: TreeNodeRef;
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
  readonly starts: number[] = [0];

  constructor(readonly text: string) {
    for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) this.starts.push(i + 1);
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

// The index of the last document read, since the lowerers read many expressions of one document.
let lastIndex: LineIndex | undefined;

function lineIndex(text: string): LineIndex {
  if (lastIndex?.text !== text) lastIndex = new LineIndex(text);
  return lastIndex;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type TokenKind =
  | "eof"
  | "name"
  | "keyword"
  | "symbol"
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
  | "unknown";

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
// A comment, or a part of one the tree reads apart from it (the `]]` that
// closes a block comment after a value or type); a cast after a comment is not one.
const COMMENT = /^Luau(?!TargetTypeCastAfterComment$)\w*Comment(Close|Content|Mark|Tags)?$/;
const LINE_COMMENT = /^Luau(Doc)?LineComment$/;

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

/** Reads a unit's tokens from the tree. */
class Tokenizer {
  readonly tokens: Token[] = [];
  readonly hotcomments: HotComment[] = [];
  /** The index of the top-level node being read. */
  source = -1;

  constructor(
    readonly text: string,
    readonly index: LineIndex,
  ) {}

  location(from: number, to: number): Location {
    return new Location(this.index.position(from), this.index.position(to));
  }

  push(kind: TokenKind, from: number, to: number, node?: SyntaxNode): void {
    const token: Token = { kind, text: this.text.slice(from, to), from, to, location: this.location(from, to), source: this.source };
    if (node) token.node = node;
    this.tokens.push(token);
  }

  /** Writes a token the unit needs that the text does not hold, at an offset, as part of the node being read. */
  synthetic(kind: TokenKind, text: string, at: number): void {
    this.tokens.push({ kind, text, from: at, to: at, location: this.location(at, at), source: this.source });
  }

  /** Reads the tokens of a node and everything under it. */
  read(node: SyntaxNode): void {
    const name = node.name;
    if (COMMENT.test(name)) {
      this.comment(node);
      return;
    }
    const [from, to] = trimmedRange(this.text, node.from, node.to);
    if (SPARKDOWN_EXPRESSIONS.has(name)) {
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
    if (SPARKDOWN_ONLY.has(name)) return;
    if (name === "LuauScopeModifier") {
      const modifier = this.text.slice(from, to);
      if (LUAU_SCOPE_MODIFIERS.has(modifier)) this.lex(from, to);
      else if (modifier === "store") this.push("store", from, to);
      return;
    }
    if (!name.startsWith("Luau") && !NEUTRAL.test(name)) return;
    if (QUOTED_STRING.test(name)) {
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
    if (NUMBER.test(name)) {
      if (to > from) this.push("number", from, to, node);
      return;
    }
    if (name === "LuauFunctionDefinition") {
      this.readFunctionDefinition(node);
      return;
    }
    this.readChildren(node);
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
    if (!LINE_COMMENT.test(node.name)) return;
    const [from, to] = trimmedRange(this.text, node.from, node.to);
    const text = this.text.slice(from, to);
    if (!text.startsWith("--!")) return;
    this.hotcomments.push({ header: this.tokens.length === 0, location: this.location(from, to), content: text.slice(3).trimEnd() });
  }

  /** Splits text into Luau tokens: the text of a leaf, or text between a node's children. */
  lex(from: number, to: number): void {
    const text = this.text;
    let i = from;
    while (i < to) {
      const ch = text[i]!;
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (text.startsWith("--", i)) {
        i = skipComment(text, i, to);
        continue;
      }
      const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i, to));
      if (name) {
        this.push(KEYWORDS.has(name[0]) ? "keyword" : "name", i, i + name[0].length);
        i += name[0].length;
        continue;
      }
      const number = /^(?:0[xXbB][0-9A-Za-z_]*|(?:[0-9][0-9_]*\.?[0-9_]*|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9_]*)?[0-9A-Za-z_]*)/.exec(text.slice(i, to));
      if (number && /^\.?[0-9]/.test(text.slice(i, i + 2))) {
        this.push("number", i, i + number[0].length);
        i += number[0].length;
        continue;
      }
      const symbol = SYMBOLS.find((s) => text.startsWith(s, i) && i + s.length <= to);
      if (symbol) {
        this.push("symbol", i, i + symbol.length);
        i += symbol.length;
        continue;
      }
      const code = text.codePointAt(i)!;
      const length = code > 0xffff ? 2 : 1;
      this.push("unknown", i, i + length);
      i += length;
    }
  }
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
  switch (token.kind) {
    case "eof":
      return "<eof>";
    case "string":
    case "rawstring":
      return `"${token.text.replace(/^\[=*\[|^["']|["']$|\]=*\]$/g, "")}"`;
    case "interp":
      return token.text;
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

const BINARY_OPS: Record<string, BinaryOp> = {
  "+": BinaryOp.Add,
  "-": BinaryOp.Sub,
  "*": BinaryOp.Mul,
  "/": BinaryOp.Div,
  "//": BinaryOp.FloorDiv,
  "%": BinaryOp.Mod,
  "^": BinaryOp.Pow,
  "..": BinaryOp.Concat,
  "~=": BinaryOp.CompareNe,
  "==": BinaryOp.CompareEq,
  "<": BinaryOp.CompareLt,
  "<=": BinaryOp.CompareLe,
  ">": BinaryOp.CompareGt,
  ">=": BinaryOp.CompareGe,
};

const COMPOUND_OPS: Record<string, BinaryOp> = {
  "+=": BinaryOp.Add,
  "-=": BinaryOp.Sub,
  "*=": BinaryOp.Mul,
  "/=": BinaryOp.Div,
  "//=": BinaryOp.FloorDiv,
  "%=": BinaryOp.Mod,
  "^=": BinaryOp.Pow,
  "..=": BinaryOp.Concat,
};

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
}

/** What a parser reads besides its tokens: the document, for the text of Sparkdown's constructs and of strings. */
interface ReadContext {
  text: string;
  index: LineIndex;
}

/** The name Luau's parser gives a name it expected and did not find. */
const ERROR_NAME = "%error-id%";

/**
 * Luau's recursive descent over the tree's tokens. A Luau construct is read
 * as `Parser.cpp` reads it, with its node's location spanning the same
 * tokens; a syntax error is reported with Luau's message and recovered from
 * more simply than Luau does, since no consumer reads the recovery's shape.
 */
class Parser {
  private pos = 0;
  readonly errors: LuauSyntaxError[] = [];
  private readonly functionStack: FunctionState[] = [{ vararg: true, loopDepth: 0 }];
  private readonly localMap = new Map<string, AstLocal | undefined>();
  private readonly localStack: AstLocal[] = [];
  private readonly eof: Token;
  private blockDepth = 0;

  /** The block depth whose statements are recorded in `statements`, with the tokens each was read from. */
  recordDepth = -1;
  readonly statements: { statement: AstStat; first: number; end: number }[] = [];

  constructor(
    private tokens: Token[],
    private readonly ctx: ReadContext,
    private previous: Location,
  ) {
    const last = tokens[tokens.length - 1];
    const end = last ? last.location.end : previous.end;
    this.eof = { kind: "eof", text: "", from: last?.to ?? 0, to: last?.to ?? 0, location: new Location(end, end), source: -1 };
  }

  // -- Tokens --------------------------------------------------------------

  private current(): Token {
    return this.tokens[this.pos] ?? this.eof;
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

  private is(text: string, token = this.current()): boolean {
    return (token.kind === "symbol" || token.kind === "keyword") && token.text === text;
  }

  private isName(token = this.current()): boolean {
    return token.kind === "name";
  }

  /** Reads tokens of their own (a string's interpolation) as part of this parse, with the same locals and functions in scope. */
  private withTokens<T>(tokens: Token[], read: () => T): T {
    const saved = { tokens: this.tokens, pos: this.pos, previous: this.previous };
    this.tokens = tokens;
    this.pos = 0;
    try {
      return read();
    } finally {
      this.tokens = saved.tokens;
      this.pos = saved.pos;
      this.previous = saved.previous;
    }
  }

  // -- Errors --------------------------------------------------------------

  private report(location: Location, message: string): void {
    // Luau keeps one error of a location, the first.
    const last = this.errors[this.errors.length - 1];
    if (last && last.location.equals(location)) return;
    this.errors.push({ location, message });
  }

  private reportExprError(location: Location, expressions: AstExpr[], message: string): AstExprError {
    this.report(location, message);
    return new AstExprError(location, expressions, this.errors.length - 1);
  }

  private reportStatError(location: Location, expressions: AstExpr[], statements: AstStat[], message: string): AstStatError {
    this.report(location, message);
    return new AstStatError(location, expressions, statements, this.errors.length - 1);
  }

  private reportTypeError(location: Location, types: AstType[], message: string): AstTypeError {
    this.report(location, message);
    return new AstTypeError(location, types, false, this.errors.length - 1);
  }

  private expectAndConsume(text: string, context?: string): boolean {
    if (this.is(text)) {
      this.next();
      return true;
    }
    this.expectAndConsumeFail(text, context);
    // An extra token before the one expected is skipped.
    if (this.is(text, this.lookahead())) {
      this.next();
      this.next();
    }
    return false;
  }

  private expectAndConsumeFail(text: string, context?: string): void {
    const got = describe(this.current());
    this.report(this.current().location, context !== undefined ? `Expected '${text}' when parsing ${context}, got ${got}` : `Expected '${text}', got ${got}`);
  }

  private expectMatchAndConsume(text: string, begin: Token, searchForMissing = false): boolean {
    if (this.is(text)) {
      this.next();
      return true;
    }
    this.expectMatchAndConsumeFail(text, begin);
    if (searchForMissing) {
      const line = this.previousLocation().end.line;
      while (this.current().kind !== "eof" && this.current().location.begin.line === line && !this.is(text) && !this.is("end")) this.next();
      if (this.is(text)) {
        this.next();
        return true;
      }
    } else if (this.is(text, this.lookahead())) {
      this.next();
      this.next();
      return true;
    }
    return false;
  }

  private expectMatchAndConsumeFail(text: string, begin: Token, extra = ""): void {
    const location = this.current().location;
    const got = `${describe(this.current())}${extra}`;
    const open = begin.kind === "chooseThen" || begin.kind === "choose" ? "choose" : begin.text;
    if (location.begin.line === begin.location.begin.line)
      this.report(location, `Expected '${text}' (to close '${open}' at column ${begin.location.begin.column + 1}), got ${got}`);
    else this.report(location, `Expected '${text}' (to close '${open}' at line ${begin.location.begin.line + 1}), got ${got}`);
  }

  private expectMatchEndAndConsume(text: string, begin: Token): boolean {
    if (this.is(text)) {
      this.next();
      return true;
    }
    this.expectMatchAndConsumeFail(text, begin);
    if (this.is(text, this.lookahead())) {
      this.next();
      this.next();
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
    if (token.kind === "eof" || token.kind === "chooseThen" || token.kind === "chooseEnd") return true;
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
    if (this.current().kind !== "eof") this.report(this.current().location, `Expected the end of the expression, got ${describe(this.current())}`);
    return expr;
  }

  parseChunk(): AstStatBlock {
    const result = this.parseBlock();
    while (this.current().kind !== "eof") {
      this.report(this.current().location, `Expected <eof>, got ${describe(this.current())}`);
      this.next();
      const rest = this.parseBlock();
      result.body.push(...rest.body);
    }
    return result;
  }

  private parseBlock(): AstStatBlock {
    const localsBegin = this.saveLocals();
    const result = this.parseBlockNoScope();
    this.restoreLocals(localsBegin);
    return result;
  }

  private parseBlockNoScope(): AstStatBlock {
    const body: AstStat[] = [];
    const prevPosition = this.previousLocation().end;
    this.blockDepth++;
    const record = this.blockDepth === this.recordDepth;
    while (!this.blockFollow(this.current())) {
      const first = this.pos;
      const start = this.current();
      const stat = this.parseStat();
      if (this.is(";")) {
        this.next();
        stat.hasSemicolon = true;
        stat.location = new Location(stat.location.begin, this.previousLocation().end);
      }
      // A token no statement begins with is skipped, so the reading goes on.
      if (this.current() === start && this.pos === first) this.next();
      body.push(stat);
      if (record) this.statements.push({ statement: stat, first, end: this.pos });
      if (stat instanceof AstStatBreak || stat instanceof AstStatContinue || stat instanceof AstStatReturn) break;
    }
    this.blockDepth--;
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
          return this.parseFunctionStat();
        case "local":
          return this.parseLocal(token.location, false);
        case "return":
          return this.parseReturn();
        case "break":
          return this.parseBreak();
      }
    } else if (token.kind === "mark") {
      return this.parseExplicit();
    } else if (token.kind === "store") {
      return this.parseStore();
    } else if (token.kind === "choose") {
      return this.parseChoose();
    }

    const start = token.location;
    const expr = this.parsePrimaryExpr(true);

    if (expr instanceof AstExprCall) return new AstStatExpr(expr.location, expr);

    if (this.is(",") || this.is("=")) return this.parseAssignment(expr);

    const compound = this.current().kind === "symbol" ? COMPOUND_OPS[this.current().text] : undefined;
    if (compound !== undefined) return this.parseCompoundAssignment(expr, compound);

    const ident = expr instanceof AstExprGlobal ? expr.name : expr instanceof AstExprLocal ? expr.local.name : undefined;
    if (ident === "type") return this.parseTypeAlias(expr.location, false);
    if (ident === "export" && this.isName() && this.current().text === "type") {
      this.next();
      return this.parseTypeAlias(expr.location, true);
    }
    if (ident === "continue") return this.parseContinue(expr.location);
    if (ident === "const") return this.parseLocal(expr.location, true);

    if (start.equals(this.current().location)) this.next();
    return this.reportStatError(expr.location, [expr], [], "Incomplete statement: expected assignment or a function call");
  }

  /** `&` and the statement it marks. */
  private parseExplicit(): AstStat {
    const mark = this.current().location;
    this.next();
    if (this.blockFollow(this.current())) {
      return this.reportStatError(mark, [], [], `Expected a statement after '&', got ${describe(this.current())}`);
    }
    const statement = this.parseStat();
    return new AstStatSparkdownExplicit(Location.span(mark, statement.location), statement, mark);
  }

  /** `store` names [`=` values]. */
  private parseStore(): AstStat {
    const start = this.current().location;
    this.next();
    const names: Binding[] = [];
    this.parseBindingList(names);
    let equalsSignLocation: Location | undefined;
    const values: AstExpr[] = [];
    if (this.is("=")) {
      equalsSignLocation = this.current().location;
      this.next();
      this.parseExprList(values);
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

  private parseIf(): AstStat {
    const start = this.current().location;
    this.next(); // if / elseif
    const cond = this.parseExpr();
    const matchThen = this.current();
    let thenLocation: Location | undefined;
    if (this.expectAndConsume("then", "if statement")) thenLocation = matchThen.location;
    const thenbody = this.parseBlock();

    let elsebody: AstStat | undefined;
    let end = start;
    let elseLocation: Location | undefined;
    if (this.is("elseif")) {
      thenbody.hasEnd = true;
      elseLocation = this.current().location;
      elsebody = this.parseIf();
      end = elsebody.location;
    } else {
      let matchThenElse = matchThen;
      if (this.is("else")) {
        thenbody.hasEnd = true;
        elseLocation = this.current().location;
        matchThenElse = this.current();
        this.next();
        const elseBlock = this.parseBlock();
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
    const body = this.parseBlock();
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
    const body = this.parseBlockNoScope();
    this.currentFunction().loopDepth--;
    body.hasEnd = this.expectMatchEndAndConsume("until", matchRepeat);
    const cond = this.parseExpr();
    this.restoreLocals(localsBegin);
    return new AstStatRepeat(Location.span(start, cond.location), cond, body);
  }

  private parseDo(): AstStat {
    const start = this.current().location;
    const matchDo = this.current();
    this.next();
    const body = this.parseBlock();
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
      const body = this.parseBlock();
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
    const body = this.parseBlock();
    this.currentFunction().loopDepth--;
    this.restoreLocals(localsBegin);
    const end = this.current().location;
    body.hasEnd = this.expectMatchEndAndConsume("end", matchDo);
    return new AstStatForIn(Location.span(start, end), vars, values, body, hasIn, inLocation, hasDo, matchDo.location);
  }

  private parseFunctionName(out: { hasself: boolean; debugname: string }): AstExpr {
    if (this.isName()) out.debugname = this.current().text;
    let expr = this.parseNameExpr("function name");
    while (this.is(".")) {
      const opPosition = this.current().location.begin;
      this.next();
      const name = this.parseName("field name");
      out.debugname = name.name;
      expr = new AstExprIndexName(Location.span(expr.location, name.location), expr, name.name, name.location, opPosition, ".");
    }
    if (this.is(":")) {
      const opPosition = this.current().location.begin;
      this.next();
      const name = this.parseName("method name");
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
      return this.reportExprError(expr.location, [expr], `Variable '${expr.local.name}' is constant and may not be reassigned`);
    return this.reportExprError(expr.location, [expr], "Assigned expression must be a variable or a field");
  }

  private parseFunctionStat(): AstStat {
    const start = this.current().location;
    const matchFunction = this.current();
    this.next();
    const name = { hasself: false, debugname: "" };
    let expr = this.parseFunctionName(name);
    if (!this.isExprLValue(expr)) expr = this.reportLValueError(expr);
    const body = this.parseFunctionBody(name.hasself, matchFunction, name.debugname, undefined)[0];
    return new AstStatFunction(Location.span(start, body.location), expr, body);
  }

  private parseLocal(start: Location, isConst: boolean): AstStat {
    if (!isConst) this.next(); // local
    if (this.is("function")) {
      let matchFunction = this.current();
      this.next();
      // `local function` reads as beginning where `local` begins, as Luau patches its token.
      if (matchFunction.location.begin.line === start.begin.line) {
        matchFunction = { ...matchFunction, location: new Location(new Position(matchFunction.location.begin.line, start.begin.column), matchFunction.location.end) };
      }
      const name = this.parseName("variable name");
      const [body, variable] = this.parseFunctionBody(false, matchFunction, name.name, name, isConst);
      return new AstStatLocalFunction(new Location(start.begin, body.location.end), variable!, body, isConst);
    }
    const names: Binding[] = [];
    this.parseBindingList(names, false, isConst);
    const values: AstExpr[] = [];
    let equalsSignLocation: Location | undefined;
    if (this.is("=")) {
      equalsSignLocation = this.current().location;
      this.next();
      this.parseExprList(values);
    }
    const vars = names.map((name) => this.pushLocal(name));
    const end = values.length === 0 ? this.previousLocation() : values[values.length - 1]!.location;
    const node = new AstStatLocal(Location.span(start, end), vars, values, equalsSignLocation, isConst);
    if (isConst && !isEnoughValues(values, vars.length)) this.report(node.location, "Missing initializer in const declaration");
    return node;
  }

  private parseReturn(): AstStat {
    const start = this.current().location;
    this.next();
    const list: AstExpr[] = [];
    if (!this.blockFollow(this.current()) && !this.is(";")) this.parseExprList(list);
    const end = list.length === 0 ? start : list[list.length - 1]!.location;
    return new AstStatReturn(Location.span(start, end), list);
  }

  private parseTypeAlias(start: Location, exported: boolean): AstStat {
    let name = this.parseNameOpt("type name");
    if (!name) name = { name: ERROR_NAME, location: this.current().location };
    const [generics, genericPacks] = this.parseGenericTypeList(true);
    this.expectAndConsume("=", "type alias");
    const type = this.parseType();
    return new AstStatTypeAlias(Location.span(start, type.location), name.name, name.location, generics, genericPacks, type, exported);
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
    this.expectAndConsume("=", "assignment");
    const values: AstExpr[] = [];
    this.parseExprList(values);
    return new AstStatAssign(Location.span(initial.location, values[values.length - 1]!.location), vars, values);
  }

  private parseCompoundAssignment(initial: AstExpr, op: BinaryOp): AstStat {
    if (!this.isExprLValue(initial)) initial = this.reportLValueError(initial);
    this.next();
    const value = this.parseExpr();
    return new AstStatCompoundAssign(Location.span(initial.location, value.location), op, initial, value);
  }

  // -- Functions -----------------------------------------------------------

  private parseFunctionBody(hasself: boolean, matchFunction: Token, debugname: string, localName: Name | undefined, isConst = false): [AstExprFunction, AstLocal | undefined] {
    const start = matchFunction.location;
    const [generics, genericPacks] = this.parseGenericTypeList(false);
    const matchParen = this.current();
    this.expectAndConsume("(", "function");
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
    this.functionStack.push({ vararg, loopDepth: 0 });
    let self: AstLocal | undefined;
    if (hasself) self = this.pushLocal({ name: { name: "self", location: start }, annotation: undefined, isConst: false });
    const vars = args.map((arg) => this.pushLocal(arg));
    const body = this.parseBlock();
    this.functionStack.pop();
    this.restoreLocals(localsBegin);

    const end = this.current().location;
    body.hasEnd = this.expectMatchEndAndConsume("end", matchFunction);

    const node = new AstExprFunction(
      Location.span(start, end),
      [],
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

  private parseExprList(result: AstExpr[]): void {
    result.push(this.parseExpr());
    while (this.is(",")) {
      this.next();
      if (this.is(")")) {
        this.report(this.current().location, "Expected expression after ',' but got ')' instead");
        break;
      }
      result.push(this.parseExpr());
    }
  }

  private parseBinding(isConst = false): Binding {
    let name = this.parseNameOpt("variable name");
    if (!name) name = { name: ERROR_NAME, location: this.current().location };
    const annotation = this.parseOptionalType();
    return { name, annotation, isConst };
  }

  /** Returns whether the list ends in `...`, the location of the `...`, and its annotation. */
  parseBindingList(result: Binding[], allowDot3 = false, isConst = false): [boolean, Location, AstTypePack | undefined] {
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
      result.push(this.parseBinding(isConst));
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
    const result = this.parseReturnType();
    if (this.is(",")) {
      this.report(this.current().location, "Expected a statement, got ','; did you forget to wrap the list of return types in parentheses?");
      this.next();
    }
    return result;
  }

  private parseReturnType(): AstTypePack {
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
    this.expectMatchAndConsume(")", begin, true);

    if (!this.is("->") && resultNames.length === 0) {
      if (result.length === 1) {
        let inner: AstType;
        if (varargAnnotation === undefined && this.isTypeFollow()) inner = new AstTypeGroup(location, result[0]!);
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
    const index = this.parseType();
    this.expectMatchAndConsume("]", begin);
    this.expectAndConsume(":", "table field");
    const result = this.parseType();
    const indexer: AstTableIndexer = { indexType: index, resultType: result, location: Location.span(begin.location, result.location), access };
    if (accessLocation) indexer.accessLocation = accessLocation;
    return indexer;
  }

  private parseTableType(): AstType {
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
        const nullLocation = new Location(start.begin, start.begin);
        const index = new AstTypeReference(nullLocation, undefined, "number", undefined, nullLocation);
        indexer = { indexType: index, resultType: type, location: type.location, access };
        if (accessLocation) indexer.accessLocation = accessLocation;
        break;
      } else {
        const name = this.parseNameOpt("table field");
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
    if (!this.expectMatchAndConsume("}", matchBrace, true)) end = this.previousLocation();
    return new AstTypeTable(Location.span(start, end), props, indexer);
  }

  private parseFunctionType(allowPack: boolean): AstTypeOrPack {
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
    this.expectMatchAndConsume(")", parameterStart, true);
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
    let isUnion = false;
    let isIntersection = false;
    for (;;) {
      if (this.is("|")) {
        this.next();
        parts.push(this.parseSimpleType(false).type!);
        isUnion = true;
      } else if (this.is("?")) {
        const loc = this.current().location;
        this.next();
        parts.push(new AstTypeOptional(loc));
        isUnion = true;
      } else if (this.is("&")) {
        this.next();
        parts.push(this.parseSimpleType(false).type!);
        isIntersection = true;
      } else if (this.is("...")) {
        this.report(this.current().location, "Unexpected '...' after type annotation");
        this.next();
      } else break;
    }
    if (parts.length === 1 && !isUnion && !isIntersection) return parts[0]!;
    if (parts.length === 0) return this.reportTypeError(begin, [], `Expected type, got ${describe(this.current())}`);
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
    const begin = this.current().location;
    const { type, typePack } = this.parseSimpleType(true);
    if (typePack) return { typePack };
    return { type: this.parseTypeSuffix(type, begin) };
  }

  parseType(): AstType {
    const begin = this.current().location;
    let type: AstType | undefined;
    if (!this.is("|") && !this.is("&")) type = this.parseSimpleType(false).type;
    return this.parseTypeSuffix(type, begin);
  }

  private parseSimpleType(allowPack: boolean): AstTypeOrPack {
    const start = this.current().location;
    const token = this.current();
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
    if (token.kind === "interp") {
      this.next();
      return { type: this.reportTypeError(start, [], "Interpolated string literals cannot be used as types") };
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
        name = this.parseIndexName("field name", prefixPointPosition);
      } else if (this.is("...")) {
        this.report(this.current().location, "Unexpected '...' after type name; type pack is not allowed in this context");
        this.next();
      } else if (name.name === "typeof") {
        const typeofBegin = this.current();
        this.expectAndConsume("(", "typeof type");
        const expr = this.parseExpr();
        const end = this.current().location;
        this.expectMatchAndConsume(")", typeofBegin);
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
    this.report(new Location(this.previousLocation().end, start.end), `Expected type, got ${describe(token)}`);
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
    this.expectMatchAndConsume(">", begin);
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
    const op = BINARY_OPS[token.text];
    if (op !== undefined) return op;
    // Luau reads the operators of other languages as its own, and reports them.
    const confusable: Record<string, [BinaryOp, string]> = { "&&": [BinaryOp.And, "and"], "||": [BinaryOp.Or, "or"], "!=": [BinaryOp.CompareNe, "~="] };
    const entry = confusable[token.text];
    if (entry && BINARY_PRIORITY[entry[0]]!.left > limit) {
      this.report(token.location, `Unexpected '${token.text}'; did you mean '${entry[1]}'?`);
      return entry[0];
    }
    return undefined;
  }

  parseExpr(limit = 0): AstExpr {
    const start = this.current().location;
    let expr: AstExpr;
    const uop = this.unaryOp();
    if (uop !== undefined) {
      this.next();
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
    }
    return expr;
  }

  private parseNameExpr(context?: string): AstExpr {
    const name = this.parseNameOpt(context);
    if (!name) return new AstExprError(this.current().location, [], this.errors.length - 1);
    const local = this.localMap.get(name.name);
    if (local) return new AstExprLocal(name.location, local, local.functionDepth !== this.functionStack.length - 1);
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
        end = this.previousLocation().end;
      } else {
        this.next();
      }
      return new AstExprGroup(new Location(start, end), expr);
    }
    if (this.current().kind === "new") return this.parseNew();
    return this.parseNameExpr("expression");
  }

  private parsePrimaryExpr(asStatement: boolean): AstExpr {
    const start = this.current().location.begin;
    let expr = this.parsePrefixExpr();
    for (;;) {
      if (this.is(".")) {
        const opPosition = this.current().location.begin;
        this.next();
        const index = this.parseIndexName(undefined, opPosition);
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
        const index = this.parseIndexName("method name", opPosition);
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
    }
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
    const start = this.current().location;
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
      return this.parseFunctionBody(false, token, "", undefined)[0];
    }
    if (token.kind === "number") return this.parseNumber();
    if (token.kind === "string" || token.kind === "rawstring") return this.parseString();
    if (token.kind === "interp") return this.parseInterpString();
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
      if (!this.is(")")) this.parseExprList(args);
      const end = this.current().location;
      this.expectMatchAndConsume(")", matchParen);
      return new AstExprCall(Location.span(func.location, end), func, args, self, [], new Location(argStart, end.end));
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
      `Expected '(', '{' or <string> when parsing function call, got ${describe(this.current())}`,
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
      else if (this.is("[") || this.isName()) this.report(this.current().location, "Expected ',' after table constructor element");
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
    const trueExpr = this.parseExpr();
    let falseExpr: AstExpr;
    let hasElse: boolean;
    if (this.is("elseif")) {
      hasElse = true;
      falseExpr = this.parseIfElseExpr();
    } else {
      hasElse = this.expectAndConsume("else", "if then else expression");
      falseExpr = this.parseExpr();
    }
    return new AstExprIfElse(Location.span(start, falseExpr.location), condition, hasThen, trueExpr, hasElse, falseExpr);
  }

  private parseNameOpt(context?: string): Name | undefined {
    if (!this.isName()) {
      const got = describe(this.current());
      this.report(this.current().location, context !== undefined ? `Expected identifier when parsing ${context}, got ${got}` : `Expected identifier, got ${got}`);
      return undefined;
    }
    const result = { name: this.current().text, location: this.current().location };
    this.next();
    return result;
  }

  private parseName(context?: string): Name {
    const name = this.parseNameOpt(context);
    if (name) return name;
    const location = this.current().location;
    return { name: ERROR_NAME, location: new Location(location.begin, location.begin) };
  }

  private parseIndexName(context: string | undefined, previous: Position): Name {
    const name = this.parseNameOpt(context);
    if (name) return name;
    // A keyword on the same line is read as an unfinished name.
    if (this.current().kind === "keyword" && this.current().location.begin.line === previous.line) {
      const result = { name: this.current().text, location: this.current().location };
      this.next();
      return result;
    }
    const location = this.current().location;
    return { name: ERROR_NAME, location: new Location(location.begin, location.begin) };
  }

  // -- Literals ------------------------------------------------------------

  private parseNumber(): AstExpr {
    const token = this.current();
    this.next();
    const value = numberValue(token.text);
    if (value === undefined) return this.reportExprError(token.location, [], "Malformed number");
    return new AstExprConstantNumber(token.location, value);
  }

  /** A quoted or long string's value, or undefined when an escape is malformed. */
  private charArray(token: Token): string | undefined {
    if (token.kind === "rawstring") return rawValue(token.text);
    return quotedValue(token.text.slice(1, token.text.length - 1));
  }

  private parseString(): AstExpr {
    const token = this.current();
    this.next();
    if (!isFinished(token)) return this.reportExprError(token.location, [], "Malformed string; did you forget to finish it?");
    if (token.kind === "string" && token.text.startsWith('"') && token.node && hasInterpolation(token.node)) {
      return this.parseSparkdownString(token);
    }
    const style = token.kind === "rawstring" ? QuoteStyle.QuotedRaw : QuoteStyle.QuotedSimple;
    const value = this.charArray(token);
    if (value === undefined) return this.reportExprError(token.location, [], "String literal contains malformed escape sequence");
    return new AstExprConstantString(token.location, value, style);
  }

  /** The parts of a string node: the text between its interpolations, and the interpolations. */
  private stringParts(token: Token, interpolation: string): { strings: string[]; expressions: AstExpr[] } | undefined {
    const node = token.node!;
    const strings: string[] = [];
    const expressions: AstExpr[] = [];
    const text = this.ctx.text;
    let at = token.from + 1;
    const close = token.to - 1;
    for (const child of stringPartNodes(node, interpolation)) {
      const isShorthand = CALL_SHORTHANDS.has(child.name);
      const value = quotedValue(text.slice(at, child.from));
      if (value === undefined) return undefined;
      strings.push(value);
      expressions.push(this.interpolation(child, isShorthand));
      at = child.to;
    }
    const value = quotedValue(text.slice(at, Math.max(at, close)));
    if (value === undefined) return undefined;
    strings.push(value);
    return { strings, expressions };
  }

  /** The expression of an interpolation (`{x}`), or of a `{{f}}` shorthand. */
  private interpolation(node: SyntaxNode, shorthand: boolean): AstExpr {
    const tokenizer = new Tokenizer(this.ctx.text, this.ctx.index);
    tokenizer.readChildren(node);
    const inner = tokenizer.tokens;
    // The braces around the expression: one on each side, or two for the shorthand.
    const braces = shorthand ? 2 : 1;
    const open = inner.slice(0, braces);
    const body = inner.slice(braces, Math.max(braces, inner.length - braces));
    const location = new Location(this.ctx.index.position(node.from), this.ctx.index.position(node.to));
    const expr = this.withTokens(body, () => {
      if (body.length === 0) return this.reportExprError(location, [], "Malformed interpolated string, expected expression inside '{}'");
      const e = this.parseExpr();
      if (this.current().kind !== "eof") this.report(this.current().location, `Malformed interpolated string, got ${describe(this.current())}`);
      return e;
    });
    if (open.length < braces) return this.reportExprError(location, [expr], "Malformed interpolated string");
    return shorthand ? new AstExprSparkdownCallShorthand(location, expr) : expr;
  }

  /** A double-quoted string with interpolations, as Sparkdown reads it. */
  private parseSparkdownString(token: Token): AstExpr {
    const luauValue = quotedValue(token.text.slice(1, token.text.length - 1));
    const parts = this.stringParts(token, DOUBLE_QUOTED_INTERPOLATION);
    if (!parts || luauValue === undefined) return this.reportExprError(token.location, [], "String literal contains malformed escape sequence");
    return new AstExprSparkdownInterpString(token.location, parts.strings, parts.expressions, luauValue);
  }

  private parseInterpString(): AstExpr {
    const token = this.current();
    this.next();
    if (!token.text.endsWith("`") || token.text.length < 2) {
      return this.reportExprError(token.location, [], "Malformed interpolated string; did you forget to add a '`'?");
    }
    const parts = this.stringParts(token, BACKTICK_INTERPOLATION);
    if (!parts) return this.reportExprError(token.location, [], "Interpolated string literal contains malformed escape sequence");
    // A string with no interpolation is a plain string to Luau.
    if (parts.expressions.length === 0) return new AstExprConstantString(token.location, parts.strings[0]!, QuoteStyle.QuotedSimple);
    return new AstExprInterpString(token.location, parts.strings, parts.expressions);
  }
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
      return new AstExprSparkdownDivertTarget(token.location, token.text.replace(/^->/, "").replace(/\s+/g, ""), source);
    case "LuauRegexLiteral": {
      const match = /^@\/([\s\S]*)\/([A-Za-z]*)$/.exec(token.text);
      return new AstExprSparkdownRegex(token.location, match?.[1] ?? token.text.slice(2), match?.[2] ?? "", source);
    }
    case "LuauConditionalAlternatorBlock":
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
    if (child.name === name) return child;
    const found = findDescendant(child, name);
    if (found) return found;
  }
  return undefined;
}

/** Every node of a kind under a node, in document order, outside parameters' annotations when `outsideAnnotations` says so. */
function findAll(node: SyntaxNode, name: string, outsideAnnotations = false, found: SyntaxNode[] = []): SyntaxNode[] {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) found.push(child);
    else if (!outsideAnnotations || child.name !== "LuauTypeAnnotationOperation") findAll(child, name, outsideAnnotations, found);
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
): LuauAstUnit {
  const ctx: ReadContext = { text: tokenizer.text, index: tokenizer.index };
  const parser = new Parser(tokenizer.tokens, ctx, new Location(start, start));
  parser.recordDepth = recordDepth;
  const root = parser.parseChunk();
  const tokens = tokenizer.tokens;
  const statements: LuauStatementSource[] = parser.statements.map(({ statement, first, end }) => {
    const seen = new Set<number>();
    for (let i = first; i < end; i++) {
      const source = tokens[i]?.source ?? -1;
      if (source >= 0) seen.add(source);
    }
    return { statement, nodes: [...seen].sort((a, b) => a - b).map((i) => nodes[i]!) };
  });
  return { kind, root, errors: parser.errors, hotcomments: tokenizer.hotcomments, statements };
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

const COMMENT_NODE = /^Luau\w*Comment$/;

/**
 * Reads a `.sd` file's Luau as units: its prelude, with the Luau statements
 * outside any flow and every function definition, and a unit per scene (its
 * branches included) or branch outside any scene that holds Luau
 * statements, as `sparkdownUnits` in `LuauDocumentChecker.ts` divides them.
 */
export function readLuauUnits(tree: Tree, documentText: string): LuauAstUnits {
  const index = lineIndex(documentText);

  // Whether a header's parameter list is a Luau parameter list as written.
  const isWhole = (node: SyntaxNode): boolean => {
    const tokenizer = new Tokenizer(documentText, index);
    tokenizer.read(node);
    const parser = new Parser(tokenizer.tokens, { text: documentText, index }, new Location());
    return parser.readsAsParameterList();
  };

  const varargOf = (parameters: SyntaxNode): Vararg | undefined => {
    const dots = findAll(parameters, "LuauVariadicParameter", true)[0];
    if (!dots) return undefined;
    let annotation = dots.nextSibling;
    while (annotation && (NEUTRAL.test(annotation.name) || COMMENT_NODE.test(annotation.name))) annotation = annotation.nextSibling;
    if (annotation?.name !== "LuauTypeAnnotationOperation") return { dots, annotation: undefined, type: "" };
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
  const preludeStart = preludeNodes[0] ? new Position(index.lineAt(preludeNodes[0].from), 0) : new Position(0, 0);
  const prelude = readUnit("prelude", preludeTokenizer, preludeNodes.map(ref), 1, preludeStart);

  const units: LuauAstUnit[] = [];
  for (const flow of flows) {
    const unit = readFlow(flow, documentText, index);
    if (unit) units.push(unit);
  }
  return { prelude, flows: units };
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
function readFlow(flow: Flow, documentText: string, index: LineIndex): LuauAstUnit | undefined {
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
      declareBranchParameters(tokenizer, part.branch, part.parameters, documentText);
      tokenizer.source = -1;
    }
  }
  // A flow whose statements are all Sparkdown's own has no Luau to check.
  if (statements === 0) return undefined;

  if (flow.end) {
    const [from, to] = trimmedRange(documentText, flow.end.from, flow.end.to);
    tokenizer.push("keyword", from, to);
  } else {
    const last = tokenizer.tokens[tokenizer.tokens.length - 1]!;
    tokenizer.synthetic("keyword", "end", last.to);
  }
  const start = new Position(index.lineAt(flow.header.from), 0);
  const unit = readUnit("flow", tokenizer, nodes, 2, start);
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
export function readLuauRunFile(tree: Tree, documentText: string): LuauAstUnit | undefined {
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
  const nodes: TreeNodeRef[] = [];
  let at = body.from;
  for (let child = body.firstChild; child; child = child.nextSibling) {
    if (child.from > at) tokenizer.lex(at, child.from);
    tokenizer.source = nodes.length;
    nodes.push(ref(child));
    tokenizer.read(child);
    tokenizer.source = -1;
    at = Math.max(at, child.to);
  }
  if (body.to > at) tokenizer.lex(at, body.to);
  return readUnit("file", tokenizer, nodes, 1, new Position(index.lineAt(body.from) + 1, 0));
}

/**
 * Reads the one Luau expression some nodes hold (an interpolation's,
 * a choice's condition, a struct's value), with every name read as a global.
 */
export function readLuauExpression(nodes: SyntaxNode | readonly SyntaxNode[], documentText: string): { expr: AstExpr; errors: LuauSyntaxError[] } {
  const index = lineIndex(documentText);
  const tokenizer = new Tokenizer(documentText, index);
  for (const node of Array.isArray(nodes) ? nodes : [nodes as SyntaxNode]) tokenizer.read(node);
  const first = tokenizer.tokens[0];
  const start = first ? first.location : new Location();
  const parser = new Parser(tokenizer.tokens, { text: documentText, index }, new Location(start.begin, start.begin));
  const expr = parser.parseLoneExpression();
  return { expr, errors: parser.errors };
}

/** Reads the Luau statements some nodes hold, in order, as one block. */
export function readLuauStatements(nodes: readonly SyntaxNode[], documentText: string): LuauAstUnit {
  const index = lineIndex(documentText);
  const tokenizer = new Tokenizer(documentText, index);
  nodes.forEach((node, i) => {
    tokenizer.source = i;
    tokenizer.read(node);
  });
  const start = nodes[0] ? new Position(index.lineAt(nodes[0].from), 0) : new Position(0, 0);
  return readUnit("prelude", tokenizer, nodes.map(ref), 1, start);
}

