import type { SyntaxNode } from "@lezer/common";
import {
  EXPLICIT,
  FLOWS,
  childEndingWith,
  scopeOf,
  statementsOf,
} from "./declarationOnly";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { isExplicitRuleName } from "./explicitRuleNames";
import { nodeNameSet } from "./nodeNameSet";
import {
  VARIABLE_DEFINITION_CONTENT_NAMES,
  VARIABLE_DEFINITION_NAMES,
  assignmentListName,
  valueListAssignmentName,
} from "./variableDefinitionNames";

export const ROOT_ONLY = "only";

export const ROOT_IN_BLOCK = "inBlock";

export const ROOT_NONE = "none";

const CHOOSE_BLOCKS = nodeNameSet(["LuauSparkdownChooseBlock"]);
const THEN_CLAUSES = nodeNameSet(["LuauSparkdownChooseThenClause"]);
const CHOICES = nodeNameSet(["Choice"]);
const LOCAL_FUNCTIONS = nodeNameSet(["LuauFunctionDefinition", "LuauFunctionAttributes"]);
const FUNCTION_BODIES = nodeNameSet(["LuauFunctionBody", "LuauMethodDefinition"]);
const ACCESS_PATHS = nodeNameSet(["LuauAccessPath", "LuauSparkdownExplicitAccessPath"]);
const FOR_HEADER_ENDS = nodeNameSet([
  "LuauInKeyword",
  "LuauAssignmentOperation",
  "LuauSparkdownExplicitAssignmentOperation",
]);
const LOOP_CONDITIONS = nodeNameSet(["LuauForCondition", "LuauSparkdownExplicitLoopCondition"]);

const BLOCKS = nodeNameSet([
  "LuauIfBlock",
  "LuauSparkdownIfBlock",
  "LuauSparkdownExplicitIfBlock",
  "LuauDoBlock",
  "LuauSparkdownDoBlock",
  "LuauSparkdownExplicitDoBlock",
  "LuauForLoop",
  "LuauSparkdownForLoop",
  "LuauWhileLoop",
  "LuauSparkdownWhileLoop",
  "LuauSparkdownExplicitLoop",
  "LuauRepeatLoop",
  "LuauSparkdownRepeatLoop",
  "LuauSparkdownExplicitRepeatLoop",
]);

interface RootDeclaration {
  at: number;
  parameter?: boolean;
  visibleFrom: number;
  visibleTo: number;
  flow: number;
}

interface Flow {
  from: number;
  to: number;
  parent: number;
}

export class RootLocals {
  protected readonly declarations = new Map<string, RootDeclaration[]>();
  protected readonly flows: Flow[] = [];
  protected readonly blocks: { from: number; to: number }[] = [];
  protected readonly blockDeclarations = new Map<string, { from: number; to: number }[]>();

  constructor(top: SyntaxNode, read: (from: number, to: number) => string) {
    const open: number[] = [];
    for (let node = top.firstChild; node; node = node.nextSibling) {
      if (FLOWS.has(node.name)) {
        this.flows.push({
          from: node.from,
          to: Number.POSITIVE_INFINITY,
          parent: open[open.length - 1] ?? -1,
        });
        open.push(this.flows.length - 1);
        const params = getDescendent("LuauFunctionParameters", node);
        for (const param of params ? getDescendents("LuauFunctionParameter", params) : []) {
          this.add(read(param.from, param.to).trim(), {
            at: param.from,
            visibleFrom: param.to,
            visibleTo: Number.POSITIVE_INFINITY,
            flow: this.flows.length - 1,
            parameter: true,
          });
        }
      } else if (node.name === "LuauEndKeyword") {
        const flow = open.pop();
        if (flow !== undefined) this.flows[flow]!.to = node.to;
      } else {
        this.collect(node, open[open.length - 1] ?? -1, Number.POSITIVE_INFINITY, read);
      }
    }
  }

  answer(name: string, at: number): string {
    if (this.inBlock(at)) return ROOT_IN_BLOCK;
    return this.answerIgnoringBlocks(name, at);
  }

  answerIgnoringBlocks(name: string, at: number): string {
    const list = this.declarations.get(name);
    if (!list) return "";
    const around = this.flowsAround(at);
    const [own] = around;
    for (let i = list.length - 1; i >= 0; i--) {
      const declaration = list[i]!;
      if (
        declaration.visibleFrom <= at &&
        at <= declaration.visibleTo &&
        (declaration.flow < 0 ||
          declaration.flow === own ||
          (declaration.parameter === true && around.has(declaration.flow)))
      ) {
        return ordinal(list, i);
      }
    }
    return ROOT_NONE;
  }

  declared(name: string, at: number): string {
    const list = this.declarations.get(name);
    if (!list) return "";
    const i = list.findIndex((declaration) => declaration.at === at);
    if (i < 0) return "";
    return ordinal(list, i);
  }

  blockLocal(name: string, at: number): boolean {
    return this.blockDeclarations.get(name)?.some(({ from, to }) => from <= at && at <= to) ?? false;
  }

