import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lower } from "../lower";
import { lowerPrimary } from "../expression/lowerExpression";

// Build a statement-form `Divert` ParsedObject from a
// `LuauDivertTargetLiteral` syntax node. Mirrors what
// `expression/lowerExpression.ts > lowerDivertTargetLiteral` does for
// the value form, but produces a bare `Divert` (which executes as
// flow control) instead of wrapping in `DivertTarget` (which produces
// a `DivertTargetValue` and emits it to the output stream). Used by
// the inline-alternator arm path so `{chain | -> next | other end}`
// transfers control on arm 1 instead of emitting "DivertTargetValue(next)".
function buildDivertFromTargetLiteral(
  node: SyntaxNode,
  ctx: LowerContext,
): Divert | null {
  const parts: Identifier[] = [];
  // Recursive in-order walk so `DivertPartName` nodes are collected in
  // source order (`knot.stitch.choice`, not the reversed `choice.stitch.knot`
  // that a stack-based DFS would produce).
  const visit = (n: SyntaxNode): void => {
    if (n.name === "DivertPartName") {
      parts.push(new Identifier(ctx.read(n.from, n.to)));
    }
    let kid = n.firstChild;
    while (kid) {
      visit(kid);
      kid = kid.nextSibling;
    }
  };
  visit(node);
  if (parts.length === 0) return null;
  return new Divert(parts);
}

export interface AlternatorArm {
  // Bare-identifier key for conditional arms (`| warrior = ...`). null for
  // sequential arms (`| body`).
  key: string | null;
  body: ParsedObject[];
}

// Walks the content of an alternator block, partitioning children into arms
// delimited by `LuauAlternatorSeparator`. Each arm's body nodes are lowered
// via the main dispatcher and unwrapped from their `Weave` containers.
export function lowerArms(
  content: SyntaxNode | null,
  ctx: LowerContext,
): AlternatorArm[] {
  const arms: AlternatorArm[] = [];
  if (!content) return arms;
  let current: AlternatorArm | null = null;

  let child = content.firstChild;
  while (child) {
    if (child.name === "LuauAlternatorSeparator") {
      const keyNode = getDescendent("LuauAlternatorAssignmentName", child);
      const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : null;
      current = { key, body: [] };
      arms.push(current);
    } else if (
      current &&
      (child.name === "LuauSparkdownInlineGluedAlternatorArm" ||
        child.name === "LuauSparkdownAlternatorArm")
    ) {
      // Wrapped alternator arms used by:
      //   - inline-glued form (`..queue|A|B|C..`)
      //   - single-line block form (`queue | A | B | C end`)
      // The arm's `_content` may contain plain text (Word / Space /
      // Punctuation children) and / or `ArmTag` annotations
      // (`# tag content`). We walk the children: text-shaped children
      // accumulate into a single `Text` ParsedObject (preserving
      // whitespace between words), and `ArmTag` children emit a
      // `Tag(start)` + `Text(tagContent)` + `Tag(end)` triplet so the
      // runtime collects them into `currentTags` when the arm runs.
      // For the single-line block form we also append a trailing
      // `"\n"` so each visit ends a display line — matching the
      // multi-line block-form arm shape (which routes through
      // `ImplicitAction` → display line + newline). The inline-glued
      // form is spliced into surrounding text and doesn't want a
      // trailing newline; the caller's display lowerer handles line
      // breaks.
      const armContent = findChildByName(child, `${child.name}_content`);
      if (armContent) {
        lowerArmContent(armContent, current.body, ctx);
        if (child.name === "LuauSparkdownAlternatorArm") {
          current.body.push(new Text("\n"));
        }
      }
    } else if (current) {
      // Special case: inline alternators (`LuauSequentialAlternatorBlock`,
      // no Sparkdown prefix) use `#LuauExpression` for arm content. A
      // `-> target` literal inside an arm would normally lower as a
      // `LuauDivertTargetLiteral` value expression (producing a
      // `DivertTargetValue` emitted to the output stream — not what the
      // author meant). Detect the divert-shape and route it through the
      // statement-form divert lowerer so the chosen arm's runtime
      // transfers control instead of emitting the target as a value.
      // Both the bare `LuauDivertTargetLiteral` and a wrapping
      // `LuauAccessPath > LuauDivertTargetLiteral` shape can occur
      // depending on how the grammar's expression matcher segments the
      // token stream.
      const divertLiteral =
        child.name === "LuauDivertTargetLiteral"
          ? child
          : getDescendent("LuauDivertTargetLiteral", child);
      if (divertLiteral) {
        const divert = buildDivertFromTargetLiteral(divertLiteral, ctx);
        if (divert) {
          current.body.push(divert);
          child = child.nextSibling;
          continue;
        }
      }

      const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
      if (block?.content) {
        for (const obj of block.content) {
          if (obj instanceof Weave) {
            for (const inner of obj.content) current.body.push(inner);
          } else {
            current.body.push(obj);
          }
        }
      } else {
        // `lower()` returned `undefined` — the child isn't a top-level
        // statement node. This is the common case in *inline* alternators
        // (`{queue|A|B|C end}`), where each arm body is a bare expression
        // (LuauAccessPath, LuauNumber, LuauString, ...). Lower as a value
        // expression and mark `outputWhenComplete` so its result emits
        // into the surrounding output stream — same behavior as a normal
        // `{expr}` interpolation, just nested inside the alternator's
        // chosen arm.
        const expr = lowerPrimary(child, ctx);
        if (expr) {
          expr.outputWhenComplete = true;
          current.body.push(expr);
        }
      }
    }
    child = child.nextSibling;
  }
  return arms;
}

