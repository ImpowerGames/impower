import {
  AstExpr,
  AstExprCall,
  AstExprConstantString,
  AstExprGlobal,
  AstExprGroup,
  AstExprIndexExpr,
  AstExprIndexName,
  AstExprLocal,
  AstExprTypeAssertion,
  AstStatAssign,
  AstStatLocal,
  AstTypeGroup,
  AstTypeTypeof,
  visitAst,
  type AstLocal,
  type AstNode,
  type AstStatBlock,
} from "../../compiler/typecheck/Ast";

// Test-only port of pinned RequireTracer.cpp and Fixture.cpp's file resolver.
// Both checker call sites query this exact node map: the generator supplies
// the argument; MagicRequire supplies the full call. No recursive call peeling.
export function traceFixtureRequires(root: AstStatBlock, current: string) {
  const calls: AstExprCall[] = [];
  const locals = new Map<AstLocal, AstExpr | undefined>();
  visitAst(root, {
    visit(node) {
      if (node instanceof AstExprTypeAssertion) return false;
      if (
        node instanceof AstExprCall &&
        node.func instanceof AstExprGlobal &&
        node.func.name === "require" &&
        node.args.length >= 1
      )
        calls.push(node);
      if (node instanceof AstStatLocal)
        for (let i = 0; i < node.vars.length && i < node.values.length; ++i)
          locals.set(node.vars[i]!, node.values[i]!);
      if (node instanceof AstStatAssign)
        for (const variable of node.vars)
          if (variable instanceof AstExprLocal)
            locals.set(variable.local, undefined);
      return true;
    },
  });
  const dependent = (node: AstNode): AstNode | undefined => {
    if (node instanceof AstExprLocal) return locals.get(node.local);
    if (node instanceof AstExprIndexName || node instanceof AstExprIndexExpr)
      return node.expr;
    if (node instanceof AstExprCall && node.self)
      return (node.func as AstExprIndexName).expr;
    if (node instanceof AstExprGroup) return node.expr;
    if (node instanceof AstExprTypeAssertion) return node.annotation;
    if (node instanceof AstTypeGroup) return node.type;
    if (node instanceof AstTypeTypeof) return node.expr;
    return undefined;
  };
  const resolve = (context: string | undefined, node: AstExpr) => {
    if (node instanceof AstExprGlobal) {
      if (node.name === "game" || node.name === "workspace") return node.name;
      if (node.name === "script") return context;
    } else if (node instanceof AstExprIndexName && context !== undefined) {
      if (node.index === "Parent") {
        const slash = context.lastIndexOf("/");
        return slash < 0 ? undefined : context.slice(0, slash);
      }
      return context + "/" + node.index;
    } else if (
      node instanceof AstExprIndexExpr &&
      context !== undefined &&
      node.index instanceof AstExprConstantString
    )
      return context + "/" + stringPath(node.index.value);
    else if (
      node instanceof AstExprCall &&
      node.self &&
      node.args[0] instanceof AstExprConstantString &&
      context === "game" &&
      (node.func as AstExprIndexName).index === "GetService"
    )
      return "game/" + stringPath(node.args[0].value);
    return undefined;
  };
  const expressions = new Map<AstNode, string>();
  const work: AstNode[] = calls.map((call) => call.args[0]!);
  for (let i = 0; i < work.length; ++i) {
    const dep = dependent(work[i]!);
    if (dep) work.push(dep);
  }
  for (let i = work.length; i > 0; --i) {
    const node = work[i - 1]!;
    if (expressions.has(node)) continue;
    const dep = dependent(node);
    const context = dep ? expressions.get(dep) : current;
    let name: string | undefined;
    if (
      dep &&
      context !== undefined &&
      (node instanceof AstExprLocal ||
        node instanceof AstExprGroup ||
        node instanceof AstTypeGroup ||
        node instanceof AstTypeTypeof ||
        node instanceof AstExprTypeAssertion)
    )
      name = context;
    else if (node instanceof AstExpr) name = resolve(context, node);
    if (name !== undefined) expressions.set(node, name);
  }
  const dependencies: string[] = [];
  // Preserve upstream preorder and its unresolved empty-name sentinel. In a
  // nested require, the inner call acquires its map entry after the outer call.
  for (const call of calls) {
    const name = expressions.get(call.args[0]!);
    if (name !== undefined) dependencies.push(name);
    expressions.set(call, name ?? "");
  }
  return { expressions, dependencies };
}

// AST strings contain bytes; moduleSources keys are Unicode JS text. Preserve
// valid UTF-8 including NUL; reject invalid bytes rather than invent a path.
// A leading BOM is path text, not an encoding signature (ignoreBOM preserves it).
function stringPath(bytes: string): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    Uint8Array.from(bytes, (c) => c.charCodeAt(0)),
  );
}
