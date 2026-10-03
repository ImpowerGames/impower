import { nodeNameSet } from "../../utils/nodeNameSet";
import { luauStatementError } from "../../utils/luauStatementError";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { followsDanglingDot, followsMissingValue } from "../utils/statementBefore";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { StructDefinition } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructDefinition";
import { StructPropertyDefinition } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructPropertyDefinition";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext, SiblingSubFlowInfo } from "../context";
import {
  AstExpr,
  AstExprBinary,
  AstExprCall,
  AstExprConstantBool,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprFunction,
  AstExprGroup,
  AstExprSparkdownInterpString,
  AstExprSparkdownRegex,
  AstExprTable,
  AstExprUnary,
  BinaryOp,
  QuoteStyle,
  UnaryOp,
} from "../../typecheck/Ast";
import { recordCaptureRead } from "../expression/bindings";
import {
  containerValueNodes,
  lowerExpression,
  pathNames,
  processLuauEscapes,
  stripQuotes,
} from "../expression/lowerExpression";
import {
  bodyAst,
  buildClosureExpression,
  freeVariables,
} from "../expression/lowerFunction";
import { rangeOf, readExpressionAst, type LuauSource } from "../utils/luauAst";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { identifierAt, stampDebugMetadata } from "../utils/debugMetadata";
import { findOwnDeclarationName } from "../utils/findOwnDeclarationName";
import { getFunctionBodyContent } from "../utils/getFunctionBodyContent";
import { lowerArguments } from "../utils/lowerArguments";
import { validateAssignmentValue } from "../utils/validateAssignmentValue";
import { validateDefineStructure } from "../utils/validateDefineStructure";
import { wrapInWeave } from "../utils/wrapInWeave";
import { syntheticId } from "../utils/documentTag";
import {
  closeFunctionBody,
  openFunctionBody,
} from "../utils/statementShape";

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
  // The assigned value as the converter read it, with the nodes it was read
  // from, used to emit a compile-time literal into the engine struct
  // registry. See the context-emission note in `lowerLuauDefine`.
  value: DefineValue;
}

interface DefineValue {
  expr: AstExpr;
  source: LuauSource;
  /** Whether the converter read the value without a syntax error. */
  isLuau: boolean;
  /** The nodes the value was read from, comments and whitespace left out. */
  nodes: SyntaxNode[];
}

const DEFINE_MEMBER_NAMES = nodeNameSet([
  "LuauPropertyDefinition", "LuauMethodDefinition", "LuauFunctionDefinition",
]);

const EXPRESSION_STATEMENT_STARTS = nodeNameSet([
  "LuauAccessPath", "LuauNumericDecimal", "LuauNumericHex", "LuauNumericBinary",
  "LuauDoubleQuotedString", "LuauSingleQuotedString", "LuauMultilineString",
  "LuauInterpolatedString", "LuauBoolean", "LuauNil", "LuauTable",
  "LuauLengthOperation", "LuauLogicalOperation", "LuauParenthetical", "LuauUnitKeywords",
]);

// Define bodies lower members only, but still report expressions that Luau
// cannot read as statements. A property's continuation is consumed first.
function reportDefineStatement(start: SyntaxNode, ctx: LowerContext): SyntaxNode {
  let last = start;
  let dangling = false;
  for (let node: SyntaxNode | null = start; node && node.name !== "Newline"; node = node.nextSibling) {
    last = node;
    if (node.name === "LuauDanglingAccessor" || getDescendent("LuauDanglingAccessor", node)) dangling = true;
  }
  const read = (from: number, to: number) => ctx.read(from, to);
  if (dangling || followsDanglingDot(start, read) || followsMissingValue(start, read)) return last;
  const error = luauStatementError(start, start.from, read, last.to, ctx.documentText);
  if (error) ctx.diagnostics?.push({
    message: error.message,
    severity: ErrorType.Error,
    source: {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(error.from) + 1,
      endLineNumber: ctx.lineNumber(error.to) + 1,
      startCharacterNumber: ctx.characterNumber(error.from) + 1,
      endCharacterNumber: ctx.characterNumber(error.to) + 1,
    },
  });
  return last;
}

