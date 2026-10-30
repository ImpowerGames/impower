import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { CHOICE_OUTSIDE_CHOOSE_MESSAGE } from "../../utils/unsupportedConstructMessage";
import { identifierAt } from "../utils/debugMetadata";
import { nodeNameSet } from "../../utils/nodeNameSet";
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
} from "../utils/displayCall";
import { lowerTagContent } from "../utils/lowerTagContent";
import { recordAlternatorSource } from "../utils/statementShape";
import { statementSource } from "../utils/statementSource";
import { wrapInWeave } from "../utils/wrapInWeave";

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

  const bracketed = getDescendent("ChoiceWithSuppressedText", nodeRef.node);
  const unbracketed = getDescendent("ChoiceWithNoSuppressedText", nodeRef.node);

  let hasWeaveStyleInlineBrackets = false;

  if (bracketed) {
    hasWeaveStyleInlineBrackets = true;
    appendTextFromCapture(bracketed, "ChoiceStartText", ctx, startContent);
    appendTextFromCapture(bracketed, "ChoiceOnlyText", ctx, choiceOnlyContent);
    appendTextFromCapture(bracketed, "ChoiceInnerText", ctx, innerContent);
  } else if (unbracketed) {
    appendTextFromCapture(unbracketed, "ChoicePlainText", ctx, startContent);
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
      if (bracketed) {
        appendTextFromCapture(bracketed, "ChoiceStartText", ctx, fresh);
      } else if (unbracketed) {
        appendTextFromCapture(unbracketed, "ChoicePlainText", ctx, fresh);
      }
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

  const choice = new Choice(startContent, choiceOnlyContent, innerContent);
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

  const condition = collectChoiceCondition(nodeRef.node, ctx);
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
      source: statementSource(nodeRef.node, ctx),
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


function appendTextFromCapture(
  parent: SyntaxNode,
  captureName: string,
  ctx: LowerContext,
  list: ContentList,
): boolean {
  let appended = false;
  const stack: SyntaxNode[] = [parent];
  const matches: SyntaxNode[] = [];
  while (stack.length > 0) {
    const node = stack.pop()!;
    let child = node.firstChild;
    while (child) {
      if (child.name === captureName) {
        matches.push(child);
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
  type Marker =
    | { kind: "tag"; node: SyntaxNode }
    | { kind: "expr"; node: SyntaxNode };
  const markers: Marker[] = [];
  const walk = (node: SyntaxNode): void => {
    if (isExplicitRuleName(node.name, "Tag")) {
      markers.push({ kind: "tag", node });
      return;
    }
    if (
      isExplicitRuleName(node.name, "LuauInterpolatedStringExpression") ||
      isExplicitRuleName(node.name, "LuauFunctionCallShorthand")
    ) {
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
      const expr = lowerExpressionFromContainer(m.node, ctx, "expression");
      if (expr) {
        expr.outputWhenComplete = true;
        list.AddContent(expr);
        appended = true;
      }
    } else {
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
  flushText(captureNode.to);
  return appended;
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
