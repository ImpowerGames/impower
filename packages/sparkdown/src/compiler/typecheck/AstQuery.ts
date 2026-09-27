// Finding the node and type at a position, ported from Luau's
// `AstQuery.h`/`AstQuery.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`).

import { AstExpr, AstStatBlock, AstStatFunction, AstType, AstTypePack, visitAst, type AstNode, type AstVisitor } from "./Ast";
import type { Position } from "./Location";
import type { Module, SourceModule } from "./Module";
import type { TypeId } from "./Type";

/**
 * Finds the innermost node containing a position (Luau's `FindNode`). As
 * with Luau's visitor, types and type packs are never entered.
 */
class FindNode implements AstVisitor {
  best: AstNode | undefined;

  constructor(
    readonly pos: Position,
    readonly documentEnd: Position,
  ) {}

  visit(node: AstNode): boolean {
    if (node instanceof AstType || node instanceof AstTypePack) return false;
    if (node instanceof AstStatFunction) {
      this.visitNode(node);
      if (node.name.location.contains(this.pos)) visitAst(node.name, this);
      else if (node.func.location.contains(this.pos)) visitAst(node.func, this);
      return false;
    }
    if (node instanceof AstStatBlock) {
      this.visitNode(node);
      for (const stat of node.body) {
        if (stat.location.end.lt(this.pos)) continue;
        if (stat.location.begin.gt(this.pos)) break;
        visitAst(stat, this);
      }
      return false;
    }
    return this.visitNode(node);
  }

  private visitNode(node: AstNode): boolean {
    if (node.location.contains(this.pos)) {
      this.best = node;
      return true;
    }
    // At the very end of the document, the innermost node ending there is the answer.
    if (node.location.end.equals(this.documentEnd) && this.pos.ge(this.documentEnd)) {
      this.best = node;
      return true;
    }
    return false;
  }
}

export function findNodeAtPosition(root: AstStatBlock, pos: Position): AstNode | undefined {
  const end = root.location.end;
  if (pos.lt(root.location.begin)) return root;
  if (pos.gt(end)) pos = end;
  const findNode = new FindNode(pos, end);
  findNode.visit(root);
  return findNode.best;
}

export function findExprAtPosition(source: SourceModule, pos: Position): AstExpr | undefined {
  const node = findNodeAtPosition(source.root, pos);
  return node instanceof AstExpr ? node : undefined;
}

export function findTypeAtPosition(module: Module, sourceModule: SourceModule, pos: Position): TypeId | undefined {
  const expr = findExprAtPosition(sourceModule, pos);
  return expr ? module.astTypes.get(expr) : undefined;
}