export function findChildByName(
  parent: SyntaxNode,
  name: string,
): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

// Walks the children of a `LuauSparkdown*AlternatorArm_content` node
// and emits the arm body into `out`. Splits the arm's content into
// runs of plain text (Word / Space / Punctuation / etc.) and `ArmTag`
// annotations:
//   - Text runs become a single `Text` ParsedObject (trailing
//     whitespace stripped from the final run to drop the
//     pre-boundary space that the arm rule's end-pattern leaves on
//     the trailing content).
//   - `ArmTag` nodes emit `Tag(true)` + `Text(tagContent)` +
//     `Tag(false)` so the runtime collects them into `currentTags`
//     via the `BeginTag` / `EndTag` control-command pair.
function lowerArmContent(
  armContent: SyntaxNode,
  out: ParsedObject[],
  ctx: LowerContext,
): void {
  let textBuf = "";
  const flushText = (trim: boolean): void => {
    let text = textBuf;
    if (trim) text = text.replace(/\s+$/, "");
    if (text.length > 0) out.push(new Text(text));
    textBuf = "";
  };
  let child = armContent.firstChild;
  while (child) {
    if (child.name === "ArmTag") {
      // Strip the trailing whitespace that's part of the surrounding
      // text run; don't trim mid-arm leading whitespace that belongs
      // to the text immediately before the tag.
      flushText(true);
      // ArmTag's third capture is the tag content (everything after `#`).
      const tagContent = findChildByName(child, "ArmTag_c3");
      const raw = tagContent
        ? ctx.read(tagContent.from, tagContent.to).trim()
        : "";
      if (raw.length > 0) {
        out.push(new Tag(true));
        out.push(new Text(raw));
        out.push(new Tag(false));
      }
    } else if (child.name === "ArmDivert") {
      // Structural divert inside the arm — route through the main
      // dispatcher so `-> target` becomes a real `Divert` ParsedObject
      // (with proper path resolution, argument lowering, and
      // `isTunnel` flag handling) rather than literal text. This is
      // what makes the flat-weave-style "alternator arm pivots to
      // another path" idiom work in sparkdown:
      //   {chain | -> next_scene | other_text end}
      // The arm's `ArmDivert` grammar rule has the same captures as the
      // standard `Divert` rule but with an end pattern that respects
      // alternator-arm boundaries (`|`, `end`, NL). The lowerer
      // dispatch (`lower.ts`) treats `ArmDivert` exactly like `Divert`.
      flushText(true);
      const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
      if (block?.content) {
        for (const obj of block.content) {
          if (obj instanceof Weave) {
            for (const inner of obj.content) out.push(inner);
          } else {
            out.push(obj);
          }
        }
      }
    } else {
      // Plain text child (Word / Space / Punctuation / Escape /
      // interpolation result, etc.). Accumulate the raw source text;
      // the runtime concatenates Text runs into the output stream.
      textBuf += ctx.read(child.from, child.to);
    }
    child = child.nextSibling;
  }
  flushText(true);
}
