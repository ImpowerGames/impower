import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { LowerContext } from "../context";
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
// Both keyed shapes resolve to a static string at compile time and
// emit an `ObjectExpressionEntry(key, value)`. Dynamic keys
// (`[i + 1] = value`) require runtime StoreIndex emission and are
// silently deferred — bracket forms whose inner expression isn't a
// string literal or numeric literal produce no entry.
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
  // When non-null: `{ key, … }` is being parsed and we're holding the
  // resolved key string from the most-recent identifier or bracket
  // expression. If the next non-skippable child is a `LuauAssignmentOperation`,
  // we emit `(pendingKey, value)`. Otherwise we flush `pendingKey` as a
  // bare value (treat as array-style) — but only when it came from an
  // `LuauAccessPath`, since `LuauTableIndexDeclaration` is meaningless
  // without an assignment.
  let pendingKey: string | null = null;
  let pendingKeyNode: SyntaxNode | null = null;
  let pendingKeyIsBracket = false;
  let arrayIndex = 1;

  const emitBareValue = (valueNode: SyntaxNode) => {
    const value = lowerExpressionFromNodes([valueNode], ctx);
    if (value) {
      entries.push(new ObjectExpressionEntry(String(arrayIndex++), value));
    }
  };

  let child = content.firstChild;
  while (child) {
    if (
      child.name === "LuauCommaSeparator" ||
      child.name === "LuauSemicolonSeparator"
    ) {
      if (pendingKeyNode !== null && !pendingKeyIsBracket) {
        // Bare identifier acting as an array-style value
        // (`{foo, bar}`).
        emitBareValue(pendingKeyNode);
      }
      pendingKey = null;
      pendingKeyNode = null;
      pendingKeyIsBracket = false;
      child = child.nextSibling;
      continue;
    }
    if (isSkippableName(child.name)) {
      child = child.nextSibling;
      continue;
    }
    if (child.name === "LuauAccessPath" && pendingKey === null) {
      pendingKey = readSingleIdentifier(child, ctx);
      pendingKeyNode = child;
      pendingKeyIsBracket = false;
      child = child.nextSibling;
      continue;
    }
    if (
      child.name === "LuauTableIndexDeclaration" &&
      pendingKey === null
    ) {
      pendingKey = readStaticBracketKey(child, ctx);
      pendingKeyNode = child;
      pendingKeyIsBracket = true;
      child = child.nextSibling;
      continue;
    }
    if (child.name === "LuauAssignmentOperation" && pendingKey !== null) {
      const keyName = pendingKey;
      pendingKey = null;
      pendingKeyNode = null;
      pendingKeyIsBracket = false;
      const opContent = findChildByName(
        child,
        "LuauAssignmentOperation_content",
      );
      const value = opContent
        ? lowerExpressionFromContainer(opContent, ctx)
        : null;
      if (value && keyName !== null) {
        entries.push(new ObjectExpressionEntry(keyName, value));
      }
      child = child.nextSibling;
      continue;
    }
    // Either a leftover pending key with no `=` (treat as bare value), or a
    // bare expression entry (array-style).
    if (pendingKeyNode !== null && !pendingKeyIsBracket) {
      emitBareValue(pendingKeyNode);
    }
    pendingKey = null;
    pendingKeyNode = null;
    pendingKeyIsBracket = false;
    emitBareValue(child);
    child = child.nextSibling;
  }
  if (pendingKeyNode !== null && !pendingKeyIsBracket) {
    emitBareValue(pendingKeyNode);
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
  let literal: SyntaxNode | null = null;
  for (const name of [...STRING_NODES, ...NUMBER_NODES]) {
    const found = getDescendent(name, indexDecl);
    if (found) {
      literal = found;
      break;
    }
  }
  if (!literal) return null;
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
