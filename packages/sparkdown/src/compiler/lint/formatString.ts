// Luau's FormatString lint (`LintFormatString` in `Luau/Linter.cpp`): a
// literal format given to `string.format`, `os.date`, `string.pack`,
// `string.packsize` or `string.unpack`, a literal match pattern given to
// `string.match`, `gmatch`, `find` or `gsub`, and a literal `gsub`
// replacement, that is malformed. The validators are Luau's, ported line for
// line with its messages, and read a literal as Luau holds it, one character
// per UTF-8 byte (`AstExprConstantString.value`).
//
// A format Sparkdown's runtime runs is never reported, so where Luau's
// validator rejects a literal the runtime accepts, the lint stays silent
// (docs/compiler/LINTS.md):
// - A literal is reported only when the string the runtime holds for it
//   (`stringLiteralValue`), which an escape can make differ from Luau's, is
//   malformed too (`lintFormatStringCall`).
// - A match pattern Luau rejects is reported only when the runtime's own
//   translator (`luaPatternToJs`) rejects it too. It runs an escape of a
//   character that is not a class (`%q`, `%,`) as that character, and a
//   class before a `-` in a set (`[%a-b]`) as the class, a `-` and the next
//   character.
// - The other validators read three formats as the runtime does, each
//   marked "Sparkdown" below: `%1` in a `gsub` replacement for a pattern with
//   no capture, which is the whole match, as in Lua (`expandGsubStringRepl`);
//   the size of `string.packsize("Xs")`, whose `s` only aligns, as in Lua
//   (`parsePackFormat`); and `os.date`'s `%h` and a NUL byte outside a
//   conversion (`formatDateString`).
// Where the runtime runs less than Luau's validator accepts
// (`os.date("%U")`, `string.format("%5*")`), the lint follows Luau and stays
// silent. The sweep in `FormatString.test.ts` holds each validator to the
// runtime function that runs the literal.

import { LuaPatternError, luaPatternToJs } from "../../runtime/LuaPatterns";
import { AstExpr, AstExprCall, AstExprConstantBool, AstExprConstantString, AstExprGlobal, AstExprGroup, AstExprIndexName } from "../typecheck/Ast";

const NUL = String.fromCharCode(0);
/** Luau reads a pack size's digits while the value is at most `(INT_MAX - 9) / 10`. */
const PACK_SIZE_READ_LIMIT = Math.floor((2147483647 - 9) / 10);

/** C's `strchr(set, ch) != nullptr`, which also finds the NUL ending `set`. */
function strchr(set: string, ch: string | undefined): boolean {
  return ch !== undefined && (ch === NUL || set.includes(ch));
}

