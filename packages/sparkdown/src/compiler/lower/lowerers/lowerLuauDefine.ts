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
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
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

// `define` blocks come in two flavors, split on whether the block
// declares any METHODS:
//
// 1. DATA define (properties only) — the legacy struct path,
//    unchanged: lowers to a `StructDefinition` registered in the
//    story's compile-time struct registry (`structDefinitions` in the
//    compiled JSON — consumed by the engine for character/UI/asset
//    specs) plus flat dot-accessible property globals. Never
//    initialized or serialized at runtime.
//
//      define companion as character with
//        name = "???"
//      end
//
// 2. CLASS define (has `name(args) ... end` methods) — sparkdown's
//    OOP sugar. Lowers to a GLOBAL DECLARATION whose initializer
//    builds the class table at story start:
//
//      define Penguin as Bird with         Penguin = setmetatable({
//        canFly = false                      canFly = false,
//        swim()                              swim = <closure(self)>,
//          self.isSwimming = true          }, { __index = Bird })
//        end
//      end
//
//    - Data properties become class-table defaults; instances created
//      with `new Penguin()` read them through the `__index` chain
//      until written (table-form dispatch — no function-form
//      metamethod re-entry on the hot path).
//    - Methods become hoisted anonymous Function knots with an
//      implicit `self` first parameter, stored as closure values in
//      the class table. `penguin:fly()` resolves `fly` through the
//      instance's `__index` chain and threads the receiver via the
//      existing colon-call dispatch.
//    - `as Parent` chains the class to another class-define via
//      `setmetatable(Class, { __index = Parent })`. Initialization
//      order is document order, so parents must be defined first.
//    - `store`-modified properties are recorded in a hidden
//      `__storeProps` list; `__new` copies those defaults INTO each
//      instance at construction so they always travel with the
//      instance in save files (unmodified non-store properties stay
//      on the class and reset to defaults on load).
//    - `read` / `write` access modifiers are recorded in hidden
//      `__readProps` / `__writeProps` lists for future enforcement;
//      they have no runtime effect yet.
//    - An `init(...)` method, if declared, is invoked by `__new`
//      with the constructor's arguments after store-prop copying.
//
//    Class defines deliberately SKIP struct registration:
//    `VariableReference.ResolveReferences` blocks bare references to
//    struct names ("allow reference to struct property, not struct
//    itself"), which would break `new Bird()` / `setmetatable(Bird,
//    ...)` resolution.

interface DefineProperty {
  name: string;
  expr: Expression;
  // "store" | "local" | "const" | "" — from LuauScopeModifier.
  scope: string;
  // "read" | "write" | "" — from LuauAccessModifier.
  access: string;
  node: SyntaxNode;
}

interface DefineMethod {
  name: string;
  closure: Expression;
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

  // CLASS-define detection. A define is a class when it declares any
  // method, or when it inherits from a CLASS define (a data-only
  // subclass like `define Penguin as Bird with noise = "honk" end`
  // must still chain to Bird's table). Everything else — including
  // modifier-bearing data defines like the engine-typed
  // `define companion as character with store trust = 0` — stays on
  // the legacy struct path. `ctx.classDefineNames` is precomputed
  // from the whole document by CompilationAnnotator (chunks lower
  // with fresh contexts, so same-chunk registration can't see across
  // defines); the lazy `??=` add below keeps single-context tools
  // (snapshot tests) working for same-document subclassing. Known
  // gap: a method-less ROOT class can't be detected — give it a
  // method to opt in.
  const isClassDefine =
    methodNodes.length > 0 ||
    (nameIdentifier.name != null &&
      (ctx.classDefineNames?.has(nameIdentifier.name) ?? false)) ||
    (parentIdentifier?.name != null &&
      (ctx.classDefineNames?.has(parentIdentifier.name) ?? false));

  if (!isClassDefine) {
    return lowerDataDefine(nameIdentifier, parentIdentifier, properties);
  }
  if (nameIdentifier.name) {
    ctx.classDefineNames ??= new Set();
    ctx.classDefineNames.add(nameIdentifier.name);
  }
  return lowerClassDefine(
    nameIdentifier,
    parentIdentifier,
    properties,
    methodNodes,
    ctx,
  );
}

// ----------------------------------------------------------------------------
// Data define — legacy struct path (unchanged behavior).
// ----------------------------------------------------------------------------

function lowerDataDefine(
  nameIdentifier: Identifier,
  parentIdentifier: Identifier | null,
  properties: DefineProperty[],
): CompiledBlock {
  const propertyDefs = properties.map(
    (p) => new StructPropertyDefinition(0, new Identifier(p.name), p.expr),
  );
  const structDef = new StructDefinition(propertyDefs);
  structDef.name = nameIdentifier;
  structDef.type = parentIdentifier;
  structDef.identifier = nameIdentifier;

  const variableAssignment = new VariableAssignment({
    variableIdentifier: nameIdentifier,
    structDef,
  });

  return wrapInWeave([variableAssignment]);
}

// ----------------------------------------------------------------------------
// Class define — OOP sugar.
// ----------------------------------------------------------------------------

function lowerClassDefine(
  nameIdentifier: Identifier,
  parentIdentifier: Identifier | null,
  properties: DefineProperty[],
  methodNodes: { name: string; node: SyntaxNode }[],
  ctx: LowerContext,
): CompiledBlock {
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

  // Hidden modifier lists. `__storeProps` drives `__new`'s
  // copy-into-instance behavior; `__readProps` / `__writeProps` are
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

  let classExpr: Expression = new ObjectExpression(entries);

  if (parentIdentifier) {
    // Chain to the parent class: Class = setmetatable({...},
    // { __index = Parent }). Globals initialize in document order,
    // so the parent's table already exists when this runs.
    classExpr = new FunctionCall(new Identifier("setmetatable"), [
      classExpr,
      new ObjectExpression([
        new ObjectExpressionEntry(
          "__index",
          new VariableReference([parentIdentifier]),
        ),
      ]),
    ]);
  }

  const declaration = new VariableAssignment({
    variableIdentifier: nameIdentifier,
    assignedExpression: classExpr,
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
