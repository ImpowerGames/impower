// Luau's lexer and parser, ported from Luau's `Lexer.h`/`Lexer.cpp`,
// `Parser.h`/`Parser.cpp` and `Confusables.cpp` (in `Ast/`); Luau is
// MIT-licensed (see `LICENSE-luau.txt`).
//
// `parseLuau` parses a Luau program into the syntax tree of `./Ast` as Luau's
// `Parser::parse` builds it: the same nodes and locations, the same local
// resolution, the same hot comments and the same parse errors.
// `parseDefinitionSource` parses a definition file, where the `declare`
// statements are allowed.
//
// The lexer reads the source's UTF-8 bytes, so a column counts bytes, as
// Luau's does. Text the tree takes from the source (string constants, names
// made from string keys, hot comment contents) holds one character per byte,
// as `AstExprConstantString` documents; error messages are decoded as UTF-8.
// The parser records no concrete syntax and no comment locations.

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
  AstStatDeclareExternType,
  AstStatDeclareFunction,
  AstStatDeclareGlobal,
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
  AstStatTypeAlias,
  AstStatTypeFunction,
  AstStatWhile,
  AstTableAccess,
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
  type AstArgumentName,
  type AstDeclaredExternTypeProperty,
  type AstExprTableItem,
  type AstTableIndexer,
  type AstTableProp,
  type AstTypeList,
  type AstTypeOrPack,
} from "./Ast";
import { Location, Position } from "./Location";
import type { HotComment } from "./Module";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** The options `parseLuau` takes (the part of Luau's `ParseOptions` the checker uses). */
export interface ParseOptions {
  /** Allow the `declare` statements of a definition file. */
  allowDeclarationSyntax?: boolean;
}

/** A syntax error (Luau's `ParseError`). */
export interface ParseError {
  location: Location;
  message: string;
}

/** What parsing a source gives (Luau's `ParseResult`). */
export interface ParseResult {
  /**
   * The program. When a fatal error (the recursion, type length or error
   * count limit) abandons the parse, Luau gives no root; this is then an empty
   * block at the start of the source, which is what `Frontend::parse`
   * substitutes for it.
   */
  root: AstStatBlock;
  errors: ParseError[];
  hotcomments: HotComment[];
}

/** Parses a Luau program (Luau's `Parser::parse`). */
export function parseLuau(source: string, options: ParseOptions = {}): ParseResult {
  const buffer = utf8Encoder.encode(source);
  return Parser.parse(buffer, buffer.length, new AstNameTable(), options);
}

/** Parses a definition file, as `Frontend::loadDefinitionFile` does. */
export function parseDefinitionSource(source: string): ParseResult {
  return parseLuau(source, { allowDeclarationSyntax: true });
}

// Luau's `FInt::LuauRecursionLimit`, `FInt::LuauTypeLengthLimit` and `FInt::LuauParseErrorLimit`.
const LuauRecursionLimit: number = 1000;
const LuauTypeLengthLimit: number = 1000;
const LuauParseErrorLimit: number = 100;

const kParseNameError = "%error-id%";

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

/** The bytes `bytes[begin..end)` as a string of one character per byte. */
function byteString(bytes: ArrayLike<number>, begin: number, end: number): string {
  let result = "";
  for (let i = begin; i < end; i++) result += String.fromCharCode(bytes[i]!);
  return result;
}

/** The bytes `buffer[begin..end)` decoded as UTF-8, for a message. */
function decodeUtf8(buffer: Uint8Array, begin: number, end: number): string {
  return utf8Decoder.decode(buffer.subarray(begin, end));
}

/** Luau's `Location(begin, length)`: a location within one line. */
function locationOfLength(begin: Position, length: number): Location {
  return new Location(begin, new Position(begin.line, begin.column + length));
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

/** The kinds of lexeme (Luau's `Lexeme::Type`). */
const enum LexemeType {
  Eof = 0,

  // 1..255 means actual character values
  Char_END = 256,

  Equal,
  LessEqual,
  GreaterEqual,
  NotEqual,
  Dot2,
  Dot3,
  SkinnyArrow,
  DoubleColon,
  FloorDiv,

  InterpStringBegin,
  InterpStringMid,
  InterpStringEnd,
  // An interpolated string with no expressions (like `x`)
  InterpStringSimple,

  AddAssign,
  SubAssign,
  MulAssign,
  DivAssign,
  FloorDivAssign,
  ModAssign,
  PowAssign,
  ConcatAssign,

  RawString,
  QuotedString,
  Number,
  Name,

  Comment,
  BlockComment,

  Attribute,
  AttributeOpen,

  BrokenString,
  BrokenComment,
  BrokenUnicode,
  BrokenInterpDoubleBrace,
  Error,

  Reserved_BEGIN,
  ReservedAnd = Reserved_BEGIN,
  ReservedBreak,
  ReservedDo,
  ReservedElse,
  ReservedElseif,
  ReservedEnd,
  ReservedFalse,
  ReservedFor,
  ReservedFunction,
  ReservedIf,
  ReservedIn,
  ReservedLocal,
  ReservedNil,
  ReservedNot,
  ReservedOr,
  ReservedRepeat,
  ReservedReturn,
  ReservedThen,
  ReservedTrue,
  ReservedUntil,
  ReservedWhile,
  Reserved_END,
}

/** The character codes the lexer and the parser compare with; a lexeme of one character has its code as its type. */
const enum Ch {
  Tab = 0x09,
  Newline = 0x0a,
  VerticalTab = 0x0b,
  FormFeed = 0x0c,
  CarriageReturn = 0x0d,
  Space = 0x20,
  Bang = 0x21,
  DoubleQuote = 0x22,
  Hash = 0x23,
  Percent = 0x25,
  Ampersand = 0x26,
  SingleQuote = 0x27,
  LeftParen = 0x28,
  RightParen = 0x29,
  Star = 0x2a,
  Plus = 0x2b,
  Comma = 0x2c,
  Minus = 0x2d,
  Dot = 0x2e,
  Slash = 0x2f,
  Zero = 0x30,
  Colon = 0x3a,
  Semicolon = 0x3b,
  Less = 0x3c,
  Equals = 0x3d,
  Greater = 0x3e,
  Question = 0x3f,
  At = 0x40,
  UpperE = 0x45,
  LeftBracket = 0x5b,
  Backslash = 0x5c,
  RightBracket = 0x5d,
  Caret = 0x5e,
  Underscore = 0x5f,
  Backtick = 0x60,
  LowerA = 0x61,
  LowerB = 0x62,
  LowerE = 0x65,
  LowerF = 0x66,
  LowerN = 0x6e,
  LowerR = 0x72,
  LowerT = 0x74,
  LowerU = 0x75,
  LowerV = 0x76,
  LowerX = 0x78,
  LowerZ = 0x7a,
  LeftBrace = 0x7b,
  Pipe = 0x7c,
  RightBrace = 0x7d,
  Tilde = 0x7e,
}

const kReserved = [
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
];

/** Luau's `Lexeme`. */
class Lexeme {
  /** The code point of a `BrokenUnicode` lexeme, or 0 for an invalid UTF-8 sequence. */
  codepoint = 0;

  private constructor(
    /** A `LexemeType`, or the character's code for a lexeme of one character. */
    readonly type: number,
    readonly location: Location,
    /** The length of the text at `data`. */
    private readonly length: number,
    private readonly buffer: Uint8Array | undefined,
    /** Where the text of a string, number or comment starts in the source; undefined when the lexeme carries no text. */
    readonly data: number | undefined,
    /** The name of a `Name`, an `Attribute` or a reserved word. */
    readonly name: string | undefined,
  ) {}

  /** Luau's `Lexeme(location, type)` and `Lexeme(location, character)`. */
  static make(location: Location, type: number): Lexeme {
    return new Lexeme(type, location, 0, undefined, undefined, undefined);
  }

  /** Luau's `Lexeme(location, type, data, size)`, with `data` an offset into `buffer`. */
  static withData(location: Location, type: number, buffer: Uint8Array, data: number, size: number): Lexeme {
    return new Lexeme(type, location, size, buffer, data, undefined);
  }

  /** Luau's `Lexeme(location, type, name)`. */
  static withName(location: Location, type: number, name: string | undefined): Lexeme {
    return new Lexeme(type, location, 0, undefined, undefined, name);
  }

  /** The same lexeme at another location. */
  withLocation(location: Location): Lexeme {
    const result = new Lexeme(this.type, location, this.length, this.buffer, this.data, this.name);
    result.codepoint = this.codepoint;
    return result;
  }

  getLength(): number {
    return this.length;
  }

  /** A copy of the lexeme's text, byte by byte. */
  bytes(): number[] {
    if (this.data === undefined || !this.buffer) return [];
    return Array.from(this.buffer.subarray(this.data, this.data + this.length));
  }

  /** The byte at `index` in the lexeme's text. */
  dataByte(index: number): number {
    return this.buffer![this.data! + index]!;
  }

  /**
   * What Luau reads through the lexeme's `name`. Luau keeps `name` in a union
   * with `data`, so for a lexeme that carries text this is the source from
   * the start of that text to the end of the source (or the first NUL byte),
   * and for any other lexeme it is a null pointer.
   */
  nameAsCString(): string | undefined {
    if (this.name !== undefined) return this.name;
    if (this.data === undefined || !this.buffer) return undefined;
    let end = this.data;
    while (end < this.buffer.length && this.buffer[end] !== 0) end++;
    return decodeUtf8(this.buffer, this.data, end);
  }

  /** The lexeme's text, decoded for a message. */
  private text(): string {
    return decodeUtf8(this.buffer!, this.data!, this.data! + this.length);
  }

  toString(): string {
    switch (this.type) {
      case LexemeType.Eof:
        return "<eof>";

      case LexemeType.Equal:
        return "'=='";

      case LexemeType.LessEqual:
        return "'<='";

      case LexemeType.GreaterEqual:
        return "'>='";

      case LexemeType.NotEqual:
        return "'~='";

      case LexemeType.Dot2:
        return "'..'";

      case LexemeType.Dot3:
        return "'...'";

      case LexemeType.SkinnyArrow:
        return "'->'";

      case LexemeType.DoubleColon:
        return "'::'";

      case LexemeType.FloorDiv:
        return "'//'";

      case LexemeType.AddAssign:
        return "'+='";

      case LexemeType.SubAssign:
        return "'-='";

      case LexemeType.MulAssign:
        return "'*='";

      case LexemeType.DivAssign:
        return "'/='";

      case LexemeType.FloorDivAssign:
        return "'//='";

      case LexemeType.ModAssign:
        return "'%='";

      case LexemeType.PowAssign:
        return "'^='";

      case LexemeType.ConcatAssign:
        return "'..='";

      case LexemeType.RawString:
      case LexemeType.QuotedString:
        return this.data !== undefined ? `"${this.text()}"` : "string";

      case LexemeType.InterpStringBegin:
        return this.data !== undefined ? `\`${this.text()}{` : "the beginning of an interpolated string";

      case LexemeType.InterpStringMid:
        return this.data !== undefined ? `}${this.text()}{` : "the middle of an interpolated string";

      case LexemeType.InterpStringEnd:
        return this.data !== undefined ? `}${this.text()}\`` : "the end of an interpolated string";

      case LexemeType.InterpStringSimple:
        return this.data !== undefined ? `\`${this.text()}\`` : "interpolated string";

      case LexemeType.Number:
        return this.data !== undefined ? `'${this.text()}'` : "number";

      case LexemeType.Name:
        return this.name !== undefined ? `'${this.name}'` : "identifier";

      case LexemeType.Comment:
        return "comment";

      case LexemeType.Attribute:
        return this.name !== undefined ? `'${this.name}'` : "attribute";

      case LexemeType.AttributeOpen:
        return "'@['";

      case LexemeType.BrokenString:
        return "malformed string";

      case LexemeType.BrokenComment:
        return "unfinished comment";

      case LexemeType.BrokenInterpDoubleBrace:
        return "'{{', which is invalid (did you mean '\\{'?)";

      case LexemeType.BrokenUnicode:
        if (this.codepoint) {
          const confusable = findConfusable(this.codepoint);
          if (confusable !== undefined) return `Unicode character U+${this.codepoint.toString(16)} (did you mean '${confusable}'?)`;

          return `Unicode character U+${this.codepoint.toString(16)}`;
        } else {
          return "invalid UTF-8 sequence";
        }

      default:
        if (this.type < LexemeType.Char_END) return `'${String.fromCharCode(this.type)}'`;
        else if (this.type >= LexemeType.Reserved_BEGIN && this.type < LexemeType.Reserved_END)
          return `'${kReserved[this.type - LexemeType.Reserved_BEGIN]}'`;
        else return "<unknown>";
    }
  }
}

/**
 * Luau's `AstNameTable`: the names the lexer has read, with the lexeme type
 * each reads as. Names are strings here, so the table only tells the reserved
 * words and the names it has seen apart.
 */
class AstNameTable {
  private readonly data = new Map<string, number>();

  constructor() {
    for (let i: number = LexemeType.Reserved_BEGIN; i < LexemeType.Reserved_END; ++i)
      this.addStatic(kReserved[i - LexemeType.Reserved_BEGIN]!, i);
  }

  addStatic(name: string, type: number = LexemeType.Name): string {
    this.data.set(name, type);
    return name;
  }

  getOrAddWithType(name: string): [string, number] {
    const type = this.data.get(name);

    // entry already was inserted
    if (type !== undefined) return [name, type];

    const newType = name.charCodeAt(0) === Ch.At ? LexemeType.Attribute : LexemeType.Name;
    this.data.set(name, newType);
    return [name, newType];
  }

  getWithType(name: string): [string | undefined, number] {
    const type = this.data.get(name);
    if (type !== undefined) return [name, type];
    return [undefined, LexemeType.Name];
  }

  getOrAdd(name: string): string {
    return this.getOrAddWithType(name)[0];
  }

  get(name: string): string | undefined {
    return this.getWithType(name)[0];
  }
}

const enum BraceType {
  InterpolatedString,
  Normal,
}

function isSpace(ch: number): boolean {
  return (
    ch === Ch.Space || ch === Ch.Tab || ch === Ch.CarriageReturn || ch === Ch.Newline || ch === Ch.VerticalTab || ch === Ch.FormFeed
  );
}

function isAlpha(ch: number): boolean {
  // use or trick to convert to lower case and unsigned comparison to do range check
  return ((ch | Ch.Space) - Ch.LowerA) >>> 0 < 26;
}

function isDigit(ch: number): boolean {
  return (ch - Ch.Zero) >>> 0 < 10;
}

function isHexDigit(ch: number): boolean {
  // use or trick to convert to lower case and unsigned comparison to do range check
  return (ch - Ch.Zero) >>> 0 < 10 || ((ch | Ch.Space) - Ch.LowerA) >>> 0 < 6;
}

function isNewline(ch: number): boolean {
  return ch === Ch.Newline;
}

function unescape(ch: number): number {
  switch (ch) {
    case Ch.LowerA:
      return 0x07;
    case Ch.LowerB:
      return 0x08;
    case Ch.LowerF:
      return 0x0c;
    case Ch.LowerN:
      return 0x0a;
    case Ch.LowerR:
      return 0x0d;
    case Ch.LowerT:
      return 0x09;
    case Ch.LowerV:
      return 0x0b;
    default:
      return ch;
  }
}

/** Writes the UTF-8 encoding of `code` into `data` at `write`, and returns its length (0 when `code` is out of range). */
function toUtf8(data: number[], write: number, code: number): number {
  // U+0000..U+007F
  if (code < 0x80) {
    data[write] = code;
    return 1;
  }
  // U+0080..U+07FF
  else if (code < 0x800) {
    data[write] = 0xc0 | (code >>> 6);
    data[write + 1] = 0x80 | (code & 0x3f);
    return 2;
  }
  // U+0800..U+FFFF
  else if (code < 0x10000) {
    data[write] = 0xe0 | (code >>> 12);
    data[write + 1] = 0x80 | ((code >>> 6) & 0x3f);
    data[write + 2] = 0x80 | (code & 0x3f);
    return 3;
  }
  // U+10000..U+10FFFF
  else if (code < 0x110000) {
    data[write] = 0xf0 | (code >>> 18);
    data[write + 1] = 0x80 | ((code >>> 12) & 0x3f);
    data[write + 2] = 0x80 | ((code >>> 6) & 0x3f);
    data[write + 3] = 0x80 | (code & 0x3f);
    return 4;
  } else {
    return 0;
  }
}

/** Luau's `Lexer`. */
class Lexer {
  private offset = 0;
  private line: number;
  private lineOffset: number;
  private lexeme: Lexeme;
  private prevLocation = new Location();
  private skipComments = false;
  private readNames = true;
  private readonly braceStack: BraceType[] = [];

  constructor(
    private readonly buffer: Uint8Array,
    private readonly bufferSize: number,
    private readonly names: AstNameTable,
    startPosition = new Position(0, 0),
  ) {
    this.line = startPosition.line;
    this.lineOffset = -startPosition.column;
    this.lexeme = Lexeme.make(locationOfLength(new Position(startPosition.line, startPosition.column), 0), LexemeType.Eof);
  }

  setSkipComments(skip: boolean): void {
    this.skipComments = skip;
  }

  setReadNames(read: boolean): void {
    this.readNames = read;
  }

  previousLocation(): Location {
    return this.prevLocation;
  }

  next(skipComments = this.skipComments, updatePrevLocation = true): Lexeme {
    // in skipComments mode we reject valid comments
    do {
      // consume whitespace before the token
      while (isSpace(this.peekch())) this.consumeAny();

      if (updatePrevLocation) this.prevLocation = this.lexeme.location;

      this.lexeme = this.readNext();
      updatePrevLocation = false;
    } while (skipComments && (this.lexeme.type === LexemeType.Comment || this.lexeme.type === LexemeType.BlockComment));

    return this.lexeme;
  }

  nextline(): void {
    while (this.peekch() !== 0 && this.peekch() !== Ch.CarriageReturn && !isNewline(this.peekch())) this.consume();

    this.next();
  }

  lookahead(): Lexeme {
    const currentOffset = this.offset;
    const currentLine = this.line;
    const currentLineOffset = this.lineOffset;
    const currentLexeme = this.lexeme;
    const currentPrevLocation = this.prevLocation;
    const currentBraceStackSize = this.braceStack.length;
    const currentBraceType = this.braceStack.length === 0 ? BraceType.Normal : this.braceStack[this.braceStack.length - 1]!;

    const result = this.next();

    this.offset = currentOffset;
    this.line = currentLine;
    this.lineOffset = currentLineOffset;
    this.lexeme = currentLexeme;
    this.prevLocation = currentPrevLocation;

    if (this.braceStack.length < currentBraceStackSize) this.braceStack.push(currentBraceType);
    else if (this.braceStack.length > currentBraceStackSize) this.braceStack.pop();

    return result;
  }

  current(): Lexeme {
    return this.lexeme;
  }

  static isReserved(word: string): boolean {
    for (let i: number = LexemeType.Reserved_BEGIN; i < LexemeType.Reserved_END; ++i)
      if (word === kReserved[i - LexemeType.Reserved_BEGIN]) return true;

    return false;
  }

  /** Resolves the escapes of a quoted string's bytes in place; false when one is malformed. */
  static fixupQuotedString(data: number[]): boolean {
    if (data.length === 0 || !data.includes(Ch.Backslash)) return true;

    const size = data.length;
    let write = 0;

    for (let i = 0; i < size; ) {
      if (data[i] !== Ch.Backslash) {
        data[write++] = data[i]!;
        i++;
        continue;
      }

      if (i + 1 === size) return false;

      const escape = data[i + 1]!;
      i += 2; // skip \e

      switch (escape) {
        case Ch.Newline:
          data[write++] = Ch.Newline;
          break;

        case Ch.CarriageReturn:
          data[write++] = Ch.Newline;
          if (i < size && data[i] === Ch.Newline) i++;
          break;

        case 0:
          return false;

        case Ch.LowerX: {
          // hex escape codes are exactly 2 hex digits long
          if (i + 2 > size) return false;

          let code = 0;

          for (let j = 0; j < 2; ++j) {
            const ch = data[i + j]!;
            if (!isHexDigit(ch)) return false;

            // use or trick to convert to lower case
            code = 16 * code + (isDigit(ch) ? ch - Ch.Zero : (ch | Ch.Space) - Ch.LowerA + 10);
          }

          data[write++] = code;
          i += 2;
          break;
        }

        case Ch.LowerZ: {
          while (i < size && isSpace(data[i]!)) i++;
          break;
        }

        case Ch.LowerU: {
          // unicode escape codes are at least 3 characters including braces
          if (i + 3 > size) return false;

          if (data[i] !== Ch.LeftBrace) return false;
          i++;

          if (data[i] === Ch.RightBrace) return false;

          let code = 0;

          for (let j = 0; j < 16; ++j) {
            if (i === size) return false;

            const ch = data[i]!;

            if (ch === Ch.RightBrace) break;

            if (!isHexDigit(ch)) return false;

            // use or trick to convert to lower case; the code is an unsigned 32-bit number, which wraps around
            code = (16 * code + (isDigit(ch) ? ch - Ch.Zero : (ch | Ch.Space) - Ch.LowerA + 10)) >>> 0;
            i++;
          }

          if (i === size || data[i] !== Ch.RightBrace) return false;
          i++;

          const utf8 = toUtf8(data, write, code);
          if (utf8 === 0) return false;

          write += utf8;
          break;
        }

        default: {
          if (isDigit(escape)) {
            let code = escape - Ch.Zero;

            for (let j = 0; j < 2; ++j) {
              if (i === size || !isDigit(data[i]!)) break;

              code = 10 * code + (data[i]! - Ch.Zero);
              i++;
            }

            if (code > 0xff) return false;

            data[write++] = code;
          } else {
            data[write++] = unescape(escape);
          }
        }
      }
    }

    data.length = write;

    return true;
  }

  /** Normalizes the newlines of a long string's bytes in place. */
  static fixupMultilineString(data: number[]): void {
    if (data.length === 0) return;

    // Lua rules for multiline strings are as follows:
    // - standalone \r, \r\n, \n\r and \n are all considered newlines
    // - first newline in the multiline string is skipped
    // - all other newlines are normalized to \n

    // Since our lexer just treats \n as newlines, we apply a simplified set of rules that is sufficient to get normalized newlines for Windows/Unix:
    // - \r\n and \n are considered newlines
    // - first newline is skipped
    // - newlines are normalized to \n

    // This makes the string parsing behavior consistent with general lexing behavior - a standalone \r isn't considered a new line from the line
    // tracking perspective

    // Luau reads the data as a C string, so it stops at a NUL byte.
    let src = 0;
    let dst = 0;

    // skip leading newline
    if (data[0] === Ch.CarriageReturn && data[1] === Ch.Newline) {
      src += 2;
    } else if (data[0] === Ch.Newline) {
      src += 1;
    }

    // parse the rest of the string, converting newlines as we go
    while (src < data.length && data[src] !== 0) {
      if (data[src] === Ch.CarriageReturn && data[src + 1] === Ch.Newline) {
        data[dst++] = Ch.Newline;
        src += 2;
      } else {
        // note, this handles \n by just writing it without changes
        data[dst++] = data[src]!;
        src += 1;
      }
    }

    data.length = dst;
  }

  getOffset(): number {
    return this.offset;
  }

  peekBraceStackTop(): BraceType | undefined {
    if (this.braceStack.length === 0) return undefined;
    else return this.braceStack[this.braceStack.length - 1];
  }

  private peekch(lookahead = 0): number {
    return this.offset + lookahead < this.bufferSize ? this.buffer[this.offset + lookahead]! : 0;
  }

  private position(): Position {
    return new Position(this.line, this.offset - this.lineOffset);
  }

  // consume() assumes current character is not a newline for performance; when that is not known, consumeAny() should be used instead.
  private consume(): void {
    this.offset++;
  }

  private consumeAny(): void {
    if (isNewline(this.buffer[this.offset]!)) {
      this.line++;
      this.lineOffset = this.offset + 1;
    }

    this.offset++;
  }

  private readCommentBody(): Lexeme {
    const start = this.position();

    this.consume();
    this.consume();

    const startOffset = this.offset;

    if (this.peekch() === Ch.LeftBracket) {
      const sep = this.skipLongSeparator();

      if (sep >= 0) {
        return this.readLongString(start, sep, LexemeType.BlockComment, LexemeType.BrokenComment);
      }
    }

    // fall back to single-line comment
    while (this.peekch() !== 0 && this.peekch() !== Ch.CarriageReturn && !isNewline(this.peekch())) this.consume();

    return Lexeme.withData(new Location(start, this.position()), LexemeType.Comment, this.buffer, startOffset, this.offset - startOffset);
  }

  // Given a sequence [===[ or ]===], returns:
  // 1. number of equal signs (or 0 if none present) between the brackets
  // 2. -1 if this is not a long comment/string separator
  // 3. -N if this is a malformed separator
  // Does not consume the closing brace.
  private skipLongSeparator(): number {
    const start = this.peekch();

    this.consume();

    let count = 0;

    while (this.peekch() === Ch.Equals) {
      this.consume();
      count++;
    }

    return start === this.peekch() ? count : -count - 1;
  }

  private readLongString(start: Position, sep: number, ok: number, broken: number): Lexeme {
    // skip (second) [
    this.consume();

    const startOffset = this.offset;

    while (this.peekch() !== 0) {
      if (this.peekch() === Ch.RightBracket) {
        if (this.skipLongSeparator() === sep) {
          this.consume(); // skip (second) ]

          const endOffset = this.offset - sep - 2;

          return Lexeme.withData(new Location(start, this.position()), ok, this.buffer, startOffset, endOffset - startOffset);
        }
      } else {
        this.consumeAny();
      }
    }

    return Lexeme.make(new Location(start, this.position()), broken);
  }

  private readBackslashInString(): void {
    this.consume();
    switch (this.peekch()) {
      case Ch.CarriageReturn:
        this.consume();
        if (this.peekch() === Ch.Newline) this.consumeAny();
        break;

      case 0:
        break;

      case Ch.LowerZ:
        this.consume();
        while (isSpace(this.peekch())) this.consumeAny();
        break;

      default:
        this.consumeAny();
    }
  }

  private readQuotedString(): Lexeme {
    const start = this.position();

    const delimiter = this.peekch();

    this.consume();

    const startOffset = this.offset;

    while (this.peekch() !== delimiter) {
      switch (this.peekch()) {
        case 0:
        case Ch.CarriageReturn:
        case Ch.Newline:
          return Lexeme.make(new Location(start, this.position()), LexemeType.BrokenString);

        case Ch.Backslash:
          this.readBackslashInString();
          break;

        default:
          this.consume();
      }
    }

    this.consume();

    return Lexeme.withData(new Location(start, this.position()), LexemeType.QuotedString, this.buffer, startOffset, this.offset - startOffset - 1);
  }

  private readInterpolatedStringBegin(): Lexeme {
    const start = this.position();
    this.consume();

    return this.readInterpolatedStringSection(start, LexemeType.InterpStringBegin, LexemeType.InterpStringSimple);
  }

  private readInterpolatedStringSection(start: Position, formatType: number, endType: number): Lexeme {
    const startOffset = this.offset;

    while (this.peekch() !== Ch.Backtick) {
      switch (this.peekch()) {
        case 0:
        case Ch.CarriageReturn:
        case Ch.Newline:
          return Lexeme.make(new Location(start, this.position()), LexemeType.BrokenString);

        case Ch.Backslash:
          // Allow for \u{}, which would otherwise be consumed by looking for {
          if (this.peekch(1) === Ch.LowerU && this.peekch(2) === Ch.LeftBrace) {
            this.consume(); // backslash
            this.consume(); // u
            this.consume(); // {
            break;
          }

          this.readBackslashInString();
          break;

        case Ch.LeftBrace: {
          this.braceStack.push(BraceType.InterpolatedString);

          if (this.peekch(1) === Ch.LeftBrace) {
            const brokenDoubleBrace = Lexeme.withData(
              new Location(start, this.position()),
              LexemeType.BrokenInterpDoubleBrace,
              this.buffer,
              startOffset,
              this.offset - startOffset,
            );
            this.consume();
            this.consume();
            return brokenDoubleBrace;
          }

          this.consume();
          return Lexeme.withData(new Location(start, this.position()), formatType, this.buffer, startOffset, this.offset - startOffset - 1);
        }

        default:
          this.consume();
      }
    }

    this.consume();

    return Lexeme.withData(new Location(start, this.position()), endType, this.buffer, startOffset, this.offset - startOffset - 1);
  }

  private readNumber(start: Position, startOffset: number): Lexeme {
    // This function does not do the number parsing - it only skips a number-like pattern.
    // It uses the same logic as Lua stock lexer; the resulting string is later converted
    // to a number with proper verification.
    do {
      this.consume();
    } while (isDigit(this.peekch()) || this.peekch() === Ch.Dot || this.peekch() === Ch.Underscore);

    if (this.peekch() === Ch.LowerE || this.peekch() === Ch.UpperE) {
      this.consume();

      if (this.peekch() === Ch.Plus || this.peekch() === Ch.Minus) this.consume();
    }

    while (isAlpha(this.peekch()) || isDigit(this.peekch()) || this.peekch() === Ch.Underscore) this.consume();

    return Lexeme.withData(new Location(start, this.position()), LexemeType.Number, this.buffer, startOffset, this.offset - startOffset);
  }

  private readName(): [string | undefined, number] {
    const startOffset = this.offset;

    do this.consume();
    while (isAlpha(this.peekch()) || isDigit(this.peekch()) || this.peekch() === Ch.Underscore);

    const name = byteString(this.buffer, startOffset, this.offset);
    return this.readNames ? this.names.getOrAddWithType(name) : this.names.getWithType(name);
  }

  private readNext(): Lexeme {
    const start = this.position();

    switch (this.peekch()) {
      case 0:
        return Lexeme.make(locationOfLength(start, 0), LexemeType.Eof);

      case Ch.Minus: {
        if (this.peekch(1) === Ch.Greater) {
          this.consume();
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.SkinnyArrow);
        } else if (this.peekch(1) === Ch.Equals) {
          this.consume();
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.SubAssign);
        } else if (this.peekch(1) === Ch.Minus) {
          return this.readCommentBody();
        } else {
          this.consume();
          return Lexeme.make(locationOfLength(start, 1), Ch.Minus);
        }
      }

      case Ch.LeftBracket: {
        const sep = this.skipLongSeparator();

        if (sep >= 0) {
          return this.readLongString(start, sep, LexemeType.RawString, LexemeType.BrokenString);
        } else if (sep === -1) {
          return Lexeme.make(locationOfLength(start, 1), Ch.LeftBracket);
        } else {
          return Lexeme.make(new Location(start, this.position()), LexemeType.BrokenString);
        }
      }

      case Ch.LeftBrace: {
        this.consume();

        if (this.braceStack.length !== 0) this.braceStack.push(BraceType.Normal);

        return Lexeme.make(locationOfLength(start, 1), Ch.LeftBrace);
      }

      case Ch.RightBrace: {
        this.consume();

        if (this.braceStack.length === 0) {
          return Lexeme.make(locationOfLength(start, 1), Ch.RightBrace);
        }

        const braceStackTop = this.braceStack.pop()!;

        if (braceStackTop !== BraceType.InterpolatedString) {
          return Lexeme.make(locationOfLength(start, 1), Ch.RightBrace);
        }

        return this.readInterpolatedStringSection(start, LexemeType.InterpStringMid, LexemeType.InterpStringEnd);
      }

      case Ch.Equals: {
        this.consume();

        if (this.peekch() === Ch.Equals) {
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.Equal);
        } else return Lexeme.make(locationOfLength(start, 1), Ch.Equals);
      }

      case Ch.Less: {
        this.consume();

        if (this.peekch() === Ch.Equals) {
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.LessEqual);
        } else return Lexeme.make(locationOfLength(start, 1), Ch.Less);
      }

      case Ch.Greater: {
        this.consume();

        if (this.peekch() === Ch.Equals) {
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.GreaterEqual);
        } else return Lexeme.make(locationOfLength(start, 1), Ch.Greater);
      }

      case Ch.Tilde: {
        this.consume();

        if (this.peekch() === Ch.Equals) {
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.NotEqual);
        } else return Lexeme.make(locationOfLength(start, 1), Ch.Tilde);
      }

      case Ch.DoubleQuote:
      case Ch.SingleQuote:
        return this.readQuotedString();

      case Ch.Backtick:
        return this.readInterpolatedStringBegin();

      case Ch.Dot:
        this.consume();

        if (this.peekch() === Ch.Dot) {
          this.consume();

          if (this.peekch() === Ch.Dot) {
            this.consume();

            return Lexeme.make(locationOfLength(start, 3), LexemeType.Dot3);
          } else if (this.peekch() === Ch.Equals) {
            this.consume();

            return Lexeme.make(locationOfLength(start, 3), LexemeType.ConcatAssign);
          } else return Lexeme.make(locationOfLength(start, 2), LexemeType.Dot2);
        } else {
          if (isDigit(this.peekch())) {
            return this.readNumber(start, this.offset - 1);
          } else return Lexeme.make(locationOfLength(start, 1), Ch.Dot);
        }

      case Ch.Plus:
        this.consume();

        if (this.peekch() === Ch.Equals) {
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.AddAssign);
        } else return Lexeme.make(locationOfLength(start, 1), Ch.Plus);

      case Ch.Slash: {
        this.consume();

        const ch = this.peekch();

        if (ch === Ch.Equals) {
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.DivAssign);
        } else if (ch === Ch.Slash) {
          this.consume();

          if (this.peekch() === Ch.Equals) {
            this.consume();
            return Lexeme.make(locationOfLength(start, 3), LexemeType.FloorDivAssign);
          } else return Lexeme.make(locationOfLength(start, 2), LexemeType.FloorDiv);
        } else return Lexeme.make(locationOfLength(start, 1), Ch.Slash);
      }

      case Ch.Star:
        this.consume();

        if (this.peekch() === Ch.Equals) {
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.MulAssign);
        } else return Lexeme.make(locationOfLength(start, 1), Ch.Star);

      case Ch.Percent:
        this.consume();

        if (this.peekch() === Ch.Equals) {
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.ModAssign);
        } else return Lexeme.make(locationOfLength(start, 1), Ch.Percent);

      case Ch.Caret:
        this.consume();

        if (this.peekch() === Ch.Equals) {
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.PowAssign);
        } else return Lexeme.make(locationOfLength(start, 1), Ch.Caret);

      case Ch.Colon: {
        this.consume();
        if (this.peekch() === Ch.Colon) {
          this.consume();
          return Lexeme.make(locationOfLength(start, 2), LexemeType.DoubleColon);
        } else return Lexeme.make(locationOfLength(start, 1), Ch.Colon);
      }

      case Ch.LeftParen:
      case Ch.RightParen:
      case Ch.RightBracket:
      case Ch.Semicolon:
      case Ch.Comma:
      case Ch.Hash:
      case Ch.Question:
      case Ch.Ampersand:
      case Ch.Pipe: {
        const ch = this.peekch();
        this.consume();

        return Lexeme.make(locationOfLength(start, 1), ch);
      }

      case Ch.At: {
        if (this.peekch(1) === Ch.LeftBracket) {
          this.consume();
          this.consume();

          return Lexeme.make(locationOfLength(start, 2), LexemeType.AttributeOpen);
        } else {
          // consume @ first
          this.consume();

          if (isAlpha(this.peekch()) || this.peekch() === Ch.Underscore) {
            const attribute = this.readName();
            return Lexeme.withName(new Location(start, this.position()), LexemeType.Attribute, attribute[0]);
          } else {
            return Lexeme.withName(new Location(start, this.position()), LexemeType.Attribute, "");
          }
        }
      }

      default:
        if (isDigit(this.peekch())) {
          return this.readNumber(start, this.offset);
        } else if (isAlpha(this.peekch()) || this.peekch() === Ch.Underscore) {
          const name = this.readName();

          return Lexeme.withName(new Location(start, this.position()), name[1], name[0]);
        } else if (this.peekch() & 0x80) {
          return this.readUtf8Error();
        } else {
          const ch = this.peekch();
          this.consume();

          return Lexeme.make(locationOfLength(start, 1), ch);
        }
    }
  }

  private readUtf8Error(): Lexeme {
    const start = this.position();
    let codepoint = 0;
    let size = 0;

    if ((this.peekch() & 0b10000000) === 0b00000000) {
      size = 1;
      codepoint = this.peekch() & 0x7f;
    } else if ((this.peekch() & 0b11100000) === 0b11000000) {
      size = 2;
      codepoint = this.peekch() & 0b11111;
    } else if ((this.peekch() & 0b11110000) === 0b11100000) {
      size = 3;
      codepoint = this.peekch() & 0b1111;
    } else if ((this.peekch() & 0b11111000) === 0b11110000) {
      size = 4;
      codepoint = this.peekch() & 0b111;
    } else {
      this.consume();
      return Lexeme.make(new Location(start, this.position()), LexemeType.BrokenUnicode);
    }

    this.consume();

    for (let i = 1; i < size; ++i) {
      if ((this.peekch() & 0b11000000) !== 0b10000000) return Lexeme.make(new Location(start, this.position()), LexemeType.BrokenUnicode);

      codepoint = codepoint << 6;
      codepoint |= this.peekch() & 0b00111111;
      this.consume();
    }

    const result = Lexeme.make(new Location(start, this.position()), LexemeType.BrokenUnicode);
    result.codepoint = codepoint;
    return result;
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Thrown to abandon the parse (Luau's `ParseError`, as `ParseError::raise` throws it). */
class FatalParseError extends Error {
  constructor(
    readonly location: Location,
    message: string,
  ) {
    super(message);
  }

  static raise(location: Location, message: string): never {
    throw new FatalParseError(location, message);
  }
}

/** How a number constant parsed (Luau's `ConstantNumberParseResult`). */
const enum ConstantNumberParseResult {
  Ok,
  Imprecise,
  Malformed,
  BinOverflow,
  HexOverflow,
  IntOverflow,
}

/**
 * An integer constant such as `1i` (Luau's `AstExprConstantInteger`), which
 * `./Ast` has no class for: until it has one, the constant stands in as a
 * number constant holding the integer's value as a double, and keeps the
 * exact value and how it parsed.
 */
class AstExprConstantInteger extends AstExprConstantNumber {
  constructor(
    location: Location,
    readonly integerValue: bigint,
    readonly parseResult: ConstantNumberParseResult,
  ) {
    super(location, Number(integerValue));
  }
}

/** Luau's `Parser::Name`. */
interface Name {
  name: string;
  location: Location;
}

/** Luau's `Parser::Binding`. */
interface Binding {
  name: Name;
  annotation: AstType | undefined;
  isConst: boolean;
}

/** Luau's `Parser::Function`: what the parser tracks about each function it is in. */
class ParserFunction {
  vararg = false;
  loopDepth = 0;
}

/** Luau's `Parser::MatchLexeme`: a lexeme that a later one closes, as error messages name it. */
class MatchLexeme {
  readonly type: number;
  readonly position: Position;

  constructor(l: Lexeme) {
    this.type = l.type;
    this.position = l.location.begin;
  }
}

/** Luau's `Parser::BinaryOpPriority`. */
interface BinaryOpPriority {
  left: number;
  right: number;
}

/** Each binary operator's priorities, by `BinaryOp`. */
const kBinaryPriority: readonly BinaryOpPriority[] = [
  { left: 6, right: 6 }, // '+'
  { left: 6, right: 6 }, // '-'
  { left: 7, right: 7 }, // '*'
  { left: 7, right: 7 }, // '/'
  { left: 7, right: 7 }, // '//'
  { left: 7, right: 7 }, // `%'
  { left: 10, right: 9 }, // power (right associative)
  { left: 5, right: 4 }, // concat (right associative)
  { left: 3, right: 3 }, // inequality
  { left: 3, right: 3 }, // equality
  { left: 3, right: 3 }, // '<'
  { left: 3, right: 3 }, // '<='
  { left: 3, right: 3 }, // '>'
  { left: 3, right: 3 }, // '>='
  { left: 2, right: 2 }, // logical and
  { left: 1, right: 1 }, // logical or
];

type AttributeArgumentsValidator = (attrLoc: Location, args: AstExpr[]) => [Location, string][];

interface AttributeEntry {
  name: string;
  type: AstAttrType;
  argsValidator?: AttributeArgumentsValidator;
}

function deprecatedArgsValidator(attrLoc: Location, args: AstExpr[]): [Location, string][] {
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

const kAttributeEntries: readonly AttributeEntry[] = [
  { name: "checked", type: AstAttrType.Checked },
  { name: "native", type: AstAttrType.Native },
  { name: "deprecated", type: AstAttrType.Deprecated, argsValidator: deprecatedArgsValidator },
];

// Luau's `isConstantLiteral`, `isLiteralTable` and `getIdentifier`, from `Ast.cpp`.

function isConstantLiteral(expr: AstExpr): boolean {
  return (
    expr instanceof AstExprConstantNil ||
    expr instanceof AstExprConstantBool ||
    (expr instanceof AstExprConstantNumber && !(expr instanceof AstExprConstantInteger)) ||
    expr instanceof AstExprConstantString
  );
}

function isLiteralTable(expr: AstExpr): boolean {
  if (!(expr instanceof AstExprTable)) return false;

  for (const item of expr.items) {
    switch (item.kind) {
      case TableItemKind.General:
        return false;
      case TableItemKind.Record:
      case TableItemKind.List:
        if (!isConstantLiteral(item.value) && !isLiteralTable(item.value)) return false;
        break;
    }
  }
  return true;
}

function getIdentifier(node: AstExpr): string | undefined {
  if (node instanceof AstExprGlobal) return node.name;

  if (node instanceof AstExprLocal) return node.local.name;

  return undefined;
}

function shouldParseTypePack(lexer: Lexer): boolean {
  if (lexer.current().type === LexemeType.Dot3) return true;
  else if (lexer.current().type === LexemeType.Name && lexer.lookahead().type === LexemeType.Dot3) return true;

  return false;
}

function isStatLast(stat: AstStat): boolean {
  return stat instanceof AstStatBreak || stat instanceof AstStatContinue || stat instanceof AstStatReturn;
}

function isEnoughValues(values: AstExpr[], expected: number): boolean {
  if (values.length > 0) {
    const last = values[values.length - 1]!;
    if (last instanceof AstExprCall || last instanceof AstExprVarargs) return true;
  }
  return values.length === expected;
}

function isTypeFollow(c: number): boolean {
  return c === Ch.Pipe || c === Ch.Question || c === Ch.Ampersand;
}

/** Luau's `AstTypeList{types, tailType}`, with no `tailType` when the list has no tail. */
function typeList(types: AstType[], tailType: AstTypePack | undefined): AstTypeList {
  return tailType ? { types, tailType } : { types };
}

// Number constants. Luau reads them with C's `strtod`, `strtoull` and
// `strtoll`, which these emulate on the constant's text.

const ULLONG_MAX = (1n << 64n) - 1n;
const LLONG_MAX = (1n << 63n) - 1n;
const LLONG_MIN = -(1n << 63n);

/** The digit a character stands for in a base up to 36, or -1. */
function digitValue(ch: number): number {
  if (isDigit(ch)) return ch - Ch.Zero;
  if (isAlpha(ch)) return (ch | Ch.Space) - Ch.LowerA + 10;
  return -1;
}

/** The number C's integer conversions read from a text. */
interface ScannedInteger {
  /** The value of the digits, without the sign. */
  magnitude: bigint;
  negative: boolean;
  /** Where the number ends in the text: 0 when no number starts it. */
  end: number;
}

/** What C's `strtoull` and `strtoll` share: the digits in `base` at the start of `data`. */
function scanInteger(data: string, base: number): ScannedInteger {
  let i = 0;
  while (i < data.length && isSpace(data.charCodeAt(i))) i++;

  let negative = false;
  if (data[i] === "+" || data[i] === "-") {
    negative = data[i] === "-";
    i++;
  }

  // A base-16 number may start with 0x; the prefix counts only when a digit follows it.
  if (base === 16 && data[i] === "0" && (data[i + 1] === "x" || data[i + 1] === "X") && i + 2 < data.length) {
    if (isHexDigit(data.charCodeAt(i + 2))) i += 2;
  }

  const digitsStart = i;
  let magnitude = 0n;
  for (; i < data.length; i++) {
    const d = digitValue(data.charCodeAt(i));
    if (d < 0 || d >= base) break;
    magnitude = magnitude * BigInt(base) + BigInt(d);
  }

  if (i === digitsStart) return { magnitude: 0n, negative: false, end: 0 };
  return { magnitude, negative, end: i };
}

/** C's `strtoull`: the value (the largest one when it overflows, which C reports with `ERANGE`) and where it ends. */
function strtoull(data: string, base: number): { value: bigint; overflow: boolean; end: number } {
  const { magnitude, negative, end } = scanInteger(data, base);
  if (magnitude > ULLONG_MAX) return { value: ULLONG_MAX, overflow: true, end };
  return { value: negative ? -magnitude & ULLONG_MAX : magnitude, overflow: false, end };
}

/** C's `strtoll`: the value (the nearest limit when it overflows, which C reports with `ERANGE`) and where it ends. */
function strtoll(data: string, base: number): { value: bigint; overflow: boolean; end: number } {
  const { magnitude, negative, end } = scanInteger(data, base);
  const value = negative ? -magnitude : magnitude;
  if (value > LLONG_MAX) return { value: LLONG_MAX, overflow: true, end };
  if (value < LLONG_MIN) return { value: LLONG_MIN, overflow: true, end };
  return { value, overflow: false, end };
}

/** C's `strtod` on the text of a number constant (which has no sign, spaces, or letters before its digits): the value and where it ends. */
function strtod(data: string): { value: number; end: number } {
  const match = /^(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(data);
  if (!match) return { value: 0, end: 0 };
  return { value: Number(match[0]), end: match[0].length };
}

function parseInteger(result: { value: number }, data: string, base: 2 | 16): ConstantNumberParseResult {
  // Some libc implementations accept an optional 0b prefix for base-2 parsing.
  // Binary literals have already had their leading 0b stripped by us.
  if (base === 2 && data[0] === "0" && (data[1] === "b" || data[1] === "B")) return ConstantNumberParseResult.Malformed;

  const parsed = strtoull(data, base);

  if (parsed.end !== data.length) return ConstantNumberParseResult.Malformed;

  result.value = Number(parsed.value);

  if (parsed.overflow) return base === 2 ? ConstantNumberParseResult.BinOverflow : ConstantNumberParseResult.HexOverflow;

  if (parsed.value >= 1n << 53n && BigInt(result.value) !== parsed.value) return ConstantNumberParseResult.Imprecise;

  return ConstantNumberParseResult.Ok;
}

function parseInteger64(result: { value: bigint }, data: string, base: 2 | 10 | 16): ConstantNumberParseResult {
  if (base === 10) {
    const parsed = strtoll(data, 10);
    result.value = parsed.value;

    if (parsed.end === 0 || data[parsed.end] !== "i" || parsed.end + 1 !== data.length) return ConstantNumberParseResult.Malformed;

    if ((result.value === LLONG_MIN || result.value === LLONG_MAX) && parsed.overflow) return ConstantNumberParseResult.IntOverflow;
  } else {
    if (base === 2 && data[0] === "0" && (data[1] === "b" || data[1] === "B")) return ConstantNumberParseResult.Malformed;

    // hex and binary literals represent bit patterns covering the full uint64 range
    const parsed = strtoull(data, base);

    if (parsed.end === 0 || data[parsed.end] !== "i" || parsed.end + 1 !== data.length) return ConstantNumberParseResult.Malformed;

    if (parsed.value === ULLONG_MAX && parsed.overflow)
      return base === 2 ? ConstantNumberParseResult.BinOverflow : ConstantNumberParseResult.HexOverflow;

    result.value = BigInt.asIntN(64, parsed.value);
  }

  return ConstantNumberParseResult.Ok;
}

function parseDouble(result: { value: number }, data: string): ConstantNumberParseResult {
  // binary literal
  if (data[0] === "0" && (data[1] === "b" || data[1] === "B") && data.length > 2) return parseInteger(result, data.slice(2), 2);

  // hexadecimal literal; pass in '0x' prefix, it's handled by 'strtoull'
  if (data[0] === "0" && (data[1] === "x" || data[1] === "X") && data.length > 2) return parseInteger(result, data, 16);

  const parsed = strtod(data);

  // trailing non-numeric characters
  if (parsed.end !== data.length) return ConstantNumberParseResult.Malformed;

  result.value = parsed.value;

  // for linting, we detect integer constants that are parsed imprecisely
  // since the check is expensive we only perform it when the number is larger than the precise integer range
  if (parsed.value >= 2 ** 53 && /^[0-9]*$/.test(data)) {
    // C's "%.0f" prints the double's exact value
    const repr = Number.isFinite(parsed.value) ? BigInt(parsed.value).toString() : "inf";

    if (repr !== data) return ConstantNumberParseResult.Imprecise;
  }

  return ConstantNumberParseResult.Ok;
}

/** Luau's `Parser`. */
class Parser {
  private readonly lexer: Lexer;

  private readonly hotcomments: HotComment[] = [];

  private hotcommentHeader = true;

  private recursionCounter = 0;

  /** The context the recursion counter last counted, for the message when the JavaScript stack runs out. */
  private recursionContext = "block";

  private readonly nameSelf: string;
  private readonly nameNumber: string;
  private readonly nameError: string;
  private readonly nameNil: string;

  private endMismatchSuspect: MatchLexeme;

  private readonly functionStack: ParserFunction[] = [];
  private typeFunctionDepth = 0;

  private readonly localMap = new Map<string, AstLocal | undefined>();
  private readonly localStack: AstLocal[] = [];

  private readonly parseErrors: ParseError[] = [];

  private readonly matchRecoveryStopOnToken: number[];

  private readonly declaredExportBindings = new Map<string, Location>();
  private hasModuleReturn = false;

  static parse(buffer: Uint8Array, bufferSize: number, names: AstNameTable, options: ParseOptions = {}): ParseResult {
    const p = new Parser(buffer, bufferSize, names, options);

    try {
      const root = p.parseChunk();

      return { root, errors: p.parseErrors, hotcomments: p.hotcomments };
    } catch (caught) {
      const err = caught instanceof FatalParseError ? caught : p.stackExhaustedError(caught);
      if (!err) throw caught;

      // when catching a fatal error, append it to the list of non-fatal errors and return
      p.parseErrors.push({ location: err.location, message: err.message });

      return { root: new AstStatBlock(new Location(), []), errors: p.parseErrors, hotcomments: [] };
    }
  }

  /**
   * Luau's recursion limit keeps its parser within the native stack, but a
   * JavaScript stack can run out below that limit (the deepest nesting of
   * calls or of local functions reaches it). The parse is then abandoned as
   * the limit abandons it, with the limit's message.
   */
  private stackExhaustedError(caught: unknown): FatalParseError | undefined {
    const stackExhausted = caught instanceof RangeError || (caught instanceof Error && caught.name === "InternalError");
    if (!stackExhausted) return undefined;

    return new FatalParseError(
      this.lexer.current().location,
      `Exceeded allowed recursion depth; simplify your ${this.recursionContext} to make the code compile`,
    );
  }

  private constructor(
    buffer: Uint8Array,
    bufferSize: number,
    names: AstNameTable,
    private readonly options: ParseOptions,
  ) {
    this.lexer = new Lexer(buffer, bufferSize, names);
    this.endMismatchSuspect = new MatchLexeme(Lexeme.make(new Location(), LexemeType.Eof));

    const top = new ParserFunction();
    top.vararg = true;

    this.functionStack.push(top);

    this.nameSelf = names.getOrAdd("self");
    this.nameNumber = names.getOrAdd("number");
    this.nameError = names.getOrAdd(kParseNameError);
    this.nameNil = names.getOrAdd("nil"); // nil is a reserved keyword

    this.matchRecoveryStopOnToken = new Array<number>(LexemeType.Reserved_END).fill(0);
    this.matchRecoveryStopOnToken[LexemeType.Eof] = 1;

    // required for lookahead() to work across a comment boundary and for nextLexeme() to work when captureComments is false
    this.lexer.setSkipComments(true);

    // read first lexeme (any hot comments get .header = true)
    this.nextLexeme();

    // all hot comments parsed after the first non-comment lexeme are special in that they don't affect type checking / linting mode
    this.hotcommentHeader = false;
  }

  /** Luau's `functionStack.back()`. */
  private currentFunction(): ParserFunction {
    return this.functionStack[this.functionStack.length - 1]!;
  }

  private blockFollow(l: Lexeme): boolean {
    return (
      l.type === LexemeType.Eof ||
      l.type === LexemeType.ReservedElse ||
      l.type === LexemeType.ReservedElseif ||
      l.type === LexemeType.ReservedEnd ||
      l.type === LexemeType.ReservedUntil
    );
  }

  private parseChunk(): AstStatBlock {
    const result = this.parseBlock();

    if (this.lexer.current().type !== LexemeType.Eof) this.expectAndConsumeFail(LexemeType.Eof, undefined);

    return result;
  }

  // chunk ::= {stat [`;']} [laststat [`;']]
  // block ::= chunk
  private parseBlock(): AstStatBlock {
    const localsBegin = this.saveLocals();

    const result = this.parseBlockNoScope();

    this.restoreLocals(localsBegin);

    return result;
  }

  private parseBlockNoScope(): AstStatBlock {
    const body: AstStat[] = [];

    const prevPosition = this.lexer.previousLocation().end;

    while (!this.blockFollow(this.lexer.current())) {
      const oldRecursionCount = this.recursionCounter;

      this.incrementRecursionCounter("block");

      const stat = this.parseStat();

      this.recursionCounter = oldRecursionCount;

      if (this.lexer.current().type === Ch.Semicolon) {
        this.nextLexeme();
        stat.hasSemicolon = true;
        stat.location = new Location(stat.location.begin, this.lexer.previousLocation().end);
      }

      body.push(stat);

      if (isStatLast(stat)) break;
    }

    const location = new Location(prevPosition, this.lexer.current().location.begin);

    return new AstStatBlock(location, body);
  }

  // stat ::=
  // varlist `=' explist |
  // functioncall |
  // do block end |
  // while exp do block end |
  // repeat block until exp |
  // if exp then block {elseif exp then block} [else block] end |
  // for binding `=' exp `,' exp [`,' exp] do block end |
  // for namelist in explist do block end |
  // function funcname funcbody |
  // attributes function funcname funcbody |
  // local function Name funcbody |
  // local attributes function Name funcbody |
  // local namelist [`=' explist]
  // laststat ::= return [explist] | break
  private parseStat(): AstStat {
    // guess the type from the token type
    switch (this.lexer.current().type) {
      case LexemeType.ReservedIf:
        return this.parseIf();
      case LexemeType.ReservedWhile:
        return this.parseWhile();
      case LexemeType.ReservedDo:
        return this.parseDo();
      case LexemeType.ReservedFor:
        return this.parseFor();
      case LexemeType.ReservedRepeat:
        return this.parseRepeat();
      case LexemeType.ReservedFunction:
        return this.parseFunctionStat([]);
      case LexemeType.ReservedLocal: {
        const start = this.lexer.current().location;
        return this.parseLocal(start, [], false);
      }
      case LexemeType.ReservedReturn:
        return this.parseReturn();
      case LexemeType.ReservedBreak:
        return this.parseBreak();
      case LexemeType.Attribute:
      case LexemeType.AttributeOpen:
        return this.parseAttributeStat();
      default:
    }

    const start = this.lexer.current().location;

    // we need to disambiguate a few cases, primarily assignment (lvalue = ...) vs statements-that-are calls
    const expr = this.parsePrimaryExpr(/* asStatement= */ true);

    if (expr instanceof AstExprCall) return new AstStatExpr(expr.location, expr);

    // if the next token is , or =, it's an assignment (, means it's an assignment with multiple variables)
    if (this.lexer.current().type === Ch.Comma || this.lexer.current().type === Ch.Equals) return this.parseAssignment(expr);

    // if the next token is a compound assignment operator, it's a compound assignment (these don't support multiple variables)
    const op = Parser.parseCompoundOp(this.lexer.current());
    if (op !== undefined) return this.parseCompoundAssignment(expr, op);

    // we know this isn't a call or an assignment; therefore it must be a context-sensitive keyword such as `type` or `continue`
    const ident = getIdentifier(expr);

    if (ident === "type") return this.parseTypeAlias(expr.location, /* exported= */ false);

    if (ident === "export") {
      const current = this.lexer.current();

      const isExportValue =
        current.type === LexemeType.ReservedLocal ||
        current.type === LexemeType.ReservedFunction ||
        (current.type === LexemeType.Name && current.name === "const");

      if (isExportValue) {
        return this.parseExportValue(expr.location, []);
      } else if (current.type === LexemeType.Name && current.name === "type") {
        this.nextLexeme();
        return this.parseTypeAlias(expr.location, /* exported= */ true);
      }
    }

    if (ident === "continue") return this.parseContinue(expr.location);

    if (ident === "const") return this.parseLocal(expr.location, [], true);

    if (this.options.allowDeclarationSyntax) {
      if (ident === "declare") return this.parseDeclaration(expr.location, []);
    }

    // skip unexpected symbol if lexer couldn't advance at all (statements are parsed in a loop)
    if (start.equals(this.lexer.current().location)) this.nextLexeme();

    return this.reportStatError(expr.location, [expr], [], "Incomplete statement: expected assignment or a function call");
  }

  // if exp then block {elseif exp then block} [else block] end
  private parseIf(): AstStat {
    const start = this.lexer.current().location;

    this.nextLexeme(); // if / elseif

    const cond = this.parseExpr();

    const matchThen = this.lexer.current();
    let thenLocation: Location | undefined;
    if (this.expectAndConsume(LexemeType.ReservedThen, "if statement")) thenLocation = matchThen.location;

    const thenbody = this.parseBlock();

    const elseInfo = { end: start, elseLocation: undefined as Location | undefined };
    const elsebody = this.parseElseBody(start, matchThen, thenbody, elseInfo);

    return new AstStatIf(Location.span(start, elseInfo.end), cond, thenbody, elsebody, thenLocation, elseInfo.elseLocation);
  }

  // Parse the trailing `{elseif exp then block} [else block] end` of `parseIf`; `out` receives the end of the statement and
  // the location of its `else` or `elseif`.
  private parseElseBody(
    start: Location,
    matchThen: Lexeme,
    thenbody: AstStatBlock,
    out: { end: Location; elseLocation: Location | undefined },
  ): AstStat | undefined {
    let elsebody: AstStat | undefined;
    out.end = start;
    out.elseLocation = undefined;

    if (this.lexer.current().type === LexemeType.ReservedElseif) {
      thenbody.hasEnd = true;
      const oldRecursionCount = this.recursionCounter;
      this.incrementRecursionCounter("elseif");
      out.elseLocation = this.lexer.current().location;
      elsebody = this.parseIf();
      out.end = elsebody.location;
      this.recursionCounter = oldRecursionCount;
    } else {
      let matchThenElse = matchThen;

      if (this.lexer.current().type === LexemeType.ReservedElse) {
        thenbody.hasEnd = true;
        out.elseLocation = this.lexer.current().location;
        matchThenElse = this.lexer.current();
        this.nextLexeme();

        const elseBlock = this.parseBlock();
        elseBlock.location = new Location(matchThenElse.location.end, elseBlock.location.end);
        elsebody = elseBlock;
      }

      out.end = this.lexer.current().location;

      const hasEnd = this.expectMatchEndAndConsume(LexemeType.ReservedEnd, new MatchLexeme(matchThenElse));

      if (elsebody) {
        if (elsebody instanceof AstStatBlock) elsebody.hasEnd = hasEnd;
      } else thenbody.hasEnd = hasEnd;
    }

    return elsebody;
  }

  // while exp do block end
  private parseWhile(): AstStat {
    const start = this.lexer.current().location;

    this.nextLexeme(); // while

    const cond = this.parseExpr();

    const matchDo = this.lexer.current();
    const hasDo = this.expectAndConsume(LexemeType.ReservedDo, "while loop");

    this.currentFunction().loopDepth++;

    const body = this.parseBlock();

    this.currentFunction().loopDepth--;

    const end = this.lexer.current().location;

    const hasEnd = this.expectMatchEndAndConsume(LexemeType.ReservedEnd, new MatchLexeme(matchDo));
    body.hasEnd = hasEnd;

    return new AstStatWhile(Location.span(start, end), cond, body, hasDo, matchDo.location);
  }

  // repeat block until exp
  private parseRepeat(): AstStat {
    const start = this.lexer.current().location;

    const matchRepeat = this.lexer.current();
    this.nextLexeme(); // repeat

    const localsBegin = this.saveLocals();

    this.currentFunction().loopDepth++;

    const body = this.parseBlockNoScope();

    this.currentFunction().loopDepth--;

    const hasUntil = this.expectMatchEndAndConsume(LexemeType.ReservedUntil, new MatchLexeme(matchRepeat));
    body.hasEnd = hasUntil;

    const cond = this.parseExpr();

    this.restoreLocals(localsBegin);

    return new AstStatRepeat(Location.span(start, cond.location), cond, body);
  }

  // do block end
  private parseDo(): AstStat {
    const start = this.lexer.current().location;

    const matchDo = this.lexer.current();
    this.nextLexeme(); // do

    const body = this.parseBlock();

    body.location = new Location(start.begin, body.location.end);

    const endLocation = this.lexer.current().location;
    body.hasEnd = this.expectMatchEndAndConsume(LexemeType.ReservedEnd, new MatchLexeme(matchDo));
    if (body.hasEnd) body.location = new Location(body.location.begin, endLocation.end);

    return body;
  }

  // break
  private parseBreak(): AstStat {
    const start = this.lexer.current().location;

    this.nextLexeme(); // break

    if (this.currentFunction().loopDepth === 0)
      return this.reportStatError(start, [], [new AstStatBreak(start)], "break statement must be inside a loop");

    return new AstStatBreak(start);
  }

  // continue
  private parseContinue(start: Location): AstStat {
    if (this.currentFunction().loopDepth === 0)
      return this.reportStatError(start, [], [new AstStatContinue(start)], "continue statement must be inside a loop");

    // note: the token is already parsed for us!

    return new AstStatContinue(start);
  }

  // for binding `=' exp `,' exp [`,' exp] do block end |
  // for bindinglist in explist do block end |
  private parseFor(): AstStat {
    const start = this.lexer.current().location;

    this.nextLexeme(); // for

    const varname = this.parseBinding();

    if (this.lexer.current().type === Ch.Equals) {
      this.nextLexeme();

      const from = this.parseExpr();

      this.expectAndConsume(Ch.Comma, "index range");

      const to = this.parseExpr();

      let step: AstExpr | undefined;

      if (this.lexer.current().type === Ch.Comma) {
        this.nextLexeme();

        step = this.parseExpr();
      }

      const matchDo = this.lexer.current();
      const hasDo = this.expectAndConsume(LexemeType.ReservedDo, "for loop");

      const localsBegin = this.saveLocals();

      this.currentFunction().loopDepth++;

      const variable = this.pushLocal(varname);

      const body = this.parseBlock();

      this.currentFunction().loopDepth--;

      this.restoreLocals(localsBegin);

      const end = this.lexer.current().location;

      const hasEnd = this.expectMatchEndAndConsume(LexemeType.ReservedEnd, new MatchLexeme(matchDo));
      body.hasEnd = hasEnd;

      return new AstStatFor(Location.span(start, end), variable, from, to, step, body, hasDo, matchDo.location);
    } else {
      const names: Binding[] = [varname];

      if (this.lexer.current().type === Ch.Comma) {
        this.nextLexeme();

        this.parseBindingList(names);
      }

      const inLocation = this.lexer.current().location;
      const hasIn = this.expectAndConsume(LexemeType.ReservedIn, "for loop");

      const values: AstExpr[] = [];
      this.parseExprList(values);

      const matchDo = this.lexer.current();
      const hasDo = this.expectAndConsume(LexemeType.ReservedDo, "for loop");

      const localsBegin = this.saveLocals();

      this.currentFunction().loopDepth++;

      const vars: AstLocal[] = [];

      for (const name of names) vars.push(this.pushLocal(name));

      const body = this.parseBlock();

      this.currentFunction().loopDepth--;

      this.restoreLocals(localsBegin);

      const end = this.lexer.current().location;

      const hasEnd = this.expectMatchEndAndConsume(LexemeType.ReservedEnd, new MatchLexeme(matchDo));
      body.hasEnd = hasEnd;

      return new AstStatForIn(Location.span(start, end), vars, values, body, hasIn, inLocation, hasDo, matchDo.location);
    }
  }

  // funcname ::= Name {`.' Name} [`:' Name]
  // `out` receives whether the name ends in a method name, and the last name, for the function's debug name.
  private parseFunctionName(out: { hasself: boolean; debugname: string }): AstExpr {
    if (this.lexer.current().type === LexemeType.Name) out.debugname = this.lexer.current().name!;

    // parse funcname into a chain of indexing operators
    let expr = this.parseNameExpr("function name");

    const oldRecursionCount = this.recursionCounter;

    while (this.lexer.current().type === Ch.Dot) {
      const opPosition = this.lexer.current().location.begin;
      this.nextLexeme();

      const name = this.parseName("field name");

      // while we could concatenate the name chain, for now let's just write the short name
      out.debugname = name.name;

      expr = new AstExprIndexName(Location.span(expr.location, name.location), expr, name.name, name.location, opPosition, ".");

      // note: while the parser isn't recursive here, we're generating recursive structures of unbounded depth
      this.incrementRecursionCounter("function name");
    }

    this.recursionCounter = oldRecursionCount;

    // finish with :
    if (this.lexer.current().type === Ch.Colon) {
      const opPosition = this.lexer.current().location.begin;
      this.nextLexeme();

      const name = this.parseName("method name");

      // while we could concatenate the name chain, for now let's just write the short name
      out.debugname = name.name;

      expr = new AstExprIndexName(Location.span(expr.location, name.location), expr, name.name, name.location, opPosition, ":");

      out.hasself = true;
    }

    return expr;
  }

  private isExprLValue(expr: AstExpr): boolean {
    return (
      (expr instanceof AstExprLocal && !expr.local.isConst) ||
      expr instanceof AstExprGlobal ||
      expr instanceof AstExprIndexExpr ||
      expr instanceof AstExprIndexName
    );
  }

  // function funcname funcbody
  private parseFunctionStat(attributes: AstAttr[]): AstStatFunction {
    const start = this.getAttributeStartLocation(attributes, this.lexer.current().location);

    const matchFunction = this.lexer.current();
    this.nextLexeme();

    const name = { hasself: false, debugname: "" };
    let expr = this.parseFunctionName(name);

    if (!this.isExprLValue(expr)) {
      expr = this.reportLValueError(expr);
    }

    this.matchRecoveryStopOnToken[LexemeType.ReservedEnd]!++;

    const body = this.parseFunctionBody(name.hasself, matchFunction, name.debugname, undefined, attributes)[0];

    this.matchRecoveryStopOnToken[LexemeType.ReservedEnd]!--;

    return new AstStatFunction(Location.span(start, body.location), expr, body);
  }

  private validateAttribute(loc: Location, attributeName: string, attributes: AstAttr[], args: AstExpr[]): AstAttrType | undefined {
    // check if the attribute name is valid
    let type: AstAttrType | undefined;
    let argsValidator: AttributeArgumentsValidator | undefined;

    for (const entry of kAttributeEntries) {
      if (attributeName === entry.name) {
        type = entry.type;
        argsValidator = entry.argsValidator;
        break;
      }
    }

    // Luau's debug attributes (`@debugnoinline`) are behind `DebugLuauNoInline`, which is off.

    if (type === undefined) {
      if (attributeName.length === 0) this.report(loc, "Attribute name is missing");
      else this.report(loc, `Invalid attribute '@${attributeName}'`);
    } else {
      // check that attribute is not duplicated
      for (const attr of attributes) {
        if (attr.type === type) this.report(loc, `Cannot duplicate attribute '@${attributeName}'`);
      }
      if (argsValidator) {
        const errorsToReport = argsValidator(loc, args);
        for (const [errorLoc, msg] of errorsToReport) {
          this.report(errorLoc, msg);
        }
      }
    }

    return type;
  }

  // attrlist = '@[' parattr {',' parattr} ']'
  private parseAttrList(attributes: AstAttr[]): void {
    const open = this.lexer.current();

    this.nextLexeme();

    if (this.lexer.current().type !== Ch.RightBracket) {
      while (true) {
        const name = this.parseName("attribute name");

        const nameLoc = name.location;
        const attrName = name.name;

        const argOpenType = this.lexer.current().type;

        if (
          argOpenType === LexemeType.RawString ||
          argOpenType === LexemeType.QuotedString ||
          argOpenType === Ch.LeftBrace ||
          argOpenType === Ch.LeftParen
        ) {
          const [args, argsLocation] = this.parseCallList();

          for (const arg of args) {
            if (!isConstantLiteral(arg) && !isLiteralTable(arg)) this.report(argsLocation, "Only literals can be passed as arguments for attributes");
          }

          const type = this.validateAttribute(nameLoc, attrName, attributes, args);

          attributes.push(new AstAttr(Location.span(nameLoc, argsLocation), type ?? AstAttrType.Unknown, args, attrName));
        } else {
          const type = this.validateAttribute(nameLoc, attrName, attributes, []);

          attributes.push(new AstAttr(nameLoc, type ?? AstAttrType.Unknown, [], attrName));
        }

        if (this.lexer.current().type === Ch.Comma) {
          this.nextLexeme();
        } else {
          break;
        }
      }
    } else {
      this.report(Location.span(open.location, this.lexer.current().location), "Attribute list cannot be empty");

      // autocomplete expects at least one unknown attribute.
      attributes.push(new AstAttr(Location.span(open.location, this.lexer.current().location), AstAttrType.Unknown, [], this.nameError));
    }

    this.expectMatchAndConsume(Ch.RightBracket, new MatchLexeme(open));
  }

  // attribute ::= '@' NAME
  private parseAttribute(attributes: AstAttr[]): void {
    const loc = this.lexer.current().location;

    const name = this.lexer.current().name!;
    const type = this.validateAttribute(loc, name, attributes, []);

    this.nextLexeme();

    attributes.push(new AstAttr(loc, type ?? AstAttrType.Unknown, [], name));
  }

  // attributes ::= {attribute}
  private parseAttributes(): AstAttr[] {
    const attributes: AstAttr[] = [];

    while (this.lexer.current().type === LexemeType.Attribute || this.lexer.current().type === LexemeType.AttributeOpen) {
      if (this.lexer.current().type === LexemeType.Attribute) this.parseAttribute(attributes);
      else this.parseAttrList(attributes);
    }

    return attributes;
  }

  // Without concrete syntax, Luau's `getAttributeStartLocation` has no attribute list positions to consult.
  private getAttributeStartLocation(attributes: AstAttr[], defaultLocation: Location): Location {
    if (attributes.length > 0) return attributes[0]!.location;
    else return defaultLocation;
  }

  // attributes local function Name funcbody
  // attributes function funcname funcbody
  // attributes `declare function' Name`(' [parlist] `)' [`:` Type]
  // declare Name '{' Name ':' attributes `(' [parlist] `)' [`:` Type] '}'
  private parseAttributeStat(): AstStat {
    const startLocation = this.lexer.current().location;

    const attributes = this.parseAttributes();

    const type = this.lexer.current().type;

    if (type === LexemeType.ReservedFunction) return this.parseFunctionStat(attributes);

    if (type === LexemeType.ReservedLocal)
      return this.parseLocal(this.getAttributeStartLocation(attributes, startLocation), attributes, false);

    if (type === LexemeType.Name) {
      if (this.lexer.current().name === "export") {
        this.nextLexeme();
        return this.parseExportValue(this.getAttributeStartLocation(attributes, startLocation), attributes);
      }

      if (this.lexer.current().name === "const") {
        this.nextLexeme();
        return this.parseLocal(this.getAttributeStartLocation(attributes, startLocation), attributes, true);
      }
      if (this.options.allowDeclarationSyntax && this.lexer.current().name === "declare") {
        const expr = this.parsePrimaryExpr(/* asStatement= */ true);
        return this.parseDeclaration(expr.location, attributes);
      }
    }

    return this.reportStatError(
      this.lexer.current().location,
      [],
      [],
      "Expected 'function', 'local function', 'const function', 'declare function' or a function type declaration after attribute, but got " +
        `${this.lexer.current().toString()} instead`,
    );
  }

  private parseLocal(start: Location, attributes: AstAttr[], isConst: boolean): AstStat {
    if (!isConst) this.nextLexeme(); // local

    if (this.lexer.current().type === LexemeType.ReservedFunction) {
      let matchFunction = this.lexer.current();
      this.nextLexeme();

      // matchFunction is only used for diagnostics; to make it suitable for detecting missed indentation between
      // `local function` and `end`, we patch the token to begin at the column where `local` starts
      if (matchFunction.location.begin.line === start.begin.line)
        matchFunction = matchFunction.withLocation(
          new Location(new Position(matchFunction.location.begin.line, start.begin.column), matchFunction.location.end),
        );

      const name = this.parseName("variable name");

      this.matchRecoveryStopOnToken[LexemeType.ReservedEnd]!++;

      const [body, variable] = this.parseFunctionBody(false, matchFunction, name.name, name, attributes, isConst);

      this.matchRecoveryStopOnToken[LexemeType.ReservedEnd]!--;

      const location = new Location(start.begin, body.location.end);

      return new AstStatLocalFunction(location, variable!, body, isConst);
    } else {
      if (attributes.length !== 0) {
        return this.reportStatError(
          this.lexer.current().location,
          [],
          [],
          `Expected 'function' after local declaration with attribute, but got ${this.lexer.current().toString()} instead`,
        );
      }

      this.matchRecoveryStopOnToken[Ch.Equals]!++;

      const names: Binding[] = [];
      this.parseBindingList(names, false, isConst);

      this.matchRecoveryStopOnToken[Ch.Equals]!--;

      const vars: AstLocal[] = [];

      const values: AstExpr[] = [];

      let equalsSignLocation: Location | undefined;

      if (this.lexer.current().type === Ch.Equals) {
        equalsSignLocation = this.lexer.current().location;

        this.nextLexeme();

        this.parseExprList(values);
      }

      for (const name of names) vars.push(this.pushLocal(name));

      const end = values.length === 0 ? this.lexer.previousLocation() : values[values.length - 1]!.location;

      const node = new AstStatLocal(Location.span(start, end), vars, values, equalsSignLocation, isConst);

      // It is a syntax error when a const declaration definitely does
      // not have enough values, for example:
      //
      //  const foo
      //  const bar, baz = 42
      //
      // Both error as there's probably user error (`foo` and `baz` can
      // only ever be `nil`). We report an error but return the
      // declaration as-is, as it's still reasonable syntactically.
      if (isConst && !isEnoughValues(values, vars.length)) this.report(node.location, "Missing initializer in const declaration");

      return node;
    }
  }

  // return [explist]
  private parseReturn(): AstStat {
    const start = this.lexer.current().location;

    this.nextLexeme();

    const list: AstExpr[] = [];

    if (!this.blockFollow(this.lexer.current()) && this.lexer.current().type !== Ch.Semicolon) this.parseExprList(list);

    const end = list.length === 0 ? start : list[list.length - 1]!.location;

    const node = new AstStatReturn(Location.span(start, end), list);

    if (this.functionStack.length === 1) {
      if (this.declaredExportBindings.size !== 0)
        this.report(node.location, "Exporting values is not compatible with top-level return (export/return conflict)");

      this.hasModuleReturn = true;
    }

    return node;
  }

  // type Name [`<' varlist `>'] `=' Type
  private parseTypeAlias(start: Location, exported: boolean): AstStat {
    // parsing a type function
    if (this.lexer.current().type === LexemeType.ReservedFunction) return this.parseTypeFunction(start, exported);

    // parsing a type alias

    // note: `type` token is already parsed for us, so we just need to parse the rest

    let name = this.parseNameOpt("type name");

    // Use error name if the name is missing
    if (!name) name = { name: this.nameError, location: this.lexer.current().location };

    const [generics, genericPacks] = this.parseGenericTypeList(/* withDefaultValues= */ true);

    this.expectAndConsume(Ch.Equals, "type alias");

    const type = this.parseType();

    return new AstStatTypeAlias(Location.span(start, type.location), name.name, name.location, generics, genericPacks, type, exported);
  }

  // type function Name `(' arglist `)' `=' funcbody `end'
  private parseTypeFunction(start: Location, exported: boolean): AstStat {
    const matchFn = this.lexer.current();
    this.nextLexeme();

    const errorsAtStart = this.parseErrors.length;

    // parse the name of the type function
    let fnName = this.parseNameOpt("type function name");
    if (!fnName) fnName = { name: this.nameError, location: this.lexer.current().location };

    this.matchRecoveryStopOnToken[LexemeType.ReservedEnd]!++;

    const oldTypeFunctionDepth = this.typeFunctionDepth;
    this.typeFunctionDepth = this.functionStack.length;

    const body = this.parseFunctionBody(/* hasself */ false, matchFn, fnName.name, undefined, [])[0];

    this.typeFunctionDepth = oldTypeFunctionDepth;

    this.matchRecoveryStopOnToken[LexemeType.ReservedEnd]!--;

    const hasErrors = this.parseErrors.length > errorsAtStart;

    return new AstStatTypeFunction(Location.span(start, body.location), fnName.name, fnName.location, body, exported, hasErrors);
  }

  private parseDeclaredExternTypeMethod(attributes: AstAttr[]): AstDeclaredExternTypeProperty {
    const start = this.lexer.current().location;

    this.nextLexeme();

    const fnName = this.parseName("function name");

    // Declared methods take no generics.
    const generics: AstGenericType[] = [];
    const genericPacks: AstGenericTypePack[] = [];

    const matchParen = new MatchLexeme(this.lexer.current());
    this.expectAndConsume(Ch.LeftParen, "function parameter list start");

    const args: Binding[] = [];

    let vararg = false;
    let varargAnnotation: AstTypePack | undefined;
    if (this.lexer.current().type !== Ch.RightParen) [vararg, , varargAnnotation] = this.parseBindingList(args, /* allowDot3 */ true);

    this.expectMatchAndConsume(Ch.RightParen, matchParen);

    let retTypes = this.parseOptionalReturnType();
    if (!retTypes) retTypes = new AstTypePackExplicit(this.lexer.current().location, typeList([], undefined));
    const end = this.lexer.previousLocation();

    const vars: AstType[] = [];
    const varNames: (AstArgumentName | undefined)[] = [];

    if (args.length === 0 || args[0]!.name.name !== "self" || args[0]!.annotation !== undefined) {
      return {
        name: fnName.name,
        nameLocation: fnName.location,
        ty: this.reportTypeError(Location.span(start, end), [], "'self' must be present as the unannotated first parameter"),
        isMethod: true,
        location: new Location(),
        access: AstTableAccess.ReadWrite,
      };
    }

    // Skip the first index.
    for (let i = 1; i < args.length; ++i) {
      const arg = args[i]!;
      varNames.push({ name: arg.name.name, location: arg.name.location });

      if (arg.annotation) vars.push(arg.annotation);
      else vars.push(this.reportTypeError(Location.span(start, end), [], "All declaration parameters aside from 'self' must be annotated"));
    }

    if (vararg && !varargAnnotation) this.report(start, "All declaration parameters aside from 'self' must be annotated");

    const fnType = new AstTypeFunction(
      Location.span(start, end),
      attributes,
      generics,
      genericPacks,
      typeList(vars, varargAnnotation),
      varNames,
      retTypes,
    );

    return {
      name: fnName.name,
      nameLocation: fnName.location,
      ty: fnType,
      isMethod: true,
      location: Location.span(start, end),
      access: AstTableAccess.ReadWrite,
    };
  }

  private parseDeclaration(start: Location, attributes: AstAttr[]): AstStat {
    // `declare` token is already parsed at this point

    if (attributes.length !== 0 && this.lexer.current().type !== LexemeType.ReservedFunction)
      return this.reportStatError(
        this.lexer.current().location,
        [],
        [],
        `Expected a function type declaration after attribute, but got ${this.lexer.current().toString()} instead`,
      );

    if (this.lexer.current().type === LexemeType.ReservedFunction) {
      this.nextLexeme();

      const globalName = this.parseName("global function name");
      const [generics, genericPacks] = this.parseGenericTypeList(/* withDefaultValues= */ false);

      const matchParen = new MatchLexeme(this.lexer.current());

      this.expectAndConsume(Ch.LeftParen, "global function declaration");

      const args: Binding[] = [];

      let vararg = false;
      let varargLocation = new Location();
      let varargAnnotation: AstTypePack | undefined;

      if (this.lexer.current().type !== Ch.RightParen)
        [vararg, varargLocation, varargAnnotation] = this.parseBindingList(args, /* allowDot3= */ true);

      this.expectMatchAndConsume(Ch.RightParen, matchParen);

      let retTypes = this.parseOptionalReturnType();
      if (!retTypes) retTypes = new AstTypePackExplicit(this.lexer.current().location, typeList([], undefined));
      const end = this.lexer.current().location;

      const vars: AstType[] = [];
      const varNames: AstArgumentName[] = [];

      for (const arg of args) {
        if (!arg.annotation) return this.reportStatError(Location.span(start, end), [], [], "All declaration parameters must be annotated");

        vars.push(arg.annotation);
        varNames.push({ name: arg.name.name, location: arg.name.location });
      }

      if (vararg && !varargAnnotation) return this.reportStatError(Location.span(start, end), [], [], "All declaration parameters must be annotated");

      return new AstStatDeclareFunction(
        Location.span(start, end),
        attributes,
        globalName.name,
        globalName.location,
        generics,
        genericPacks,
        typeList(vars, varargAnnotation),
        varNames,
        vararg,
        varargLocation,
        retTypes,
      );
    }
    // `declare class : T` is parsed as a global variable declaration whose name is `class`, not as a malformed class
    // declaration, which allows a global table like string/math/bit32 called `class`.
    //
    // Luau reads the current lexeme's `name` here whatever its type, so an attribute named `extern` counts, and the
    // messages below print what `Lexeme.nameAsCString` describes.
    else if (this.lexer.current().nameAsCString() === "extern") {
      if (this.lexer.current().nameAsCString() === "extern") {
        this.nextLexeme();
        if (this.lexer.current().nameAsCString() !== "type")
          return this.reportStatError(
            this.lexer.current().location,
            [],
            [],
            `Expected \`type\` keyword after \`extern\`, but got ${this.lexer.current().nameAsCString() ?? "(null)"} instead`,
          );
      }

      this.nextLexeme();

      const classStart = this.lexer.current().location;
      const className = this.parseName("type name");
      let superName: string | undefined;

      if (this.lexer.current().nameAsCString() === "extends") {
        this.nextLexeme();
        superName = this.parseName("supertype name").name;
      }

      if (this.lexer.current().nameAsCString() !== "with")
        this.report(
          this.lexer.current().location,
          "Expected `with` keyword before listing properties of the external type, but got " +
            `${this.lexer.current().nameAsCString() ?? "(null)"} instead`,
        );
      else this.nextLexeme();

      const props: AstDeclaredExternTypeProperty[] = [];
      let indexer: AstTableIndexer | undefined;

      while (this.lexer.current().type !== LexemeType.ReservedEnd) {
        let attributes: AstAttr[] = [];

        if (this.lexer.current().type === LexemeType.Attribute || this.lexer.current().type === LexemeType.AttributeOpen) {
          attributes = this.parseAttributes();

          if (this.lexer.current().type !== LexemeType.ReservedFunction)
            return this.reportStatError(
              this.lexer.current().location,
              [],
              [],
              `Expected a method type declaration after attribute, but got ${this.lexer.current().toString()} instead`,
            );
        }

        // There are two possibilities: Either it's a property or a function.
        if (this.lexer.current().type === LexemeType.ReservedFunction) {
          props.push(this.parseDeclaredExternTypeMethod(attributes));
        } else if (this.lexer.current().type === Ch.LeftBracket) {
          const begin = this.lexer.current();
          this.nextLexeme(); // [

          if (
            (this.lexer.current().type === LexemeType.RawString || this.lexer.current().type === LexemeType.QuotedString) &&
            this.lexer.lookahead().type === Ch.RightBracket
          ) {
            const nameBegin = this.lexer.current().location;
            const chars = this.parseCharArray();

            const nameEnd = this.lexer.previousLocation();

            this.expectMatchAndConsume(Ch.RightBracket, new MatchLexeme(begin));
            this.expectAndConsume(Ch.Colon, "property type annotation");
            const type = this.parseType();

            // since AstName contains a char*, it can't contain null
            const containsNull = chars !== undefined && chars.includes("\0");

            if (chars !== undefined && !containsNull) {
              props.push({
                name: chars,
                nameLocation: Location.span(nameBegin, nameEnd),
                ty: type,
                isMethod: false,
                location: Location.span(begin.location, this.lexer.previousLocation()),
                access: AstTableAccess.ReadWrite,
              });
            } else {
              this.report(begin.location, "String literal contains malformed escape sequence or \\0");
            }
          } else if (indexer) {
            // maybe we don't need to parse the entire badIndexer...
            // however, we either have { or [ to lint, not the entire table type or the bad indexer.
            const badIndexer = this.parseTableIndexer(AstTableAccess.ReadWrite, undefined, begin);

            // we lose all additional indexer expressions from the AST after error recovery here
            this.report(badIndexer.location, "Cannot have more than one indexer on an extern type");
          } else {
            indexer = this.parseTableIndexer(AstTableAccess.ReadWrite, undefined, begin);
          }
        } else {
          let access = AstTableAccess.ReadWrite;

          if (this.lexer.current().type === LexemeType.Name && this.lexer.lookahead().type !== Ch.Colon) {
            if (this.lexer.current().name === "read") {
              access = AstTableAccess.Read;
              this.lexer.next();
            } else if (this.lexer.current().name === "write") {
              access = AstTableAccess.Write;
              this.lexer.next();
            } else {
              this.report(this.lexer.current().location, `Expected blank or 'read' or 'write' attribute, got '${this.lexer.current().name}'`);
              this.lexer.next();
            }
          }

          const propStart = this.lexer.current().location;
          const propName = this.parseNameOpt("property name");

          if (!propName) break;

          this.expectAndConsume(Ch.Colon, "property type annotation");
          const propType = this.parseType();
          props.push({
            name: propName.name,
            nameLocation: propName.location,
            ty: propType,
            isMethod: false,
            location: Location.span(propStart, this.lexer.previousLocation()),
            access,
          });
        }
      }

      const classEnd = this.lexer.current().location;
      this.nextLexeme(); // skip past `end`

      return new AstStatDeclareExternType(Location.span(classStart, classEnd), className.name, superName, props, indexer);
    } else {
      const globalName = this.parseNameOpt("global variable name");
      if (globalName) {
        this.expectAndConsume(Ch.Colon, "global variable declaration");

        const type = this.parseType(/* in declaration context */ true);
        return new AstStatDeclareGlobal(Location.span(start, type.location), globalName.name, globalName.location, type);
      } else {
        return this.reportStatError(start, [], [], "declare must be followed by an identifier, 'function', or 'extern type'");
      }
    }
  }

  private reportLValueError(expr: AstExpr): AstExprError {
    if (expr instanceof AstExprLocal && expr.local.isConst) {
      return this.reportExprError(expr.location, [expr], `Variable '${expr.local.name}' is constant and may not be reassigned`);
    }

    return this.reportExprError(expr.location, [expr], "Assigned expression must be a variable or a field");
  }

  // varlist `=' explist
  private parseAssignment(initial: AstExpr): AstStat {
    if (!this.isExprLValue(initial)) initial = this.reportLValueError(initial);

    const vars: AstExpr[] = [initial];

    while (this.lexer.current().type === Ch.Comma) {
      this.nextLexeme();

      let expr = this.parsePrimaryExpr(/* asStatement= */ true);

      if (!this.isExprLValue(expr)) expr = this.reportLValueError(expr);

      vars.push(expr);
    }

    this.expectAndConsume(Ch.Equals, "assignment");

    const values: AstExpr[] = [];
    this.parseExprList(values);

    return new AstStatAssign(Location.span(initial.location, values[values.length - 1]!.location), vars, values);
  }

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

    if (attributes.length !== 0 && this.lexer.current().type !== LexemeType.ReservedFunction) {
      this.report(
        this.lexer.current().location,
        `Expected 'function' after export declaration with attribute, but got ${this.lexer.current().toString()} instead`,
      );
    }

    if (this.lexer.current().type === LexemeType.ReservedLocal) {
      const localKeywordLocation = this.lexer.current().location;

      if (this.lexer.lookahead().type === LexemeType.ReservedFunction) {
        this.report(start, "'export' must be followed by an identifier or 'function'; try removing 'local'");
        // still parse the function for error recovery
        return this.parseLocal(start, [], true);
      }

      return exportLocalStat(this.parseLocal(start, [], false), localKeywordLocation);
    } else if (this.lexer.current().type === LexemeType.ReservedFunction) {
      const funcStat = this.parseLocal(start, attributes, true);
      if (!(funcStat instanceof AstStatLocalFunction))
        // parseLocal returned a parse error
        return funcStat;

      const func = funcStat;

      if (!checkDuplicateExport(func.name.name, func.name.location))
        this.report(func.name.location, `Duplicate exported identifier '${func.name.name}'`);

      func.name.isExported = true;
      func.name.isConst = true;
      return func;
    } else if (this.lexer.current().type === LexemeType.Name && this.lexer.current().name === "const") {
      const constKeywordLocation = this.lexer.current().location;
      this.nextLexeme();

      if (this.lexer.current().type === LexemeType.ReservedFunction) {
        this.report(start, "'export' must be followed by an identifier or 'function'");
        // still parse the function for error recovery
        return this.parseLocal(start, [], true);
      }

      return exportLocalStat(this.parseLocal(start, [], true), constKeywordLocation);
    }

    return this.reportStatError(start, [], [], "'export' must be followed by an identifier or 'function'");
  }

  // var [`+=' | `-=' | `*=' | `/=' | `%=' | `^=' | `..='] exp
  private parseCompoundAssignment(initial: AstExpr, op: BinaryOp): AstStat {
    if (!this.isExprLValue(initial)) {
      initial = this.reportLValueError(initial);
    }

    this.nextLexeme();

    const value = this.parseExpr();

    return new AstStatCompoundAssign(Location.span(initial.location, value.location), op, initial, value);
  }

  private prepareFunctionArguments(start: Location, hasself: boolean, args: Binding[]): [AstLocal | undefined, AstLocal[]] {
    let self: AstLocal | undefined;

    if (hasself) self = this.pushLocal({ name: { name: this.nameSelf, location: start }, annotation: undefined, isConst: false });

    const vars: AstLocal[] = [];

    for (const arg of args) vars.push(this.pushLocal(arg));

    return [self, vars];
  }

  // funcbody ::= `(' [parlist] `)' [`:' ReturnType] block end
  // parlist ::= bindinglist [`,' `...'] | `...'
  private parseFunctionBody(
    hasself: boolean,
    matchFunction: Lexeme,
    debugname: string,
    localName: Name | undefined,
    attributes: AstAttr[],
    isConst = false,
  ): [AstExprFunction, AstLocal | undefined] {
    let start = matchFunction.location;

    if (attributes.length > 0) start = attributes[0]!.location;

    const [generics, genericPacks] = this.parseGenericTypeList(/* withDefaultValues= */ false);

    const matchParen = new MatchLexeme(this.lexer.current());
    this.expectAndConsume(Ch.LeftParen, "function");

    // `)` stops the search for a missing `}` in `parseTableType`, so that code with a table type missing its `}`,
    // like `function (t: { a: number  ) end`, still parses as (roughly) `function (t: { a: number }) end`.
    this.matchRecoveryStopOnToken[Ch.RightParen]!++;

    const args: Binding[] = [];

    let vararg = false;
    let varargLocation = new Location();
    let varargAnnotation: AstTypePack | undefined;

    if (this.lexer.current().type !== Ch.RightParen) {
      [vararg, varargLocation, varargAnnotation] = this.parseBindingList(args, /* allowDot3= */ true);
    }

    let argLocation: Location | undefined;

    if (matchParen.type === Ch.LeftParen && this.lexer.current().type === Ch.RightParen)
      argLocation = new Location(matchParen.position, this.lexer.current().location.end);

    this.expectMatchAndConsume(Ch.RightParen, matchParen, true);

    this.matchRecoveryStopOnToken[Ch.RightParen]!--;

    const typelist = this.parseOptionalReturnType();

    let funLocal: AstLocal | undefined;

    if (localName) {
      funLocal = this.pushLocal({ name: localName, annotation: undefined, isConst });
    }

    const localsBegin = this.saveLocals();

    const fun = new ParserFunction();
    fun.vararg = vararg;

    this.functionStack.push(fun);

    const [self, vars] = this.prepareFunctionArguments(start, hasself, args);

    const body = this.parseBlock();

    this.functionStack.pop();

    this.restoreLocals(localsBegin);

    const end = this.lexer.current().location;

    const hasEnd = this.expectMatchEndAndConsume(LexemeType.ReservedEnd, new MatchLexeme(matchFunction));
    body.hasEnd = hasEnd;

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

  // explist ::= {exp `,'} exp
  private parseExprList(result: AstExpr[]): void {
    result.push(this.parseExpr());

    while (this.lexer.current().type === Ch.Comma) {
      this.nextLexeme();

      if (this.lexer.current().type === Ch.RightParen) {
        this.report(this.lexer.current().location, "Expected expression after ',' but got ')' instead");
        break;
      }

      result.push(this.parseExpr());
    }
  }

  // binding ::= Name [`:` Type]
  private parseBinding(isConst = false): Binding {
    let name = this.parseNameOpt("variable name");

    // Use placeholder if the name is missing
    if (!name) name = { name: this.nameError, location: this.lexer.current().location };

    const annotation = this.parseOptionalType();

    return { name, annotation, isConst };
  }

  // bindinglist ::= (binding | `...') [`,' bindinglist]
  // Returns whether the list ends in `...`, the location of the `...`, and its annotation.
  private parseBindingList(result: Binding[], allowDot3 = false, isConst = false): [boolean, Location, AstTypePack | undefined] {
    while (true) {
      if (this.lexer.current().type === LexemeType.Dot3 && allowDot3) {
        const varargLocation = this.lexer.current().location;
        this.nextLexeme();

        let tailAnnotation: AstTypePack | undefined;
        if (this.lexer.current().type === Ch.Colon) {
          this.nextLexeme();
          tailAnnotation = this.parseVariadicArgumentTypePack();
        }

        return [true, varargLocation, tailAnnotation];
      }

      result.push(this.parseBinding(isConst));

      if (this.lexer.current().type !== Ch.Comma) break;
      this.nextLexeme();
    }

    return [false, new Location(), undefined];
  }

  private parseOptionalType(): AstType | undefined {
    if (this.lexer.current().type === Ch.Colon) {
      this.nextLexeme();
      return this.parseType();
    } else return undefined;
  }

  // TypeList ::= Type [`,' TypeList] | ...Type
  // Returns the variadic annotation, if it exists.
  private parseTypeList(result: AstType[], resultNames: (AstArgumentName | undefined)[]): AstTypePack | undefined {
    while (true) {
      if (shouldParseTypePack(this.lexer)) return this.parseTypePack();

      if (this.lexer.current().type === LexemeType.Name && this.lexer.lookahead().type === Ch.Colon) {
        // Fill in previous argument names with empty slots
        while (resultNames.length < result.length) resultNames.push(undefined);

        resultNames.push({ name: this.lexer.current().name!, location: this.lexer.current().location });
        this.nextLexeme();

        this.expectAndConsume(Ch.Colon);
      } else if (resultNames.length !== 0) {
        // If we have a type with named arguments, provide elements for all types
        resultNames.push(undefined);
      }

      result.push(this.parseType());
      if (this.lexer.current().type !== Ch.Comma) break;

      this.nextLexeme();

      if (this.lexer.current().type === Ch.RightParen) {
        this.report(this.lexer.current().location, "Expected type after ',' but got ')' instead");
        break;
      }
    }

    return undefined;
  }

  private parseOptionalReturnType(): AstTypePack | undefined {
    if (this.lexer.current().type === Ch.Colon || this.lexer.current().type === LexemeType.SkinnyArrow) {
      if (this.lexer.current().type === LexemeType.SkinnyArrow)
        this.report(this.lexer.current().location, "Function return type annotations are written after ':' instead of '->'");

      this.nextLexeme();

      const oldRecursionCount = this.recursionCounter;

      const result = this.parseReturnType();

      // At this point, if we find a , character, it indicates that there are multiple return types
      // in this type annotation, but the list wasn't wrapped in parentheses.
      if (this.lexer.current().type === Ch.Comma) {
        this.report(this.lexer.current().location, "Expected a statement, got ','; did you forget to wrap the list of return types in parentheses?");

        this.nextLexeme();
      }

      this.recursionCounter = oldRecursionCount;

      return result;
    }

    return undefined;
  }

  // ReturnType ::= Type | `(' TypeList `)'
  private parseReturnType(): AstTypePack {
    this.incrementRecursionCounter("type annotation");

    const begin = this.lexer.current();

    if (this.lexer.current().type !== Ch.LeftParen) {
      if (shouldParseTypePack(this.lexer)) {
        return this.parseTypePack();
      } else {
        const type = this.parseType();
        return new AstTypePackExplicit(type.location, typeList([type], undefined));
      }
    }

    this.nextLexeme(); // Consume '('

    this.matchRecoveryStopOnToken[LexemeType.SkinnyArrow]!++;

    const result: AstType[] = [];
    const resultNames: (AstArgumentName | undefined)[] = [];
    let varargAnnotation: AstTypePack | undefined;

    // possibly () -> ReturnType
    if (this.lexer.current().type !== Ch.RightParen) {
      varargAnnotation = this.parseTypeList(result, resultNames);
    }

    const location = Location.span(begin.location, this.lexer.current().location);
    this.expectMatchAndConsume(Ch.RightParen, new MatchLexeme(begin), true);

    this.matchRecoveryStopOnToken[LexemeType.SkinnyArrow]!--;

    if (this.lexer.current().type !== LexemeType.SkinnyArrow && resultNames.length === 0) {
      // If it turns out that it's just '(A)', it's possible that there are unions/intersections to follow, so fold over it.
      if (result.length === 1) {
        // A variadic tail after the single type does not stop the suffix from being parsed.
        let inner: AstType;

        if (varargAnnotation === undefined && isTypeFollow(this.lexer.current().type)) {
          inner = new AstTypeGroup(location, result[0]!);
        } else inner = result[0]!;

        const returnType = this.parseTypeSuffix(inner, begin.location);

        // If parseType parses nothing, then returnType->location.end only points at the last non-type-pack
        // type to successfully parse.  We need the span of the whole annotation.
        const endPos = result.length === 1 ? location.end : returnType.location.end;

        return new AstTypePackExplicit(new Location(location.begin, endPos), typeList([returnType], varargAnnotation));
      }

      return new AstTypePackExplicit(location, typeList(result, varargAnnotation));
    }

    const tail = this.parseFunctionTypeTail(begin, [], [], [], result, resultNames, varargAnnotation);

    return new AstTypePackExplicit(Location.span(location, tail.location), typeList([tail], undefined));
  }

  // TableIndexer ::= `[' Type `]' `:' Type
  private parseTableIndexer(access: AstTableAccess, accessLocation: Location | undefined, begin: Lexeme): AstTableIndexer {
    const index = this.parseType();

    this.expectMatchAndConsume(Ch.RightBracket, new MatchLexeme(begin));

    this.expectAndConsume(Ch.Colon, "table field");

    const result = this.parseType();

    return { indexType: index, resultType: result, location: Location.span(begin.location, result.location), access, accessLocation };
  }

  // TableProp ::= Name `:' Type
  // TablePropOrIndexer ::= TableProp | TableIndexer
  // PropList ::= TablePropOrIndexer {fieldsep TablePropOrIndexer} [fieldsep]
  // TableType ::= `{' PropList `}'
  private parseTableType(inDeclarationContext = false): AstType {
    this.incrementRecursionCounter("type annotation");

    const props: AstTableProp[] = [];
    let indexer: AstTableIndexer | undefined;

    const start = this.lexer.current().location;

    const matchBrace = new MatchLexeme(this.lexer.current());
    this.expectAndConsume(Ch.LeftBrace, "table type");

    while (this.lexer.current().type !== Ch.RightBrace) {
      let access = AstTableAccess.ReadWrite;
      let accessLocation: Location | undefined;

      if (this.lexer.current().type === LexemeType.Name && this.lexer.lookahead().type !== Ch.Colon) {
        if (this.lexer.current().name === "read") {
          accessLocation = this.lexer.current().location;
          access = AstTableAccess.Read;
          this.lexer.next();
        } else if (this.lexer.current().name === "write") {
          accessLocation = this.lexer.current().location;
          access = AstTableAccess.Write;
          this.lexer.next();
        }
      }

      if (this.lexer.current().type === Ch.LeftBracket) {
        const begin = this.lexer.current();
        this.nextLexeme(); // [

        if (
          (this.lexer.current().type === LexemeType.RawString || this.lexer.current().type === LexemeType.QuotedString) &&
          this.lexer.lookahead().type === Ch.RightBracket
        ) {
          const chars = this.parseCharArray();

          this.expectMatchAndConsume(Ch.RightBracket, new MatchLexeme(begin));
          this.expectAndConsume(Ch.Colon, "table field");

          const type = this.parseType();

          // since AstName contains a char*, it can't contain null
          const containsNull = chars !== undefined && chars.includes("\0");

          if (chars !== undefined && !containsNull) {
            props.push({ name: chars, location: begin.location, type, access, accessLocation });
          } else this.report(begin.location, "String literal contains malformed escape sequence or \\0");
        } else {
          if (indexer) {
            // maybe we don't need to parse the entire badIndexer...
            // however, we either have { or [ to lint, not the entire table type or the bad indexer.
            const badIndexer = this.parseTableIndexer(access, accessLocation, begin);

            // we lose all additional indexer expressions from the AST after error recovery here
            this.report(badIndexer.location, "Cannot have more than one table indexer");
          } else {
            indexer = this.parseTableIndexer(access, accessLocation, begin);
          }
        }
      } else if (
        props.length === 0 &&
        !indexer &&
        !(this.lexer.current().type === LexemeType.Name && this.lexer.lookahead().type === Ch.Colon)
      ) {
        const type = this.parseType();

        // array-like table type: {T} desugars into {[number]: T}
        const nullTypeLocation = locationOfLength(start.begin, 0);
        const index = new AstTypeReference(nullTypeLocation, undefined, this.nameNumber, undefined, nullTypeLocation);
        indexer = { indexType: index, resultType: type, location: type.location, access, accessLocation };
        break;
      } else {
        const name = this.parseNameOpt("table field");

        if (!name) break;

        this.expectAndConsume(Ch.Colon, "table field");

        const type = this.parseType(inDeclarationContext);

        props.push({ name: name.name, location: name.location, type, access, accessLocation });
      }

      if (this.lexer.current().type === Ch.Comma || this.lexer.current().type === Ch.Semicolon) {
        this.nextLexeme();
      } else {
        if (this.lexer.current().type !== Ch.RightBrace) break;
      }
    }

    let end = this.lexer.current().location;

    if (!this.expectMatchAndConsume(Ch.RightBrace, matchBrace, /* searchForMissing = */ true)) end = this.lexer.previousLocation();

    return new AstTypeTable(Location.span(start, end), props, indexer);
  }

  // ReturnType ::= Type | `(' TypeList `)'
  // FunctionType ::= [`<' varlist `>'] `(' [TypeList] `)' `->` ReturnType
  private parseFunctionType(allowPack: boolean, attributes: AstAttr[]): AstTypeOrPack {
    this.incrementRecursionCounter("type annotation");

    let forceFunctionType = this.lexer.current().type === Ch.Less;

    const begin = this.lexer.current();

    const [generics, genericPacks] = this.parseGenericTypeList(/* withDefaultValues= */ false);

    const parameterStart = this.lexer.current();

    this.expectAndConsume(Ch.LeftParen, "function parameters");

    this.matchRecoveryStopOnToken[LexemeType.SkinnyArrow]!++;

    const params: AstType[] = [];
    const names: (AstArgumentName | undefined)[] = [];
    let varargAnnotation: AstTypePack | undefined;

    if (this.lexer.current().type !== Ch.RightParen) {
      varargAnnotation = this.parseTypeList(params, names);
    }

    const closeArgsLocation = this.lexer.current().location;
    this.expectMatchAndConsume(Ch.RightParen, new MatchLexeme(parameterStart), true);

    this.matchRecoveryStopOnToken[LexemeType.SkinnyArrow]!--;

    const paramTypes = params;

    if (names.length !== 0) forceFunctionType = true;

    const returnTypeIntroducer = this.lexer.current().type === LexemeType.SkinnyArrow || this.lexer.current().type === Ch.Colon;

    // Not a function at all. Just a parenthesized type. Or maybe a type pack with a single element
    if (params.length === 1 && !varargAnnotation && !forceFunctionType && !returnTypeIntroducer) {
      if (allowPack) {
        return { typePack: new AstTypePackExplicit(begin.location, typeList(paramTypes, undefined)) };
      } else {
        return { type: new AstTypeGroup(Location.span(parameterStart.location, closeArgsLocation), params[0]!) };
      }
    }

    if (!forceFunctionType && !returnTypeIntroducer && allowPack) {
      return { typePack: new AstTypePackExplicit(begin.location, typeList(paramTypes, varargAnnotation)) };
    }

    const paramNames = names;

    const node = this.parseFunctionTypeTail(begin, attributes, generics, genericPacks, paramTypes, paramNames, varargAnnotation);
    return { type: node };
  }

  private parseFunctionTypeTail(
    begin: Lexeme,
    attributes: AstAttr[],
    generics: AstGenericType[],
    genericPacks: AstGenericTypePack[],
    params: AstType[],
    paramNames: (AstArgumentName | undefined)[],
    varargAnnotation: AstTypePack | undefined,
  ): AstType {
    this.incrementRecursionCounter("type annotation");

    if (this.lexer.current().type === Ch.Colon) {
      this.report(this.lexer.current().location, "Return types in function type annotations are written after '->' instead of ':'");
      this.lexer.next();
    }
    // Users occasionally write '()' as the 'unit' type when they actually want to use 'nil', here we'll try to give a more specific error
    else if (this.lexer.current().type !== LexemeType.SkinnyArrow && generics.length === 0 && genericPacks.length === 0 && params.length === 0) {
      this.report(
        Location.span(begin.location, this.lexer.previousLocation()),
        "Expected '->' after '()' when parsing function type; did you mean 'nil'?",
      );

      return new AstTypeReference(begin.location, undefined, this.nameNil, undefined, begin.location);
    } else {
      this.expectAndConsume(LexemeType.SkinnyArrow, "function type");
    }

    const returnType = this.parseReturnType();

    const paramTypes = typeList(params, varargAnnotation);
    return new AstTypeFunction(
      Location.span(begin.location, returnType.location),
      attributes,
      generics,
      genericPacks,
      paramTypes,
      paramNames,
      returnType,
    );
  }

  // Type ::=
  //      nil |
  //      Name[`.' Name] [`<' namelist `>'] |
  //      `{' [PropList] `}' |
  //      `(' [TypeList] `)' `->` ReturnType
  //      `typeof` Type
  private parseTypeSuffix(type: AstType | undefined, begin: Location): AstType {
    const parts: AstType[] = [];

    if (type !== undefined) parts.push(type);

    this.incrementRecursionCounter("type annotation");

    let isUnion = false;
    let isIntersection = false;
    let optionalCount = 0;

    let location = begin;

    while (true) {
      const c = this.lexer.current().type;
      if (c === Ch.Pipe) {
        this.nextLexeme();

        const oldRecursionCount = this.recursionCounter;
        parts.push(this.parseSimpleType(/* allowPack= */ false).type!);
        this.recursionCounter = oldRecursionCount;

        isUnion = true;
      } else if (c === Ch.Question) {
        const loc = this.lexer.current().location;
        this.nextLexeme();

        parts.push(new AstTypeOptional(loc));
        optionalCount++;

        isUnion = true;
      } else if (c === Ch.Ampersand) {
        this.nextLexeme();

        const oldRecursionCount = this.recursionCounter;
        parts.push(this.parseSimpleType(/* allowPack= */ false).type!);
        this.recursionCounter = oldRecursionCount;

        isIntersection = true;
      } else if (c === LexemeType.Dot3) {
        this.report(this.lexer.current().location, "Unexpected '...' after type annotation");
        this.nextLexeme();
      } else break;

      if (parts.length > LuauTypeLengthLimit + optionalCount)
        FatalParseError.raise(
          parts[parts.length - 1]!.location,
          "Exceeded allowed type length; simplify your type annotation to make the code compile",
        );
    }

    if (parts.length === 1 && !isUnion && !isIntersection) return parts[0]!;
    if (isUnion && isIntersection) {
      return this.reportTypeError(
        Location.span(begin, parts[parts.length - 1]!.location),
        parts,
        "Mixing union and intersection types is not allowed; consider wrapping in parentheses.",
      );
    }

    location = new Location(location.begin, parts[parts.length - 1]!.location.end);

    if (isUnion) {
      return new AstTypeUnion(location, parts);
    }

    if (isIntersection) {
      return new AstTypeIntersection(location, parts);
    }

    FatalParseError.raise(begin, "Composite type was not an intersection or union.");
  }

  private parseSimpleTypeOrPack(): AstTypeOrPack {
    const oldRecursionCount = this.recursionCounter;
    // recursion counter is incremented in parseSimpleType

    const begin = this.lexer.current().location;

    const { type, typePack } = this.parseSimpleType(/* allowPack= */ true);

    if (typePack) {
      return { typePack };
    }

    this.recursionCounter = oldRecursionCount;

    return { type: this.parseTypeSuffix(type, begin) };
  }

  private parseType(inDeclarationContext = false): AstType {
    const oldRecursionCount = this.recursionCounter;
    // recursion counter is incremented in parseSimpleType and/or parseTypeSuffix

    const begin = this.lexer.current().location;

    let type: AstType | undefined;

    const c = this.lexer.current().type;
    if (c !== Ch.Pipe && c !== Ch.Ampersand) {
      type = this.parseSimpleType(/* allowPack= */ false, /* in declaration context */ inDeclarationContext).type;
      this.recursionCounter = oldRecursionCount;
    }

    const typeWithSuffix = this.parseTypeSuffix(type, begin);
    this.recursionCounter = oldRecursionCount;

    return typeWithSuffix;
  }

  // Type ::= nil | Name[`.' Name] [ `<' Type [`,' ...] `>' ] | `typeof' `(' expr `)' | `{' [PropList] `}'
  //   | [`<' varlist `>'] `(' [TypeList] `)' `->` ReturnType
  private parseSimpleType(allowPack: boolean, inDeclarationContext = false): AstTypeOrPack {
    this.incrementRecursionCounter("type annotation");

    const start = this.lexer.current().location;

    if (this.lexer.current().type === LexemeType.Attribute || this.lexer.current().type === LexemeType.AttributeOpen) {
      if (!inDeclarationContext) {
        return { type: this.reportTypeError(start, [], "attributes are not allowed in declaration context") };
      } else {
        const attributes = this.parseAttributes();
        return this.parseFunctionType(allowPack, attributes);
      }
    } else if (this.lexer.current().type === LexemeType.ReservedNil) {
      this.nextLexeme();
      return { type: new AstTypeReference(start, undefined, this.nameNil, undefined, start) };
    } else if (this.lexer.current().type === LexemeType.ReservedTrue) {
      this.nextLexeme();
      return { type: new AstTypeSingletonBool(start, true) };
    } else if (this.lexer.current().type === LexemeType.ReservedFalse) {
      this.nextLexeme();
      return { type: new AstTypeSingletonBool(start, false) };
    } else if (this.lexer.current().type === LexemeType.RawString || this.lexer.current().type === LexemeType.QuotedString) {
      const value = this.parseCharArray();
      if (value !== undefined) {
        return { type: new AstTypeSingletonString(start, value) };
      } else return { type: this.reportTypeError(start, [], "String literal contains malformed escape sequence") };
    } else if (this.lexer.current().type === LexemeType.InterpStringBegin || this.lexer.current().type === LexemeType.InterpStringSimple) {
      this.parseInterpString();

      return { type: this.reportTypeError(start, [], "Interpolated string literals cannot be used as types") };
    } else if (this.lexer.current().type === LexemeType.BrokenString) {
      this.nextLexeme();
      return { type: this.reportTypeError(start, [], "Malformed string; did you forget to finish it?") };
    } else if (this.lexer.current().type === LexemeType.Name) {
      let prefix: string | undefined;
      let prefixLocation: Location | undefined;
      let name = this.parseName("type name");

      if (this.lexer.current().type === Ch.Dot) {
        const prefixPointPosition = this.lexer.current().location.begin;
        this.nextLexeme();

        prefix = name.name;
        prefixLocation = name.location;

        name = this.parseIndexName("field name", prefixPointPosition);
      } else if (this.lexer.current().type === LexemeType.Dot3) {
        this.report(this.lexer.current().location, "Unexpected '...' after type name; type pack is not allowed in this context");
        this.nextLexeme();
      } else if (name.name === "typeof") {
        const typeofBegin = this.lexer.current();
        this.expectAndConsume(Ch.LeftParen, "typeof type");

        const expr = this.parseExpr();

        const end = this.lexer.current().location;

        this.expectMatchAndConsume(Ch.RightParen, new MatchLexeme(typeofBegin));

        return { type: new AstTypeTypeof(Location.span(start, end), expr) };
      }

      let hasParameters = false;
      let parameters: AstTypeOrPack[] = [];

      if (this.lexer.current().type === Ch.Less) {
        hasParameters = true;
        parameters = this.parseTypeParams();
      }

      const end = this.lexer.previousLocation();

      return { type: new AstTypeReference(Location.span(start, end), prefix, name.name, prefixLocation, name.location, hasParameters, parameters) };
    } else if (this.lexer.current().type === Ch.LeftBrace) {
      return { type: this.parseTableType(/* inDeclarationContext */ inDeclarationContext) };
    } else if (this.lexer.current().type === Ch.LeftParen || this.lexer.current().type === Ch.Less) {
      return this.parseFunctionType(allowPack, []);
    } else if (this.lexer.current().type === LexemeType.ReservedFunction) {
      this.nextLexeme();

      return {
        type: this.reportTypeError(
          start,
          [],
          "Using 'function' as a type annotation is not supported, consider replacing with a function type annotation e.g. '(...any) -> ...any'",
        ),
      };
    } else {
      // For a missing type annotation, capture 'space' between last token and the next one
      const astErrorlocation = new Location(this.lexer.previousLocation().end, start.begin);
      // The parse error includes the next lexeme to make it easier to display where the error is (e.g. in an IDE or a CLI error message).
      // Including the current lexeme also makes the parse error consistent with other parse errors returned by Luau.
      const parseErrorLocation = new Location(this.lexer.previousLocation().end, start.end);
      return {
        type: this.reportMissingTypeError(parseErrorLocation, astErrorlocation, `Expected type, got ${this.lexer.current().toString()}`),
      };
    }
  }

  private parseVariadicArgumentTypePack(): AstTypePack {
    // Generic: a...
    if (this.lexer.current().type === LexemeType.Name && this.lexer.lookahead().type === LexemeType.Dot3) {
      const name = this.parseName("generic name");
      const end = this.lexer.current().location;

      // This will not fail because of the lookahead guard.
      this.expectAndConsume(LexemeType.Dot3, "generic type pack annotation");
      return new AstTypePackGeneric(Location.span(name.location, end), name.name);
    }
    // Variadic: T
    else {
      const variadicAnnotation = this.parseType();
      return new AstTypePackVariadic(variadicAnnotation.location, variadicAnnotation);
    }
  }

  private parseTypePack(): AstTypePack {
    // Variadic: ...T
    if (this.lexer.current().type === LexemeType.Dot3) {
      const start = this.lexer.current().location;
      this.nextLexeme();
      const varargTy = this.parseType();
      return new AstTypePackVariadic(Location.span(start, varargTy.location), varargTy);
    }
    // Generic: a...
    else if (this.lexer.current().type === LexemeType.Name && this.lexer.lookahead().type === LexemeType.Dot3) {
      const name = this.parseName("generic name");
      const end = this.lexer.current().location;

      // This will not fail because of the lookahead guard.
      this.expectAndConsume(LexemeType.Dot3, "generic type pack annotation");
      return new AstTypePackGeneric(Location.span(name.location, end), name.name);
    }

    // Every caller checks shouldParseTypePack first.
    throw new Error("parseTypePack can't be called if shouldParseTypePack() returned false");
  }

  private static parseUnaryOp(l: Lexeme): UnaryOp | undefined {
    if (l.type === LexemeType.ReservedNot) return UnaryOp.Not;
    else if (l.type === Ch.Minus) return UnaryOp.Minus;
    else if (l.type === Ch.Hash) return UnaryOp.Len;
    else return undefined;
  }

  private static parseBinaryOp(l: Lexeme): BinaryOp | undefined {
    if (l.type === Ch.Plus) return BinaryOp.Add;
    else if (l.type === Ch.Minus) return BinaryOp.Sub;
    else if (l.type === Ch.Star) return BinaryOp.Mul;
    else if (l.type === Ch.Slash) return BinaryOp.Div;
    else if (l.type === LexemeType.FloorDiv) return BinaryOp.FloorDiv;
    else if (l.type === Ch.Percent) return BinaryOp.Mod;
    else if (l.type === Ch.Caret) return BinaryOp.Pow;
    else if (l.type === LexemeType.Dot2) return BinaryOp.Concat;
    else if (l.type === LexemeType.NotEqual) return BinaryOp.CompareNe;
    else if (l.type === LexemeType.Equal) return BinaryOp.CompareEq;
    else if (l.type === Ch.Less) return BinaryOp.CompareLt;
    else if (l.type === LexemeType.LessEqual) return BinaryOp.CompareLe;
    else if (l.type === Ch.Greater) return BinaryOp.CompareGt;
    else if (l.type === LexemeType.GreaterEqual) return BinaryOp.CompareGe;
    else if (l.type === LexemeType.ReservedAnd) return BinaryOp.And;
    else if (l.type === LexemeType.ReservedOr) return BinaryOp.Or;
    else return undefined;
  }

  private static parseCompoundOp(l: Lexeme): BinaryOp | undefined {
    if (l.type === LexemeType.AddAssign) return BinaryOp.Add;
    else if (l.type === LexemeType.SubAssign) return BinaryOp.Sub;
    else if (l.type === LexemeType.MulAssign) return BinaryOp.Mul;
    else if (l.type === LexemeType.DivAssign) return BinaryOp.Div;
    else if (l.type === LexemeType.FloorDivAssign) return BinaryOp.FloorDiv;
    else if (l.type === LexemeType.ModAssign) return BinaryOp.Mod;
    else if (l.type === LexemeType.PowAssign) return BinaryOp.Pow;
    else if (l.type === LexemeType.ConcatAssign) return BinaryOp.Concat;
    else return undefined;
  }

  private checkUnaryConfusables(): UnaryOp | undefined {
    const curr = this.lexer.current();

    // early-out: need to check if this is a possible confusable quickly
    if (curr.type !== Ch.Bang) return undefined;

    // slow path: possible confusable
    const start = curr.location;

    this.report(start, "Unexpected '!'; did you mean 'not'?");
    return UnaryOp.Not;
  }

  private checkBinaryConfusables(binaryPriority: readonly BinaryOpPriority[], limit: number): BinaryOp | undefined {
    const curr = this.lexer.current();

    // early-out: need to check if this is a possible confusable quickly
    if (curr.type !== Ch.Ampersand && curr.type !== Ch.Pipe && curr.type !== Ch.Bang) return undefined;

    // slow path: possible confusable
    const start = curr.location;
    const next = this.lexer.lookahead();

    if (
      curr.type === Ch.Ampersand &&
      next.type === Ch.Ampersand &&
      curr.location.end.equals(next.location.begin) &&
      binaryPriority[BinaryOp.And]!.left > limit
    ) {
      this.nextLexeme();
      this.report(Location.span(start, next.location), "Unexpected '&&'; did you mean 'and'?");
      return BinaryOp.And;
    } else if (
      curr.type === Ch.Pipe &&
      next.type === Ch.Pipe &&
      curr.location.end.equals(next.location.begin) &&
      binaryPriority[BinaryOp.Or]!.left > limit
    ) {
      this.nextLexeme();
      this.report(Location.span(start, next.location), "Unexpected '||'; did you mean 'or'?");
      return BinaryOp.Or;
    } else if (
      curr.type === Ch.Bang &&
      next.type === Ch.Equals &&
      curr.location.end.equals(next.location.begin) &&
      binaryPriority[BinaryOp.CompareNe]!.left > limit
    ) {
      this.nextLexeme();
      this.report(Location.span(start, next.location), "Unexpected '!='; did you mean '~='?");
      return BinaryOp.CompareNe;
    }

    return undefined;
  }

  // subexpr -> (asexp | unop subexpr) { binop subexpr }
  // where `binop' is any binary operator with a priority higher than `limit'
  private parseExpr(limit = 0): AstExpr {
    const binaryPriority = kBinaryPriority;

    const oldRecursionCount = this.recursionCounter;

    // this handles recursive calls to parseSubExpr/parseExpr
    this.incrementRecursionCounter("expression");

    const unaryPriority = 8;

    const start = this.lexer.current().location;

    let expr: AstExpr;

    let uop = Parser.parseUnaryOp(this.lexer.current());

    if (uop === undefined) uop = this.checkUnaryConfusables();

    if (uop !== undefined) {
      this.nextLexeme();

      const subexpr = this.parseExpr(unaryPriority);

      expr = new AstExprUnary(Location.span(start, subexpr.location), uop, subexpr);
    } else {
      expr = this.parseAssertionExpr();
    }

    // expand while operators have priorities higher than `limit'
    let op = Parser.parseBinaryOp(this.lexer.current());

    if (op === undefined) op = this.checkBinaryConfusables(binaryPriority, limit);

    while (op !== undefined && binaryPriority[op]!.left > limit) {
      this.nextLexeme();

      // read sub-expression with higher priority
      const next = this.parseExpr(binaryPriority[op]!.right);

      expr = new AstExprBinary(Location.span(start, next.location), op, expr, next);
      op = Parser.parseBinaryOp(this.lexer.current());

      if (op === undefined) op = this.checkBinaryConfusables(binaryPriority, limit);

      // note: while the parser isn't recursive here, we're generating recursive structures of unbounded depth
      this.incrementRecursionCounter("expression");
    }

    this.recursionCounter = oldRecursionCount;

    return expr;
  }

  // NAME
  private parseNameExpr(context?: string): AstExpr {
    const name = this.parseNameOpt(context);

    if (!name) return new AstExprError(this.lexer.current().location, [], this.parseErrors.length - 1);

    const local = this.localMap.get(name.name);

    if (local) {
      if (local.functionDepth < this.typeFunctionDepth)
        return this.reportExprError(this.lexer.current().location, [], `Type function cannot reference outer local '${local.name}'`);

      return new AstExprLocal(name.location, local, local.functionDepth !== this.functionStack.length - 1);
    }

    return new AstExprGlobal(name.location, name.name);
  }

  // prefixexp -> NAME | '(' expr ')'
  private parsePrefixExpr(): AstExpr {
    if (this.lexer.current().type === Ch.LeftParen) {
      const start = this.lexer.current().location.begin;

      const matchParen = new MatchLexeme(this.lexer.current());
      this.nextLexeme();

      const expr = this.parseExpr();

      let end = this.lexer.current().location.end;

      if (this.lexer.current().type !== Ch.RightParen) {
        const suggestion = this.lexer.current().type === Ch.Equals ? "; did you mean to use '{' when defining a table?" : undefined;

        this.expectMatchAndConsumeFail(Ch.RightParen, matchParen, suggestion);

        end = this.lexer.previousLocation().end;
      } else {
        this.nextLexeme();
      }

      return new AstExprGroup(new Location(start, end), expr);
    } else {
      return this.parseNameExpr("expression");
    }
  }

  // primaryexp -> prefixexp { `.' NAME | `[' exp `]' | `:' NAME funcargs | funcargs }
  private parsePrimaryExpr(asStatement: boolean): AstExpr {
    const start = this.lexer.current().location.begin;

    let expr = this.parsePrefixExpr();

    const oldRecursionCount = this.recursionCounter;

    while (true) {
      if (this.lexer.current().type === Ch.Dot) {
        const opPosition = this.lexer.current().location.begin;
        this.nextLexeme();

        const index = this.parseIndexName(undefined, opPosition);

        expr = new AstExprIndexName(new Location(start, index.location.end), expr, index.name, index.location, opPosition, ".");
      } else if (this.lexer.current().type === Ch.LeftBracket) {
        expr = this.parseIndexExpr(start, expr);
      } else if (this.lexer.current().type === Ch.Colon) {
        expr = this.parseMethodCall(start, expr);
      } else if (this.lexer.current().type === Ch.LeftParen) {
        // This error is handled inside 'parseFunctionArgs' as well, but for better error recovery we need to break out the current loop here
        if (!asStatement && expr.location.end.line !== this.lexer.current().location.begin.line) {
          this.reportAmbiguousCallError();
          break;
        }

        expr = this.parseFunctionArgs(expr, false);
      } else if (
        this.lexer.current().type === Ch.LeftBrace ||
        this.lexer.current().type === LexemeType.RawString ||
        this.lexer.current().type === LexemeType.QuotedString
      ) {
        expr = this.parseFunctionArgs(expr, false);
      } else if (this.lexer.current().type === Ch.Less && this.lexer.lookahead().type === Ch.Less) {
        expr = this.parseExplicitTypeInstantiationExpr(start, expr);
      } else {
        break;
      }

      // note: while the parser isn't recursive here, we're generating recursive structures of unbounded depth
      this.incrementRecursionCounter("expression");
    }

    this.recursionCounter = oldRecursionCount;

    return expr;
  }

  private parseIndexExpr(start: Position, expr: AstExpr): AstExpr {
    const matchBracket = new MatchLexeme(this.lexer.current());
    this.nextLexeme();

    const index = this.parseExpr();

    const end = this.lexer.current().location.end;

    this.expectMatchAndConsume(Ch.RightBracket, matchBracket);

    return new AstExprIndexExpr(new Location(start, end), expr, index);
  }

  private parseMethodCall(start: Position, expr: AstExpr): AstExpr {
    const opPosition = this.lexer.current().location.begin;
    this.nextLexeme();

    const index = this.parseIndexName("method name", opPosition);
    const func = new AstExprIndexName(new Location(start, index.location.end), expr, index.name, index.location, opPosition, ":");

    let typeArguments: AstTypeOrPack[] = [];

    if (this.lexer.current().type === Ch.Less && this.lexer.lookahead().type === Ch.Less) {
      typeArguments = this.parseTypeInstantiationExpr();
    }

    const call = this.parseFunctionArgs(func, true);

    // If we have an AstExprCall, fill in the type arguments
    if (call instanceof AstExprCall && typeArguments.length > 0) call.typeArguments = typeArguments;

    return call;
  }

  // asexp -> simpleexp [`::' Type]
  private parseAssertionExpr(): AstExpr {
    const start = this.lexer.current().location;
    const expr = this.parseSimpleExpr();

    if (this.lexer.current().type === LexemeType.DoubleColon) {
      this.nextLexeme();
      const annotation = this.parseType();
      return new AstExprTypeAssertion(Location.span(start, annotation.location), expr, annotation);
    } else return expr;
  }

  private parseAttributedFunction(start: Location): AstExpr {
    const attributes = this.parseAttributes();

    if (this.lexer.current().type !== LexemeType.ReservedFunction) {
      return this.reportExprError(start, [], `Expected 'function' declaration after attribute, but got ${this.lexer.current().toString()} instead`);
    }

    const matchFunction = this.lexer.current();
    this.nextLexeme();

    return this.parseFunctionBody(false, matchFunction, "", undefined, attributes, false)[0];
  }

  // simpleexp -> NUMBER | STRING | NIL | true | false | ... | constructor | [attributes] FUNCTION body | primaryexp
  private parseSimpleExpr(): AstExpr {
    const start = this.lexer.current().location;

    if (this.lexer.current().type === LexemeType.Attribute || this.lexer.current().type === LexemeType.AttributeOpen) {
      return this.parseAttributedFunction(start);
    }

    if (this.lexer.current().type === LexemeType.ReservedNil) {
      this.nextLexeme();

      return new AstExprConstantNil(start);
    } else if (this.lexer.current().type === LexemeType.ReservedTrue) {
      this.nextLexeme();

      return new AstExprConstantBool(start, true);
    } else if (this.lexer.current().type === LexemeType.ReservedFalse) {
      this.nextLexeme();

      return new AstExprConstantBool(start, false);
    } else if (this.lexer.current().type === LexemeType.ReservedFunction) {
      const matchFunction = this.lexer.current();
      this.nextLexeme();

      return this.parseFunctionBody(false, matchFunction, "", undefined, [], false)[0];
    } else if (this.lexer.current().type === LexemeType.Number) {
      return this.parseNumber();
    } else if (
      this.lexer.current().type === LexemeType.RawString ||
      this.lexer.current().type === LexemeType.QuotedString ||
      this.lexer.current().type === LexemeType.InterpStringSimple
    ) {
      return this.parseString();
    } else if (this.lexer.current().type === LexemeType.InterpStringBegin) {
      return this.parseInterpString();
    } else if (this.lexer.current().type === LexemeType.BrokenString) {
      this.nextLexeme();
      return this.reportExprError(start, [], "Malformed string; did you forget to finish it?");
    } else if (this.lexer.current().type === LexemeType.BrokenInterpDoubleBrace) {
      this.nextLexeme();
      return this.reportExprError(start, [], "Double braces are not permitted within interpolated strings; did you mean '\\{'?");
    } else if (this.lexer.current().type === LexemeType.Dot3) {
      if (this.currentFunction().vararg) {
        this.nextLexeme();

        return new AstExprVarargs(start);
      } else {
        this.nextLexeme();

        return this.reportExprError(start, [], "Cannot use '...' outside of a vararg function");
      }
    } else if (this.lexer.current().type === Ch.LeftBrace) {
      return this.parseTableConstructor();
    } else if (this.lexer.current().type === LexemeType.ReservedIf) {
      return this.parseIfElseExpr();
    } else {
      return this.parsePrimaryExpr(/* asStatement= */ false);
    }
  }

  // Returns the arguments, their location, and the location of the whole list.
  private parseCallList(): [AstExpr[], Location, Location] {
    if (this.lexer.current().type === Ch.LeftParen) {
      const argStart = this.lexer.current().location.end;

      const matchParen = new MatchLexeme(this.lexer.current());
      this.nextLexeme();

      const args: AstExpr[] = [];

      if (this.lexer.current().type !== Ch.RightParen) this.parseExprList(args);

      const end = this.lexer.current().location;
      const argEnd = end.end;

      this.expectMatchAndConsume(Ch.RightParen, matchParen);

      return [args, new Location(argStart, argEnd), new Location(matchParen.position, this.lexer.previousLocation().begin)];
    } else if (this.lexer.current().type === Ch.LeftBrace) {
      const argStart = this.lexer.current().location.end;
      const expr = this.parseTableConstructor();
      const argEnd = this.lexer.previousLocation().end;

      return [[expr], new Location(argStart, argEnd), expr.location];
    } else {
      const argLocation = this.lexer.current().location;
      const expr = this.parseString();
      return [[expr], argLocation, expr.location];
    }
  }

  // args ::=  `(' [explist] `)' | tableconstructor | String
  private parseFunctionArgs(func: AstExpr, self: boolean): AstExpr {
    if (this.lexer.current().type === Ch.LeftParen) {
      const argStart = this.lexer.current().location.end;
      if (func.location.end.line !== this.lexer.current().location.begin.line) this.reportAmbiguousCallError();

      const matchParen = new MatchLexeme(this.lexer.current());
      this.nextLexeme();

      const args: AstExpr[] = [];

      if (this.lexer.current().type !== Ch.RightParen) this.parseExprList(args);

      const end = this.lexer.current().location;
      const argEnd = end.end;

      this.expectMatchAndConsume(Ch.RightParen, matchParen);

      return new AstExprCall(Location.span(func.location, end), func, args, self, [], new Location(argStart, argEnd));
    } else if (this.lexer.current().type === Ch.LeftBrace) {
      const argStart = this.lexer.current().location.end;
      const expr = this.parseTableConstructor();
      const argEnd = this.lexer.previousLocation().end;

      return new AstExprCall(Location.span(func.location, expr.location), func, [expr], self, [], new Location(argStart, argEnd));
    } else if (this.lexer.current().type === LexemeType.RawString || this.lexer.current().type === LexemeType.QuotedString) {
      const argLocation = this.lexer.current().location;
      const expr = this.parseString();

      return new AstExprCall(Location.span(func.location, expr.location), func, [expr], self, [], argLocation);
    } else {
      return this.reportFunctionArgsError(func, self);
    }
  }

  private reportFunctionArgsError(func: AstExpr, self: boolean): AstExpr {
    if (self && this.lexer.current().location.begin.line !== func.location.end.line) {
      return this.reportExprError(func.location, [func], "Expected function call arguments after '('");
    } else {
      return this.reportExprError(
        new Location(func.location.begin, this.lexer.current().location.begin),
        [func],
        `Expected '(', '{' or <string> when parsing function call, got ${this.lexer.current().toString()}`,
      );
    }
  }

  private reportAmbiguousCallError(): void {
    this.report(
      this.lexer.current().location,
      "Ambiguous syntax: this looks like an argument list for a function call, but could also be a start of " +
        "new statement; use ';' to separate statements",
    );
  }

  // tableconstructor ::= `{' [fieldlist] `}'
  // fieldlist ::= field {fieldsep field} [fieldsep]
  // field ::= `[' exp `]' `=' exp | Name `=' exp | exp
  // fieldsep ::= `,' | `;'
  private parseTableConstructor(): AstExpr {
    const items: AstExprTableItem[] = [];

    const start = this.lexer.current().location;

    const matchBrace = new MatchLexeme(this.lexer.current());
    this.expectAndConsume(Ch.LeftBrace, "table literal");

    while (this.lexer.current().type !== Ch.RightBrace) {
      if (this.lexer.current().type === Ch.LeftBracket) {
        const matchLocationBracket = new MatchLexeme(this.lexer.current());
        this.nextLexeme();

        const key = this.parseExpr();

        this.expectMatchAndConsume(Ch.RightBracket, matchLocationBracket);

        this.expectAndConsume(Ch.Equals, "table field");

        const value = this.parseExpr();

        items.push({ kind: TableItemKind.General, key, value });
      } else if (this.lexer.current().type === LexemeType.Name && this.lexer.lookahead().type === Ch.Equals) {
        const name = this.parseName("table field");

        this.expectAndConsume(Ch.Equals, "table field");

        const key = new AstExprConstantString(name.location, name.name, QuoteStyle.Unquoted);
        const value = this.parseExpr();

        if (value instanceof AstExprFunction) value.debugname = name.name;

        items.push({ kind: TableItemKind.Record, key, value });
      } else {
        const expr = this.parseExpr();

        items.push({ kind: TableItemKind.List, key: undefined, value: expr });
      }

      if (this.lexer.current().type === Ch.Comma || this.lexer.current().type === Ch.Semicolon) {
        this.nextLexeme();
      } else if (this.lexer.current().type === Ch.LeftBracket || this.lexer.current().type === LexemeType.Name) {
        this.report(this.lexer.current().location, "Expected ',' after table constructor element");
      } else if (this.lexer.current().type !== Ch.RightBrace) {
        break;
      }
    }

    let end = this.lexer.current().location;

    if (!this.expectMatchAndConsume(Ch.RightBrace, matchBrace)) end = this.lexer.previousLocation();

    return new AstExprTable(Location.span(start, end), items);
  }

  private parseIfElseExpr(): AstExpr {
    let hasElse = false;
    const start = this.lexer.current().location;

    this.nextLexeme(); // skip if / elseif

    const condition = this.parseExpr();

    const hasThen = this.expectAndConsume(LexemeType.ReservedThen, "if then else expression");

    const trueExpr = this.parseExpr();
    let falseExpr: AstExpr;

    if (this.lexer.current().type === LexemeType.ReservedElseif) {
      const oldRecursionCount = this.recursionCounter;
      this.incrementRecursionCounter("expression");
      hasElse = true;
      falseExpr = this.parseIfElseExpr();
      this.recursionCounter = oldRecursionCount;
    } else {
      hasElse = this.expectAndConsume(LexemeType.ReservedElse, "if then else expression");
      falseExpr = this.parseExpr();
    }

    const end = falseExpr.location;

    return new AstExprIfElse(Location.span(start, end), condition, hasThen, trueExpr, hasElse, falseExpr);
  }

  // Name
  private parseNameOpt(context?: string): Name | undefined {
    if (this.lexer.current().type !== LexemeType.Name) {
      this.reportNameError(context);

      return undefined;
    }

    const result: Name = { name: this.lexer.current().name!, location: this.lexer.current().location };

    this.nextLexeme();

    return result;
  }

  private parseName(context?: string): Name {
    const name = this.parseNameOpt(context);
    if (name) return name;

    const location = this.lexer.current().location;

    return { name: this.nameError, location: new Location(location.begin, location.begin) };
  }

  private parseIndexName(context: string | undefined, previous: Position): Name {
    const name = this.parseNameOpt(context);
    if (name) return name;

    // If we have a reserved keyword next at the same line, assume it's an incomplete name
    if (
      this.lexer.current().type >= LexemeType.Reserved_BEGIN &&
      this.lexer.current().type < LexemeType.Reserved_END &&
      this.lexer.current().location.begin.line === previous.line
    ) {
      const result: Name = { name: this.lexer.current().name!, location: this.lexer.current().location };

      this.nextLexeme();

      return result;
    }

    const location = this.lexer.current().location;

    return { name: this.nameError, location: new Location(location.begin, location.begin) };
  }

  // `<' namelist `>'
  private parseGenericTypeList(withDefaultValues: boolean): [AstGenericType[], AstGenericTypePack[]] {
    const names: AstGenericType[] = [];
    const namePacks: AstGenericTypePack[] = [];

    if (this.lexer.current().type === Ch.Less) {
      const begin = this.lexer.current();
      this.nextLexeme();

      let seenPack = false;
      let seenDefault = false;

      while (true) {
        const nameLocation = this.lexer.current().location;
        const name = this.parseName().name;
        if (this.lexer.current().type === LexemeType.Dot3 || seenPack) {
          seenPack = true;

          if (this.lexer.current().type !== LexemeType.Dot3)
            this.report(this.lexer.current().location, "Generic types come before generic type packs");
          else this.nextLexeme();

          if (withDefaultValues && this.lexer.current().type === Ch.Equals) {
            seenDefault = true;
            this.nextLexeme();

            if (shouldParseTypePack(this.lexer)) {
              const typePack = this.parseTypePack();

              namePacks.push(new AstGenericTypePack(nameLocation, name, typePack));
            } else {
              const { type, typePack } = this.parseSimpleTypeOrPack();

              if (type) this.report(type.location, "Expected type pack after '=', got type");

              namePacks.push(new AstGenericTypePack(nameLocation, name, typePack));
            }
          } else {
            if (seenDefault) this.report(this.lexer.current().location, "Expected default type pack after type pack name");

            namePacks.push(new AstGenericTypePack(nameLocation, name, undefined));
          }
        } else {
          if (withDefaultValues && this.lexer.current().type === Ch.Equals) {
            seenDefault = true;
            this.nextLexeme();

            const defaultType = this.parseType();

            names.push(new AstGenericType(nameLocation, name, defaultType));
          } else {
            if (seenDefault) this.report(this.lexer.current().location, "Expected default type after type name");

            names.push(new AstGenericType(nameLocation, name, undefined));
          }
        }

        if (this.lexer.current().type === Ch.Comma) {
          this.nextLexeme();

          if (this.lexer.current().type === Ch.Greater) {
            this.report(this.lexer.current().location, "Expected type after ',' but got '>' instead");
            break;
          }
        } else break;
      }

      this.expectMatchAndConsume(Ch.Greater, new MatchLexeme(begin));
    }

    return [names, namePacks];
  }

  // `<' Type[, ...] `>'
  private parseTypeParams(): AstTypeOrPack[] {
    const parameters: AstTypeOrPack[] = [];

    if (this.lexer.current().type === Ch.Less) {
      const begin = this.lexer.current();
      this.nextLexeme();

      while (true) {
        if (shouldParseTypePack(this.lexer)) {
          const typePack = this.parseTypePack();
          parameters.push({ typePack });
        } else if (this.lexer.current().type === Ch.LeftParen) {
          const typeBegin = this.lexer.current().location;
          let type: AstType | undefined;
          let typePack: AstTypePack | undefined;
          const c = this.lexer.current().type;

          if (c !== Ch.Pipe && c !== Ch.Ampersand) {
            const typeOrTypePack = this.parseSimpleType(/* allowPack */ true, /* inDeclarationContext */ false);
            type = typeOrTypePack.type;
            typePack = typeOrTypePack.typePack;
          }

          // Consider the following type:
          //
          //  X<(T)>
          //
          // Is this a type pack or a parenthesized type? The
          // assumption will be a type pack, as that's what allows one
          // to express either a singular type pack or a potential
          // complex type.

          if (typePack) {
            if (
              typePack instanceof AstTypePackExplicit &&
              typePack.typeList.tailType === undefined &&
              typePack.typeList.types.length === 1 &&
              isTypeFollow(this.lexer.current().type)
            ) {
              // If we parsed an explicit type pack with a single
              // type in it (something of the form `(T)`), and
              // the next lexeme is one that follows a type
              // (&, |, ?), then assume that this was actually a
              // parenthesized type.
              const parenthesizedType = typePack.typeList.types[0]!;

              const typeGroup = new AstTypeGroup(parenthesizedType.location, parenthesizedType);

              parameters.push({ type: this.parseTypeSuffix(typeGroup, typeBegin) });
            } else {
              // Otherwise, it's a type pack.
              parameters.push({ typePack });
            }
          } else {
            // There's two cases in which `typePack` will be null:
            // - We try to parse a simple type or a type pack, and
            //   we get a simple type: there's no ambiguity and
            //   we attempt to parse a complex type.
            // - The next lexeme was a `|` or `&` indicating a
            //   union or intersection type with a leading
            //   separator. We just fall right into
            //   `parseTypeSuffix`, which allows its first
            //   argument to be `nullptr`
            parameters.push({ type: this.parseTypeSuffix(type, typeBegin) });
          }
        } else if (this.lexer.current().type === Ch.Greater && parameters.length === 0) {
          break;
        } else {
          parameters.push({ type: this.parseType() });
        }

        if (this.lexer.current().type === Ch.Comma) {
          this.nextLexeme();
        } else break;
      }

      this.expectMatchAndConsume(Ch.Greater, new MatchLexeme(begin));
    }

    return parameters;
  }

  // The string the current string lexeme stands for, with one character per byte, or undefined when an escape is
  // malformed; either way it moves past the lexeme.
  private parseCharArray(): string | undefined {
    const current = this.lexer.current();

    const scratchData = current.bytes();

    if (current.type === LexemeType.QuotedString || current.type === LexemeType.InterpStringSimple) {
      if (!Lexer.fixupQuotedString(scratchData)) {
        this.nextLexeme();
        return undefined;
      }
    } else {
      Lexer.fixupMultilineString(scratchData);
    }

    const value = byteString(scratchData, 0, scratchData.length);
    this.nextLexeme();
    return value;
  }

  private parseString(): AstExpr {
    const location = this.lexer.current().location;

    // The current lexeme is a QuotedString, an InterpStringSimple or a RawString.
    const style = this.lexer.current().type === LexemeType.RawString ? QuoteStyle.QuotedRaw : QuoteStyle.QuotedSimple;

    const value = this.parseCharArray();
    if (value !== undefined) {
      return new AstExprConstantString(location, value, style);
    } else return this.reportExprError(location, [], "String literal contains malformed escape sequence");
  }

  private parseInterpString(): AstExpr {
    const strings: string[] = [];
    const expressions: AstExpr[] = [];

    const startLocation = this.lexer.current().location;
    let endLocation: Location;

    do {
      const currentLexeme = this.lexer.current();

      endLocation = currentLexeme.location;

      const scratchData = currentLexeme.bytes();

      if (!Lexer.fixupQuotedString(scratchData)) {
        this.nextLexeme();
        return this.reportExprError(Location.span(startLocation, endLocation), [], "Interpolated string literal contains malformed escape sequence");
      }

      const chars = byteString(scratchData, 0, scratchData.length);

      this.nextLexeme();

      strings.push(chars);

      if (currentLexeme.type === LexemeType.InterpStringEnd || currentLexeme.type === LexemeType.InterpStringSimple) {
        break;
      }

      let errorWhileChecking = false;

      switch (this.lexer.current().type) {
        case LexemeType.InterpStringMid:
        case LexemeType.InterpStringEnd: {
          errorWhileChecking = true;
          this.nextLexeme();
          expressions.push(this.reportExprError(endLocation, [], "Malformed interpolated string, expected expression inside '{}'"));
          break;
        }
        case LexemeType.BrokenString: {
          errorWhileChecking = true;
          this.nextLexeme();
          expressions.push(this.reportExprError(endLocation, [], "Malformed interpolated string; did you forget to add a '`'?"));
          break;
        }
        default:
          expressions.push(this.parseExpr());
      }

      if (errorWhileChecking) {
        break;
      }

      switch (this.lexer.current().type) {
        case LexemeType.InterpStringBegin:
        case LexemeType.InterpStringMid:
        case LexemeType.InterpStringEnd:
          break;
        case LexemeType.BrokenInterpDoubleBrace:
          this.nextLexeme();
          return this.reportExprError(endLocation, [], "Double braces are not permitted within interpolated strings; did you mean '\\{'?");
        case LexemeType.BrokenString:
        case LexemeType.Eof: {
          // Luau moves past a broken string, then handles it as the end of the source.
          if (this.lexer.current().type === LexemeType.BrokenString) this.nextLexeme();

          const node = new AstExprInterpString(Location.span(startLocation, this.lexer.previousLocation()), strings, expressions);
          const top = this.lexer.peekBraceStackTop();
          if (top !== undefined) {
            // We are in a broken interpolated string, the top of the stack is non empty, we are missing '}'
            if (top === BraceType.InterpolatedString)
              this.report(this.lexer.previousLocation(), "Malformed interpolated string; did you forget to add a '}'?");
          } else {
            // We are in a broken interpolated string, the top of the stack is empty, we are missing '`'.
            this.report(this.lexer.previousLocation(), "Malformed interpolated string; did you forget to add a '`'?");
          }
          return node;
        }
        default:
          return this.reportExprError(endLocation, [], `Malformed interpolated string, got ${this.lexer.current().toString()}`);
      }
    } while (true);

    return new AstExprInterpString(Location.span(startLocation, endLocation), strings, expressions);
  }

  private parseExplicitTypeInstantiationExpr(start: Position, basedOnExpr: AstExpr): AstExpr {
    const endLocation = { value: new Location() };
    const typesOrPacks = this.parseTypeInstantiationExpr(endLocation);

    return new AstExprInstantiate(new Location(start, endLocation.value.end), basedOnExpr, typesOrPacks);
  }

  // TypeInstantiation ::= `<' `<' [TypeList] `>' `>'
  // `endLocationOut` receives the location of the closing `>`.
  private parseTypeInstantiationExpr(endLocationOut?: { value: Location }): AstTypeOrPack[] {
    const begin = this.lexer.current();
    this.lexer.next();

    const typeOrPacks = this.parseTypeParams();

    if (endLocationOut) {
      endLocationOut.value = this.lexer.current().location;
    }

    this.expectMatchAndConsume(Ch.Greater, new MatchLexeme(begin));
    return typeOrPacks;
  }

  private parseNumber(): AstExpr {
    const start = this.lexer.current().location;

    const bytes = this.lexer.current().bytes();

    // Remove all internal _ - they don't hold any meaning and this allows parsing code to just pass the string pointer to strtod et al
    const scratchData = byteString(bytes, 0, bytes.length).replaceAll("_", "");

    if (scratchData.endsWith("i")) {
      const value = { value: 0n };
      let result: ConstantNumberParseResult;
      if (scratchData.startsWith("0x") || scratchData.startsWith("0X"))
        result = parseInteger64(value, scratchData, 16); // pass in '0x' prefix, it's handled by strtoll
      else if (scratchData.startsWith("0b") || scratchData.startsWith("0B")) result = parseInteger64(value, scratchData.slice(2), 2);
      else result = parseInteger64(value, scratchData, 10);

      this.nextLexeme();

      if (result === ConstantNumberParseResult.Malformed) return this.reportExprError(start, [], "Malformed integer");

      if (result !== ConstantNumberParseResult.Ok) return this.reportExprError(start, [], "Integer overflow");

      return new AstExprConstantInteger(start, value.value, result);
    } else {
      const value = { value: 0 };
      const result = parseDouble(value, scratchData);
      this.nextLexeme();

      if (result === ConstantNumberParseResult.Malformed) return this.reportExprError(start, [], "Malformed number");

      // `./Ast` keeps no parse result on a number constant.
      return new AstExprConstantNumber(start, value.value);
    }
  }

  private pushLocal(binding: Binding): AstLocal {
    const name = binding.name;
    const shadow = this.localMap.get(name.name);

    const local = new AstLocal(
      name.name,
      name.location,
      /* shadow= */ shadow,
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

  // check that parser is at lexeme/symbol, move to next lexeme/symbol on success, report failure and continue on failure
  private expectAndConsume(type: number, context?: string): boolean {
    if (this.lexer.current().type !== type) return this.expectAndConsumeFailWithLookahead(type, context);

    this.nextLexeme();
    return true;
  }

  private expectAndConsumeFailWithLookahead(type: number, context: string | undefined): boolean {
    this.expectAndConsumeFail(type, context);

    // check if this is an extra token and the expected token is next
    if (this.lexer.lookahead().type === type) {
      // skip invalid and consume expected
      this.nextLexeme();
      this.nextLexeme();
    }

    return false;
  }

  private expectAndConsumeFail(type: number, context: string | undefined): void {
    const typeString = Lexeme.make(locationOfLength(new Position(0, 0), 0), type).toString();
    const currLexemeString = this.lexer.current().toString();

    if (context !== undefined) this.report(this.lexer.current().location, `Expected ${typeString} when parsing ${context}, got ${currLexemeString}`);
    else this.report(this.lexer.current().location, `Expected ${typeString}, got ${currLexemeString}`);
  }

  private expectMatchAndConsume(value: number, begin: MatchLexeme, searchForMissing = false): boolean {
    const type = value;

    if (this.lexer.current().type !== type) {
      this.expectMatchAndConsumeFail(type, begin);

      return this.expectMatchAndConsumeRecover(value, begin, searchForMissing);
    } else {
      this.nextLexeme();

      return true;
    }
  }

  private expectMatchAndConsumeRecover(value: number, _begin: MatchLexeme, searchForMissing: boolean): boolean {
    const type = value;

    if (searchForMissing) {
      // previous location is taken because 'current' lexeme is already the next token
      const currentLine = this.lexer.previousLocation().end.line;

      // search to the end of the line for expected token
      // we will also stop if we hit a token that can be handled by parsing function above the current one
      let lexemeType = this.lexer.current().type;

      while (currentLine === this.lexer.current().location.begin.line && lexemeType !== type && this.matchRecoveryStopOnToken[lexemeType] === 0) {
        this.nextLexeme();
        lexemeType = this.lexer.current().type;
      }

      if (lexemeType === type) {
        this.nextLexeme();

        return true;
      }
    } else {
      // check if this is an extra token and the expected token is next
      if (this.lexer.lookahead().type === type) {
        // skip invalid and consume expected
        this.nextLexeme();
        this.nextLexeme();

        return true;
      }
    }

    return false;
  }

  private expectMatchAndConsumeFail(type: number, begin: MatchLexeme, extra?: string): void {
    const typeString = Lexeme.make(locationOfLength(new Position(0, 0), 0), type).toString();
    const matchString = Lexeme.make(locationOfLength(new Position(0, 0), 0), begin.type).toString();

    const location = this.lexer.current().location;
    const got = `${this.lexer.current().toString()}${extra ?? ""}`;

    if (location.begin.line === begin.position.line)
      this.report(location, `Expected ${typeString} (to close ${matchString} at column ${begin.position.column + 1}), got ${got}`);
    else this.report(location, `Expected ${typeString} (to close ${matchString} at line ${begin.position.line + 1}), got ${got}`);
  }

  private expectMatchEndAndConsume(type: number, begin: MatchLexeme): boolean {
    if (this.lexer.current().type !== type) return this.expectMatchEndAndConsumeFailWithLookahead(type, begin);

    // If the token matches on a different line and a different column, it suggests misleading indentation
    // This can be used to pinpoint the problem location for a possible future actual mismatch
    if (
      this.lexer.current().location.begin.line !== begin.position.line &&
      this.lexer.current().location.begin.column !== begin.position.column &&
      this.endMismatchSuspect.position.line < begin.position.line // Only replace the previous suspect with more recent suspects
    ) {
      this.endMismatchSuspect = begin;
    }

    this.nextLexeme();

    return true;
  }

  private expectMatchEndAndConsumeFailWithLookahead(type: number, begin: MatchLexeme): boolean {
    if (this.endMismatchSuspect.type !== LexemeType.Eof && this.endMismatchSuspect.position.line > begin.position.line) {
      const matchString = Lexeme.make(locationOfLength(new Position(0, 0), 0), this.endMismatchSuspect.type).toString();
      const suggestion = `; did you forget to close ${matchString} at line ${this.endMismatchSuspect.position.line + 1}?`;

      this.expectMatchAndConsumeFail(type, begin, suggestion);
    } else {
      this.expectMatchAndConsumeFail(type, begin);
    }

    // check if this is an extra token and the expected token is next
    if (this.lexer.lookahead().type === type) {
      // skip invalid and consume expected
      this.nextLexeme();
      this.nextLexeme();

      return true;
    }

    return false;
  }

  private incrementRecursionCounter(context: string): void {
    this.recursionCounter++;
    this.recursionContext = context;

    if (this.recursionCounter > LuauRecursionLimit) {
      FatalParseError.raise(this.lexer.current().location, `Exceeded allowed recursion depth; simplify your ${context} to make the code compile`);
    }
  }

  private report(location: Location, message: string): void {
    // To reduce number of errors reported to user for incomplete statements, we skip multiple errors at the same location
    // For example, consider 'local a = (((b + ' where multiple tokens haven't been written yet
    const last = this.parseErrors[this.parseErrors.length - 1];
    if (last && location.equals(last.location)) return;

    // when limited to a single error, behave as if the error recovery is disabled
    if (LuauParseErrorLimit === 1) throw new FatalParseError(location, message);

    this.parseErrors.push({ location, message });

    // The parser keeps Luau's error limit (its `noErrorLimit` option is off).
    if (this.parseErrors.length >= LuauParseErrorLimit) FatalParseError.raise(location, `Reached error limit (${LuauParseErrorLimit})`);
  }

  private reportNameError(context: string | undefined): void {
    if (context !== undefined)
      this.report(this.lexer.current().location, `Expected identifier when parsing ${context}, got ${this.lexer.current().toString()}`);
    else this.report(this.lexer.current().location, `Expected identifier, got ${this.lexer.current().toString()}`);
  }

  private reportStatError(location: Location, expressions: AstExpr[], statements: AstStat[], message: string): AstStatError {
    this.report(location, message);

    return new AstStatError(location, expressions, statements, this.parseErrors.length - 1);
  }

  private reportExprError(location: Location, expressions: AstExpr[], message: string): AstExprError {
    this.report(location, message);

    return new AstExprError(location, expressions, this.parseErrors.length - 1);
  }

  private reportTypeError(location: Location, types: AstType[], message: string): AstTypeError {
    this.report(location, message);

    return new AstTypeError(location, types, false, this.parseErrors.length - 1);
  }

  // `parseErrorLocation` is associated with the parser error
  // `astErrorLocation` is associated with the AstTypeError created
  // It can be useful to have different error locations so that the parse error can include the next lexeme, while the AstTypeError can precisely
  // define the location (possibly of zero size) where a type annotation is expected.
  private reportMissingTypeError(parseErrorLocation: Location, astErrorLocation: Location, message: string): AstTypeError {
    this.report(parseErrorLocation, message);

    return new AstTypeError(astErrorLocation, [], true, this.parseErrors.length - 1);
  }

  private nextLexeme(): void {
    let type = this.lexer.next(/* skipComments= */ false, true).type;

    while (type === LexemeType.BrokenComment || type === LexemeType.Comment || type === LexemeType.BlockComment) {
      const lexeme = this.lexer.current();

      // Comment locations are not recorded (Luau's `captureComments` option is off).

      // A broken comment is recorded as a comment and is also passed to the parser as a lexeme, which turns it into a
      // syntax error.
      if (lexeme.type === LexemeType.BrokenComment) return;

      // Comments starting with ! are called "hot comments" and contain directives for type checking / linting / compiling
      if (lexeme.type === LexemeType.Comment && lexeme.getLength() && lexeme.dataByte(0) === Ch.Bang) {
        let end = lexeme.getLength();
        while (end > 0 && isSpace(lexeme.dataByte(end - 1))) --end;

        this.hotcomments.push({ header: this.hotcommentHeader, location: lexeme.location, content: byteString(lexeme.bytes(), 1, end) });
      }

      type = this.lexer.next(/* skipComments= */ false, /* updatePrevLocation= */ false).type;
    }
  }
}

// ---------------------------------------------------------------------------
// Confusables
// ---------------------------------------------------------------------------

let confusables: Map<number, string> | undefined;

/** The text a Unicode character may have been mistaken for (Luau's `findConfusable`). */
function findConfusable(codepoint: number): string | undefined {
  if (!confusables) {
    confusables = new Map();
    for (const [text, codepoints] of kConfusables) for (const cp of codepoints.split(" ")) confusables.set(Number(cp), text);
  }
  return confusables.get(codepoint);
}

/**
 * Luau's `kConfusables`, derived from http://www.unicode.org/Public/security/10.0.0/confusables.txt:
 * each entry is a text, then the code points (in decimal, separated by spaces)
 * of the characters that look like it.
 */
const kConfusables: readonly (readonly [string, string])[] = [
  ["\"", "34 698 733 750 758 1522 1524 7379 8220 8221 8223 8243 8246 12291 65282"],
  ["O", "48 927 1054 1365 1984 2534 2848 2918 4816 11422 11604 12295 42227 65327 66194 66219 66564 66754 66838 70864 71861 71904 119822 119874"],
  ["O", "119926 119978 120030 120082 120134 120186 120238 120290 120342 120394 120446 120502 120560 120618 120676 120734 120782 120792 120802"],
  ["O", "120812 120822"],
  ["l", "49 73 124 406 448 921 1030 1216 1472 1493 1503 1575 1633 1777 1994 5825 8464 8465 8467 8544 8572 8739 9213 11410 11599 42226 65165 65166"],
  ["l", "65321 65356 65512 66186 66313 66336 93992 119816 119845 119868 119897 119920 119949 120001 120024 120053 120105 120128 120157 120180"],
  ["l", "120209 120232 120261 120284 120313 120336 120365 120388 120417 120440 120469 120496 120554 120612 120670 120728 120783 120793 120803"],
  ["l", "120813 120823 125127 126464 126592"],
  ["'", "96 180 697 699 700 701 702 712 714 715 756 884 900 1370 1373 1497 1523 2036 2037 5194 5836 8125 8127 8175 8189 8190 8216 8217 8219 8242"],
  ["'", "8245 42892 65287 65344 94033 94034"],
  ["rn", "109 8575 71424 71907 119846 119898 119950 120002 120054 120106 120158 120210 120262 120314 120366 120418 120470"],
  [" ", "160 5760 8192 8193 8194 8195 8196 8197 8198 8199 8200 8201 8202 8232 8233 8239 8287"],
  [",", "184 1549 1643 8218 42233"],
  ["AE", "198 1236"],
  ["x", "215 1093 5441 5501 5742 8569 10539 10540 10799 65368 119857 119909 119961 120013 120065 120117 120169 120221 120273 120325 120377 120429"],
  ["x", "120481"],
  ["ae", "230 1237"],
  ["i", "305 617 618 731 890 953 1110 1231 5029 8126 8505 8520 8560 9075 42567 43893 65353 71875 119842 119894 119946 119998 120050 120102 120154"],
  ["i", "120206 120258 120310 120362 120414 120466 120484 120522 120580 120638 120696 120754"],
  ["lJ", "306"],
  ["ij", "307"],
  ["'n", "329"],
  ["OE", "338"],
  ["oe", "339"],
  ["f", "383 1412 7837 42905 43829 119839 119891 119943 119995 120047 120099 120151 120203 120255 120307 120359 120411 120463"],
  ["'B", "385"],
  ["b", "388 1068 5071 5551 119835 119887 119939 119991 120043 120095 120147 120199 120251 120303 120355 120407 120459"],
  ["C'", "391"],
  ["'D", "394"],
  ["g", "397 609 1409 7555 8458 65351 119840 119892 119944 120048 120100 120152 120204 120256 120308 120360 120412 120464"],
  ["G'", "403"],
  ["K'", "408"],
  ["O'", "416 5028"],
  ["o'", "417"],
  ["'P", "420"],
  ["R", "422 5025 5074 5511 8475 8476 8477 42211 66740 94005 119318 119825 119877 119929 120033 120189 120241 120293 120345 120397 120449"],
  ["2", "423 1000 5311 42564 42735 42842 120784 120794 120804 120814 120824"],
  ["'T", "428"],
  ["'Y", "435"],
  ["3", "439 540 1047 1248 11468 42858 42923 71882 94011 119302 120785 120795 120805 120815 120825"],
  ["5", "444 71867 120787 120797 120807 120817 120827"],
  ["s", "445 1109 42801 43946 65363 66632 71873 119852 119904 119956 120008 120060 120112 120164 120216 120268 120320 120372 120424 120476"],
  ["ll", "449 1520 8214 8545 8741"],
  ["!", "451 11601 65281"],
  ["LJ", "455"],
  ["Lj", "456"],
  ["lj", "457"],
  ["NJ", "458"],
  ["Nj", "459"],
  ["nj", "460"],
  ["DZ", "497"],
  ["Dz", "498"],
  ["dz", "499 675"],
  ["8", "546 547 2538 2666 2819 66330 120790 120800 120810 120820 120830 125131"],
  ["?", "577 660 2429 5038 42731"],
  ["a", "593 945 1072 9082 65345 119834 119886 119938 119990 120042 120094 120146 120198 120250 120302 120354 120406 120458 120514 120572 120630"],
  ["a", "120688 120746"],
  ["y", "611 655 947 1091 1199 4327 7564 7935 8509 43866 65369 71900 119858 119910 119962 120014 120066 120118 120170 120222 120274 120326 120378"],
  ["y", "120430 120482 120516 120574 120632 120690 120748"],
  ["w", "623 1121 1309 1377 7457 43907 71434 71438 71439 119856 119908 119960 120012 120064 120116 120168 120220 120272 120324 120376 120428"],
  ["w", "120480"],
  ["u", "651 965 1405 7452 42911 43854 43858 66806 71896 119854 119906 119958 120010 120062 120114 120166 120218 120270 120322 120374 120426"],
  ["u", "120478 120534 120592 120650 120708 120766"],
  ["ts", "678"],
  ["ls", "682"],
  ["lz", "683"],
  ["<", "706 5176 5810 8249 10094 119350"],
  [">", "707 5171 8250 10095 94015 119351"],
  ["^", "708 710"],
  [":", "720 760 1417 1475 1795 1796 2307 2691 5868 6147 6153 8282 8758 42237 42889 65072 65306"],
  ["-", "727 1748 8208 8209 8210 8211 8259 8722 10134 11450 65112"],
  ["~", "732 8128 8275 8764"],
  [";", "894"],
  ["J", "895 1032 5035 5261 42201 42930 65322 119817 119869 119921 119973 120025 120077 120129 120181 120233 120285 120337 120389 120441"],
  ["A", "913 1040 5034 5573 42222 65313 66208 94016 119808 119860 119912 119964 120016 120068 120120 120172 120224 120276 120328 120380 120432"],
  ["A", "120488 120546 120604 120662 120720"],
  ["B", "914 1042 5108 5623 8492 42192 42932 65314 66178 66209 66305 119809 119861 119913 120017 120069 120121 120173 120225 120277 120329 120381"],
  ["B", "120433 120489 120547 120605 120663 120721"],
  ["E", "917 1045 5036 8496 8959 11577 42224 65317 66182 71846 71854 119812 119864 119916 120020 120072 120124 120176 120228 120280 120332 120384"],
  ["E", "120436 120492 120550 120608 120666 120724"],
  ["Z", "918 5059 8484 8488 42204 65338 66293 71849 71909 119833 119885 119937 119989 120041 120197 120249 120301 120353 120405 120457 120493"],
  ["Z", "120551 120609 120667 120725"],
  ["H", "919 1053 5051 5500 8459 8460 8461 11406 42215 65320 66255 119815 119867 119919 120023 120179 120231 120283 120335 120387 120439 120494"],
  ["H", "120552 120610 120668 120726"],
  ["K", "922 1050 5094 5845 8490 11412 42199 65323 66840 119818 119870 119922 119974 120026 120078 120130 120182 120234 120286 120338 120390"],
  ["K", "120442 120497 120555 120613 120671 120729"],
  ["M", "924 1018 1052 5047 5616 5846 8499 8559 11416 42207 65325 66224 66321 119820 119872 119924 120028 120080 120132 120184 120236 120288"],
  ["M", "120340 120392 120444 120499 120557 120615 120673 120731"],
  ["N", "925 8469 11418 42208 65326 66835 119821 119873 119925 119977 120029 120081 120185 120237 120289 120341 120393 120445 120500 120558"],
  ["N", "120616 120674 120732"],
  ["P", "929 1056 5090 5229 8473 11426 42193 65328 66197 119823 119875 119927 119979 120031 120083 120187 120239 120291 120343 120395 120447"],
  ["P", "120504 120562 120620 120678 120736"],
  ["T", "932 1058 5026 8868 10201 11430 42196 65332 66199 66225 66325 71868 93962 119827 119879 119931 119983 120035 120087 120139 120191 120243"],
  ["T", "120295 120347 120399 120451 120507 120565 120623 120681 120739 128872"],
  ["Y", "933 978 1059 1198 5033 5053 11432 42220 65337 66226 71844 94019 119832 119884 119936 119988 120040 120092 120144 120196 120248 120300"],
  ["Y", "120352 120404 120456 120508 120566 120624 120682 120740"],
  ["X", "935 1061 5741 5815 8553 9587 11436 11613 42219 42931 65336 66192 66228 66327 66338 66855 71916 119831 119883 119935 119987 120039 120091"],
  ["X", "120143 120195 120247 120299 120351 120403 120455 120510 120568 120626 120684 120742"],
  ["v", "957 1141 1496 7456 8564 8744 8897 43945 65366 71430 71872 119855 119907 119959 120011 120063 120115 120167 120219 120271 120323 120375"],
  ["v", "120427 120479 120526 120584 120642 120700 120758"],
  ["o", "959 963 1086 1413 1505 1607 1637 1726 1729 1749 1781 2406 2662 2790 3046 3074 3174 3202 3302 3330 3360 3430 3458 3664 3792 4125 4160"],
  ["o", "4351 7439 7441 8500 11423 43837 64422 64423 64424 64425 64426 64427 64428 64429 65257 65258 65259 65260 65359 66604 66794 71880 71895"],
  ["o", "119848 119900 119952 120056 120108 120160 120212 120264 120316 120368 120420 120472 120528 120532 120586 120590 120644 120648 120702"],
  ["o", "120706 120760 120764 126500 126564 126596"],
  ["p", "961 1009 1088 9076 11427 65360 119849 119901 119953 120005 120057 120109 120161 120213 120265 120317 120369 120421 120473 120530 120544"],
  ["p", "120588 120602 120646 120660 120704 120718 120762 120776"],
  ["F", "988 5556 8497 42205 42904 66183 66213 66853 71842 71874 119315 119813 119865 119917 120021 120073 120125 120177 120229 120281 120333"],
  ["F", "120385 120437 120778"],
  ["c", "1010 1089 7428 8573 11429 43951 65347 66621 119836 119888 119940 119992 120044 120096 120148 120200 120252 120304 120356 120408 120460"],
  ["j", "1011 1112 8521 65354 119843 119895 119947 119999 120051 120103 120155 120207 120259 120311 120363 120415 120467"],
  ["C", "1017 1057 5087 8450 8493 8557 11428 42202 65315 66210 66306 66581 66844 71913 71922 119810 119862 119914 119966 120018 120174 120226"],
  ["C", "120278 120330 120382 120434 128844"],
  ["S", "1029 1359 5077 5082 42210 65331 66198 66592 94010 119826 119878 119930 119982 120034 120086 120138 120190 120242 120294 120346 120398"],
  ["S", "120450"],
  ["bl", "1067"],
  ["lO", "1070"],
  ["6", "1073 5102 11474 71893 120788 120798 120808 120818 120828"],
  ["r", "1075 7462 11397 43847 43848 43905 119851 119903 119955 120007 120059 120111 120163 120215 120267 120319 120371 120423 120475"],
  ["e", "1077 1213 8494 8495 8519 43826 65349 119838 119890 119942 120046 120098 120150 120202 120254 120306 120358 120410 120462"],
  ["V", "1140 1639 1783 5081 5167 8548 11576 42214 42719 66845 71840 93960 119309 119829 119881 119933 119985 120037 120089 120141 120193 120245"],
  ["V", "120297 120349 120401 120453"],
  ["r'", "1169"],
  ["h", "1211 1392 5058 8462 65352 119841 119945 119997 120049 120101 120153 120205 120257 120309 120361 120413 120465"],
  ["d", "1281 5095 5231 8518 8574 42194 119837 119889 119941 119993 120045 120097 120149 120201 120253 120305 120357 120409 120461"],
  ["G", "1292 5056 5107 42198 119814 119866 119918 119970 120022 120074 120126 120178 120230 120282 120334 120386 120438"],
  ["q", "1307 1379 1382 119850 119902 119954 120006 120058 120110 120162 120214 120266 120318 120370 120422 120474"],
  ["W", "1308 5043 5076 42218 71910 71919 119830 119882 119934 119986 120038 120090 120142 120194 120246 120298 120350 120402 120454"],
  ["U", "1357 4608 5196 8746 8899 42228 66766 71864 94018 119828 119880 119932 119984 120036 120088 120140 120192 120244 120296 120348 120400"],
  ["U", "120452"],
  ["n", "1400 1404 119847 119899 119951 120003 120055 120107 120159 120211 120263 120315 120367 120419 120471"],
  ["l'", "1521"],
  [".", "1632 1776 1793 1794 8228 42232 42510 68176 119149"],
  ["*", "1645 8270 8727 66335"],
  ["_", "2042 65101 65102 65103"],
  ["9", "2541 2663 2920 3437 11466 42862 71852 71884 71894 120791 120801 120811 120821 120831"],
  ["D", "5024 5598 5610 8517 8558 42195 119811 119863 119915 119967 120019 120071 120123 120175 120227 120279 120331 120383 120435"],
  ["4", "5070 71855 120786 120796 120806 120816 120826"],
  ["L", "5086 5290 8466 8556 11472 42209 66587 66854 71843 71858 93974 119338 119819 119871 119923 120027 120079 120131 120183 120235 120287"],
  ["L", "120339 120391 120443"],
  ["=", "5120 11840 12448 42239"],
  ["U'", "5223"],
  ["P'", "5254"],
  ["d'", "5255"],
  ["+", "5869 10133 66203"],
  ["/", "5941 8257 8260 8725 9585 10187 10744 11462 12035 12339 12494 12755 20031 119354"],
  ["z", "7458 43923 71876 119859 119911 119963 120015 120067 120119 120171 120223 120275 120327 120379 120431 120483"],
  ["ue", "7531"],
  ["..", "8229 42234"],
  ["...", "8230"],
  ["'''", "8244 8247"],
  ["!!", "8252"],
  ["??", "8263"],
  ["?!", "8264"],
  ["!?", "8265"],
  ["''''", "8279"],
  ["Rs", "8360"],
  ["lt", "8374"],
  ["a/c", "8448"],
  ["a/s", "8449"],
  ["c/o", "8453"],
  ["c/u", "8454"],
  ["No", "8470"],
  ["Q", "8474 11605 119824 119876 119928 119980 120032 120084 120188 120240 120292 120344 120396 120448"],
  ["TEL", "8481"],
  ["FAX", "8507"],
  ["lll", "8546"],
  ["lV", "8547"],
  ["Vl", "8549"],
  ["Vll", "8550"],
  ["Vlll", "8551"],
  ["lX", "8552"],
  ["Xl", "8554"],
  ["Xll", "8555"],
  ["ii", "8561"],
  ["iii", "8562"],
  ["iv", "8563"],
  ["vi", "8565"],
  ["vii", "8566"],
  ["viii", "8567"],
  ["ix", "8568"],
  ["xi", "8570"],
  ["xii", "8571"],
  ["\\", "8726 10189 10741 10745 12034 12756 20022 65128 65340 119311 119355"],
  ["oo", "8734 42649 42831"],
  ["<<", "8810"],
  [">>", "8811 10784"],
  ["<<<", "8920"],
  [">>>", "8921"],
  ["\\\\", "9290 11513"],
  ["(l)", "9332 9383 127256"],
  ["(2)", "9333"],
  ["(3)", "9334"],
  ["(4)", "9335"],
  ["(5)", "9336"],
  ["(6)", "9337"],
  ["(7)", "9338"],
  ["(8)", "9339"],
  ["(9)", "9340"],
  ["(lO)", "9341"],
  ["(ll)", "9342"],
  ["(l2)", "9343"],
  ["(l3)", "9344"],
  ["(l4)", "9345"],
  ["(l5)", "9346"],
  ["(l6)", "9347"],
  ["(l7)", "9348"],
  ["(l8)", "9349"],
  ["(l9)", "9350"],
  ["(2O)", "9351"],
  ["l.", "9352"],
  ["2.", "9353"],
  ["3.", "9354"],
  ["4.", "9355"],
  ["5.", "9356"],
  ["6.", "9357"],
  ["7.", "9358"],
  ["8.", "9359"],
  ["9.", "9360"],
  ["lO.", "9361"],
  ["ll.", "9362"],
  ["l2.", "9363"],
  ["l3.", "9364"],
  ["l4.", "9365"],
  ["l5.", "9366"],
  ["l6.", "9367"],
  ["l7.", "9368"],
  ["l8.", "9369"],
  ["l9.", "9370"],
  ["2O.", "9371"],
  ["(a)", "9372"],
  ["(b)", "9373"],
  ["(c)", "9374"],
  ["(d)", "9375"],
  ["(e)", "9376"],
  ["(f)", "9377"],
  ["(g)", "9378"],
  ["(h)", "9379"],
  ["(i)", "9380"],
  ["(j)", "9381"],
  ["(k)", "9382"],
  ["(rn)", "9384"],
  ["(n)", "9385"],
  ["(o)", "9386"],
  ["(p)", "9387"],
  ["(q)", "9388"],
  ["(r)", "9389"],
  ["(s)", "9390"],
  ["(t)", "9391"],
  ["(u)", "9392"],
  ["(v)", "9393"],
  ["(w)", "9394"],
  ["(x)", "9395"],
  ["(y)", "9396"],
  ["(z)", "9397"],
  ["(", "10088 10098 12308 64830 65339"],
  [")", "10089 10099 12309 64831 65341"],
  ["{", "10100 119060"],
  ["}", "10101"],
  ["::=", "10868"],
  ["==", "10869"],
  ["===", "10870"],
  ["><", "10917"],
  ["///", "11003"],
  ["//", "11005"],
  ["((", "11816"],
  ["))", "11817"],
  [".,", "42235"],
  ["-.", "42238"],
  ["OO", "42648 42830"],
  ["T3", "42792"],
  ["AA", "42802"],
  ["aa", "42803"],
  ["AO", "42804"],
  ["ao", "42805"],
  ["AU", "42806"],
  ["au", "42807"],
  ["AV", "42808 42810"],
  ["av", "42809 42811"],
  ["AY", "42812"],
  ["ay", "42813"],
  ["tf", "42871"],
  ["&", "42872"],
  ["uo", "43875"],
  ["ff", "64256"],
  ["fi", "64257"],
  ["fl", "64258"],
  ["ffi", "64259"],
  ["ffl", "64260"],
  ["st", "64262"],
  ["7", "66770 71878 119314 120789 120799 120809 120819 120829"],
  ["k", "119844 119896 119948 120000 120052 120104 120156 120208 120260 120312 120364 120416 120468"],
  ["t", "119853 119905 119957 120009 120061 120113 120165 120217 120269 120321 120373 120425 120477"],
  ["O.", "127232"],
  ["O,", "127233"],
  ["l,", "127234"],
  ["2,", "127235"],
  ["3,", "127236"],
  ["4,", "127237"],
  ["5,", "127238"],
  ["6,", "127239"],
  ["7,", "127240"],
  ["8,", "127241"],
  ["9,", "127242"],
  ["(A)", "127248"],
  ["(B)", "127249"],
  ["(C)", "127250"],
  ["(D)", "127251"],
  ["(E)", "127252"],
  ["(F)", "127253"],
  ["(G)", "127254"],
  ["(H)", "127255"],
  ["(J)", "127257"],
  ["(K)", "127258"],
  ["(L)", "127259"],
  ["(M)", "127260"],
  ["(N)", "127261"],
  ["(O)", "127262"],
  ["(P)", "127263"],
  ["(Q)", "127264"],
  ["(R)", "127265"],
  ["(S)", "127266 127274"],
  ["(T)", "127267"],
  ["(U)", "127268"],
  ["(V)", "127269"],
  ["(W)", "127270"],
  ["(X)", "127271"],
  ["(Y)", "127272"],
  ["(Z)", "127273"],
  ["QE", "128768"],
  ["AR", "128775"],
  ["sss", "128860"],
  ["MB", "128875"],
  ["VB", "128876"],
];
