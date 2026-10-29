import { test } from "vitest";

const NOT_APPLICABLE: [name: string, reason: string][] = [
  ["IgnoreLintAll", "`--!nolint` directive comments; sparkdown has no lint suppression directive"],
  ["IgnoreLintSpecific", "`--!nolint <rule>` directive comments"],
  ["WrongComment", "validates `--!nolint`, `--!optimize` and `--!native`, which sparkdown does not read; the mode directives' half is the type checker's (typecheckModes.test.ts)"],
  ["WrongCommentMuteSelf", "`--!nolint` directive comments"],
  ["WrongCommentOptimize", "`--!optimize` directive comments; sparkdown has no optimization levels"],
  ["DeprecatedAttribute", "`@deprecated` function attributes, which sparkdown does not have"],
  ["DeprecatedAttributeWithParams", "`@deprecated` function attributes"],
  ["DeprecatedAttributeFunctionDeclaration", "`@deprecated` function attributes"],
  ["DeprecatedAttributeTableDeclaration", "`@deprecated` function attributes"],
  ["DeprecatedAttributeMethodDeclaration", "`@deprecated` function attributes"],
  ["RedundantNativeAttribute", "`@native` attributes and `--!native`; sparkdown has no native code generation"],
  ["UnknownType", "needs the type checker (#589) and host-registered types"],
  ["DeprecatedApiTyped", "needs the type checker (#589) to know a value's class; the untyped half is in LintExistingWarnings.test.ts"],
  ["TableOperationsIndexer", "needs the type checker (#589) to know a table has no array part"],
  ["FormatStringTyped", "needs the type checker (#589) to know `s:match` is a string method; the untyped form is FormatStringMatch"],
  ["DisableUnknownGlobalWithTypeChecking", "Luau's linter drops its UnknownGlobal lint when the type checker runs; sparkdown's lints have no such rule, since its resolver and the type checker report unknown names"],
  ["use_all_parent_scopes_for_globals", "module environments and definition files"],
  ["DeprecatedGlobalNoReplacement", "host-registered deprecated globals; every deprecated stdlib global sparkdown knows names its replacement"],
  ["ImportUnused", "`require`; sparkdown has no modules"],
  ["LintHygieneUAF", "a use-after-free regression test for Luau's C++ linter"],
];

test.skip.each(NOT_APPLICABLE)("%s (N/A: %s)", () => {});
