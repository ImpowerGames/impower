import { type SyntaxNode, type Tree } from "@lezer/common";
import { isBareDeclarationTarget } from "../classes/annotators/DeclarationAnnotator";
import { ancestorMatching } from "./ancestorMatching";
import { findChildByName } from "./findChildByName";
import { getLocalScope } from "./localScopes";
import { nodeNameSet } from "./nodeNameSet";
import { VARIABLE_DEFINITION_NAMES } from "./variableDefinitionNames";

type Read = (from: number, to: number) => string;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
const FUNCTION_LIKE = nodeNameSet(["LuauFunctionDefinition", "LuauMethodDefinition"]);
const CONST_SCOPE = nodeNameSet(["LuauFunctionDefinition", "LuauMethodDefinition", "LuauSparkleHandlerClosure"]);
const SECTION_HEADER = nodeNameSet(["Scene", "Branch"]);
const PARAMETER_OWNER = nodeNameSet([
  "LuauFunctionDefinition",
  "LuauMethodDefinition",
  "Scene",
  "Branch",
]);
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
      const name = firstNamed(findChildByName(child, `${child.name}_begin`), "LuauVariableName");
      if (name) names.push(name);
    } else if (child.name.endsWith("AccessPath")) {
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

function loopVariables(loopContent: SyntaxNode): SyntaxNode[] {
  const condition = significantChildren(loopContent).find(
    (child) => child.name.endsWith("ForCondition") || child.name.endsWith("LoopCondition"),
  );
  const names: SyntaxNode[] = [];
  for (const child of significantChildren(condition ? findChildByName(condition, `${condition.name}_content`) : null)) {
    if (child.name === "LuauCommaSeparator") continue;
    if (child.name.endsWith("AccessPath")) {
      const name = firstNamed(child, "LuauVariableName");
      if (name) names.push(name);
      continue;
    }
    return child.name.endsWith("InKeyword") || child.name.includes("AssignmentOperation") ? names : [];
  }
  return [];
}

export class LocalBindings {
  constructor(
    private readonly tree: Tree,
    private readonly read: Read,
  ) {}

  private text(node: SyntaxNode): string {
    return this.read(node.from, node.to);
  }

  private modifiers(node: SyntaxNode): ReadonlySet<string> {
    return ancestorMatching(node, CONST_SCOPE, Infinity) ? LOCAL_OR_CONST : LOCAL_ONLY;
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
      return null;
    }
    if (statement.name === "LuauFunctionDefinition") {
      const declared = functionName(statement);
      if (declared && this.text(declared) === name && scoped(declared, "function")) return declared;
    }
    return null;
  }

  private parameterNamed(owner: SyntaxNode, name: string): SyntaxNode | null {
    const header = FUNCTION_LIKE.has(owner.name)
      ? findChildByName(findChildByName(owner, `${owner.name}_content`) ?? owner, "LuauFunctionParameters")
      : owner;
    for (const parameter of allNamed(header, "LuauFunctionParameter")) {
      if (IDENTIFIER.exec(this.text(parameter).trim())?.[0] === name) return parameter;
    }
    return null;
  }

  private ownDeclaration(node: SyntaxNode): SyntaxNode | null | undefined {
    const parameter = node.name === "LuauFunctionParameter" ? node : ancestorMatching(node, FUNCTION_PARAMETER, 3);
    if (parameter) return ancestorMatching(parameter, PARAMETER_OWNER, Infinity) ? parameter : null;
    if (node.name === "LuauVariableName") {
      const statement = ancestorMatching(node, VARIABLE_DEFINITION_NAMES, 8);
      if (statement && variableNames(statement).some((variable) => variable.from === node.from)) {
        return this.localScope(node, "var") != null ? node : null;
      }
    }
    if (node.name === "LuauFunctionName") {
      const statement = ancestorMatching(node, FUNCTION_LIKE, 4);
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
      if (scope.name.endsWith("Loop_content")) {
        for (const variable of loopVariables(scope).reverse()) {
          if (variable.from === at || (child.name.endsWith("DoBlock") && this.text(variable) === name)) {
            return variable.from;
          }
        }
      }
      if (FUNCTION_LIKE.has(scope.name)) {
        const parameter = this.parameterNamed(scope, name);
        if (parameter) return parameter.from;
        const own = this.declarationIn(scope, name, at);
        if (own) return own.from;
      }
      const repeat = child.name.endsWith("UntilCondition") ? significantBefore(child) : null;
      let sections = scope.parent ? null : { pendingEnds: 0 };
      for (let statement = child.prevSibling; statement; statement = statement.prevSibling) {
        if (sections && statement.name === "LuauEndKeyword") {
          sections.pendingEnds += 1;
        } else if (sections && SECTION_HEADER.has(statement.name)) {
          if (sections.pendingEnds > 0) {
            sections.pendingEnds -= 1;
          } else {
            const parameter = this.parameterNamed(statement, name);
            if (parameter) return parameter.from;
            if (statement.name === "Scene") sections = null;
          }
        }
        if (repeat?.name.endsWith("RepeatLoop") && statement.from === repeat.from) {
          const body = findChildByName(statement, `${statement.name}_content`);
          for (let inner = body?.lastChild; inner; inner = inner.prevSibling) {
            const local = this.declarationIn(inner, name, at);
            if (local) return local.from;
          }
          continue;
        }
        const local = this.declarationIn(statement, name, at);
        if (local) return local.from;
      }
    }
    return null;
  }
}
