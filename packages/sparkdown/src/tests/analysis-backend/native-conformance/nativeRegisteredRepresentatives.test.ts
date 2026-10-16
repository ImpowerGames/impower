import { afterEach, expect, it, vi } from "vitest";
import { runNativePortedCase, type PortedCase } from "../../luau-conformance/typecheck/portedCases";
import {
  externMethodSource, generalSource, genericSource, nilTypeFunctionSource, nonStrictModuleA, nonStrictModuleB,
  overloadSource, refinementSource, specificUnionAssignmentSource, tableSource,
  negatedStringSubtypeSource, mismatchingFunctionAritySource,
} from "./fixtureSources";

afterEach(() => { vi.unstubAllEnvs(); });

// Original assertions remain scoped to these exact cases. Passing this bounded
// fixture route neither activates an area nor proves the public AST path.
const cases: [string,PortedCase][] = [
  ["TypeInfer.negations.test.cpp",{name:"negated_string_is_a_subtype_of_string",fixture:"NegationFixture",
    source:negatedStringSubtypeSource,expect:[{errors:0}]}],
  ["TypeInfer.provisional.test.cpp",{name:"functions_with_mismatching_arity",fixture:"IsSubtypeFixture",
    source:mismatchingFunctionAritySource,expect:[
      {type:"a",subtypeOf:{type:"b"},isSubtype:false},
      {type:"a",subtypeOf:{type:"c"},isSubtype:false},
      {type:"b",subtypeOf:{type:"c"},isSubtype:false},
    ]}],
  ["TypeInfer.test.cpp",{name:"tc_hello_world",fixture:"Fixture",source:generalSource,
    expect:[{errors:0},{type:"a",equals:"number"}]}],
  ["TypeInfer.tables.test.cpp",{name:"basic",fixture:"Fixture",source:tableSource,
    expect:[{errors:0},{type:"t",kind:"TableType"},
      {type:"t",path:[{property:"foo"}],primitive:"String"},
      {type:"t",path:[{property:"baz"}],primitive:"Number"},
      {type:"t",path:[{property:"quux"}],primitive:"NilType"}]}],
  ["TypeInfer.functions.test.cpp",{name:"overload_resolution",fixture:"Fixture",source:overloadSource,ignoreMissingAnnotations:true,
    expect:[{errors:0},{type:"foo",kind:"FunctionType",equals:"(((number) -> string) & ((string) -> number)) -> (string, number)"}]}],
  ["TypeInfer.refinements.test.cpp",{name:"impossible_type_narrow_is_not_an_error",fixture:"BuiltinsFixture",source:refinementSource,
    expect:[{errors:0}]}],
  ["TypeInfer.generics.test.cpp",{name:"check_generic_function",fixture:"Fixture",source:genericSource,
    expect:[{errors:0},{type:"x",sameAs:{builtin:"string"}},{type:"y",sameAs:{builtin:"number"}}]}],
  ["TypeInfer.unionTypes.test.cpp",{name:"allow_specific_assign",fixture:"Fixture",source:specificUnionAssignmentSource,
    expect:[{errors:0}]}],
  ["TypeInfer.externTypes.test.cpp",{name:"call_method_of_a_class",fixture:"ExternTypeFixture",source:externMethodSource,
    expect:[{errors:0},{type:"m",equals:"number"}]}],
  ["TypeFunction.user.test.cpp",{name:"udtf_nil_methods_work",fixture:"BuiltinsFixture",flags:{DebugLuauForceOldSolver:false},source:nilTypeFunctionSource,
    expect:[{errors:0}]}],
  ["NonStrictTypeChecker.test.cpp",{name:"non_strict_shouldnt_warn_on_require_module",fixture:"NonStrictTypeCheckerFixture",source:nonStrictModuleB,
    module:"Modules/B",moduleSources:{"Modules/A":nonStrictModuleA},expect:[{errors:0}]}],
];

it.each(cases)("executes original %s representative through the registered native case contract", async (file,c) => {
  vi.stubEnv("LUAU_TYPECHECK_AREAS",file);
  const skipped = vi.fn(); await runNativePortedCase(file,c,skipped);
  expect(skipped).not.toHaveBeenCalled();
});