// Coerce a property's value to a compile-time literal for the engine struct
// registry, as the converter read it: a string literal's value, with its
// escapes read so that a regex written as a string reaches context as the
// runtime string does, a number, a boolean, or, for a value that is no Luau
// expression or that names nothing Luau computes (`surface-2`, `md`,
// `inline-block`, `hero`), the value's text as written, which the engine's
// value system interprets. A comment after the value is no part of it
// (`delay = 5 -- note` is the number 5), and a `--` inside quotes is part of
// the string. Returns `undefined` for values that aren't simple scalars (a
// table, a call, a typed reference such as `layer.instance`, a
// concatenation, anything written over several lines): those have no
// faithful literal form and are left out of the registry (the runtime
// `__def` table remains their source of truth), or, for a typed reference,
// resolved by `expressionToContextValue`.
function coerceScalarLiteral(value: DefineValue, ctx: LowerContext): unknown {
  const first = value.nodes[0];
  const last = value.nodes[value.nodes.length - 1];
  if (!first || !last) return undefined;
  if (ctx.lineNumber(first.from) !== ctx.lineNumber(last.to)) return undefined;
  if (!value.isLuau) return ctx.read(first.from, last.to).trim();
  const expr = value.expr;
  const range = rangeOf(expr.location, ctx);
  const text = ctx.read(range.from, range.to);
  if (expr instanceof AstExprConstantString) {
    if (expr.quoteStyle === QuoteStyle.QuotedRaw) return undefined;
    return processLuauEscapes(stripQuotes(text));
  }
  if (expr instanceof AstExprSparkdownInterpString) {
    return processLuauEscapes(stripQuotes(text));
  }
  if (expr instanceof AstExprConstantBool) return expr.value;
  if (expr instanceof AstExprConstantNumber) {
    return expr.malformed ? text : expr.value;
  }
  if (
    expr instanceof AstExprUnary &&
    expr.op === UnaryOp.Minus &&
    expr.expr instanceof AstExprConstantNumber &&
    !expr.expr.malformed
  ) {
    return -expr.expr.value;
  }
  // A regex literal (`@/pattern/flags`) reaches the registry as the string
  // it lowers to, `/pattern/flags` (`expressionToContextValue`).
  if (
    expr instanceof AstExprSparkdownRegex ||
    expr instanceof AstExprTable ||
    expr instanceof AstExprCall ||
    expr instanceof AstExprGroup ||
    expr instanceof AstExprFunction ||
    (expr instanceof AstExprBinary && expr.op === BinaryOp.Concat)
  ) {
    return undefined;
  }
  // A TYPED reference (`layer.instance`, `image.none`) is NOT a scalar string —
  // let `expressionToContextValue` resolve it to a `{ $type, $name }` ref (the
  // engine reads e.g. `animation.target.$name`). Without this it would be
  // stored as the literal string "layer.instance" and `.$name` would be
  // undefined.
  if (pathNames(expr)?.length === 2) return undefined;
  return text;
}

// Convert a parsed property-value Expression into a compile-time context
// value for the engine struct registry — the NON-scalar counterpart to
// `coerceScalarLiteral` (which works from the raw source string and handles
// engine value tokens like `surface-2` that aren't valid Luau expressions).
// This is what lets a `layered_image`'s `assets = { a, b }` table reach
// `program.context` so `UIModule.getImageAssets` can iterate it. Mirrors
// `StructPropertyDefinition.GetValue`'s reference semantics exactly:
//   - a bare reference `a`      → { $type: "",  $name: "a" }
//   - a typed reference `t.n`   → { $type: "t", $name: "n" }
// The engine treats an empty `$type` as "search every type by name", so no
// compile-time type resolution is needed. A Luau table lowers to an
// `ObjectExpression`; array-style entries (lowerTable keys them "1".."n")
// become a JS array, keyed entries a JS object. Returns `undefined` for any
// value that has no faithful literal form (a call, an operator expression, a
// computed key, an interpolation) — that whole property is then left to the
// runtime `__def` table, matching `coerceScalarLiteral`'s contract.
function expressionToContextValue(expr: Expression | null): unknown {
  if (!expr) return undefined;
  if (expr instanceof NumberExpression) {
    // Covers int / float / bool (`value` is number | boolean).
    return expr.value;
  }
  if (expr instanceof StringExpression) {
    return expr.isSingleString ? expr.toString() : undefined;
  }
  if (expr instanceof VariableReference) {
    const path = expr.path;
    if (path.length === 1) {
      return { $type: "", $name: path[0] ?? "" };
    }
    if (path.length === 2) {
      return { $type: path[0] ?? "", $name: path[1] ?? "" };
    }
    return undefined;
  }
  if (expr instanceof ObjectExpression) {
    const entries = expr.entries;
    if (entries.length === 0) {
      return {};
    }
    // Array-style when every key is the sequential 1-based index string
    // that `lowerTable` assigns to bare (non-keyed) entries.
    let isArray = true;
    for (let i = 0; i < entries.length; i += 1) {
      if (entries[i]!.key !== String(i + 1)) {
        isArray = false;
        break;
      }
    }
    if (isArray) {
      const arr: unknown[] = [];
      for (const entry of entries) {
        const value = expressionToContextValue(entry.value);
        if (value === undefined) return undefined;
        arr.push(value);
      }
      return arr;
    }
    const obj: Record<string, unknown> = {};
    for (const entry of entries) {
      // Computed keys (`[expr] =`) can't be resolved at compile time.
      if (typeof entry.key !== "string") return undefined;
      const value = expressionToContextValue(entry.value);
      if (value === undefined) return undefined;
      obj[entry.key] = value;
    }
    return obj;
  }
  return undefined;
}

