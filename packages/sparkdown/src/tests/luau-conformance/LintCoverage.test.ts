// Every case in Luau's `tests/Linter.test.cpp` (at the vendored commit in
// upstream/VENDORING.md) is accounted for in a `Lint*.test.ts` file of this
// directory as ported, adapted, not yet implemented or not applicable, marked
// by a `// Luau: <case>` comment.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const UPSTREAM_CASES = [
  "CleanCode",
  "type_function_fully_reduces",
  "UnknownGlobal",
  "DeprecatedGlobal",
  "DeprecatedGlobalNoReplacement",
  "PlaceholderRead",
  "PlaceholderReadGlobal",
  "PlaceholderWrite",
  "BuiltinGlobalWrite",
  "MultilineBlock",
  "MultilineBlockSemicolonsWhitelisted",
  "MultilineBlockMissedSemicolon",
  "MultilineBlockLocalDo",
  "ConfusingIndentation",
  "GlobalAsLocal",
  "GlobalAsLocalMultiFx",
  "GlobalAsLocalMultiFxWithRead",
  "GlobalAsLocalWithConditional",
  "GlobalAsLocal3WithConditionalRead",
  "GlobalAsLocalInnerRead",
  "GlobalAsLocalMulti",
  "LocalShadowLocal",
  "LocalShadowGlobal",
  "LocalShadowArgument",
  "LocalUnused",
  "ImportUnused",
  "FunctionUnused",
  "UnreachableCodeBasic",
  "UnreachableCodeLoopBreak",
  "UnreachableCodeLoopContinue",
  "UnreachableCodeIfMerge",
  "UnreachableCodeErrorReturnSilent",
  "UnreachableCodeAssertFalseReturnSilent",
  "UnreachableCodeErrorReturnNonSilentBranchy",
  "UnreachableCodeErrorReturnPropagate",
  "UnreachableCodeLoopWhile",
  "UnreachableCodeLoopRepeat",
  "UnknownType",
  "ForRangeTable",
  "ForRangeBackwards",
  "ForRangeImprecise",
  "ForRangeZero",
  "UnbalancedAssignment",
  "ImplicitReturn",
  "ImplicitReturnInfiniteLoop",
  "TypeAnnotationsShouldNotProduceWarnings",
  "BreakFromInfiniteLoopMakesStatementReachable",
  "IgnoreLintAll",
  "IgnoreLintSpecific",
  "FormatStringFormat",
  "FormatStringPack",
  "FormatStringMatch",
  "FormatStringMatchNested",
  "FormatStringMatchSets",
  "FormatStringFindArgs",
  "FormatStringReplace",
  "FormatStringDate",
  "FormatStringTyped",
  "TableLiteral",
  "read_write_table_props",
  "ImportOnlyUsedInTypeAnnotation",
  "ImportOnlyUsedInReturnType",
  "DisableUnknownGlobalWithTypeChecking",
  "no_spurious_warning_after_a_function_type_alias",
  "use_all_parent_scopes_for_globals",
  "DeadLocalsUsed",
  "LocalFunctionNotDead",
  "DuplicateGlobalFunction",
  "DuplicateLocalFunction",
  "DuplicateMethod",
  "DontTriggerTheWarningIfTheFunctionsAreInDifferentScopes",
  "LintHygieneUAF",
  "DeprecatedApiTyped",
  "DeprecatedApiUntyped",
  "DeprecatedApiFenv",
  "DeprecatedAttribute",
  "DeprecatedAttributeWithParams",
  "DeprecatedAttributeFunctionDeclaration",
  "DeprecatedAttributeTableDeclaration",
  "DeprecatedAttributeMethodDeclaration",
  "TableOperations",
  "TableOperationsIndexer",
  "DuplicateConditions",
  "DuplicateConditionsExpr",
  "DuplicateLocal",
  "MisleadingAndOr",
  "WrongComment",
  "WrongCommentMuteSelf",
  "DuplicateConditionsIfStatAndExpr",
  "WrongCommentOptimize",
  "TestStringInterpolation",
  "IntegerParsing",
  "IntegerParsingDecimalImprecise",
  "IntegerParsingHexImprecise",
  "ComparisonPrecedence",
  "RedundantNativeAttribute",
  "type_instantiation_lints",
];

test("every upstream linter case is named exactly once", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const named: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!/^Lint.*\.test\.ts$/.test(file)) continue;
    const text = readFileSync(join(dir, file), "utf8");
    for (const match of text.matchAll(/^\s*\/\/ Luau: (\w+)/gm)) {
      named.push(match[1]!);
    }
  }
  expect(UPSTREAM_CASES).toHaveLength(97);
  expect([...named].sort()).toEqual([...UPSTREAM_CASES].sort());
});
