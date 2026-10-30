import { type SyntaxNode } from "@lezer/common";
import { findChildByName } from "../../utils/findChildByName";
import { nodeNameSet } from "../../utils/nodeNameSet";

const ENTRY_NAMES = nodeNameSet([
  "LuauSparkleElement",
  "LuauStructBlockProperty",
  "LuauSparkleBlockIf",
  "LuauSparkleBlockFor",
  "LuauSparkleBlockMatch",
  "LuauSparkleElementBlock",
  "LuauSparkleElementContinuation",
]);

const CLAUSE_NAMES = nodeNameSet([
  "LuauSparkleBlockElseif",
  "LuauSparkleBlockElse",
  "LuauSparkleBlockCase",
]);

export function sparkleBlockEntries(
  container: SyntaxNode,
  also?: ReadonlySet<string>,
): SyntaxNode[] {
  const entries: SyntaxNode[] = [];
  const walk = (node: SyntaxNode) => {
    let child = node.firstChild;
    while (child) {
      if (ENTRY_NAMES.has(child.name) || also?.has(child.name)) {
        entries.push(child);
      } else if (!CLAUSE_NAMES.has(child.name)) {
        walk(child);
      }
      child = child.nextSibling;
    }
  };
  walk(container);
  return entries;
}

export interface SparkleElementParts {
  name: SyntaxNode | null;
  args: SyntaxNode | null;
  head: SyntaxNode | null;
  block: SyntaxNode | null;
  beginTo: number;
}

const ELEMENT_NAMES = nodeNameSet([
  "BuiltinComponentName",
  "LuauSparkleElementName",
]);

export function sparkleElementParts(element: SyntaxNode): SparkleElementParts {
  const begin = findChildByName(element, "LuauSparkleElement_begin");
  const nameCapture = begin?.firstChild ?? null;
  const name = nameCapture?.firstChild ?? null;
  const args = begin ? firstNamed(begin, CALL_ARGUMENTS) : null;
  const beginTo = begin?.to ?? element.from;
  const content = findChildByName(element, "LuauSparkleElement_content");
  const first = content?.firstChild ?? null;
  const head =
    first?.name === "LuauSparkleElementParts" && first.from === beginTo
      ? first
      : null;
  return {
    name: name && ELEMENT_NAMES.has(name.name) ? name : null,
    args,
    head,
    block: content ? findChildByName(content, "LuauSparkleElementBlock") : null,
    beginTo,
  };
}

const CALL_ARGUMENTS = nodeNameSet(["LuauSparkleCallArguments"]);

function firstNamed(node: SyntaxNode, names: Set<string>): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.has(child.name)) return child;
    const found = firstNamed(child, names);
    if (found) return found;
  }
  return null;
}

export function sparkleBlockContent(block: SyntaxNode): SyntaxNode | null {
  return findChildByName(block, "LuauSparkleElementBlock_content");
}

export function sparkleBlockHasElement(block: SyntaxNode): boolean {
  const parent = block.parent?.name;
  if (
    parent !== "LuauSparkleElement_content" &&
    parent !== "LuauSparkleElementContinuation_content"
  ) {
    return false;
  }
  for (let prev = block.prevSibling; prev; prev = prev.prevSibling) {
    if (prev.name === "LuauSparkleElementBlock") return false;
  }
  return true;
}

const LATER_PART_NAMES = nodeNameSet([
  "LuauSparkleElementParts",
  "LuauSparkleEventClosureAttribute",
]);

export function sparklePartNodes(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const content =
    node.name === "LuauSparkleElement"
      ? findChildByName(node, "LuauSparkleElement_content")
      : findChildByName(node, "LuauSparkleElementContinuation_content");
  for (let child = content?.firstChild; child; child = child.nextSibling) {
    if (!LATER_PART_NAMES.has(child.name)) continue;
    out.push(child);
    if (child.name === "LuauSparkleEventClosureAttribute") {
      const inner = findChildByName(
        child,
        "LuauSparkleEventClosureAttribute_content",
      );
      for (let part = inner?.firstChild; part; part = part.nextSibling) {
        if (part.name === "LuauSparkleElementParts") out.push(part);
      }
    }
  }
  return out;
}

export function sparkleClosureAttributeEnd(attribute: SyntaxNode): number {
  const inner = findChildByName(
    attribute,
    "LuauSparkleEventClosureAttribute_content",
  );
  const closure = inner
    ? findChildByName(inner, "LuauSparkleHandlerClosure")
    : null;
  return closure?.to ?? attribute.to;
}

export function sparkleContinuationBlock(
  continuation: SyntaxNode,
): SyntaxNode | null {
  const content = findChildByName(
    continuation,
    "LuauSparkleElementContinuation_content",
  );
  return content ? findChildByName(content, "LuauSparkleElementBlock") : null;
}

export interface SparkleControlBranch {
  content: SyntaxNode;
  depth: number;
}

export function sparkleControlBranches(
  control: SyntaxNode,
): SparkleControlBranch[] {
  const out: SparkleControlBranch[] = [];
  const depth = control.name === "LuauSparkleBlockMatch" ? 2 : 1;
  const visit = (node: SyntaxNode) => {
    const content = braceControlContent(node);
    if (!content) return;
    if (node.name !== "LuauSparkleBlockMatch") out.push({ content, depth });
    let child = content.firstChild;
    while (child) {
      if (CLAUSE_NAMES.has(child.name)) visit(child);
      child = child.nextSibling;
    }
  };
  visit(control);
  return out;
}

export function braceControlContent(node: SyntaxNode): SyntaxNode | null {
  switch (node.name) {
    case "LuauSparkleBlockIf":
      return findChildByName(node, "LuauSparkleBlockIf_content");
    case "LuauSparkleBlockElseif":
      return findChildByName(node, "LuauSparkleBlockElseif_content");
    case "LuauSparkleBlockElse":
      return findChildByName(node, "LuauSparkleBlockElse_content");
    case "LuauSparkleBlockFor":
      return findChildByName(node, "LuauSparkleBlockFor_content");
    case "LuauSparkleBlockMatch":
      return findChildByName(node, "LuauSparkleBlockMatch_content");
    case "LuauSparkleBlockCase":
      return findChildByName(node, "LuauSparkleBlockCase_content");
    default:
      return null;
  }
}