// True if a computed context value contains a struct reference anywhere
// (a `{ $type, $name }` marker). Only such values need the runtime-table
// substitution below — a reference is the thing that would be evaluated as
// a global lookup at init.
function containsStructRef(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsStructRef);
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("$type" in v && "$name" in v) return true;
    return Object.values(v).some(containsStructRef);
  }
  return false;
}

// Rebuild a static literal Expression from a computed context value — the
// inverse of `expressionToContextValue`. Used to replace a define
// property's RUNTIME table expression when it holds struct references, so
// the `__def` table is built from inert `{ $type, $name }` literals instead
// of evaluating `audio.mus_a_bass` (which would index the `audio` type
// global — nil unless some define inherits from it — and throw at init).
// This matches the legacy colon-form, where a struct property's references
// were always compile-time `{ $type, $name }` data, never runtime lookups.
export function contextValueToExpression(value: unknown): Expression {
  if (typeof value === "boolean") {
    return new NumberExpression(value, "bool");
  }
  if (typeof value === "number") {
    return new NumberExpression(value, Number.isInteger(value) ? "int" : "float");
  }
  if (typeof value === "string") {
    return new StringExpression([new Text(value)]);
  }
  if (Array.isArray(value)) {
    return new ObjectExpression(
      value.map(
        (v, i) =>
          new ObjectExpressionEntry(String(i + 1), contextValueToExpression(v)),
      ),
    );
  }
  if (value && typeof value === "object") {
    return new ObjectExpression(
      Object.entries(value as Record<string, unknown>).map(
        ([k, v]) => new ObjectExpressionEntry(k, contextValueToExpression(v)),
      ),
    );
  }
  // null / undefined shouldn't reach here (only substituted values do).
  return new ObjectExpression([]);
}

