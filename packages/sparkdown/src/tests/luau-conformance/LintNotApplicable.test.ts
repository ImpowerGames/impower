// Luau's linter tests (`luau/tests/Linter.test.cpp`) that do not apply to
// sparkdown, each with the reason. They are listed rather than ported so
// that every upstream case is accounted for (LintCoverage.test.ts).

import { test } from "vitest";

const NOT_APPLICABLE: [name: string, reason: string][] = [
  // Luau: IgnoreLintAll
  ["IgnoreLintAll", "`--!nolint` directive comments; sparkdown has no lint suppression directive"],
  // Luau: IgnoreLintSpecific
  ["IgnoreLintSpecific", "`--!nolint <rule>` directive comments"],
  // Luau: WrongComment
  ["WrongComment", "validates `--!` directive comments, which sparkdown does not read"],
  // Luau: WrongCommentMuteSelf
  ["WrongCommentMuteSelf", "`--!nolint` directive comments"],
  // Luau: WrongCommentOptimize
  ["WrongCommentOptimize", "`--!optimize` directive comments; sparkdown has no optimization levels"],
  // Luau: DeprecatedAttribute
  ["DeprecatedAttribute", "`@deprecated` function attributes, which sparkdown does not have"],
  // Luau: DeprecatedAttributeWithParams
  ["DeprecatedAttributeWithParams", "`@deprecated` function attributes"],
  // Luau: DeprecatedAttributeFunctionDeclaration
  ["DeprecatedAttributeFunctionDeclaration", "`@deprecated` function attributes"],
  // Luau: DeprecatedAttributeTableDeclaration
  ["DeprecatedAttributeTableDeclaration", "`@deprecated` function attributes"],
  // Luau: DeprecatedAttributeMethodDeclaration
  ["DeprecatedAttributeMethodDeclaration", "`@deprecated` function attributes"],
  // Luau: RedundantNativeAttribute
  ["RedundantNativeAttribute", "`@native` attributes and `--!native`; sparkdown has no native code generation"],
  // Luau: UnknownType
  ["UnknownType", "needs the type checker (#589) and host-registered types"],
  // Luau: DeprecatedApiTyped
  ["DeprecatedApiTyped", "needs the type checker (#589) to know a value's class; the untyped half is in LintExistingWarnings.test.ts"],
  // Luau: TableOperationsIndexer
  ["TableOperationsIndexer", "needs the type checker (#589) to know a table has no array part"],
  // Luau: FormatStringTyped
  ["FormatStringTyped", "needs the type checker (#589) to know `s:match` is a string method; the untyped form is FormatStringMatch"],
  // Luau: read_write_table_props
  ["read_write_table_props", "`read`/`write` table type properties need the type checker (#589)"],
  // Luau: DisableUnknownGlobalWithTypeChecking
  ["DisableUnknownGlobalWithTypeChecking", "`--!strict` mode, which sparkdown does not have"],
  // Luau: use_all_parent_scopes_for_globals
  ["use_all_parent_scopes_for_globals", "module environments and definition files"],
  // Luau: DeprecatedGlobalNoReplacement
  ["DeprecatedGlobalNoReplacement", "host-registered deprecated globals; every deprecated stdlib global sparkdown knows names its replacement"],
  // Luau: ImportUnused
  ["ImportUnused", "`require`; sparkdown has no modules"],
  // Luau: LintHygieneUAF
  ["LintHygieneUAF", "a use-after-free regression test for Luau's C++ linter"],
];

test.skip.each(NOT_APPLICABLE)("%s (N/A: %s)", () => {});
