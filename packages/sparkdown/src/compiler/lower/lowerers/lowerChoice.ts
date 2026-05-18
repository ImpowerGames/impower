import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { Choice } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { ContentList } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ContentList";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { SourceMetadata } from "../../../inkjs/engine/Error";
import {
  CompiledBlock,
  InkDiagnostic,
} from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import { buildDivert } from "../utils/buildDivert";
import { wrapInWeave } from "../utils/wrapInWeave";

// Lowers a single `*` (once-only) or `+` (sticky) choice. Captures the
// choice mark, optional label, choice text (split across `startContent`
// / `choiceOnlyContent` / `innerContent`), the optional `[suppressed]`
// bracket form, and the trailing divert. Mirrors ink's three-part
// choice anatomy:
//
//   * shared [label-only] chosen-only -> target
//      ^^^^^^^ ^^^^^^^^^^^^ ^^^^^^^^^^^
//      start   choiceOnly   inner
//
//   Choice label  = startContent + choiceOnlyContent     ("shared label-only")
//   Chosen output = startContent + innerContent + divert ("shared chosen-only")
//
// For an unbracketed `* plain text -> target`, all the text goes in
// `startContent` (label and chosen output are identical).
// Walk up from `node` looking for a `choose`-related ancestor. A choice
// (`* ...` / `+ ...`) only makes sense inside a `choose ... end` block;
// at file or scene level it's almost always a typo (the author forgot
// to wrap the choices in `choose`), so we want to flag it loudly
// rather than let the grammar silently parse it as a top-level choice.
function isInsideChoose(node: SyntaxNode): boolean {
  let cur: SyntaxNode | null = node.parent;
  while (cur) {
    if (
      cur.name === "LuauSparkdownChooseBlock" ||
      cur.name === "LuauSparkdownChooseThenClause"
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

export function lowerChoice(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const markNode = getDescendent("ChoiceMark", nodeRef.node);
  const markText = markNode ? ctx.read(markNode.from, markNode.to) : "";
  const onceOnly = markText.includes("*");
  // The number of `*` / `+` characters in the mark determines weave
  // nesting depth — `* one` is depth 1, `* * two` is depth 2 (nested
  // under depth-1), etc. inkjs's `Weave` assembly uses this to figure
  // out which choices are siblings vs. children. A `-` gather at
  // depth N collects all loose ends at depth ≥ N.
  const depth = (markText.match(/[*+]/g) ?? []).length || 1;

  const labelName = getDescendent("LabelDeclarationName", nodeRef.node);
  const identifier = labelName
    ? new Identifier(ctx.read(labelName.from, labelName.to))
    : null;

  const startContent = new ContentList();
  const choiceOnlyContent = new ContentList();
  const innerContent = new ContentList();

  // Two grammar shapes for the choice body, picked at parse time:
  //   - `ChoiceWithSuppressedText` for `foo[bar]baz -> target`
  //   - `ChoiceWithNoSuppressedText` for `plain text -> target`
  // The bracket form splits text into three chunks corresponding
  // exactly to the three ContentLists ink wants.
  const bracketed = getDescendent("ChoiceWithSuppressedText", nodeRef.node);
  const unbracketed = getDescendent("ChoiceWithNoSuppressedText", nodeRef.node);

  let hasWeaveStyleInlineBrackets = false;

  if (bracketed) {
    hasWeaveStyleInlineBrackets = true;
    // Each capture is wrapped by a uniquely-named rule (§6.4: address
    // captures by name, not by `_cN` index). The wrappers mirror ink's
    // three-part choice anatomy:
    //   ChoiceStartText → text before `[`  (startContent)
    //   ChoiceOnlyText  → text inside `[]` (choiceOnlyContent)
    //   ChoiceInnerText → text after `]`   (innerContent)
    appendTextFromCapture(bracketed, "ChoiceStartText", ctx, startContent);
    appendTextFromCapture(bracketed, "ChoiceOnlyText", ctx, choiceOnlyContent);
    appendTextFromCapture(bracketed, "ChoiceInnerText", ctx, innerContent);
  } else if (unbracketed) {
    // Plain choice: all visible text goes in startContent (label and
    // chosen output are the same).
    appendTextFromCapture(unbracketed, "ChoicePlainText", ctx, startContent);
  }

  // Same-line vs next-line divert handling. `getDescendent` walks
  // the choice subtree, so a divert it finds was on the SAME line as
  // the choice text (the grammar captures inline diverts inside the
  // choice's text-body rule). A next-line divert parses as a separate
  // top-level node — invisible to this descendent lookup — and is
  // handled by `parseIncrementally`'s "closest weave" attachment.
  const divertNode = getDescendent("Divert", nodeRef.node);
  const divertObjects = divertNode ? buildDivert(divertNode, ctx) : [];
  if (divertObjects.length > 0) {
    // For an inline divert like `* hello -> world`, preserve the
    // whitespace between the choice text and the `->` so the chosen
    // output reads `"hello world\n"` (not `"helloworld\n"`). The
    // grammar puts that whitespace in capture c3 of the unbracketed
    // form or c6 of the bracketed form, sitting between the text and
    // the divert. We grab it from the source range
    // `[end-of-text..start-of-divert]`. Skip the whitespace when the
    // choice has no visible text anywhere (e.g. `* -> target`
    // fallback) — the gap is just between the choice mark and the
    // divert mark and shouldn't surface as a stray space.
    const choiceHasVisibleText =
      startContent.content.length > 0 ||
      choiceOnlyContent.content.length > 0 ||
      innerContent.content.length > 0;
    if (choiceHasVisibleText) {
      const divertMark = getDescendent("DivertMark", divertNode!);
      const pivot = divertMark ? divertMark.from : divertNode!.from;
      const whitespaceBeforeDivert = collectTrailingWhitespace(
        nodeRef.node,
        pivot,
        ctx,
      );
      if (whitespaceBeforeDivert.length > 0) {
        innerContent.AddContent(new Text(whitespaceBeforeDivert));
      }
    }
    for (const obj of divertObjects) {
      innerContent.AddContent(obj);
    }
  } else if (!divertNode) {
    // No inline divert. Append a newline so the chosen output ends
    // with `\n` like a regular display line (matches inkjs's
    // weave_options test: `* Hello[.], world.` produces
    // `"Hello, world.\n"` after choosing).
    //
    // Skip the newline append when the next significant sibling is a
    // `DoneStatement` / `FinStatement` — those keywords replace the
    // old inline `-> DONE` / `-> END` forms, and matching the inline
    // form's "no trailing newline" semantics keeps `* "X"\n  fin`
    // producing the same chosen output as the old `* "X" -> END`.
    if (!nextSignificantSiblingIsTerminator(nodeRef.node)) {
      innerContent.AddContent(new Text("\n"));
    }
  }
  // If `divertNode` was present but `buildDivert` returned undefined
  // (empty target `* ->`), leave `innerContent` empty — the choice
  // becomes an `isInvisibleDefault` fallback whose loose-end gets
  // resolved by inkjs's `Weave.AddRuntimeForGather` to the next gather.

  const choice = new Choice(startContent, choiceOnlyContent, innerContent);
  choice.onceOnly = onceOnly;
  choice.hasWeaveStyleInlineBrackets = hasWeaveStyleInlineBrackets;
  choice.indentationDepth = depth;
  if (identifier) {
    choice.identifier = identifier;
  }

  // Choice condition (`* if cond text`) — captured by the grammar as a
  // `ChoiceCondition` named wrapper child. `collectChoiceCondition`
  // walks for that wrapper and lowers its inner expression. inkjs's
  // `Choice.GenerateRuntimeObject` emits the condition and sets
  // `runtimeChoice.hasCondition = true`; an empty/no-condition choice
  // keeps its current runtime shape.
  const condition = collectChoiceCondition(nodeRef.node, ctx);
  if (condition) {
    choice.condition = condition;
  }

  // Fallback (invisible default) choice: no visible label text in either
  // `startContent` (text before/around the brackets) or `choiceOnlyContent`
  // (text inside the brackets). Forms: `* -> target` (no text, divert),
  // `* []` (empty bracket), `* {cond} -> target` (guarded fallback).
  // The runtime's `TryFollowDefaultInvisibleChoice` auto-picks these
  // when no visible choices remain. inkjs's `Choice.GenerateRuntimeObject`
  // propagates this flag to `ChoicePoint.isInvisibleDefault`.
  if (
    startContent.content.length === 0 &&
    choiceOnlyContent.content.length === 0
  ) {
    choice.isInvisibleDefault = true;
  }

  // Compile-time warnings — mirror inkjs's `InkParser`-side checks for
  // empty / blank choices. inkjs's checks live in `InkParser` itself
  // (not in `ExportRuntime`), so they don't fire automatically through
  // sparkdown's grammar-tree pipeline. Surface them here in the lowerer
  // instead.
  const diagnostics: InkDiagnostic[] = [];
  // Stray choice mark outside `choose ... end` — almost always a typo.
  // The grammar permits `*` / `+` at scene level for legacy reasons
  // (and to keep the parse tree well-formed for syntax highlighting),
  // but at compile time it's an error.
  if (!isInsideChoose(nodeRef.node)) {
    diagnostics.push({
      message:
        "Choice mark (`*` / `+`) must appear inside a `choose ... end` block. Wrap the choices in `choose` or remove the mark.",
      severity: ErrorType.Error,
      source: makeSource(nodeRef.node, ctx),
    });
  }
  const onlyHasAutoNewline =
    innerContent.content.length === 1 &&
    innerContent.content[0] instanceof Text &&
    (innerContent.content[0] as Text).text === "\n";
  const allContentEmpty =
    startContent.content.length === 0 &&
    choiceOnlyContent.content.length === 0 &&
    (innerContent.content.length === 0 || onlyHasAutoNewline);
  if (allContentEmpty && !divertNode) {
    diagnostics.push({
      message:
        "Choice is completely empty. Interpreting as a default fallback choice. Add a divert arrow to remove this warning: * ->",
      severity: ErrorType.Warning,
      source: makeSource(nodeRef.node, ctx),
    });
  }
  if (
    startContent.content.length === 0 &&
    hasWeaveStyleInlineBrackets &&
    choiceOnlyContent.content.length === 0
  ) {
    diagnostics.push({
      message:
        "Blank choice - if you intended a default fallback choice, use the `* ->` syntax",
      severity: ErrorType.Warning,
      source: makeSource(nodeRef.node, ctx),
    });
  }

  const block = wrapInWeave([choice]);
  if (diagnostics.length > 0) {
    block.diagnostics = diagnostics;
  }
  return block;
}

function makeSource(choiceNode: SyntaxNode, ctx: LowerContext): SourceMetadata {
  return {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(choiceNode.from) + 1,
    endLineNumber: ctx.lineNumber(choiceNode.to) + 1,
    startCharacterNumber: ctx.characterNumber(choiceNode.from) + 1,
    endCharacterNumber: ctx.characterNumber(choiceNode.to) + 1,
  };
}

function collectChoiceCondition(
  choiceNode: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  // Sparkdown's choice-gate form: `* if cond text` — the `if` keyword
  // sits between the choice mark (or label) and the choice text, and
  // the cond expression is wrapped by the `ChoiceCondition` named rule
  // (§6.4: address captures by name, not by auto-generated `_cN` index).
  // `not` prefix and parenthesized expressions are also accepted.
  // Lowering treats the captured node as a normal expression
  // (`LuauAccessPath`, `LuauParenthetical`, etc.) and assigns it to
  // `choice.condition` — inkjs's `Choice.GenerateRuntimeObject` then
  // emits the condition + flips `hasCondition` on the runtime choice.
  const condCapture = getDescendent("ChoiceCondition", choiceNode);
  if (!condCapture) return null;
  return lowerExpressionFromContainer(condCapture, ctx);
}

function findDirectChild(parent: SyntaxNode, name: string): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

// Walks the named capture child and appends its contents to the given
// ContentList. Text outside of `Tag` nodes is emitted as `Text` parsed
// objects (preserving authorial spacing — `foo [bar] baz` with
// surrounding spaces survives). Each `Tag` descendant is emitted as the
// `Tag(true) + Text(name) + Tag(false)` triple that inkjs's
// `Choice.GenerateRuntimeObject` translates into a `BeginTag`/`EndTag`
// pair in the choice's runtime container — those tags then attach to
// `Choice.tags` (when in start/choice-only content) or flow into
// `currentTags` (when in inner content).
function appendTextFromCapture(
  parent: SyntaxNode,
  captureName: string,
  ctx: LowerContext,
  list: ContentList,
): boolean {
  // A capture's text range can contain multiple matches of the inner
  // pattern — each emits its own wrapper node as a sibling (e.g. `c5`
  // for the post-bracket text of a choice can have several
  // `ChoiceInnerText` siblings, one per inner `DisplayText` match).
  // Walk every wrapper with the given name inside `parent` and append
  // each in source order.
  let appended = false;
  const stack: SyntaxNode[] = [parent];
  const matches: SyntaxNode[] = [];
  while (stack.length > 0) {
    const node = stack.pop()!;
    let child = node.firstChild;
    while (child) {
      if (child.name === captureName) {
        matches.push(child);
        // Don't descend into the wrapper — its inner text is what we'll
        // process via `appendNodeContent`.
      } else {
        stack.push(child);
      }
      child = child.nextSibling;
    }
  }
  matches.sort((a, b) => a.from - b.from);
  for (const node of matches) {
    if (appendNodeContent(node, ctx, list)) appended = true;
  }
  return appended;
}

function appendNodeContent(
  captureNode: SyntaxNode,
  ctx: LowerContext,
  list: ContentList,
): boolean {
  // Collect top-level `Tag` and `LuauInterpolatedStringExpression`
  // nodes inside this capture range. They split the capture into
  // text segments + tag emissions + inline expressions. Don't
  // descend into `Tag` (its own interpolation handling lives below),
  // and don't descend into an outer interpolation node (its content
  // is the expression itself, not nested text).
  type Marker =
    | { kind: "tag"; node: SyntaxNode }
    | { kind: "expr"; node: SyntaxNode };
  const markers: Marker[] = [];
  const walk = (node: SyntaxNode): void => {
    if (node.name === "Tag") {
      markers.push({ kind: "tag", node });
      return;
    }
    if (node.name === "LuauInterpolatedStringExpression") {
      markers.push({ kind: "expr", node });
      return;
    }
    let child = node.firstChild;
    while (child) {
      walk(child);
      child = child.nextSibling;
    }
  };
  walk(captureNode);
  markers.sort((a, b) => a.node.from - b.node.from);

  let appended = false;
  let cursor = captureNode.from;
  const flushText = (to: number): void => {
    if (to > cursor) {
      const text = ctx.read(cursor, to);
      if (text.length > 0) {
        list.AddContent(new Text(text));
        appended = true;
      }
    }
    cursor = to;
  };
  for (const m of markers) {
    flushText(m.node.from);
    if (m.kind === "expr") {
      const expr = lowerExpressionFromContainer(m.node, ctx);
      if (expr) {
        expr.outputWhenComplete = true;
        list.AddContent(expr);
        appended = true;
      }
    } else {
      const tagContent = getDescendent("TagContent", m.node);
      list.AddContent(new Tag(true, true));
      if (tagContent) {
        if (appendTagContent(tagContent, ctx, list)) {
          appended = true;
        }
      }
      list.AddContent(new Tag(false, true));
    }
    cursor = m.node.to;
  }
  flushText(captureNode.to);
  return appended;
}

// Tag bodies support `{var}` interpolations (`# tag {var}`). The grammar's
// `TagContent` is a flat text-only match (adding patterns to it inside
// captures.1 caused textmate-grammar-tree to collapse the captured range),
// so we re-scan the raw text here, splitting on `{...}` and emitting each
// brace pair as a `VariableReference` (single-identifier expressions only;
// `{math.floor(x)}`-style nested calls would need a proper sub-parse, which
// is left as a deferred extension).
function appendTagContent(
  c3Node: SyntaxNode,
  ctx: LowerContext,
  list: ContentList,
): boolean {
  const raw = ctx.read(c3Node.from, c3Node.to);
  const trimmed = raw.trim();
  if (trimmed.length === 0) return false;
  let appended = false;
  let i = 0;
  while (i < trimmed.length) {
    const open = trimmed.indexOf("{", i);
    if (open === -1) {
      list.AddContent(new Text(trimmed.slice(i)));
      appended = true;
      break;
    }
    if (open > i) {
      list.AddContent(new Text(trimmed.slice(i, open)));
      appended = true;
    }
    const close = trimmed.indexOf("}", open);
    if (close === -1) {
      list.AddContent(new Text(trimmed.slice(open)));
      appended = true;
      break;
    }
    const exprText = trimmed.slice(open + 1, close).trim();
    // Only simple identifier references for now. Complex expressions
    // (`{a.b}`, `{math.floor(x)}`, `{a + b}`) emit as literal text so
    // the user sees the un-resolved form rather than a silent failure.
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(exprText)) {
      const ref = new VariableReference([new Identifier(exprText)]);
      ref.outputWhenComplete = true;
      list.AddContent(ref);
      appended = true;
    } else {
      list.AddContent(new Text(trimmed.slice(open, close + 1)));
      appended = true;
    }
    i = close + 1;
  }
  return appended;
}

// Returns the whitespace (spaces / tabs) immediately preceding `pivot`
// in the source — i.e. what's between the last non-whitespace character
// of the choice text and the `->` of an inline divert. Walks backward
// from `pivot` through the choice node's text range. Stops at the first
// non-whitespace character (or at the node's start). Used to preserve
// authorial spacing across the `text -> target` boundary.
function collectTrailingWhitespace(
  choiceNode: SyntaxNode,
  pivot: number,
  ctx: LowerContext,
): string {
  let i = pivot;
  while (i > choiceNode.from) {
    const ch = ctx.read(i - 1, i);
    if (ch === " " || ch === "\t") {
      i--;
      continue;
    }
    break;
  }
  return ctx.read(i, pivot);
}


// Returns true if the next significant sibling of `choiceNode` (i.e.
// the next-line statement that forms the choice's body once
// `parseIncrementally` attaches it) is a `done` / `fin` keyword.
// In that case the choice's chosen-output should NOT receive an
// extra trailing newline — the terminator runs immediately, matching
// what the legacy inline `* "X" -> END` form used to emit.
const CHOICE_BODY_SKIP: ReadonlySet<string> = new Set([
  "Newline",
  "Whitespace",
  "ExtraWhitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "EndOfLine",
  "LuauComment",
  "Annotation",
]);

function nextSignificantSiblingIsTerminator(choiceNode: SyntaxNode): boolean {
  let cur = choiceNode.nextSibling;
  while (cur && CHOICE_BODY_SKIP.has(cur.name)) {
    cur = cur.nextSibling;
  }
  return cur?.name === "DoneStatement" || cur?.name === "FinStatement";
}
