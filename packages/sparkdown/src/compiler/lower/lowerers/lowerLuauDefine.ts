import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { StructDefinition } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructDefinition";
import { StructPropertyDefinition } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructPropertyDefinition";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext, SiblingSubFlowInfo } from "../context";
import {
  buildClosureExpression,
  lowerExpressionFromContainer,
  scanFreeVariables,
} from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { findOwnDeclarationName } from "../utils/findOwnDeclarationName";
import { getFunctionBodyContent } from "../utils/getFunctionBodyContent";
import { lowerArguments } from "../utils/lowerArguments";
import { wrapInWeave } from "../utils/wrapInWeave";

// `define` is sparkdown's unified OOP type/instance construct. Every
// define — whether it has properties, methods, or both — lowers to a
// live runtime global table (a named singleton) AND, when typed
// (`as T`), a compile-time `StructDefinition` for the engine's
// character / UI / asset spec system. Both ride ONE VariableAssignment
// (see VariableAssignment + ParsedHierarchy/Story's ExportRuntime):
//
//   define companion as character with     companion = __def({
//     store trust = 0                         trust = 0,
//   end                                       __storeProps = { "trust" },
//                                           }, "companion", "character")
//
//   define O as companion with             O = __def({
//     name = "Orion"                          name = "Orion",
//     color = "teal"                          color = "teal",
//   end                                     }, "O", "companion")
//
// The `__def(rawTable, name, parentName)` stdlib (StdLib.ts) does the
// rest at story start, in document order:
//   - tags the table (`__define` / `__defineParent` on its metatable)
//     and chains `__index` to the parent type table, CREATING the
//     parent implicitly if it was never `define`d (so `as character`
//     works against the builtin engine type);
//   - copies the parent chain's `store` defaults into the table
//     (instance-owned → enumerable + serialized); non-store props
//     inherit lazily through `__index`;
//   - registers the table into its parent AND every ancestor, so
//     `companion.O`, the grandparent `character.O`, and
//     `instances(companion)` all see it.
//
// `new T()` (the `LuauNewExpression` path) mints fresh anonymous
// instances of the same tables via `__new`; method bodies become
// hoisted closures with an implicit `self`; `init(...)` is the
// constructor. `read` / `write` access modifiers are recorded in
// hidden `__readProps` / `__writeProps` lists for future enforcement.

interface DefineProperty {
  name: string;
  expr: Expression;
  // "store" | "local" | "const" | "" — from LuauScopeModifier.
  scope: string;
  // "read" | "write" | "" — from LuauAccessModifier.
  access: string;
  node: SyntaxNode;
}

const METHOD_BODY_SKIP: ReadonlySet<string> = new Set([
  "LuauFunctionDeclarationName",
  "LuauFunctionName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
  "LuauComment",
]);

export function lowerLuauDefine(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return {};
  const nameIdentifier = new Identifier(ctx.read(nameNode.from, nameNode.to));

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parentIdentifier = parentNode
    ? new Identifier(ctx.read(parentNode.from, parentNode.to))
    : null;

  const content = findChildByName(nodeRef.node, "LuauDefine_content");
  const properties: DefineProperty[] = [];
  const methodNodes: { name: string; node: SyntaxNode }[] = [];
  if (content) {
    let child = content.firstChild;
    while (child) {
      if (child.name === "LuauPropertyDefinition") {
        const prop = readPropertyDefinition(child, ctx);
        if (prop) properties.push(prop);
      } else if (child.name === "LuauMethodDefinition") {
        const methodNameNode = getDescendent("LuauFunctionName", child);
        if (methodNameNode) {
          methodNodes.push({
            name: ctx.read(methodNameNode.from, methodNameNode.to),
            node: child,
          });
        }
      } else if (child.name === "LuauFunctionDefinition") {
        // Explicit `function name() ... end` member form.
        const declName = findOwnDeclarationName(child);
        const fnNameNode = declName
          ? getDescendent("LuauFunctionName", declName)
          : null;
        if (fnNameNode) {
          methodNodes.push({
            name: ctx.read(fnNameNode.from, fnNameNode.to),
            node: child,
          });
        }
      }
      child = child.nextSibling;
    }
  }

  // ----- The runtime table: __def({ props, methods, modifier lists }, name, parent)
  const entries: ObjectExpressionEntry[] = [];
  for (const prop of properties) {
    entries.push(new ObjectExpressionEntry(prop.name, prop.expr));
  }
  for (const method of methodNodes) {
    const closure = lowerDefineMethod(method.name, method.node, ctx);
    if (closure) {
      entries.push(new ObjectExpressionEntry(method.name, closure));
    }
  }
  // Hidden modifier lists. `__storeProps` drives the copy-into-instance
  // behavior in `__def` / `__new`; `__readProps` / `__writeProps` are
  // recorded for future access enforcement.
  const pushNameList = (key: string, names: string[]) => {
    if (names.length === 0) return;
    entries.push(
      new ObjectExpressionEntry(
        key,
        new ObjectExpression(
          names.map(
            (n, i) =>
              new ObjectExpressionEntry(
                String(i + 1),
                new StringExpression([new Text(n)]),
              ),
          ),
        ),
      ),
    );
  };
  pushNameList(
    "__storeProps",
    properties.filter((p) => p.scope === "store").map((p) => p.name),
  );
  pushNameList(
    "__readProps",
    properties.filter((p) => p.access === "read").map((p) => p.name),
  );
  pushNameList(
    "__writeProps",
    properties.filter((p) => p.access === "write").map((p) => p.name),
  );

  const defineExpr = new FunctionCall(new Identifier("__def"), [
    new ObjectExpression(entries),
    new StringExpression([new Text(nameIdentifier.name ?? "")]),
    new StringExpression([new Text(parentIdentifier?.name ?? "")]),
  ]);

  // ----- The struct registration (engine specs) — only for typed
  // defines (`as T`); root defines have no engine type. Carries only
  // DATA properties (the engine never consumes methods).
  let structDef: StructDefinition | null = null;
  if (parentIdentifier) {
    const propertyDefs = properties.map(
      (p) => new StructPropertyDefinition(0, new Identifier(p.name), p.expr),
    );
    structDef = new StructDefinition(propertyDefs);
    structDef.name = nameIdentifier;
    structDef.type = parentIdentifier;
    structDef.identifier = nameIdentifier;
  }

  const declaration = new VariableAssignment({
    variableIdentifier: nameIdentifier,
    assignedExpression: defineExpr,
    ...(structDef ? { structDef } : {}),
    isGlobalDeclaration: true,
  });

  return wrapInWeave([declaration]);
}

