// Narrative expression twins preserve the original rule's scopes and captures.
// Consumers use both identities; genuine Luau/function contexts keep originals.
import type { SparkdownNodeName } from "../types/SparkdownNodeName";

const EXPLICIT_RULE_NAMES: Partial<Record<SparkdownNodeName, SparkdownNodeName>> = {
  "LuauOperatorMissingOperand": "LuauSparkdownExplicitOperatorMissingOperand",
  "LuauTypeAnnotationMissingType": "LuauSparkdownExplicitTypeAnnotationMissingType",
  "LuauTypeBinaryOperatorMissingType": "LuauSparkdownExplicitTypeBinaryOperatorMissingType",
  "LuauArithmeticOperator": "LuauSparkdownExplicitArithmeticOperator",
  "LuauCompareOperator": "LuauSparkdownExplicitCompareOperator",
  "LuauConcatOperator": "LuauSparkdownExplicitConcatOperator",
  "LuauLengthOperator": "LuauSparkdownExplicitLengthOperator",
  "LuauLogicalOperator": "LuauSparkdownExplicitLogicalOperator",
  "LuauTypeCastOperator": "LuauSparkdownExplicitTypeCastOperator",
  "LuauCommaLineBreakGap": "LuauSparkdownExplicitCommaLineBreakGap",
  "LuauTypeBinaryOperator": "LuauSparkdownExplicitTypeBinaryOperator",
  "LuauTypeAnnotationOperator": "LuauSparkdownExplicitTypeAnnotationOperator",
  "LuauThenOperator": "LuauSparkdownExplicitThenOperator",
  "LuauElseOperator": "LuauSparkdownExplicitElseOperator",
  "LuauTernaryExpressionCondition": "LuauSparkdownExplicitTernaryExpressionCondition",
  "LuauLineContinuation": "LuauSparkdownExplicitLineContinuation",
  "LuauPropertyIndexer": "LuauSparkdownExplicitPropertyIndexer",
  "LuauIndexerLineContinuation": "LuauSparkdownExplicitIndexerLineContinuation",
  "LuauParenthetical": "LuauSparkdownExplicitParenthetical",
  "LuauTable": "LuauSparkdownExplicitTable",
  "LuauTableIndexDeclaration": "LuauSparkdownExplicitTableIndexDeclaration",
  "LuauTypeLiteral": "LuauSparkdownExplicitTypeLiteral",
  "LuauTypeTableStruct": "LuauSparkdownExplicitTypeTableStruct",
  "LuauTypeTableIndexer": "LuauSparkdownExplicitTypeTableIndexer",
  "LuauTypeofFunctionParameters": "LuauSparkdownExplicitTypeofFunctionParameters",
  "LuauQualifiedTypeReference": "LuauSparkdownExplicitQualifiedTypeReference",
  "LuauNamedTypeArguments": "LuauSparkdownExplicitNamedTypeArguments",
  "LuauTypeNameExtraQualifierContinuation": "LuauSparkdownExplicitTypeNameExtraQualifierContinuation",
  "LuauNamedTypeReference": "LuauSparkdownExplicitNamedTypeReference",
  "LuauNamedTypeQualification": "LuauSparkdownExplicitNamedTypeQualification",
  "LuauTypeFunctionParameters": "LuauSparkdownExplicitTypeFunctionParameters",
  "LuauTypeGenerics": "LuauSparkdownExplicitTypeGenerics",
  "LuauFunctionCallParameters": "LuauSparkdownExplicitFunctionCallParameters",
  "LuauThenExpression": "LuauSparkdownExplicitThenExpression",
  "LuauConditionalAlternatorBlock": "LuauSparkdownExplicitConditionalAlternatorBlock",
  "LuauSequentialAlternatorBlock": "LuauSparkdownExplicitSequentialAlternatorBlock",
  "LuauFunctionCallShorthand": "LuauSparkdownExplicitFunctionCallShorthand",
  "LuauCommaLineBreak": "LuauSparkdownExplicitCommaLineBreak",
  "LuauGenericsInstantiation": "LuauSparkdownExplicitGenericsInstantiation",
  "LuauChainedFunctionCall": "LuauSparkdownExplicitChainedFunctionCall",
  "LuauChainedPropertyAccess": "LuauSparkdownExplicitChainedPropertyAccess",
  "LuauReassignment": "LuauSparkdownExplicitReassignment",
  "LuauExpression": "LuauSparkdownExplicitExpression",
  "LuauReturnStatement": "LuauSparkdownExplicitReturnStatement",
  "LuauTernaryExpression": "LuauSparkdownExplicitTernaryExpression",
  "LuauLogicalOperation": "LuauSparkdownExplicitLogicalOperation",
  "LuauAccessPart": "LuauSparkdownExplicitAccessPart",
  "LuauArithmeticOperation": "LuauSparkdownExplicitArithmeticOperation",
  "LuauCompareOperation": "LuauSparkdownExplicitCompareOperation",
  "LuauConcatOperation": "LuauSparkdownExplicitConcatOperation",
  "LuauTypeCastOperation": "LuauSparkdownExplicitTypeCastOperation",
  "LuauTypeBinaryOperation": "LuauSparkdownExplicitTypeBinaryOperation",
  "LuauTypeAnnotationOperation": "LuauSparkdownExplicitTypeAnnotationOperation",
  "LuauTypeofFunction": "LuauSparkdownExplicitTypeofFunction",
  "LuauTypeArgumentContents": "LuauSparkdownExplicitTypeArgumentContents",
  "LuauTypeNamedFunctionParameter": "LuauSparkdownExplicitTypeNamedFunctionParameter",
  "LuauFunctionCall": "LuauSparkdownExplicitFunctionCall",
  "LuauElseExpression": "LuauSparkdownExplicitElseExpression",
  "LuauAlternatorBlocks": "LuauSparkdownExplicitAlternatorBlocks",
  "LuauConditionalAlternatorCondition": "LuauSparkdownExplicitConditionalAlternatorCondition",
  "TagContent": "SparkdownExplicitTagContent",
  "LuauVariableDefinition": "LuauSparkdownExplicitVariableDefinition",
  "LuauTargetTypeCast": "LuauSparkdownExplicitTargetTypeCast",
  "LuauTargetTypeCastAfterComment": "LuauSparkdownExplicitTargetTypeCastAfterComment",
  "LuauInterpolatedStringExpression": "LuauSparkdownExplicitInterpolatedStringExpression",
  "LuauVariableAssignment": "LuauSparkdownExplicitVariableAssignment",
  "LuauAssignmentOperation": "LuauSparkdownExplicitAssignmentOperation",
  "LuauVariableDefinitionValue": "LuauSparkdownExplicitVariableDefinitionValue",
  "LuauLengthOperation": "LuauSparkdownExplicitLengthOperation",
  "LuauAccessPath": "LuauSparkdownExplicitAccessPath",
  "LuauDataTypeDeclaration": "LuauSparkdownExplicitDataTypeDeclaration",
  "LuauTypeAssignment": "LuauSparkdownExplicitTypeAssignment",
  "LuauUntilStatement": "LuauSparkdownExplicitUntilStatement",
  "LuauSparkdownVariableDefinition": "LuauSparkdownExplicitStoryVariableDefinition",
  "Tag": "SparkdownExplicitTag",
  "LuauDeclarations": "LuauSparkdownExplicitDeclarations",
  "Tags": "SparkdownExplicitTags",
  "Annotation": "SparkdownExplicitAnnotation",
  "DivertPath": "SparkdownExplicitDivertPath",
  "LuauDivertTargetLiteral": "LuauSparkdownExplicitDivertTargetLiteral"
};

/** The bounded counterpart of a rule or its generated capture/content node. */
export function explicitRuleName(name: string): string | undefined {
  const separator = name.indexOf("_");
  const root = separator < 0 ? name : name.slice(0, separator);
  const twin = EXPLICIT_RULE_NAMES[root as SparkdownNodeName];
  return twin ? twin + (separator < 0 ? "" : name.slice(separator)) : undefined;
}

/** Both grammar identities of the same expression/declaration construct. */
export function explicitRuleNames(name: string): string[] {
  const twin = explicitRuleName(name);
  return twin ? [name, twin] : [name];
}

/** A comparison which retains both the normal and bounded grammar identity. */
export function isExplicitRuleName(actual: string | undefined | null, original: string): boolean {
  return actual != null && (actual === original || actual === explicitRuleName(original));
}
