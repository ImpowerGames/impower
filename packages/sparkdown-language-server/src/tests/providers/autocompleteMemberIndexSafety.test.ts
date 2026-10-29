import { describe, expect, test } from "vitest";
import { AstExprConstantString, AstExprIndexExpr, visitAst } from "@impower/sparkdown/src/compiler/typecheck/Ast";
import { readLuauUnits } from "@impower/sparkdown/src/compiler/typecheck/readLuauAst";
import { parseSource } from "@impower/sparkdown/src/tests/compiler/grammarSnapshot";
import { type CompletionItem } from "vscode-languageserver";
import { complete } from "./completionHarness";

const fixture = (index: string) => `store t = { alpha = 1 }\nstore suffix = "x"\nfunction main()\n  return t[${index}]\nend\n`;

function apply(source: string, item: CompletionItem): string {
  const text = source.replace("@1", "");
  const edit = item.textEdit;
  if (!edit || !("range" in edit)) throw new Error("Expected a ranged completion edit");
  const offset = (position: { line: number; character: number }) =>
    text.split("\n").slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.character;
  return text.slice(0, offset(edit.range.start)) + edit.newText + text.slice(offset(edit.range.end));
}

function indexOf(source: string): AstExprIndexExpr {
  const text = source.replace("@1", "");
  const unit = readLuauUnits(parseSource(text), text).prelude;
  expect(unit.errors.map((error) => error.message)).toEqual([]);
  const indexes: AstExprIndexExpr[] = [];
  visitAst(unit.root, { visit(node) {
    if (node instanceof AstExprIndexExpr) indexes.push(node);
    return true;
  } });
  expect(indexes.length).toBe(1);
  return indexes[0]!;
}

const computed = ['"', "'"].flatMap((quote) => [
  { name: `suffix operand (${quote})`, index: `${quote}a@1${quote} .. suffix` },
  { name: `ends in a quote (${quote})`, index: `${quote}a@1${quote} .. ${quote}x${quote}` },
  { name: `multiline operands (${quote})`, index: `${quote}a@1${quote}\n    .. suffix` },
  { name: `block comment (${quote})`, index: `${quote}a@1${quote} --[[ operand boundary ]] .. suffix` },
  { name: `line comment (${quote})`, index: `${quote}a@1${quote} .. -- operand boundary\n    suffix` },
  { name: `type assertion (${quote})`, index: `${quote}a@1${quote} :: string` },
].map((entry) => ({ ...entry, quote })));

// The index expression must name one fixed key. Editing a token within a
// computed index could preserve its syntax while changing a different key.
describe("quoted member completion preserves index expressions (#867)", () => {
  test.each(computed)("computed index is not a literal-key completion: $name", ({ index, quote }) => {
    const source = fixture(index);
    expect(indexOf(source).index instanceof AstExprConstantString).toBe(false);
    const result = complete(source);
    const alpha = result.items.find((item) => item.label === "alpha");
    if (alpha) {
      // The review predicts an unterminated string for the suffix operand.
      // Execution must establish it; inspect the edit before admission.
      const applied = apply(source, alpha);
      expect(readLuauUnits(parseSource(applied), applied).prelude.errors.map((error) => error.message)).toEqual([]);
      expect(applied).toBe(source.replace("@1", "").replace(`${quote}a${quote}`, `${quote}alpha${quote}`));
    }
    // Do not pin generic fallback labels; only the table's member admission.
    expect(result.labels).not.toContain("alpha");
  });

  test.each(['"', "'"].flatMap((quote) => [
    { name: `literal (${quote})`, index: `${quote}a@1${quote}`, quote },
    { name: `literal before comment (${quote})`, index: `${quote}a@1${quote} --[[ retained ]]`, quote },
    { name: `literal on multiple lines (${quote})`, index: `\n    ${quote}a@1${quote}\n  `, quote },
  ]))("literal acceptance replaces only its content: $name", ({ index, quote }) => {
    const source = fixture(index);
    expect(indexOf(source).index instanceof AstExprConstantString).toBe(true);
    const alpha = complete(source).items.find((item) => item.label === "alpha");
    expect(alpha).toBeDefined();
    const applied = apply(source, alpha!);
    expect(applied).toBe(source.replace("@1", "").replace(`${quote}a${quote}`, `${quote}alpha${quote}`));
    expect(readLuauUnits(parseSource(applied), applied).prelude.errors.map((error) => error.message)).toEqual([]);
  });
});
