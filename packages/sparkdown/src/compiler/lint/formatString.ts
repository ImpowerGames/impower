// Luau's FormatString validators (Analysis/src/Linter.cpp, c8cf2864a).
// Keep its conservative call matching and messages. Pattern candidates are
// checked against Sparkdown's matcher, which also accepts literal escapes
// and some class ranges that Luau's lint deliberately discourages.
import { luaPatternToJs } from "../../inkjs/engine/LuaPatterns";
import {
  AstExprCall, AstExprConstantBool, AstExprConstantString, AstExprGlobal,
  AstExprGroup, AstExprIndexName, type AstExpr,
} from "../typecheck/Ast";

const digit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const alpha = (c: string) => /^[a-z]$/i.test(c);
const magic = "^$()%.[]*+-?)";
const classes = "acdglpsuwxz";

function formatError(s: string): string | undefined {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "%") continue;
    i++;
    if (s[i] === "%") continue;
    while (i < s.length && "-+ #0".includes(s[i]!)) i++;
    if (digit(s[i])) i++;
    if (digit(s[i])) i++;
    if (s[i] === ".") {
      i++;
      if (digit(s[i])) i++;
      if (digit(s[i])) i++;
    }
    if (i === s.length) return "unfinished format specifier";
    if (!"cdiouxXeEfgGqs*".includes(s[i]!)) return "invalid format specifier: must be a string format specifier or %";
  }
  return undefined;
}

function packError(s: string, fixed: boolean): string | undefined {
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (!"<>=!bBhHlLjJTiIfdnczsxX ".includes(c)) return "unexpected character; must be a pack specifier or space";
    if (c === "c" && !digit(s[i + 1])) return "fixed-sized string format must specify the size";
    if (c === "X" && (i + 1 === s.length || "<>=!zX ".includes(s[i + 1]!))) return "X must be followed by a size specifier";
    if (fixed && (c === "z" || c === "s")) return "pack specifier must be fixed-size";
    if ("!iIcs".includes(c) && digit(s[i + 1])) {
      let value = 0;
      while (digit(s[i + 1]) && value <= (2147483647 - 9) / 10) value = value * 10 + Number(s[++i]);
      if (digit(s[i + 1])) return "size specifier is too large";
      if (c !== "c" && (value === 0 || value > 16)) return "integer size must be in range [1,16]";
    }
  }
  return undefined;
}

function setError(s: string): string | undefined {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "%") {
      i++;
      if (i === s.length) return "unfinished character class";
      if (digit(s[i])) return "sets can not contain capture references";
      if (alpha(s[i]!)) {
        if (!classes.includes(s[i]!.toLowerCase())) return "invalid character class, must refer to a defined class or its inverse";
      } else if (!magic.includes(s[i]!)) return "expected a magic character after %";
      if (s[i + 1] === "-") return "character range can't include character sets";
    } else if (s[i] === "-" && s[i + 1] === "%") return "character range can't include character sets";
  }
  return undefined;
}

function upstreamPattern(s: string): { error?: string; captures: number } {
  const open: number[] = [];
  let captures = 0;
  const fail = (error: string) => ({ error, captures: -1 });
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "%") {
      i++;
      if (i === s.length) return fail("unfinished character class");
      const escape = s[i]!;
      if (digit(escape)) {
        const index = Number(escape);
        if (index === 0) return fail("invalid capture reference, must be 1-9");
        if (index > captures) return fail("invalid capture reference, must refer to a valid capture");
        if (open.includes(index)) return fail("invalid capture reference, must refer to a closed capture");
      } else if (alpha(escape)) {
        if (escape === "b") {
          if (i + 2 >= s.length) return fail("missing brace characters for balanced match");
          i += 2;
        } else if (escape === "f") {
          if (s[i + 1] !== "[") return fail("missing set after a frontier pattern");
        } else if (!classes.includes(escape.toLowerCase())) return fail("invalid character class, must refer to a defined class or its inverse");
      } else if (!magic.includes(escape)) return fail("expected a magic character after %");
    } else if (c === "[") {
      let j = i + 1;
      if (s[j] === "^") j++;
      if (s[j] === "]") j++;
      while (j < s.length && s[j] !== "]") {
        if (j + 1 < s.length && s[j] === "%") j++;
        j++;
      }
      if (j === s.length) return fail("expected ] at the end of the string to close a set");
      const error = setError(s.slice(i + 1, j));
      if (error) return fail(error);
      i = j;
    } else if (c === "(") open.push(++captures);
    else if (c === ")") {
      if (!open.length) return fail("unexpected ) without a matching (");
      open.pop();
    }
  }
  if (open.length) return fail("expected ) at the end of the string to close a capture");
  return { captures };
}

