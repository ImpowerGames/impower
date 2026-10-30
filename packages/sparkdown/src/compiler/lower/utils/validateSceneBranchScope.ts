import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { isLuauDocument } from "../../typecheck/LuauUnitNodes";
import type { LowerContext } from "../context";
import { statementSource } from "./statementSource";

function findsMatchingEnd(decl: SyntaxNode): boolean {
  let depth = 1;
  let cur = decl.nextSibling;
  while (cur) {
    if (cur.name === "Scene" || cur.name === "Branch") {
      depth += 1;
    } else if (cur.name === "LuauEndKeyword") {
      depth -= 1;
      if (depth === 0) return true;
    }
    cur = cur.nextSibling;
  }
  return false;
}

function isInsideScene(branch: SyntaxNode): boolean {
  let pendingEnds = 0;
  let cur = branch.prevSibling;
  while (cur) {
    if (cur.name === "LuauEndKeyword") {
      pendingEnds += 1;
    } else if (cur.name === "Branch") {
      if (pendingEnds === 0) {
        return false;
      }
      pendingEnds -= 1;
    } else if (cur.name === "Scene") {
      if (pendingEnds === 0) return true;
      pendingEnds -= 1;
    }
    cur = cur.prevSibling;
  }
  return false;
}

function inLuauDocument(ctx: LowerContext): boolean {
  return ctx.filePath !== undefined && isLuauDocument(ctx.filePath);
}

export function validateScene(
  decl: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  if (inLuauDocument(ctx)) return [];
  if (!findsMatchingEnd(decl)) {
    return [
      {
        message:
          "Scene is missing its closing `end` keyword. Every `scene` block must be terminated by an explicit `end` at the same indentation as the `scene` keyword.",
        severity: ErrorType.Error,
        source: statementSource(decl, ctx),
      },
    ];
  }
  return [];
}

export function validateBranch(
  decl: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  if (inLuauDocument(ctx)) return [];
  const diagnostics: InkDiagnostic[] = [];
  if (!isInsideScene(decl)) {
    diagnostics.push({
      message:
        "Branches are only allowed inside a `scene` block. Move this branch inside an enclosing `scene ... end`, or change it to a scene.",
      severity: ErrorType.Error,
      source: statementSource(decl, ctx),
    });
  }
  if (!findsMatchingEnd(decl)) {
    diagnostics.push({
      message:
        "Branch is missing its closing `end` keyword. Every `branch` block must be terminated by an explicit `end` at the same indentation as the `branch` keyword.",
      severity: ErrorType.Error,
      source: statementSource(decl, ctx),
    });
  }
  return diagnostics;
}
