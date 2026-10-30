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

export class NoCheckerView extends Error {}

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