const METHOD_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
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
  // Reported through the chunk's diagnostics buffer, as the other lowerers do,
  // so a define nested inside another block still reports: `lowerStatements`
  // keeps only the content of the blocks it lowers.
  const structureErrors = validateDefineStructure(nodeRef.node, ctx);
  ctx.diagnostics?.push(...structureErrors);
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return {};
  const nameIdentifier = identifierAt(nameNode, ctx);

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parentIdentifier = parentNode ? identifierAt(parentNode, ctx) : null;

  const content = findChildByName(nodeRef.node, "LuauDefine_content");
  const properties: DefineProperty[] = [];
  const methodNodes: { name: string; node: SyntaxNode }[] = [];
  if (content) {
    let child = content.firstChild;
    while (child) {
      if (child.name === "LuauPropertyDefinition") {
        const prop = readPropertyDefinition(child, ctx);
        if (prop) {
          properties.push(prop);
          const end = rangeOf(prop.value.expr.location, ctx).to;
          while (child.nextSibling && child.nextSibling.from < end) child = child.nextSibling;
        }
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
        } else if (structureErrors.length === 0) {
          child = reportDefineStatement(child, ctx);
        }
      } else if (structureErrors.length === 0 && EXPRESSION_STATEMENT_STARTS.has(child.name)) {
        child = reportDefineStatement(child, ctx);
      }
      child = child.nextSibling;
    }
  }

  // ----- The runtime table: __def({ props, methods, modifier lists }, name, parent)
  const entries: ObjectExpressionEntry[] = [];
  for (const prop of properties) {
    // A table-valued property that holds struct references (e.g. a
    // `layered_image`'s `assets = { audio.x, bg_y }`) must NOT be evaluated
    // as live Luau at init — `audio.x` indexes the `audio` type global,
    // which is nil unless a define inherits from it, and throws. Substitute
    // an inert `{ $type, $name }` literal (matching context + the legacy
    // colon-form). Bare single-identifier refs (`leader = hero`) are caught
    // by `coerceScalarLiteral` and keep their runtime-object behavior.
    let entryExpr: Expression = prop.expr;
    if (coerceScalarLiteral(prop.value, ctx) === undefined) {
      const ctxValue = expressionToContextValue(prop.expr);
      if (ctxValue !== undefined && containsStructRef(ctxValue)) {
        entryExpr = contextValueToExpression(ctxValue);
      }
    }
    entries.push(new ObjectExpressionEntry(prop.name, entryExpr));
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
    // Property level must be > 0. `StructDefinition.BuildValue` walks the
    // property list as an indentation tree seeded with a level-0 root
    // sentinel; a property at level 0 pops that sentinel (the
    // `prop.level <= parentLevel` test), leaving no parent to attach to,
    // so EVERY property is silently dropped and the struct serializes as
    // an empty `{$type,$name}`. The colon form's props are indented under
    // the header (level ≥ 1), which is why they survive. These OOP-define
    // props are a flat sibling list, so they all sit at a single level 1
    // (nesting is carried inside each prop's ObjectExpression, not via the
    // level). Without this, `define X as character` registers the struct
    // KEY but with no `name` prop, so the engine can't match a dialogue
    // cue (`RAFFLES:`) to its character and every cue warns + no portrait.
    const propertyDefs = properties.map(
      (p) => new StructPropertyDefinition(1, new Identifier(p.name), p.expr),
    );
    structDef = new StructDefinition(propertyDefs);
    structDef.name = nameIdentifier;
    structDef.type = parentIdentifier;
    structDef.identifier = nameIdentifier;
  }

  // Emit the define bound to its BARE name here. Whether it ends up on the bare
  // global or a synthetic `$<type>_<name>` key is decided later, by the
  // whole-program `scopeDefineInstances` post-pass in SparkdownCompiler (before
  // ExportRuntime): a typed define whose name is NEVER used as a type — not an
  // `as`-parent, not a `new D()` target — is a LEAF INSTANCE and gets scoped so
  // the bare name stays free for user `store`/vars (the `store show` vs builtin
  // `animation show` clash class). That classification is a whole-PROGRAM
  // property (`define X` and `new X()`/`as X` can live in different included
  // files), so it can't be decided during per-document lowering — hence the
  // post-pass. The `__def(table, "D", "T")` args and the StructDefinition (which
  // the post-pass reads as the stable bare source, and which feeds
  // `context.T.D` + dialogue-cue resolution) stay keyed by the bare name.
  // See [[project_define_namespace_scoping]].
  const declaration = new VariableAssignment({
    variableIdentifier: nameIdentifier,
    assignedExpression: defineExpr,
    ...(structDef ? { structDef } : {}),
    isGlobalDeclaration: true,
    isDefineDeclaration: true,
  });

  const block = wrapInWeave([declaration]);

  // ----- Compile-time struct registry (engine specs) for typed defines.
  //
  // A typed OOP define (`define raffles as character with name = "RAFFLES"`)
  // carries a StructDefinition above, but that parsed-hierarchy → engine
  // serialization path emits an EMPTY struct for OOP defines (the runtime
  // `__def` table is treated as their source of truth), so the struct
  // never lands in `program.context`. The engine's reference resolver
  // (`resolveSelector`) only consults `program.context`, so e.g. a dialogue
  // cue `RAFFLES:` can't find its character — every cue warns and no portrait
  // renders. The structural UI lowerers (style/screen/component) hit the same
  // wall and solve it by emitting directly through the chunk's `context`
  // field; do the same here for the scalar (engine-relevant) properties.
  // Non-scalar props are left to the runtime table (see `coerceScalarLiteral`).
  if (parentIdentifier) {
    const type = parentIdentifier.name ?? "";
    const name = nameIdentifier.name ?? "";
    if (type && name) {
      const struct: Record<string, unknown> = { $type: type, $name: name };
      for (const prop of properties) {
        // A bare/dotted reference used as a SCALAR value (e.g. a
        // `filtered_image`'s `image = bunny_realization`) is a struct
        // reference, not a string — it must reach context as a
        // `{ $type, $name }` object so the engine's spec system can resolve it
        // (matching `schema_filtered_image`/`default_filtered_image`, the
        // implicit filtered_image defs, references inside `{ … }` tables, and
        // the legacy colon-form). `coerceScalarLiteral` would otherwise claim
        // the bare identifier as a plain string, leaving `filterImage` unable
        // to find the base image (its `image.$name` read yields `undefined`),
        // so the filtered image silently renders nothing. Only a value that
        // parses as a plain reference takes this path; engine value tokens like
        // `surface-2` don't (they aren't a single/dotted VariableReference), so
        // they still fall through to the raw-string scalar coercion below.
        let value =
          prop.expr instanceof VariableReference
            ? expressionToContextValue(prop.expr)
            : undefined;
        // Scalars (and engine value tokens like `surface-2`) come from the
        // raw source; tables/arrays/references fall back to the parsed
        // expression so a `layered_image`'s `assets = { … }` reaches context.
        if (value === undefined) {
          value = coerceScalarLiteral(prop.value, ctx);
        }
        if (value === undefined) {
          value = expressionToContextValue(prop.expr);
        }
        if (value !== undefined) {
          struct[prop.name] = value;
        }
      }
      block.context = { [type]: { [name]: struct } };
    }
  } else {
    // A ROOT define (`define X with <props>`, no `as T`) DECLARES type X and
    // its default property values. Emit those props as the type's `$default`
    // entry, so the LSP / `populateDefinedDefaultProperties` see X's defaults
    // and instances of X (`define Y as X`) inherit them in `program.context`
    // — mirroring the runtime, where instances inherit the root table's props
    // through `__index`. (Without this a root define's own props were dropped
    // from context entirely.) This is also how the builtins prelude expresses
    // each type's `$default` (`define animation with <defaults> end`).
    const type = nameIdentifier.name ?? "";
    if (type) {
      const struct: Record<string, unknown> = {
        $type: type,
        $name: "$default",
      };
      for (const prop of properties) {
        let value = coerceScalarLiteral(prop.value, ctx);
        if (value === undefined) {
          value = expressionToContextValue(prop.expr);
        }
        if (value !== undefined) {
          struct[prop.name] = value;
        }
      }
      block.context = { [type]: { ["$default"]: struct } };
    }
  }

  return block;
}

