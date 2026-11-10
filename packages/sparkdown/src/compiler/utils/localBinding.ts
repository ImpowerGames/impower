import { type SyntaxNode, type Tree } from "@lezer/common";
import { isBareDeclarationTarget } from "../classes/annotators/DeclarationAnnotator";
import { ancestorMatching } from "./ancestorMatching";
import { EXPLICIT } from "./declarationOnly";
import { isExplicitRuleName } from "./explicitRuleNames";
import { findChildByName } from "./findChildByName";
import { getLocalScope, LOCAL_SCOPE_NODES } from "./localScopes";
import { nodeNameSet } from "./nodeNameSet";
import { CHOOSE_BLOCKS, RootLocals, THEN_CLAUSES } from "./rootLocals";
import { VARIABLE_DEFINITION_NAMES, valueListAssignmentName } from "./variableDefinitionNames";

type Read = (from: number, to: number) => string;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
const {
  functionLike,
  parameterOwners,
  constScopes,
  forLoopContents,
  forConditions,
  forElses,
  repeatLoops,
  untilConditions,
  eventHandlers,
  eventParameters,
} = LOCAL_SCOPE_NODES;
const FLOW_CONTAINERS = new Set([...CHOOSE_BLOCKS, ...THEN_CLAUSES, ...EXPLICIT]);
const FUNCTION_PARAMETER = nodeNameSet(["LuauFunctionParameter"]);
const LOCAL_ONLY: ReadonlySet<string> = new Set(["local"]);
const LOCAL_OR_CONST: ReadonlySet<string> = new Set(["local", "const"]);

function isTrivia(node: SyntaxNode): boolean {
  return node.name.endsWith("Whitespace") || node.name.endsWith("Comment") || node.name === "Newline";
}

function significantChildren(node: SyntaxNode | null): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (let child = node?.firstChild; child; child = child.nextSibling) {
    if (!isTrivia(child)) children.push(child);
  }
  return children;
}

function significantBefore(node: SyntaxNode): SyntaxNode | null {
  let sibling = node.prevSibling;
  while (sibling && isTrivia(sibling)) sibling = sibling.prevSibling;
  return sibling;
}

function firstNamed(node: SyntaxNode | null, name: string): SyntaxNode | null {
  for (let child = node?.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const found = firstNamed(child, name);
    if (found) return found;
  }
  return null;
}

function allNamed(node: SyntaxNode | null, name: string, found: SyntaxNode[] = []): SyntaxNode[] {
  for (let child = node?.firstChild; child; child = child.nextSibling) {
    if (child.name === name) found.push(child);
    else allNamed(child, name, found);
  }
  return found;
}

function variableNames(statement: SyntaxNode): SyntaxNode[] {
  const names: SyntaxNode[] = [];
  for (const child of significantChildren(findChildByName(statement, `${statement.name}_content`))) {
    if (child.name.endsWith("VariableAssignment")) {
      if (valueListAssignmentName(child)) continue;
      const name = firstNamed(findChildByName(child, `${child.name}_begin`), "LuauVariableName");
      if (name) names.push(name);
    } else if (isExplicitRuleName(child.name, "LuauAccessPath")) {
      const name = firstNamed(child, "LuauVariableName");
      if (name && isBareDeclarationTarget(name)) names.push(name);
    }
  }
  return names;
}

function functionName(definition: SyntaxNode): SyntaxNode | null {
  const declaration = findChildByName(
    findChildByName(definition, `${definition.name}_content`) ?? definition,
    "LuauFunctionDeclarationName",
  );
  return firstNamed(declaration, "LuauFunctionName");
}

function loopHeader(loopContent: SyntaxNode): { condition: SyntaxNode; variables: SyntaxNode[] } | null {
  const condition = significantChildren(loopContent).find((child) => forConditions.has(child.name));
  if (!condition) return null;
  const variables: SyntaxNode[] = [];
  for (const child of significantChildren(findChildByName(condition, `${condition.name}_content`))) {
    if (child.name === "LuauCommaSeparator" || child.name.endsWith("TypeAnnotationOperation")) continue;
    if (isExplicitRuleName(child.name, "LuauAccessPath")) {
      const name = firstNamed(child, "LuauVariableName");
      if (name) variables.push(name);
      continue;
    }
    return child.name === "LuauInKeyword" || isExplicitRuleName(child.name, "LuauAssignmentOperation")
      ? { condition, variables }
      : null;
  }
  return null;
}

export class LocalBindings {
  private roots?: RootLocals;

  constructor(
    private readonly tree: Tree,
    private readonly read: Read,
  ) {}

  private text(node: SyntaxNode): string {
    return this.read(node.from, node.to);
  }

  private rootLocals(): RootLocals {
    this.roots ??= new RootLocals(this.tree.topNode, this.read);
    return this.roots;
  }

