import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInWeave } from "../utils/wrapInWeave";
import { contextValueToExpression } from "./lowerLuauDefine";
import { parseStructBodyTyped } from "./lowerStructBodyTyped";

// `animation NAME [as PARENT] with <body> end` / `theme NAME …` — structural
// presentation keywords (style-family). They produce BOTH:
//   - a compile-time struct in program.context.<type>.<name> (for the LSP), and
//   - a runtime `__def` global table (the engine's source of truth, read via
//     buildDefinesContext) — exactly like `define X as <type>`.
// The body is parsed by the TYPED reader (parseStructBodyTyped) so numeric fields
// (offset/duration/iterations) stay numbers and quoted CSS stays a string. The
// struct implicitly extends its type (PARENT ?? "<type>") so it inherits the
// type's `$default` (the `define animation with …` / `define theme with …` root
// in builtins.sd) via the existing inheritance deep-merge — at compile time
// (populateDefinedDefaultProperties, by type) and at runtime (the `__def` parent
// arg → the VM `__index` chain). See project_animation_theme_structural.
export function lowerLuauStructDefine(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  type: "animation" | "theme",
): CompiledBlock {
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return { content: [] };
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return { content: [] };

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parent = parentNode
    ? ctx.read(parentNode.from, parentNode.to).trim()
    : "";

  const contentNode = findChildByName(
    nodeRef.node,
    `Luau${type === "animation" ? "Animation" : "Theme"}_content`,
  );
  const body = parseStructBodyTyped(contentNode, ctx);

  const struct: Record<string, unknown> = {
    $type: type,
    $name: name,
    // Only an EXPLICIT parent sets $extends (matches `style`/`define X as Y`).
    // The type's own $default is inherited by EVERY non-$ entry of this type
    // via populateDefinedDefaultProperties (by type, not by $extends), so the
    // no-parent case needs no $extends — and adding one diverges from the
    // `define X as animation` struct (which carries none).
    ...(parent ? { $extends: parent } : {}),
    ...body,
  };

  // Runtime table: __def({ props }, name, parent). The engine sources defines
  // from the live story VM (buildDefinesContext), so the keyword form must
  // register a runtime `__def` like `define X as <type>` does — otherwise the
  // animation/theme would be invisible at runtime. The body is the already-typed
  // struct; struct-ref values (`target = layer.self`) become inert
  // `{ $type, $name }` literals so init never indexes a nil type global.
  // The parent arg is the explicit PARENT or, lacking one, the keyword TYPE, so
  // `__def` registers the table into that type (e.g. `animation.shake`) and
  // inherits its `$default` via the runtime `__index` chain.
  const parentType = parent || type;
  const defineExpr = new FunctionCall(new Identifier("__def"), [
    new ObjectExpression(
      Object.entries(body).map(
        ([k, v]) => new ObjectExpressionEntry(k, contextValueToExpression(v)),
      ),
    ),
    new StringExpression([new Text(name)]),
    new StringExpression([new Text(parentType)]),
  ]);
  // NAMESPACE-SCOPED, NOT a bare global. Bind the table to a synthetic
  // `$<type>_<name>` global key (the same mechanism same-name defines use, see
  // FlowBase.AddNewVariableDeclaration) instead of the bare `<name>`. `$` is not
  // a legal script identifier, so this never collides with a user `store <name>`
  // (e.g. `store show` vs the builtin `show` animation), yet `__def` still
  // registers `animation.<name>` into the type table — which is where the engine
  // (and buildDefinesContext) reads it. Animations/themes are referenced only
  // through their namespace at the callsite (`[[animate … with show]]`,
  // `animation.show`), never as a bare Luau variable.
  const declaration = new VariableAssignment({
    variableIdentifier: new Identifier(`$${type}_${name}`),
    assignedExpression: defineExpr,
    isGlobalDeclaration: true,
    isDefineDeclaration: true,
  });
  const block = wrapInWeave([declaration]);
  block.context = { [type]: { [name]: struct } };
  return block;
}
