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
import type {
  CompiledBlock,
  InkDiagnostic,
} from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInWeave } from "../utils/wrapInWeave";
import { contextValueToExpression } from "./lowerLuauDefine";
import { readMorphBody } from "../../morph/readMorphBody";
import {
  KEYFRAMES_KEY,
  keyframesAsList,
  parseStructBodyTyped,
  type StructSource,
} from "./lowerStructBodyTyped";
import { validateBlockStructure } from "../utils/validateBlockStructure";
import { validateFramingBody } from "../utils/validateFramingBody";
import { validateStreamBody } from "../utils/validateStreamBody";

const CONTENT_NODE = {
  animation: "LuauAnimation_content",
  theme: "LuauTheme_content",
  framing: "LuauFraming_content",
  morph: "LuauMorph_content",
  stream: "LuauStream_content",
} as const;

export function lowerLuauStructDefine(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  type: "animation" | "theme" | "framing" | "morph" | "stream",
): CompiledBlock {
  ctx.diagnostics?.push(...validateBlockStructure(nodeRef.node, ctx, type));
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return { content: [] };
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return { content: [] };

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parent = parentNode
    ? ctx.read(parentNode.from, parentNode.to).trim()
    : "";

  const contentNode = findChildByName(nodeRef.node, CONTENT_NODE[type]);
  const diagnostics: InkDiagnostic[] = [];
  const sources = new WeakMap<object, StructSource>();
  const body =
    type === "morph"
      ? readMorphBody(contentNode, ctx, diagnostics).struct
      : parseStructBodyTyped(contentNode, ctx, diagnostics, type === "framing" || type === "stream" ? { sources } : {});
  if (type === "framing") {
    diagnostics.push(...validateFramingBody(body, sources.get(body), nameNode, ctx));
  }
  if (type === "stream") {
    diagnostics.push(...validateStreamBody(body, sources.get(body), nameNode, ctx));
  }
  if (type === "animation" && KEYFRAMES_KEY in body) {
    body[KEYFRAMES_KEY] = keyframesAsList(body[KEYFRAMES_KEY]);
  }

  const struct: Record<string, unknown> = {
    $type: type,
    $name: name,
    ...(parent ? { $extends: parent } : {}),
    ...body,
  };

  const defineExpr = new FunctionCall(new Identifier("__defs"), [
    new ObjectExpression(
      Object.entries(body).map(
        ([k, v]) => new ObjectExpressionEntry(k, contextValueToExpression(v)),
      ),
    ),
    new StringExpression([new Text(name)]),
    new StringExpression([new Text(type)]),
    new StringExpression([new Text(parent)]),
  ]);
  const declaration = new VariableAssignment({
    variableIdentifier: new Identifier(`$${type}_${name}`),
    assignedExpression: defineExpr,
    isGlobalDeclaration: true,
    isDefineDeclaration: true,
  });
  const block = wrapInWeave([declaration]);
  block.context = { [type]: { [name]: struct } };
  if (diagnostics.length > 0) {
    block.diagnostics = [...(block.diagnostics ?? []), ...diagnostics];
  }
  return block;
}
