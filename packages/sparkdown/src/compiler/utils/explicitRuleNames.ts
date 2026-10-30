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
  "LuauIndexerLineContinuation": "LuauSparkdownExplicitIndexerLineContinuation",
  "LuauTypeLiteral": "LuauSparkdownExplicitTypeLiteral",
  "LuauQualifiedTypeReference": "LuauSparkdownExplicitQualifiedTypeReference",
  "LuauNamedTypeArguments": "LuauSparkdownExplicitNamedTypeArguments",
  "LuauTypeNameExtraQualifierContinuation": "LuauSparkdownExplicitTypeNameExtraQualifierContinuation",
  "LuauNamedTypeReference": "LuauSparkdownExplicitNamedTypeReference",
  "LuauNamedTypeQualification": "LuauSparkdownExplicitNamedTypeQualification",
  "LuauTypeGenerics": "LuauSparkdownExplicitTypeGenerics",
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
  "LuauFunctionCall": "LuauSparkdownExplicitFunctionCall",
  "LuauElseExpression": "LuauSparkdownExplicitElseExpression",
  "LuauAlternatorBlocks": "LuauSparkdownExplicitAlternatorBlocks",
  "LuauAlternatorArms": "LuauSparkdownExplicitAlternatorArms",
  "LuauAlternatorHead": "LuauSparkdownExplicitAlternatorHead",
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
  "LuauUntilCondition": "LuauSparkdownExplicitUntilCondition",
  "Tag": "SparkdownExplicitTag",
  "LuauDeclarations": "LuauSparkdownExplicitDeclarations",
  "LuauExpressionDeclarations": "LuauSparkdownExplicitExpressionDeclarations",
  "Tags": "SparkdownExplicitTags",
  "Annotation": "SparkdownExplicitAnnotation",
  "DivertPath": "SparkdownExplicitDivertPath",
  "LuauDivertTargetLiteral": "LuauSparkdownExplicitDivertTargetLiteral"
};

export function explicitRuleName(name: string): string | undefined {
  const separator = name.indexOf("_");
  const root = separator < 0 ? name : name.slice(0, separator);
  const twin = EXPLICIT_RULE_NAMES[root as SparkdownNodeName];
  return twin ? twin + (separator < 0 ? "" : name.slice(separator)) : undefined;
}

const NARRATIVE_RULE_NAMES: Partial<Record<SparkdownNodeName, SparkdownNodeName>> = {
  "LuauVariableAssignment": "LuauSparkdownVariableAssignment",
  "LuauAssignmentOperation": "LuauSparkdownAssignmentOperation",
};

export function narrativeRuleName(name: string): string | undefined {
  const separator = name.indexOf("_");
  const root = separator < 0 ? name : name.slice(0, separator);
  const twin = NARRATIVE_RULE_NAMES[root as SparkdownNodeName];
  return twin ? twin + (separator < 0 ? "" : name.slice(separator)) : undefined;
}

export function explicitRuleNames(name: string): string[] {
  return [name, explicitRuleName(name), narrativeRuleName(name)].filter((n): n is string => n !== undefined);
}

export function isExplicitRuleName(actual: string | undefined | null, original: string): boolean {
  return actual != null && (actual === original || actual === explicitRuleName(original) || actual === narrativeRuleName(original));
}
