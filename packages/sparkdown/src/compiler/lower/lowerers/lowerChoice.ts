import { CHOICE_OUTSIDE_CHOOSE_MESSAGE } from "../../utils/unsupportedConstructMessage";
import { identifierAt } from "../utils/debugMetadata";
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  choiceTextMarkerKind,
  choiceTextMarkers,
  readChoiceText,
} from "../../utils/readChoiceText";
import { trimStyled, writesNothing } from "../../../runtime/displayStyle";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import {
  Choice,
  ChoiceStartEcho,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { ContentList } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ContentList";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { TunnelOnwards } from "../../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import type {
CompiledBlock,
InkDiagnostic,
} from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import {
  buildDivert,
  divertLoadShapeProblem,
  withDivertLoad,
} from "../utils/buildDivert";
import {
  buildDisplayCall,
  buildOrderedDisplayCall,
  displayText,
} from "../utils/displayCall";
import { collectDisplaySpans, writeStyledRange } from "../utils/displaySpans";
import {
  inlineGluedAlternatorFrom,
  isInlineGluedAlternator,
  lowerInlineGluedAlternator,
} from "./lowerDisplay";
import { lowerTagContent } from "../utils/lowerTagContent";
import { recordAlternatorSource } from "../utils/statementShape";
import { statementSource } from "../utils/statementSource";
import { wrapInWeave } from "../utils/wrapInWeave";

const UNREADABLE_CHOICE_CONDITION_MESSAGE =
  "This condition cannot be read here, so the choice is never offered. Close any bracket left open, or compute the condition into a variable on an earlier line and test that, as in `* if ready Text`.";

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
  // value-level: the ChoiceMark token encodes whether this choice is once-only.
  const onceOnly = markText.includes("*");
  // value-level: count nesting marks in the isolated ChoiceMark token.
  const depth = (markText.match(/[*+]/g) ?? []).length || 1;

  const labelName = getDescendent("LabelDeclarationName", nodeRef.node);
  const identifier = labelName ? identifierAt(labelName, ctx) : null;

  const startContent = new ContentList();
  const choiceOnlyContent = new ContentList();
  let innerContent = new ContentList();

  const text = readChoiceText(nodeRef.node);
  const hasWeaveStyleInlineBrackets = text.inner !== null;
  const appendStart = (list: ContentList): void => {
    for (const part of text.start) {
      appendNodeContent(part.node, ctx, list, true, part.node.from, part.to);
    }
  };

  appendStart(startContent);
  if (text.inner) {
    if (text.only) appendNodeContent(text.only, ctx, choiceOnlyContent);
    appendNodeContent(text.inner, ctx, innerContent, false, text.inner.from + 1);
  }

  const divertNode = getDescendent("Divert", nodeRef.node);
  const divertObjects = divertNode ? buildDivert(divertNode, ctx) : [];
  const chosenTail: ParsedObject[] = [];
  const endsFlow =
    !divertNode && nextSignificantSiblingIsTerminator(nodeRef.node);
  if (divertObjects.length > 0) {
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
    chosenTail.push(
      ...withDivertLoad(divertNode!, divertObjects, ctx, { ownLine: false }),
    );
  } else if (!divertNode) {
    if (!endsFlow) {
      chosenTail.push(new Text("\n"));
    }
  }

  const echo = chosenTextAsDisplayCall(
    startContent,
    innerContent,
    chosenTail,
    () => {
      const fresh = new ContentList();
      appendStart(fresh);
      return fresh;
    },
    endsFlow,
    ctx,
  );
  if (echo) {
    innerContent = new ContentList();
    for (const obj of echo.inner) innerContent.AddContent(obj);
  } else {
    for (const obj of chosenTail) innerContent.AddContent(obj);
  }

  const choice = new Choice(
    confinedContent(startContent),
    confinedContent(choiceOnlyContent),
    innerContent,
  );
  choice.startEcho = echo?.startEcho ?? null;
  if (choice.startEcho) {
    choice.startEcho.choice = choice;
  }
  recordAlternatorSource(ctx, choice, nodeRef.node);
  choice.repeatsStartContent = echo?.repeatsStartContent ?? true;
  choice.onceOnly = onceOnly;
  choice.hasWeaveStyleInlineBrackets = hasWeaveStyleInlineBrackets;
  choice.indentationDepth = depth;
  if (identifier) {
    choice.identifier = identifier;
  }

  const unreadableOpen = getDescendent(
    "ChoiceUnreadableConditionOpen",
    nodeRef.node,
  );
  const condition = unreadableOpen
    ? new NumberExpression(false, "bool")
    : collectChoiceCondition(nodeRef.node, ctx);
  if (condition) {
    choice.condition = condition;
  }

  if (
    startContent.content.length === 0 &&
    choiceOnlyContent.content.length === 0
  ) {
    choice.isInvisibleDefault = true;
  }

  const diagnostics: InkDiagnostic[] = [];
  if (!isInsideChoose(nodeRef.node)) {
    diagnostics.push({
      message:
        CHOICE_OUTSIDE_CHOOSE_MESSAGE,
      severity: ErrorType.Error,
      source: statementSource(nodeRef.node, ctx),
    });
  }
  if (unreadableOpen) {
    diagnostics.push({
      message: UNREADABLE_CHOICE_CONDITION_MESSAGE,
      severity: ErrorType.Error,
      source: statementSource(unreadableOpen, ctx),
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
  if (allContentEmpty && !divertNode && !unreadableOpen) {
    diagnostics.push({
      message:
        "Choice is completely empty. Interpreting as a default fallback choice. Add a divert arrow to remove this warning: * ->",
      severity: ErrorType.Warning,
      source: statementSource(nodeRef.node, ctx),
    });
  }
  if (
    startContent.content.length === 0 &&
    hasWeaveStyleInlineBrackets &&
    choiceOnlyContent.content.length === 0 &&
    !unreadableOpen
  ) {
    diagnostics.push({
      message:
        "Blank choice - if you intended a default fallback choice, use the `* ->` syntax",
      severity: ErrorType.Warning,
      source: statementSource(nodeRef.node, ctx),
    });
  }

  const loadProblem = divertNode ? divertLoadShapeProblem(divertNode) : null;
  if (loadProblem) {
    diagnostics.push({
      message: loadProblem,
      severity: ErrorType.Warning,
      source: statementSource(divertNode!, ctx),
    });
  }

  const block = wrapInWeave([choice]);
  if (diagnostics.length > 0) {
    block.diagnostics = diagnostics;
  }
  return block;
}

function chosenTextAsDisplayCall(
  start: ContentList,
  inner: ContentList,
  tail: ParsedObject[],
  relowerStart: () => ContentList,
  endsFlow: boolean,
  ctx: LowerContext,
): {
  inner: ParsedObject[];
  startEcho: ChoiceStartEcho | null;
  repeatsStartContent: boolean;
} | null {
  const words = inner.content.slice();
  const hasStart = start.content.length > 0;
  if (!hasStart && words.length === 0) return null;
  const tagged = [...start.content, ...words].some(
    (obj) => obj instanceof Tag,
  );
  const arrow = tail.filter((obj) => !(obj instanceof Text && obj.text === "\n"));
  const open =
    endsFlow ||
    (arrow.length > 0 &&
      arrow.every(
        (obj) => obj instanceof Divert || obj instanceof TunnelOnwards,
      ));
  let call: ParsedObject;
  let startEcho: ChoiceStartEcho | null = null;
  if (tagged) {
    const startWords = hasStart ? relowerStart().content.slice() : [];
    call = buildOrderedDisplayCall([...startWords, ...words], ctx, { open });
  } else {
    startEcho = hasStart ? new ChoiceStartEcho() : null;
    const body = startEcho ? [startEcho, ...words] : words;
    call = buildDisplayCall(undefined, undefined, body, null, ctx, [], {
      open,
    });
  }
  const out: ParsedObject[] = [call];
  if (arrow.length > 0) out.push(...tail);
  return { inner: out, startEcho, repeatsStartContent: !tagged };
}

function collectChoiceCondition(
  choiceNode: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  const condCapture = getDescendent("ChoiceCondition", choiceNode);
  if (!condCapture) return null;
  return lowerExpressionFromContainer(condCapture, ctx, "expression");
}


function isChoiceTextOpaque(node: SyntaxNode): boolean {
  return choiceTextMarkerKind(node) !== null || isInlineGluedAlternator(node);
}

function appendNodeContent(
  captureNode: SyntaxNode,
  ctx: LowerContext,
  list: ContentList,
  trimStart = false,
  from = captureNode.from,
  to = captureNode.to,
): boolean {
  const spans = collectDisplaySpans(captureNode, from, to, ctx, isChoiceTextOpaque);
  const spanCursor = { code: 0, mark: 0 };
  const alternators: SyntaxNode[] = [];
  const findAlternators = (node: SyntaxNode): void => {
    if (choiceTextMarkerKind(node)) return;
    if (isInlineGluedAlternator(node)) {
      alternators.push(node);
      return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      findAlternators(child);
    }
  };
  findAlternators(captureNode);
  const inRange = [
    ...choiceTextMarkers(captureNode, to).map((m) => ({ ...m, from: m.node.from })),
    ...alternators
      .filter((node) => node.from < to)
      .map((node) => ({ kind: "alt" as const, node, from: inlineGluedAlternatorFrom(node) })),
  ].sort((a, b) => a.from - b.from);

  let appended = false;
  let cursor = from;
  let buffer = "";
  const flushBuffer = (): void => {
    const leading = trimStart && list.content.length === 0;
    const text = leading ? trimStyled(buffer, { end: false }) : buffer;
    buffer = "";
    if (text.length > 0) {
      list.AddContent(new Text(text));
      if (!writesNothing(text)) appended = true;
    }
  };
  const flushText = (until: number): void => {
    buffer += writeStyledRange(spans, cursor, until, ctx, spanCursor);
    cursor = Math.max(cursor, until);
  };
  for (const m of inRange) {
    if (m.from < cursor) continue;
    flushText(m.from);
    flushBuffer();
    if (m.kind === "alt") {
      for (const obj of lowerInlineGluedAlternator(m.node, ctx)) {
        list.AddContent(obj);
        appended = true;
      }
    } else if (m.kind === "expr") {
      const expr = lowerExpressionFromContainer(m.node, ctx, "expression");
      if (expr) {
        expr.outputWhenComplete = true;
        list.AddContent(expr);
        appended = true;
      }
    } else if (m.kind === "tag") {
      const tagContent = getDescendent(["TagContent", "SparkdownExplicitTagContent"], m.node);
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
  flushText(to);
  flushBuffer();
  return appended;
}

function confinedContent(list: ContentList): ContentList {
  const out: ParsedObject[] = [];
  let inTag = false;
  for (const obj of list.content) {
    if (obj instanceof Tag) inTag = obj.isStart;
    out.push(...(inTag || obj instanceof Tag ? [obj] : displayText([obj])));
  }
  return new ContentList(out);
}

function appendTagContent(
  tagContent: SyntaxNode,
  ctx: LowerContext,
  list: ContentList,
): boolean {
  let appended = false;
  for (const obj of lowerTagContent(tagContent, ctx)) {
    list.AddContent(obj);
    appended = true;
  }
  return appended;
}

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


const CHOICE_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
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