function patternResult(s: string): { error?: string; captures: number } {
  const result = upstreamPattern(s);
  if (!result.error) return result;
  // An upstream lint candidate that our runtime compiles is supported.
  try { return { captures: luaPatternToJs(s).captureCount }; }
  catch { return result; }
}

function replacementError(s: string, captures: number): string | undefined {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "%") continue;
    i++;
    if (i === s.length) return "unfinished replacement";
    if (s[i] !== "%" && !digit(s[i])) return "unexpected replacement character; must be a digit or %";
    // Runtime (and Lua) treats %1 as the whole match without captures.
    if (digit(s[i]) && captures >= 0 && Number(s[i]) > Math.max(1, captures)) return "invalid capture index, must refer to pattern capture";
  }
  return undefined;
}

function dateError(s: string): string | undefined {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "%") continue;
    i++;
    if (i === s.length) return "unfinished replacement";
    // %h is supported by Sparkdown. NUL is ordinary date text here.
    if (!"aAbBcdhHIjmMpSUwWxXyYzZ%".includes(s[i]!)) return "unexpected replacement character; must be a date format specifier or %";
  }
  return undefined;
}

export interface FormatStringFinding { literal: AstExprConstantString; message: string }

/** Only literal arguments to global libraries or literal string methods. */
export function formatStringFindings(call: AstExprCall): FormatStringFinding[] {
  if (!(call.func instanceof AstExprIndexName)) return [];
  const func = call.func;
  let library: string;
  let self: AstExpr | undefined;
  let args: AstExpr[];
  if (call.self) {
    self = func.expr instanceof AstExprGroup ? func.expr.expr : func.expr;
    if (!(self instanceof AstExprConstantString)) return [];
    library = "string";
    args = call.args;
  } else {
    if (!(func.expr instanceof AstExprGlobal)) return [];
    library = func.expr.name;
    self = call.args[0];
    args = call.args.slice(1);
  }
  const out: FormatStringFinding[] = [];
  const emit = (expr: AstExpr | undefined, kind: string, error: string | undefined) => {
    if (expr instanceof AstExprConstantString && error) out.push({ literal: expr, message: `Invalid ${kind}: ${error}` });
  };
  if (library === "os" && func.index === "date" && self instanceof AstExprConstantString) emit(self, "date format", dateError(self.value));
  if (library !== "string") return out;
  const name = func.index;
  if (name === "format" && self instanceof AstExprConstantString) emit(self, "format string", formatError(self.value));
  else if (["pack", "packsize", "unpack"].includes(name) && self instanceof AstExprConstantString) emit(self, "pack format", packError(self.value, name === "packsize"));
  else if (["match", "gmatch", "find", "gsub"].includes(name)) {
    if (name === "find" && args.length >= 3 && !(args[2] instanceof AstExprConstantBool && !args[2].value)) return out;
    // As upstream, gsub needs both a pattern and a replacement argument.
    if (name === "gsub" && args.length < 2) return out;
    let captures = -1;
    if (args[0] instanceof AstExprConstantString) {
      const result = patternResult(args[0].value);
      captures = result.captures;
      emit(args[0], "match pattern", result.error);
    }
    if (name === "gsub" && args[1] instanceof AstExprConstantString) emit(args[1], "match replacement", replacementError(args[1].value, captures));
  }
  return out;
}
