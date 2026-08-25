import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { LowerContext } from "../context";
import { validateAssignmentValue } from "../utils/validateAssignmentValue";
import {
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
} from "./lowerExpression";

// Luau tables. Three entry shapes are supported:
//
//   `{a = 1}`           — bare identifier key. Grammar:
//                         LuauAccessPath + LuauAssignmentOperation
//   `{["a"] = 1}`       — bracket-quoted static string key. Grammar:
//                         LuauTableIndexDeclaration + LuauAssignmentOperation
//   `{1, 2, 3}`         — array-style entry. Bare expression nodes;
//                         auto-incremented integer keys ("1", "2", ...).
//
// Static keyed shapes resolve to a string at compile time and emit an
// `ObjectExpressionEntry(key, value)`. COMPUTED bracket keys
// (`{[1+2] = 4}`, `{[i] = v}`) lower the bracket's inner expression
// and emit an Expression-keyed entry — the runtime EndObject
// stringifies the evaluated key (basic.luau line 293).
//
// `LuauTableIndexDeclaration` wraps the bracket-key form
// (`[<expr>]`). Inside is a `LuauExpression` (we drill through to
// find a primary literal: `LuauDoubleQuotedString` / `LuauSingleQuotedString`
// / `LuauNumericDecimal` / `LuauNumericHex` / `LuauNumericBinary`).
export function lowerTable(
  node: SyntaxNode,
  ctx: LowerContext,
): ObjectExpression {
  const content = findChildByName(node, "LuauTable_content");
  if (!content) return new ObjectExpression([]);

  const entries: ObjectExpressionEntry[] = [];
  let arrayIndex = 1;

  // Split the constructor body into per-entry NODE GROUPS at the
  // comma/semicolon separators. Each group is then classified whole:
  //   - [AccessPath, AssignmentOperation]            → `key = value`
  //   - [TableIndexDeclaration, AssignmentOperation] → `[expr] = value`
  //   - anything else                                → array-style value,
  //     lowered from ALL group nodes — an entry like `f'alo'..'xixi'`
  //     (paren-less call sugar + operator) arrives as TWO sibling
  //     nodes (constructs.luau line 50); lowering only the first
  //     dropped the concat tail.
  const groups: SyntaxNode[][] = [];
  let current: SyntaxNode[] = [];
  let child = content.firstChild;
  while (child) {
    if (
      child.name === "LuauCommaSeparator" ||
      child.name === "LuauSemicolonSeparator"
    ) {
      if (current.length > 0) groups.push(current);
      current = [];
    } else if (!isSkippableName(child.name)) {
      current.push(child);
    }
    child = child.nextSibling;
  }
  if (current.length > 0) groups.push(current);

  for (const group of groups) {
    const first = group[0]!;
    const second = group[1];
    if (
      second?.name === "LuauAssignmentOperation" &&
      (first.name === "LuauAccessPath" ||
        first.name === "LuauTableIndexDeclaration")
    ) {
      // Keyed entry. Identifier keys read their single name; bracket
      // keys try a static literal first, then lower the inner
      // expression for runtime evaluation (`{[1+2] = 4}`).
      let key: string | Expression | null;
      if (first.name === "LuauAccessPath") {
        key = readSingleIdentifier(first, ctx);
      } else {
        key = readStaticBracketKey(first, ctx);
        if (key === null) {
          const bracketContent = findChildByName(
            first,
            "LuauTableIndexDeclaration_content",
          );
          key = bracketContent
            ? lowerExpressionFromContainer(bracketContent, ctx)
            : null;
        }
      }
      // An empty keyed-entry RHS (`{ a = }`) is the same parse error as a
      // statement-level empty RHS — flag it (the entry is dropped below).
      validateAssignmentValue(second, ctx);
      const opContent = findChildByName(
        second,
        "LuauAssignmentOperation_content",
      );
      const value = opContent
        ? lowerExpressionFromContainer(opContent, ctx)
        : null;
      if (key !== null && value) {
        entries.push(new ObjectExpressionEntry(key, value));
      }
      continue;
    }
    // Array-style value from the whole group.
    const value = lowerExpressionFromNodes(group, ctx);
    if (value) {
      entries.push(new ObjectExpressionEntry(String(arrayIndex++), value));
    }
  }
  return new ObjectExpression(entries);
}

