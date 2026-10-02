// How the type checker reads Sparkdown's own constructs inside Luau
// (`AstExprSparkdown*` and `AstStatSparkdown*` in `Ast.ts`), which Luau has
// no syntax for.
//
// A statement construct is read as the Luau statements it holds, in place
// (`readSparkdownStatements`): a statement marked with `&` as the statement,
// a `store` declaration as an assignment of its values to its names, which
// the program declares as globals, and a `choose` block as the statements
// among its choices and in its `then` clause, in its flow's scope, since the
// block opens none. An expression construct is a value of type `any`, as
// Luau's `_G` is, except a double-quoted string that interpolates, which
// Luau reads as a plain string (`sparkdownValue`); the checker's passes
// read each through `sparkdownValue`.

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

/** The value a Sparkdown expression has to the checker, and the Luau inside it that is checked. */
export interface SparkdownValue {
  type: "any" | "string";
  /** The expressions inside the construct that are checked as Luau: a `new`'s arguments. */
  operands: AstExpr[];
}

/** How the checker reads an expression that is one of Sparkdown's own constructs; undefined for Luau's. */
export function sparkdownValue(expr: AstExpr): SparkdownValue | undefined {
  if (!isSparkdownNode(expr)) return undefined;
  if (expr instanceof AstExprSparkdownInterpString) return { type: "string", operands: [] };
  if (expr instanceof AstExprSparkdownNew) return { type: "any", operands: expr.args };
  return { type: "any", operands: [] };
}

/** The Luau statements a statement stands for: itself, or those a Sparkdown construct holds. */
function luauStatements(stat: AstStat): AstStat[] {
  if (stat instanceof AstStatSparkdownExplicit) return luauStatements(stat.statement);
  if (stat instanceof AstStatSparkdownStore) return [new AstStatAssign(stat.location, stat.vars, stat.values)];
  if (stat instanceof AstStatSparkdownChoose) return [...stat.body.body, ...(stat.gather?.body ?? [])].flatMap(luauStatements);
  return [stat];
}

/** Replaces, in every block under a node, each Sparkdown statement with the Luau statements it holds. */
export function readSparkdownStatements(node: AstNode): void {
  visitAst(node, {
    visit(n) {
      if (n instanceof AstStatBlock && n.body.some(isSparkdownNode)) n.body = n.body.flatMap(luauStatements);
      return true;
    },
  });
}
