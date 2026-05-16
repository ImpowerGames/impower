import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { StructDefinition } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructDefinition";
import { StructPropertyDefinition } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructPropertyDefinition";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInWeave } from "../utils/wrapInWeave";

// define NAME [as PARENT] with                  → VariableAssignment {
//   prop1 = value1                                  variableIdentifier: NAME,
//   prop2 = value2                                  structDef: StructDefinition {
// end                                                 name: NAME, type: PARENT,
//                                                     propertyDefinitions: [
//                                                       { identifier: "prop1", expression: value1 },
//                                                       { identifier: "prop2", expression: value2 },
//                                                     ],
//                                                   },
//                                                }
//
// Modifiers on property definitions (`store trust = 0`) are recognized by the
// grammar but currently dropped in lowering — inkjs's StructPropertyDefinition
// has no field for them. A future refinement may preserve the modifier so the
// runtime can mark mutable/persisted properties.

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
  const propertyDefs: StructPropertyDefinition[] = [];
  if (content) {
    let child = content.firstChild;
    while (child) {
      if (child.name === "LuauPropertyDefinition") {
        const prop = buildPropertyDefinition(child, ctx);
        if (prop) propertyDefs.push(prop);
      }
      child = child.nextSibling;
    }
  }

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

function buildPropertyDefinition(
  propNode: SyntaxNode,
  ctx: LowerContext,
): StructPropertyDefinition | null {
  const variableAssignment = getDescendent("LuauVariableAssignment", propNode);
  if (!variableAssignment) return null;

  const nameNode = getDescendent("LuauVariableName", variableAssignment);
  if (!nameNode) return null;
  const identifier = new Identifier(ctx.read(nameNode.from, nameNode.to));

  const opNode = getDescendent("LuauAssignmentOperation", variableAssignment);
  const expr = opNode ? lowerExpressionFromContainer(opNode, ctx) : null;

  return new StructPropertyDefinition(0, identifier, expr);
}
