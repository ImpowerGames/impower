import {
  AstExprFunction,
  AstStatBlock,
  AstStatFor,
  AstStatForIn,
  AstStatLocal,
  AstStatLocalFunction,
  AstStatRepeat,
  AstStatSparkdownExplicit,
  visitAst,
  type AstNode,
  type AstStat,
} from "../../typecheck/Ast";
import { alternatorScopesOf } from "./alternatorArms";
import type { LowerContext } from "../context";
import { offsetAt } from "./luauAst";

export interface FunctionBinding {
  name: string;
  isConst: boolean;
  from: number;
  blockFrom: number;
  blockTo: number;
}

export function functionBindings(
  params: readonly { name: string }[],
  body: AstStatBlock | null,
  ctx: LowerContext,
  bodyFrom?: number,
): FunctionBinding[] {
  const out: FunctionBinding[] = [];
  if (!body) return out;
  const blockFrom = bodyFrom ?? offsetAt(body.location.begin, ctx);
  const blockTo = offsetAt(body.location.end, ctx);
  for (const param of params) {
    out.push({ name: param.name, isConst: false, from: blockFrom, blockFrom, blockTo });
  }
  const bind = (name: string, isConst: boolean, from: number, range: { from: number; to: number }) => {
    out.push({ name, isConst, from, blockFrom: range.from, blockTo: range.to });
  };
  const walkBlock = (block: AstStatBlock, range: { from: number; to: number }): void => {
    for (const stat of block.body) walkStat(stat, range);
  };
  const blockRange = (block: AstStatBlock) => ({
    from: offsetAt(block.location.begin, ctx),
    to: offsetAt(block.location.end, ctx),
  });
  const walkStat = (stat: AstStat, range: { from: number; to: number }): void => {
    const s = stat instanceof AstStatSparkdownExplicit ? stat.statement : stat;
    if (s instanceof AstStatBlock) {
      walkBlock(s, blockRange(s));
      return;
    }
    if (s instanceof AstStatLocal) {
      const from = offsetAt(s.location.end, ctx);
      for (const v of s.vars) bind(v.name, s.isConst, from, range);
      nested(s);
      return;
    }
    if (s instanceof AstStatLocalFunction) {
      bind(s.name.name, s.isConst, offsetAt(s.location.begin, ctx), range);
      return;
    }
    if (s instanceof AstStatFor || s instanceof AstStatForIn) {
      const bodyRange = blockRange(s.body);
      const vars = s instanceof AstStatFor ? [s.variable] : s.vars;
      for (const v of vars) bind(v.name, false, bodyRange.from, bodyRange);
      walkBlock(s.body, bodyRange);
      return;
    }
    if (s instanceof AstStatRepeat) {
      walkBlock(s.body, { from: offsetAt(s.body.location.begin, ctx), to: offsetAt(s.location.end, ctx) });
      return;
    }
    nested(s);
  };
  const nested = (stat: AstNode): void => {
    visitAst(stat, {
      visit: (node) => {
        if (node === stat) return true;
        if (node instanceof AstExprFunction) return false;
        const scopes = alternatorScopesOf(node, ctx);
        if (scopes) {
          for (const scope of scopes) {
            for (const part of scope.parts) {
              if (part instanceof AstStatBlock) walkBlock(part, scope);
              else nested(part);
            }
          }
          return false;
        }
        if (node instanceof AstStatBlock) {
          walkBlock(node, blockRange(node));
          return false;
        }
        if (node instanceof AstStatFor || node instanceof AstStatForIn || node instanceof AstStatRepeat) {
          walkStat(node, blockRange(node.body));
          return false;
        }
        return true;
      },
    });
  };
  walkBlock(body, { from: blockFrom, to: blockTo });
  return out;
}

export function resolveFunctionBinding(
  name: string,
  at: number,
  ctx: LowerContext,
): FunctionBinding | undefined {
  const stack = ctx.functionBindingsStack;
  if (!stack) return undefined;
  for (let i = stack.length - 1; i >= 0; i--) {
    let found: FunctionBinding | undefined;
    for (const b of stack[i]!) {
      if (b.name !== name || b.from > at || at < b.blockFrom || at > b.blockTo) continue;
      if (!found || b.from >= found.from) found = b;
    }
    if (found) return found;
  }
  return undefined;
}