// Lower one method member into a hoisted anonymous Function knot with
// an implicit `self` first parameter, returning the closure-shaped
// expression that the class table stores under the method's name.
// Mirrors `lowerPropertyTargetFunctionDefinition`'s colon form
// (`function Class:method(...)`) — same upval capture, same
// `__closure_user_arity` contract (counts `self`).
function lowerDefineMethod(
  _methodName: string,
  node: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  const content = getFunctionBodyContent(node);
  if (!content) return null;

  const synthName = `__define_fn_${syntheticId(node.from, ctx)}`;
  const userArgs = lowerArguments(node, ctx);
  // The method's header (`name(args)`) is no Luau syntax, so only its body
  // is read as Luau, for the names it captures.
  const params = userArgs
    .filter((a) => !a.isVararg)
    .map((a) => a.identifier?.name ?? "");
  const upvals = freeVariables(
    params,
    bodyAst(content, METHOD_BODY_SKIP, ctx),
    ctx,
  ).filter((n) => n !== "self");
  recordCaptureRead(ctx, upvals);
  const upvalArgs = upvals.map(
    (n) => new Argument(new Identifier(n), false, false, false, true),
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
  const shape = openFunctionBody(ctx, node);
  const body = lowerStatements(content, ctx, METHOD_BODY_SKIP, shape);
  ctx.siblingSubFlowNamesStack?.pop();
  ctx.hoistedNestedFnDeclsStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionScopeStack?.pop();

  const fn = new Function(
    new Identifier(synthName),
    [...hoistedDecls, ...body, ...nested],
    finalArgs,
  );
  closeFunctionBody(ctx, shape, fn, node, hoistedDecls);
  // The method's source span places it where it is written, for the scope
  // check that decides whether a name in its body reads a local (see
  // `FlowBase.IsLocalInScope`).
  stampDebugMetadata([fn], node.from, node.to, ctx);

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

// Find the value node of a `LuauAssignmentOperation` (the RHS of a
// property's `name = value`). The operation wraps a `LuauAssignmentOperator`
// marker (`= `) followed by the value node(s); descend into the generated
// `_content` wrapper if present and return the first child past the operator
// and any leading whitespace.
const ASSIGNMENT_RHS_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauAssignmentOperator",
  "ExtraWhitespace",
  "Whitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "Newline",
  "LuauComment",
]);

