import { type SyntaxNode, type Tree } from "@lezer/common";
import { ancestorMatching } from "./ancestorMatching";
import { findChildByName } from "./findChildByName";
import { getLocalScope } from "./localScopes";
import { nodeNameSet } from "./nodeNameSet";
import { VARIABLE_DEFINITION_NAMES } from "./variableDefinitionNames";

type Read = (from: number, to: number) => string;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
const FUNCTION_DEFINITION = nodeNameSet(["LuauFunctionDefinition"]);
const FUNCTION_PARAMETER = nodeNameSet(["LuauFunctionParameter"]);
const LOCAL_ONLY: ReadonlySet<string> = new Set(["local"]);
const LOCAL_OR_CONST: ReadonlySet<string> = new Set(["local", "const"]);

function isTrivia(node: SyntaxNode): boolean {
  return node.name.endsWith("Whitespace") || node.name.endsWith("Comment");
}

function significantChildren(node: SyntaxNode | null): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (let child = node?.firstChild; child; child = child.nextSibling) {
    if (!isTrivia(child)) children.push(child);
  }
  return children;
}

function firstNamed(node: SyntaxNode | null, name: string): SyntaxNode | null {
  for (let child = node?.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const found = firstNamed(child, name);
    if (found) return found;
  }
  return null;
}

function variableNames(statement: SyntaxNode): SyntaxNode[] {
  const names: SyntaxNode[] = [];
  for (const assignment of significantChildren(findChildByName(statement, `${statement.name}_content`))) {
    if (!assignment.name.endsWith("VariableAssignment")) continue;
    const name = firstNamed(findChildByName(assignment, `${assignment.name}_begin`), "LuauVariableName");
    if (name) names.push(name);
  }
  return names;
}

function functionName(definition: SyntaxNode): SyntaxNode | null {
  const declaration = findChildByName(
    findChildByName(definition, "LuauFunctionDefinition_content") ?? definition,
    "LuauFunctionDeclarationName",
  );
  return firstNamed(declaration, "LuauFunctionName");
}

function loopVariables(forContent: SyntaxNode): SyntaxNode[] {
  const condition = findChildByName(forContent, "LuauForCondition");
  const names: SyntaxNode[] = [];
  for (const child of significantChildren(condition && findChildByName(condition, "LuauForCondition_content"))) {
    if (child.name === "LuauCommaSeparator") continue;
    if (child.name !== "LuauAccessPath") break;
    const name = firstNamed(child, "LuauVariableName");
    if (name) names.push(name);
  }
  return names;
}

function significantBefore(node: SyntaxNode): SyntaxNode | null {
  let sibling = node.prevSibling;
  while (sibling && (isTrivia(sibling) || sibling.name === "Newline")) sibling = sibling.prevSibling;
  return sibling;
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
    return ancestorMatching(node, FUNCTION_DEFINITION, Infinity) ? LOCAL_OR_CONST : LOCAL_ONLY;
  }

  private scopes(declaration: SyntaxNode, type: "var" | "function", at: number): boolean {
    const scope = getLocalScope(this.tree, declaration.from, this.read, true, type, this.modifiers(declaration));
    return !!scope && at > scope.from && at <= scope.to;
  }

  private isLocalDeclaration(declaration: SyntaxNode, type: "var" | "function"): boolean {
    return getLocalScope(this.tree, declaration.from, this.read, true, type, this.modifiers(declaration)) != null;
  }

  private declarationIn(statement: SyntaxNode, name: string, at: number): SyntaxNode | null {
    if (VARIABLE_DEFINITION_NAMES.has(statement.name)) {
      for (const variable of variableNames(statement).reverse()) {
        if (this.text(variable) === name && this.scopes(variable, "var", at)) return variable;
      }
      return null;
    }
    if (statement.name === "LuauFunctionDefinition") {
      const declared = functionName(statement);
      if (declared && this.text(declared) === name && this.scopes(declared, "function", at)) return declared;
    }
    return null;
  }

  private parameterNamed(definition: SyntaxNode, name: string): SyntaxNode | null {
    const content = findChildByName(definition, "LuauFunctionDefinition_content");
    const parameters = content && findChildByName(content, "LuauFunctionParameters");
    const list = parameters && findChildByName(parameters, "LuauFunctionParameters_content");
    for (const parameter of significantChildren(list)) {
      if (parameter.name === "LuauFunctionParameter" && IDENTIFIER.exec(this.text(parameter).trim())?.[0] === name) {
        return parameter;
      }
    }
    return null;
  }

  private ownDeclaration(node: SyntaxNode): SyntaxNode | null | undefined {
    const parameter = ancestorMatching(node, FUNCTION_PARAMETER, 3) ?? (node.name === "LuauFunctionParameter" ? node : null);
    if (parameter) return ancestorMatching(parameter, FUNCTION_DEFINITION, 4) ? parameter : null;
    if (node.name === "LuauVariableName") {
      const assignment = node.parent?.parent?.parent;
      const statement = assignment?.parent?.parent;
      if (
        assignment?.name.endsWith("VariableAssignment") &&
        statement &&
        VARIABLE_DEFINITION_NAMES.has(statement.name) &&
        variableNames(statement).some((variable) => variable.from === node.from)
      ) {
        return this.isLocalDeclaration(node, "var") ? node : null;
      }
    }
    if (node.name === "LuauFunctionName") {
      const statement = ancestorMatching(node, FUNCTION_DEFINITION, 4);
      if (statement && functionName(statement)?.from === node.from) {
        return this.isLocalDeclaration(node, "function") ? node : null;
      }
    }
    return undefined;
  }

  bindingOf(at: number): number | null {
    let node: SyntaxNode | null = this.tree.resolveInner(at, 1);
    while (node && node.from === at && node.name !== "LuauVariableName" && node.name !== "LuauFunctionName" && node.name !== "LuauFunctionParameter") {
      node = node.parent;
    }
    if (!node || node.from !== at) return null;
    const own = this.ownDeclaration(node);
    if (own !== undefined) return own?.from ?? null;
    const name = this.text(node);
    for (let child: SyntaxNode = node, scope = node.parent; scope; child = scope, scope = scope.parent) {
      if (scope.name === "LuauForLoop_content") {
        for (const variable of loopVariables(scope).reverse()) {
          if (variable.from === at || (child.name === "LuauDoBlock" && this.text(variable) === name)) {
            return variable.from;
          }
        }
      }
      if (scope.name === "LuauFunctionDefinition") {
        const parameter = this.parameterNamed(scope, name);
        if (parameter) return parameter.from;
        const own = this.declarationIn(scope, name, at);
        if (own) return own.from;
      }
      const repeat = child.name === "LuauUntilCondition" ? significantBefore(child) : null;
      for (let statement = child.prevSibling; statement; statement = statement.prevSibling) {
        if (repeat?.name === "LuauRepeatLoop" && statement.from === repeat.from) {
          const body = findChildByName(statement, "LuauRepeatLoop_content");
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
