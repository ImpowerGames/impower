// How the type checker's text read Sparkdown's own constructs, for comparing
// the AST `readLuauAst.ts` reads from the syntax tree with the AST Luau's
// parser reads from a unit's text (#1285).
//
// The checker's text (`luauCheckerText.ts`, the checker's reading before it
// read the tree's AST) blanks the `&` that marks a statement, a `store`
// modifier and the `choose`, `then` and `end` of a `choose` block, so their
// statements read as Luau's; it writes each of Sparkdown's own
// expressions (a divert target, a regular expression, an alternator) as a
// call of an `any` value, `_G()`, or the value alone, `_G`, where the
// expression is too short for the call; it blanks a `{{f}}` shorthand in a
// backtick string; it keeps a double-quoted string as written, which Luau
// reads as a plain string; and it writes a branch's parameters as a `local`
// holding `_G` values. `checkerView` prints the converter's nodes for those
// constructs as the checker's text reads them, so the two readings print the
// same where they agree.
//
// `new ClassName(args)` has no reading here: the text keeps it as written, which
// Luau reads as the name `new` followed by a call, so a unit holding one
// cannot be compared. Nor can a `store` with an annotation or without a
// value, which the checker's text makes a syntax error.

import {
  AstExprCall,
  AstExprConstantString,
  AstExprGlobal,
  AstExprInterpString,
  AstExprSparkdownCallShorthand,
  AstExprSparkdownConditionalAlternator,
  AstExprSparkdownDivertTarget,
  AstExprSparkdownFlowArgument,
  AstExprSparkdownInterpString,
  AstExprSparkdownNew,
  AstExprSparkdownRegex,
  AstExprSparkdownSequentialAlternator,
  AstStatAssign,
  AstStatSparkdownChoose,
  AstStatSparkdownExplicit,
  AstStatSparkdownStore,
  QuoteStyle,
  type AstExpr,
} from "../../compiler/typecheck/Ast";
import type { AstSubstitution } from "../../compiler/typecheck/printAst";

/** A construct the checker's text cannot be compared on. */
export class NoCheckerView extends Error {}

/** Prints the converter's Sparkdown constructs as the checker's text for `documentText` reads them, with `anyName` its `any` value. */
export function checkerView(documentText: string, anyName: string): AstSubstitution {
  const lineEnd = (offset: number) => {
    const end = documentText.indexOf("\n", offset);
    return end < 0 ? documentText.length : end;
  };
  return (node) => {
    if (
      node instanceof AstExprSparkdownDivertTarget ||
      node instanceof AstExprSparkdownRegex ||
      node instanceof AstExprSparkdownConditionalAlternator ||
      node instanceof AstExprSparkdownSequentialAlternator
    ) {
      // As `replaceWithAny` writes it: from where the expression's text begins, as far as its line or the expression goes.
      const { from, to } = node.source;
      const text = documentText.slice(from, to);
      const at = from + text.length - text.trimStart().length;
      const room = Math.min(to, lineEnd(at)) - at;
      const global = new AstExprGlobal(node.location, anyName);
      if (room >= 4) return new AstExprCall(node.location, global, [], false, [], node.location);
      if (room >= 2) return global;
      throw new NoCheckerView(`${node.kind} at ${node.location.begin} is too short for the checker's \`any\` value`);
    }
    if (node instanceof AstExprSparkdownFlowArgument) return new AstExprGlobal(node.location, anyName);
    if (node instanceof AstExprSparkdownInterpString) return new AstExprConstantString(node.location, node.luauValue, QuoteStyle.QuotedSimple);
    if (node instanceof AstExprInterpString && node.expressions.some((e) => e instanceof AstExprSparkdownCallShorthand)) {
      // A blanked shorthand leaves spaces between the text around it.
      const strings = [node.strings[0]!];
      const expressions: AstExpr[] = [];
      node.expressions.forEach((e, i) => {
        const after = node.strings[i + 1]!;
        if (e instanceof AstExprSparkdownCallShorthand) {
          strings[strings.length - 1] += " ".repeat(e.location.end.column - e.location.begin.column) + after;
        } else {
          expressions.push(e);
          strings.push(after);
        }
      });
      if (expressions.length === 0) return new AstExprConstantString(node.location, strings[0]!, QuoteStyle.QuotedSimple);
      return new AstExprInterpString(node.location, strings, expressions);
    }
    if (node instanceof AstExprSparkdownNew) throw new NoCheckerView(`\`new ${node.className}\` at ${node.location.begin}`);
    if (node instanceof AstStatSparkdownExplicit) {
      node.statement.hasSemicolon ||= node.hasSemicolon;
      return node.statement;
    }
    if (node instanceof AstStatSparkdownStore) {
      if (node.annotations.some((a) => a) || node.values.length === 0) throw new NoCheckerView(`a \`store\` at ${node.location.begin} the checker's text cannot read`);
      const assign = new AstStatAssign(node.location, node.vars, node.values);
      assign.hasSemicolon = node.hasSemicolon;
      return assign;
    }
    if (node instanceof AstStatSparkdownChoose) return [...node.body.body, ...(node.gather?.body ?? [])];
    return undefined;
  };
}