function findAssignmentValueNode(
  opNode: SyntaxNode | null,
): SyntaxNode | null {
  if (!opNode) return null;
  let content = opNode.firstChild;
  while (content) {
    if (content.name === "LuauAssignmentOperation_content") break;
    content = content.nextSibling;
  }
  let child = (content ?? opNode).firstChild;
  while (child) {
    if (!ASSIGNMENT_RHS_SKIP.has(child.name)) return child;
    child = child.nextSibling;
  }
  return null;
}

function readPropertyDefinition(
  propNode: SyntaxNode,
  ctx: LowerContext,
): DefineProperty | null {
  // The key is either a bracket-key (`["selector"] = …`, `["$link"] = …`) or a
  // plain identifier (`name = …`).
  let name: string | null = null;
  const bracketAssignment = getDescendent("LuauBracketKeyAssignment", propNode);
  if (bracketAssignment) {
    const indexNode = getDescendent(
      "LuauTableIndexDeclaration",
      bracketAssignment,
    );
    if (!indexNode) return null;
    // Only STRING-LITERAL keys are representable in the compile-time struct;
    // computed keys (`[expr]`) stay runtime-only (the __def table still carries
    // them). The key is the string's value, its escapes read.
    const key = readExpressionAst(containerValueNodes(indexNode), ctx);
    if (
      key?.expr instanceof AstExprConstantString &&
      key.expr.quoteStyle !== QuoteStyle.QuotedRaw
    ) {
      const range = rangeOf(key.expr.location, ctx);
      name = processLuauEscapes(stripQuotes(ctx.read(range.from, range.to)));
    }
    if (name == null) return null;
  } else {
    const variableAssignment = getDescendent(
      "LuauVariableAssignment",
      propNode,
    );
    if (!variableAssignment) return null;
    const nameNode = getDescendent("LuauVariableName", variableAssignment);
    if (!nameNode) return null;
    name = ctx.read(nameNode.from, nameNode.to);
  }

  const opNode = getDescendent("LuauAssignmentOperation", propNode);
  const valueNodes = opNode ? containerValueNodes(opNode) : [];
  // Let the shared reader decide how much of the following lines belongs
  // to the value (including call sugar and a value after a line-ending `=`).
  const candidates = [...valueNodes];
  for (let next = propNode.nextSibling; next; next = next.nextSibling) {
    // A bracket-key property's operation is a sibling of its key node.
    // Its value nodes are already present above.
    if (opNode && next.to <= opNode.to) continue;
    if (DEFINE_MEMBER_NAMES.has(next.name)) break;
    candidates.push(next);
  }
  const continued = readExpressionAst(candidates, ctx);
  const end = continued ? rangeOf(continued.expr.location, ctx).to : propNode.to;
  const consumed = end <= propNode.to ? valueNodes : candidates.filter((node) => node.from < end);
  const reading = readExpressionAst(consumed, ctx);
  if (opNode && (!reading || reading.source.errors.length > 0)) validateAssignmentValue(opNode, ctx);
  const expr = reading
    ? lowerExpression(reading.expr, reading.source, ctx)
    : null;
  if (!expr || !reading) return null;
  const value: DefineValue = {
    expr: reading.expr,
    source: reading.source,
    isLuau: reading.source.errors.length === 0,
    nodes: consumed.filter(
      (n) => !ASSIGNMENT_RHS_SKIP.has(n.name) && !n.name.endsWith("Comment"),
    ),
  };
  const valueNode = findAssignmentValueNode(opNode ?? null);

  // Anchor the property's value expression to its source range. Diagnostics
  // raised from inside it (notably `Cannot find variable named \`x\`` from
  // VariableReference) report themselves as the source, and ParsedObject's
  // debugMetadata getter walks the parent chain -- so stamping the top-level
  // expression is enough to give every nested node a location. Without this
  // the compiler's diagnostic callback falls back to the ENTRY document at
  // 0:0, piling every such warning invisibly at the top of the wrong file.
  if (valueNode && opNode) {
    stampDebugMetadata([expr], valueNode.from, opNode.to, ctx);
  }

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

  return { name, expr, scope, access, node: propNode, value };
}