// Lower one method member into a hoisted anonymous Function knot with
// an implicit `self` first parameter, returning the closure-shaped
// expression that the class table stores under the method's name.
// Mirrors `lowerPropertyTargetFunctionDefinition`'s colon form
// (`function Class:method(...)`) — same upval capture, same
// `__closure_user_arity` contract (counts `self`).
function lowerDefineMethod(
  methodName: string,
  node: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  const content = getFunctionBodyContent(node);
  if (!content) return null;

  const synthName = `__define_fn_${node.from}`;
  const userArgs = lowerArguments(node, ctx);
  const upvals = scanFreeVariables(node, ctx).filter((n) => n !== "self");
  const upvalArgs = upvals.map(
    (n) => new Argument(new Identifier(n), false, false),
  );
  const finalArgs: Argument[] = [
    ...upvalArgs,
    new Argument(new Identifier("self"), false, false),
    ...userArgs,
  ];

  const nested: ParsedObject[] = [];
  ctx.functionScopeStack?.push(nested);
  ctx.declaredLocalsStack?.push(new Set(["self"]));
  const hoistedDecls: ParsedObject[] = [];
  ctx.hoistedNestedFnDeclsStack?.push(hoistedDecls);
  const siblingSubFlows = new Map<string, SiblingSubFlowInfo>();
  ctx.siblingSubFlowNamesStack?.push(siblingSubFlows);
  const body = lowerStatements(content, ctx, METHOD_BODY_SKIP);
  ctx.siblingSubFlowNamesStack?.pop();
  ctx.hoistedNestedFnDeclsStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionScopeStack?.pop();

  const fn = new Function(
    new Identifier(synthName),
    [...hoistedDecls, ...body, ...nested],
    finalArgs,
  );

  const stack = ctx.functionScopeStack;
  const enclosingScope =
    stack && stack.length > 0 ? stack[stack.length - 1] : null;
  if (enclosingScope) {
    enclosingScope.push(fn);
  } else if (ctx.hoistedKnots) {
    ctx.hoistedKnots.push(fn);
  } else {
    return null;
  }

  const userArity = 1 + userArgs.filter((a) => !a.isVararg).length;
  return buildClosureExpression(synthName, upvals, userArity);
}

// ----------------------------------------------------------------------------
// Property parsing (shared by both flavors).
// ----------------------------------------------------------------------------

function readPropertyDefinition(
  propNode: SyntaxNode,
  ctx: LowerContext,
): DefineProperty | null {
  const variableAssignment = getDescendent("LuauVariableAssignment", propNode);
  if (!variableAssignment) return null;

  const nameNode = getDescendent("LuauVariableName", variableAssignment);
  if (!nameNode) return null;
  const name = ctx.read(nameNode.from, nameNode.to);

  const opNode = getDescendent("LuauAssignmentOperation", variableAssignment);
  const expr = opNode ? lowerExpressionFromContainer(opNode, ctx) : null;
  if (!expr) return null;

  // Modifiers live in the property's begin captures, OUTSIDE the
  // variable assignment.
  const scopeNode = getDescendent("LuauScopeModifier", propNode);
  const accessNode = getDescendent("LuauAccessModifier", propNode);
  const scope = scopeNode
    ? ctx.read(scopeNode.from, scopeNode.to).trim()
    : "";
  const access = accessNode
    ? ctx.read(accessNode.from, accessNode.to).trim()
    : "";

  return { name, expr, scope, access, node: propNode };
}