// Accept either a plain identifier (`LuauVariableName`) or any of the
// reserved-name captures (`LuauStdLibConstants` for namespaces like
// `count`/`math`/`table`, `LuauStdLibGlobals` for `_G`/`_VERSION`,
// `LuauStdLibFunctions` for `assert`/`tostring`/...). Reserved names
// are valid table keys even when they can't be variable names — Lua
// itself permits them via `["return"] = …`, and sparkdown narrative
// authors reasonably expect `{count = 3, lang = "en"}` to key on the
// literal strings rather than be silently dropped.
function readSingleIdentifier(
  accessPath: SyntaxNode,
  ctx: LowerContext,
): string | null {
  const nameNode =
    getDescendent("LuauVariableName", accessPath) ??
    getDescendent("LuauStdLibConstants", accessPath) ??
    getDescendent("LuauStdLibGlobals", accessPath) ??
    getDescendent("LuauStdLibFunctions", accessPath);
  if (!nameNode) return null;
  return ctx.read(nameNode.from, nameNode.to).trim() || null;
}

// Inside `LuauTableIndexDeclaration` (`[<expr>]`) look for a literal
// primary node and return its string-form value. Strings get their
// surrounding quotes stripped. Numbers get the raw token text
// (matches the convention used elsewhere — ObjectValue stores Lua
// integer keys as their stringified form, so `[42]` and `["42"]`
// end up indistinguishable, which is how `rawget`/`rawset` already
// behave). Returns null for dynamic or interpolated keys, which
// causes the entry to be silently dropped.
function readStaticBracketKey(
  indexDecl: SyntaxNode,
  ctx: LowerContext,
): string | null {
  const STRING_NODES = new Set([
    "LuauDoubleQuotedString",
    "LuauSingleQuotedString",
    "LuauMultilineString",
  ]);
  const NUMBER_NODES = new Set([
    "LuauNumericDecimal",
    "LuauNumericHex",
    "LuauNumericBinary",
  ]);
  // The bracket counts as STATIC only when its content is exactly ONE
  // literal node. A deep `getDescendent` walk here would grab the
  // leading `1` out of `[1+2]` and silently key the entry as "1" —
  // compound keys must fall through to the computed-expression path
  // (lowerTable's caller).
  const content = findChildByName(indexDecl, "LuauTableIndexDeclaration_content");
  if (!content) return null;
  const significant: SyntaxNode[] = [];
  let child = content.firstChild;
  while (child) {
    if (!isSkippableName(child.name)) significant.push(child);
    child = child.nextSibling;
  }
  if (significant.length !== 1) return null;
  const literal = significant[0]!;
  if (!STRING_NODES.has(literal.name) && !NUMBER_NODES.has(literal.name)) {
    return null;
  }
  const raw = ctx.read(literal.from, literal.to).trim();
  if (STRING_NODES.has(literal.name)) {
    return stripQuotes(raw);
  }
  // Numeric literal — keep the token text. parseInt/parseFloat would
  // round-trip with extra normalization (`0x10` → `16`), but the
  // sparkdown runtime keys strings literally; choosing the source
  // form matches what `rawget/rawset` users would type.
  return raw;
}

function stripQuotes(text: string): string {
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  if (
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === "`" && last === "`")
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function findChildByName(parent: SyntaxNode, name: string): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

function isSkippableName(name: string): boolean {
  return (
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "Newline" ||
    name === "LuauComment" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace"
  );
}
