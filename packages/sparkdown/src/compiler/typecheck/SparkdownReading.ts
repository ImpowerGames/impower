import {
  AstExprSparkdownInterpString,
  AstExprSparkdownNew,
  AstStatAssign,
  AstStatBlock,
  AstStatSparkdownChoose,
  AstStatSparkdownExplicit,
  AstStatSparkdownStore,
  isSparkdownNode,
  visitAst,
  type AstExpr,
  type AstNode,
  type AstStat,
} from "./Ast";

export interface SparkdownValue {
  type: "any" | "string";
  operands: AstExpr[];
}

export function sparkdownValue(expr: AstExpr): SparkdownValue | undefined {
  if (!isSparkdownNode(expr)) return undefined;
  if (expr instanceof AstExprSparkdownInterpString) return { type: "string", operands: [] };
  if (expr instanceof AstExprSparkdownNew) return { type: "any", operands: expr.args };
  return { type: "any", operands: [] };
}

function luauStatements(stat: AstStat): AstStat[] {
  if (stat instanceof AstStatSparkdownExplicit) return luauStatements(stat.statement);
  if (stat instanceof AstStatSparkdownStore) return [new AstStatAssign(stat.location, stat.vars, stat.values)];
  if (stat instanceof AstStatSparkdownChoose) return [...stat.body.body, ...(stat.gather?.body ?? [])].flatMap(luauStatements);
  return [stat];
}

export function readSparkdownStatements(node: AstNode): void {
  visitAst(node, {
    visit(n) {
      if (n instanceof AstStatBlock && n.body.some(isSparkdownNode)) n.body = n.body.flatMap(luauStatements);
      return true;
    },
  });
}