function isAlpha(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z"));
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

// ---------------------------------------------------------------------------
// Luau's validators

function checkStringFormat(data: string): string | undefined {
  const flags = "-+ #0";
  const options = "cdiouxXeEfgGqs*";
  for (let i = 0; i < data.length; ++i) {
    if (data[i] !== "%") continue;
    i++;
    // escaped % doesn't allow for flags/etc.
    if (i < data.length && data[i] === "%") continue;
    while (i < data.length && strchr(flags, data[i])) i++;
    // width, then precision, up to two digits each
    if (i < data.length && isDigit(data[i])) i++;
    if (i < data.length && isDigit(data[i])) i++;
    if (i < data.length && data[i] === ".") {
      i++;
      if (i < data.length && isDigit(data[i])) i++;
      if (i < data.length && isDigit(data[i])) i++;
    }
    if (i === data.length) return "unfinished format specifier";
    if (!strchr(options, data[i])) return "invalid format specifier: must be a string format specifier or %";
  }
  return undefined;
}

function checkStringPack(data: string, fixed: boolean): string | undefined {
  const options = "<>=!bBhHlLjJTiIfdnczsxX ";
  const unsized = "<>=!zX ";
  for (let i = 0; i < data.length; ++i) {
    if (!strchr(options, data[i])) return "unexpected character; must be a pack specifier or space";
    if (data[i] === "c" && (i + 1 === data.length || !isDigit(data[i + 1]))) return "fixed-sized string format must specify the size";
    if (data[i] === "X" && (i + 1 === data.length || strchr(unsized, data[i + 1]))) return "X must be followed by a size specifier";
    // Sparkdown: the option after `X` (`Xs`) only aligns and holds no data.
    if (fixed && (data[i] === "z" || data[i] === "s") && data[i - 1] !== "X") return "pack specifier must be fixed-size";
    if ((data[i] === "!" || data[i] === "i" || data[i] === "I" || data[i] === "c" || data[i] === "s") && i + 1 < data.length && isDigit(data[i + 1])) {
      const isc = data[i] === "c";
      let v = 0;
      while (i + 1 < data.length && isDigit(data[i + 1]) && v <= PACK_SIZE_READ_LIMIT) {
        v = v * 10 + (data.charCodeAt(i + 1) - 48);
        i++;
      }
      if (i + 1 < data.length && isDigit(data[i + 1])) return "size specifier is too large";
      if (!isc && (v === 0 || v > 16)) return "integer size must be in range [1,16]";
    }
  }
  return undefined;
}

function checkStringMatchSet(data: string, magic: string, classes: string): string | undefined {
  for (let i = 0; i < data.length; ++i) {
    if (data[i] === "%") {
      i++;
      if (i === data.length) return "unfinished character class";
      if (isDigit(data[i])) {
        return "sets can not contain capture references";
      } else if (isAlpha(data[i])) {
        // upper case for every character class is defined as its inverse
        if (!classes.includes(data[i]!.toLowerCase())) return "invalid character class, must refer to a defined class or its inverse";
      } else if (!strchr(magic, data[i])) {
        return "expected a magic character after %";
      }
      if (i + 1 < data.length && data[i + 1] === "-") return "character range can't include character sets";
    } else if (data[i] === "-") {
      if (i + 1 < data.length && data[i + 1] === "%") return "character range can't include character sets";
    }
  }
  return undefined;
}

/** The pattern's error, or, as Luau's `outCaptures`, its count of captures. */
function checkStringMatch(data: string): { error: string } | { captures: number } {
  const magic = "^$()%.[]*+-?)";
  const classes = "acdglpsuwxz";
  const openCaptures: number[] = [];
  let totalCaptures = 0;
  for (let i = 0; i < data.length; ++i) {
    if (data[i] === "%") {
      i++;
      if (i === data.length) return { error: "unfinished character class" };
      if (isDigit(data[i])) {
        if (data[i] === "0") return { error: "invalid capture reference, must be 1-9" };
        const captureIndex = data.charCodeAt(i) - 48;
        if (captureIndex > totalCaptures) return { error: "invalid capture reference, must refer to a valid capture" };
        if (openCaptures.includes(captureIndex)) return { error: "invalid capture reference, must refer to a closed capture" };
      } else if (isAlpha(data[i])) {
        if (data[i] === "b") {
          if (i + 2 >= data.length) return { error: "missing brace characters for balanced match" };
          i += 2;
        } else if (data[i] === "f") {
          if (i + 1 >= data.length || data[i + 1] !== "[") return { error: "missing set after a frontier pattern" };
          // the set is read as any other
        } else if (!classes.includes(data[i]!.toLowerCase())) {
          return { error: "invalid character class, must refer to a defined class or its inverse" };
        }
      } else if (!strchr(magic, data[i])) {
        return { error: "expected a magic character after %" };
      }
    } else if (data[i] === "[") {
      let j = i + 1;
      // empty sets don't exist, so a leading ^ and ] are part of the set
      if (j < data.length && data[j] === "^") j++;
      if (j < data.length && data[j] === "]") j++;
      while (j < data.length && data[j] !== "]") {
        // % escapes the next character
        if (j + 1 < data.length && data[j] === "%") j++;
        j++;
      }
      if (j === data.length) return { error: "expected ] at the end of the string to close a set" };
      const error = checkStringMatchSet(data.slice(i + 1, j), magic, classes);
      if (error) return { error };
      i = j;
    } else if (data[i] === "(") {
      totalCaptures++;
      openCaptures.push(totalCaptures);
    } else if (data[i] === ")") {
      if (openCaptures.length === 0) return { error: "unexpected ) without a matching (" };
      openCaptures.pop();
    }
  }
  if (openCaptures.length > 0) return { error: "expected ) at the end of the string to close a capture" };
  return { captures: totalCaptures };
}

/** `captures` is the pattern's count of captures, or -1 when unknown. */
function checkStringReplace(data: string, captures: number): string | undefined {
  for (let i = 0; i < data.length; ++i) {
    if (data[i] !== "%") continue;
    i++;
    if (i === data.length) return "unfinished replacement";
    if (data[i] !== "%" && !isDigit(data[i])) return "unexpected replacement character; must be a digit or %";
    // Sparkdown: `%1` is the whole match of a pattern with no capture.
    if (isDigit(data[i]) && captures >= 0 && data.charCodeAt(i) - 48 > captures && !(captures === 0 && data[i] === "1")) return "invalid capture index, must refer to pattern capture";
  }
  return undefined;
}

function checkDateFormat(data: string): string | undefined {
  // Sparkdown: `%h` is the month's abbreviated name, as `%b` is.
  const options = "aAbBcdhHIjmMpSUwWxXyYzZ";
  for (let i = 0; i < data.length; ++i) {
    // Sparkdown: a NUL byte outside a conversion is text, so Luau's check
    // for one moves inside the conversion.
    if (data[i] !== "%") continue;
    i++;
    if (i === data.length) return "unfinished replacement";
    if (data[i] !== "%" && !strchr(options, data[i])) return "unexpected replacement character; must be a date format specifier or %";
    if (data[i] === NUL) return "date format can not contain null characters";
  }
  return undefined;
}

/** Whether the runtime's translator (`luaPatternToJs`) reads a pattern. */
function runtimeRunsPattern(pattern: string): boolean {
  try {
    luaPatternToJs(pattern);
    return true;
  } catch (e) {
    if (e instanceof LuaPatternError) return false;
    throw e;
  }
}

/** A pattern's count of captures as Luau's validator reads it, or -1 when it rejects the pattern. */
function capturesOf(pattern: string): number {
  const result = checkStringMatch(pattern);
  return "error" in result ? -1 : result.captures;
}

// ---------------------------------------------------------------------------
// The calls

/**
 * Reports each malformed literal format of a call, as Luau's `matchCall`
 * finds them: a method on a string literal (`("%d"):format(n)`, the literal
 * in parentheses once) or a function of the global `string` or `os` library.
 * Luau also checks a method on a value its type checker types as a string,
 * which needs types (`FormatStringTyped`).
 *
 * `runtimeValue` is the string the runtime holds for a literal, which
 * should equal Luau's reading of its escapes (`\z` skips only ASCII
 * whitespace in both since I-1396). A literal is
 * reported only when the runtime's reading is malformed too: for a pattern,
 * when the runtime's translator rejects it, and otherwise when the same
 * validator rejects the runtime's reading, since the runtime rejects every
 * string the validators do.
 */
export function lintFormatStringCall(
  node: AstExprCall,
  runtimeValue: (literal: AstExprConstantString) => string,
  report: (literal: AstExprConstantString, message: string) => void,
): void {
  const func = node.func;
  if (!(func instanceof AstExprIndexName)) return;
  const check = (kind: string, literal: AstExpr | undefined, validate: (data: string) => string | undefined) => {
    if (!(literal instanceof AstExprConstantString)) return;
    const error = validate(literal.value);
    if (error && validate(runtimeValue(literal))) report(literal, `Invalid ${kind}: ${error}`);
  };
  if (node.self) {
    const self = func.expr instanceof AstExprGroup ? func.expr.expr : func.expr;
    if (self instanceof AstExprConstantString) matchStringCall(func.index, self, node.args, runtimeValue, report, check);
    return;
  }
  if (!(func.expr instanceof AstExprGlobal)) return;
  if (func.expr.name === "string") { // not a node name
    if (node.args.length > 0) matchStringCall(func.index, node.args[0]!, node.args.slice(1), runtimeValue, report, check);
  } else if (func.expr.name === "os" && func.index === "date" && node.args.length > 0) { // not a node name
    check("date format", node.args[0], checkDateFormat);
  }
}

function matchStringCall(
  name: string,
  self: AstExpr,
  args: AstExpr[],
  runtimeValue: (literal: AstExprConstantString) => string,
  report: (literal: AstExprConstantString, message: string) => void,
  check: (kind: string, literal: AstExpr | undefined, validate: (data: string) => string | undefined) => void,
): void {
  /** Checks a pattern and returns its count of captures, or -1 when unknown. */
  const matchPattern = (pat: AstExpr | undefined) => {
    if (!(pat instanceof AstExprConstantString)) return -1;
    const result = checkStringMatch(pat.value);
    if (!("error" in result)) return result.captures;
    if (!runtimeRunsPattern(runtimeValue(pat))) report(pat, `Invalid match pattern: ${result.error}`);
    return -1;
  };
  if (name === "format") {
    check("format string", self, checkStringFormat);
  } else if (name === "pack" || name === "packsize" || name === "unpack") {
    check("pack format", self, (data) => checkStringPack(data, name === "packsize"));
  } else if ((name === "match" || name === "gmatch") && args.length > 0) {
    matchPattern(args[0]);
  } else if (name === "find" && args.length > 0 && args.length <= 2) {
    matchPattern(args[0]);
  } else if (name === "find" && args.length >= 3) {
    // find(_, _, _, true) is a plain-text find, not a pattern match
    const mode = args[2];
    if (mode instanceof AstExprConstantBool && !mode.value) matchPattern(args[0]);
  } else if (name === "gsub" && args.length > 1) {
    const pat = args[0];
    const captures = matchPattern(pat);
    const rep = args[1];
    if (!(rep instanceof AstExprConstantString)) return;
    const error = checkStringReplace(rep.value, captures);
    if (!error) return;
    // The runtime's reading of the pattern can hold other captures.
    const runtimeCaptures = captures >= 0 && pat instanceof AstExprConstantString ? capturesOf(runtimeValue(pat)) : -1;
    if (checkStringReplace(runtimeValue(rep), runtimeCaptures)) report(rep, `Invalid match replacement: ${error}`);
  }
}