  private modifiers(node: SyntaxNode): ReadonlySet<string> {
    return ancestorMatching(node, constScopes, Infinity) ? LOCAL_OR_CONST : LOCAL_ONLY;
  }

  private localScope(declaration: SyntaxNode, type: "var" | "function") {
    return getLocalScope(this.tree, declaration.from, this.read, true, type, this.modifiers(declaration));
  }

  private declarationIn(statement: SyntaxNode, name: string, at: number): SyntaxNode | null {
    const scoped = (declaration: SyntaxNode, type: "var" | "function") => {
      const scope = this.localScope(declaration, type);
      return !!scope && at > scope.from && at <= scope.to;
    };
    if (VARIABLE_DEFINITION_NAMES.has(statement.name)) {
      for (const variable of variableNames(statement).reverse()) {
        if (this.text(variable) === name && scoped(variable, "var")) return variable;
      }
    } else if (statement.name === "LuauFunctionDefinition") {
      const declared = functionName(statement);
      if (declared && this.text(declared) === name && scoped(declared, "function")) return declared;
    }
    return null;
  }

  private parameterNamed(owner: SyntaxNode, name: string): SyntaxNode | null {
    const content = findChildByName(owner, `${owner.name}_content`) ?? owner;
    const header = functionLike.has(owner.name)
      ? findChildByName(content, "LuauFunctionParameters")
      : owner.name === "LuauComponent"
        ? findChildByName(content, "LuauComponentNameAndInheritance")
        : owner;
    for (const parameter of allNamed(header, "LuauFunctionParameter")) {
      if (IDENTIFIER.exec(this.text(parameter).trim())?.[0] === name) return parameter;
    }
    return null;
  }

  private ownDeclaration(node: SyntaxNode): SyntaxNode | null | undefined {
    const parameter = node.name === "LuauFunctionParameter" ? node : ancestorMatching(node, FUNCTION_PARAMETER, 3);
    if (parameter) return ancestorMatching(parameter, parameterOwners, Infinity) ? parameter : null;
    if (node.name === "LuauVariableName") {
      const statement = ancestorMatching(node, VARIABLE_DEFINITION_NAMES, 8);
      if (statement && variableNames(statement).some((variable) => variable.from === node.from)) {
        return this.localScope(node, "var") != null ? node : null;
      }
    }
    if (node.name === "LuauFunctionName") {
      const statement = ancestorMatching(node, functionLike, 4);
      if (statement && functionName(statement)?.from === node.from) {
        return this.localScope(node, "function") != null ? node : null;
      }
    }
    return undefined;
  }

  bindingOf(at: number): number | null {
    let node: SyntaxNode | null = this.tree.resolveInner(at, 1);
    while (
      node &&
      node.from === at &&
      node.name !== "LuauVariableName" &&
      node.name !== "LuauFunctionName" &&
      node.name !== "LuauFunctionParameter"
    ) {
      node = node.parent;
    }
    if (!node || node.from !== at) return null;
    const own = this.ownDeclaration(node);
    if (own !== undefined) return own?.from ?? null;
    const name = this.text(node);
    for (let child: SyntaxNode = node, scope = node.parent; scope; child = scope, scope = scope.parent) {
      const repeat = untilConditions.has(child.name) ? significantBefore(child) : null;
      if (repeat && repeatLoops.has(repeat.name)) {
        const body = findChildByName(repeat, `${repeat.name}_content`);
        for (let inner = body?.lastChild; inner; inner = inner.prevSibling) {
          const local = this.declarationIn(inner, name, at);
          if (local) return local.from;
        }
      }
      if (!scope.parent) {
        return this.rootLocals().declarationOf(name, at);
      }
      if (forLoopContents.has(scope.name)) {
        const header = loopHeader(scope);
        for (const variable of header?.variables.reverse() ?? []) {
          if (variable.from === at || (child.from >= header!.condition.to && !forElses.has(child.name) && this.text(variable) === name)) {
            return variable.from;
          }
        }
      }
      if (eventHandlers.has(scope.name) && eventParameters.has(name)) {
        return scope.from;
      }
      if (functionLike.has(scope.name) || scope.name === "LuauComponent") {
        const parameter = this.parameterNamed(scope, name);
        if (parameter) return parameter.from;
      }
      if (functionLike.has(scope.name)) {
        const own = this.declarationIn(scope, name, at);
        if (own) return own.from;
      }
      if (FLOW_CONTAINERS.has(scope.name) || (scope.parent && FLOW_CONTAINERS.has(scope.parent.name))) {
        continue;
      }
      for (let statement = child.prevSibling; statement; statement = statement.prevSibling) {
        const local = this.declarationIn(statement, name, at);
        if (local) return local.from;
      }
    }
    return null;
  }
}
