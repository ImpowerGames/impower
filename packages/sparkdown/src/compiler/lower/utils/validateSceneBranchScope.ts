import { type SyntaxNode } from "@lezer/common";
import { ErrorType, SourceMetadata } from "../../../inkjs/engine/Error";
import { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { LowerContext } from "../context";

// Scope-rule validation for `Scene` and `Branch` declarations. Scenes
// and branches are boundary-only Scoped rules in the grammar (see
// docs/compiler/GRAMMAR.md) — the body lives at root, and the explicit `end`
// keyword that terminates the block is matched as a separate
// top-level `LuauEndKeyword` sibling. The lowerer enforces the
// pairing rules:
//
//   - Every `Scene` must be followed (eventually, at root level) by
//     a matching `LuauEndKeyword` before the next `Scene` or EOF.
//   - Every `Branch` must be inside an active `Scene` (a Scene appears
//     earlier at root level with no matching `end` yet) AND must
//     itself be followed by a matching `LuauEndKeyword` before the
//     enclosing scene's `end`.
//
// Both checks are linear sibling walks over the parse tree, which
// keeps them out of the parser and avoids wrapping potentially-large
// regions in Scoped rules.

function makeSource(node: SyntaxNode, ctx: LowerContext): SourceMetadata {
  return {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(node.from) + 1,
    endLineNumber: ctx.lineNumber(node.to) + 1,
    startCharacterNumber: ctx.characterNumber(node.from) + 1,
    endCharacterNumber: ctx.characterNumber(node.to) + 1,
  };
}

// Walks forward from `decl` over root-level siblings, tracking
// scene/branch nesting depth (start at 1 — `decl` itself is the
// scope we're checking). Returns `true` iff a matching
// `LuauEndKeyword` is found before EOF or before a "wrong" boundary
// (e.g. a new `Scene` while still inside another).
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

// Walks backward from `branch` over root-level siblings, tracking
// `end` depth (we want to find a `Scene` declaration that hasn't yet
// been closed). Returns `true` iff a `Scene` is found "above" us in
// source order with no matching `end` between it and the branch.
function isInsideScene(branch: SyntaxNode): boolean {
  let pendingEnds = 0;
  let cur = branch.prevSibling;
  while (cur) {
    if (cur.name === "LuauEndKeyword") {
      pendingEnds += 1;
    } else if (cur.name === "Branch") {
      if (pendingEnds === 0) {
        // Outer Branch with no end of its own yet — branches don't
        // nest in branches, so this is a malformed file rather than
        // a valid enclosing context. Keep walking; the outer caller
        // will error on the *outer* branch.
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

export function validateScene(
  decl: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  if (!findsMatchingEnd(decl)) {
    return [
      {
        message:
          "Scene is missing its closing `end` keyword. Every `scene` block must be terminated by an explicit `end` at the same indentation as the `scene` keyword.",
        severity: ErrorType.Error,
        source: makeSource(decl, ctx),
      },
    ];
  }
  return [];
}

export function validateBranch(
  decl: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  if (!isInsideScene(decl)) {
    diagnostics.push({
      message:
        "Branches are only allowed inside a `scene` block. Move this branch inside an enclosing `scene ... end`, or change it to a scene.",
      severity: ErrorType.Error,
      source: makeSource(decl, ctx),
    });
  }
  if (!findsMatchingEnd(decl)) {
    diagnostics.push({
      message:
        "Branch is missing its closing `end` keyword. Every `branch` block must be terminated by an explicit `end` at the same indentation as the `branch` keyword.",
      severity: ErrorType.Error,
      source: makeSource(decl, ctx),
    });
  }
  return diagnostics;
}