  protected inBlock(at: number): boolean {
    let lo = 0;
    let hi = this.blocks.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const block = this.blocks[mid]!;
      if (at < block.from) hi = mid - 1;
      else if (at > block.to) lo = mid + 1;
      else return true;
    }
    return false;
  }

  protected flowsAround(at: number): Set<number> {
    const around = new Set<number>();
    let lo = 0;
    let hi = this.flows.length - 1;
    let last = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.flows[mid]!.from <= at) {
        last = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    for (let flow = last; flow >= 0; flow = this.flows[flow]!.parent) {
      if (at <= this.flows[flow]!.to) around.add(flow);
    }
    return around;
  }

  protected add(name: string, declaration: RootDeclaration): void {
    const list = this.declarations.get(name);
    if (list) {
      list.push(declaration);
    } else {
      this.declarations.set(name, [declaration]);
    }
  }

  protected collect(
    node: SyntaxNode,
    flow: number,
    visibleTo: number,
    read: (from: number, to: number) => string,
  ): void {
    if (EXPLICIT.has(node.name)) {
      const content = childEndingWith(node, "_content");
      for (const statement of content ? statementsOf(content) : []) {
        this.collect(statement, flow, visibleTo, read);
      }
      return;
    }
    if (CHOOSE_BLOCKS.has(node.name) || THEN_CLAUSES.has(node.name)) {
      this.collectBodies(node, flow, read);
      return;
    }
    if (BLOCKS.has(node.name)) {
      this.blocks.push({ from: node.from, to: node.to });
      this.collectBlock(node, read);
      return;
    }
    if (LOCAL_FUNCTIONS.has(node.name)) {
      const nameNode = getDescendent("LuauFunctionName", node);
      if (nameNode && scopeOf(node, read) === "local") {
        this.add(read(nameNode.from, nameNode.to).trim(), {
          at: nameNode.from,
          visibleFrom: node.to,
          visibleTo,
          flow,
        });
      }
      return;
    }
    if (!VARIABLE_DEFINITION_NAMES.has(node.name)) return;
    if (scopeOf(node, read) !== "local") return;
    for (const nameNode of declaredNameNodes(node)) {
      this.add(read(nameNode.from, nameNode.to).trim(), {
        at: nameNode.from,
        visibleFrom: node.to,
        visibleTo,
        flow,
      });
    }
  }

  protected collectBlock(block: SyntaxNode, read: (from: number, to: number) => string): void {
    const condition = forCondition(block);
    if (condition) {
      for (const name of forVariables(condition, read)) {
        this.declareInBlock(name, condition.to, block.to);
      }
    }
    this.collectBlockPart(block, block, read);
  }

  protected declareInBlock(name: string, from: number, to: number): void {
    const list = this.blockDeclarations.get(name);
    if (list) list.push({ from, to });
    else this.blockDeclarations.set(name, [{ from, to }]);
  }

  protected collectBlockPart(
    node: SyntaxNode,
    block: SyntaxNode,
    read: (from: number, to: number) => string,
  ): void {
    const declare = (name: string, from: number, to: number) => this.declareInBlock(name, from, to);
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (FUNCTION_BODIES.has(child.name)) continue;
      if (BLOCKS.has(child.name)) {
        this.collectBlock(child, read);
        continue;
      }
      if (LOCAL_FUNCTIONS.has(child.name)) {
        const nameNode = getDescendent("LuauFunctionName", child);
        if (nameNode && scopeOf(child, read) === "local") {
          declare(read(nameNode.from, nameNode.to).trim(), nameNode.to, block.to);
        }
        continue;
      }
      if (VARIABLE_DEFINITION_NAMES.has(child.name)) {
        if (scopeOf(child, read) === "local") {
          for (const nameNode of declaredNameNodes(child)) {
            declare(read(nameNode.from, nameNode.to).trim(), child.to, block.to);
          }
        }
        continue;
      }
      this.collectBlockPart(child, block, read);
    }
  }

  protected collectBodies(
    node: SyntaxNode,
    flow: number,
    read: (from: number, to: number) => string,
  ): void {
    const content = childEndingWith(node, "_content");
    if (!content) return;
    let inChoice = false;
    for (let child = content.firstChild; child; child = child.nextSibling) {
      if (CHOICES.has(child.name)) {
        inChoice = true;
        continue;
      }
      let visibleTo = content.to;
      for (let next = inChoice ? child.nextSibling : null; next; next = next.nextSibling) {
        if (CHOICES.has(next.name)) {
          visibleTo = next.from;
          break;
        }
      }
      this.collect(child, flow, visibleTo, read);
    }
  }
}

function ordinal(list: readonly RootDeclaration[], i: number): string {
  return list.length === 1 || (list[i]!.flow >= 0 && list.every(({ flow }) => flow >= 0))
    ? ROOT_ONLY
    : String(i + 1);
}

function forCondition(node: SyntaxNode): SyntaxNode | null {
  const begin = childEndingWith(node, "_begin");
  if (!begin || !getDescendent("LuauForKeyword", begin)) return null;
  const condition = childEndingWith(node, "_content")?.firstChild;
  return condition && LOOP_CONDITIONS.has(condition.name) ? condition : null;
}

function forVariables(
  condition: SyntaxNode,
  read: (from: number, to: number) => string,
): string[] {
  const names: string[] = [];
  const content = childEndingWith(condition, "_content");
  for (let part = content?.firstChild; part; part = part.nextSibling) {
    if (FOR_HEADER_ENDS.has(part.name)) break;
    if (!ACCESS_PATHS.has(part.name)) continue;
    const variable = getDescendent("LuauVariable", part);
    const path = childEndingWith(part, "_content");
    if (!variable || !path) continue;
    const name = read(variable.from, variable.to);
    if (read(path.from, path.to).trim() === name) names.push(name);
  }
  return names;
}

function declaredNameNodes(node: SyntaxNode): SyntaxNode[] {
  const names: SyntaxNode[] = [];
  for (let content = node.firstChild; content; content = content.nextSibling) {
    if (!VARIABLE_DEFINITION_CONTENT_NAMES.has(content.name)) continue;
    for (let inner = content.firstChild; inner; inner = inner.nextSibling) {
      if (
        !isExplicitRuleName(inner.name, "LuauVariableAssignment") ||
        valueListAssignmentName(inner)
      ) {
        continue;
      }
      const nameNode = assignmentListName(inner);
      if (nameNode) names.push(nameNode);
    }
  }
  return names;
}
