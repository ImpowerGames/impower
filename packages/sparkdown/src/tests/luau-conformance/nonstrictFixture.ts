import { addGlobalBinding, registerBuiltinGlobals } from "../../compiler/typecheck/BuiltinDefinitions";
import { Frontend } from "../../compiler/typecheck/Frontend";

/** Exact R"BUILTIN_SRC" bytes from NonStrictTypeChecker.test.cpp:99–136 at 7d5f733. */
export const NONSTRICT_DEFINITIONS = `
@checked declare function abs(n: number): number
@checked declare function lower(s: string): string
declare function cond() : boolean
@checked declare function contrived(n : Not<number>) : number

-- interesting types of things that we would like to mark as checked
@checked declare function onlyNums(...: number) : number
@checked declare function mixedArgs(x: string, ...: number) : number
@checked declare function optionalArg(x: string?) : number
declare foo: {
    bar: @checked (number) -> number,
}

@checked declare function optionalArgsAtTheEnd1(x: string, y: number?, z: number?) : number
@checked declare function optionalArgsAtTheEnd2(x: string, y: number?, z: string) : number

type DateTypeArg = {
    year: number,
    month: number,
    day: number,
    hour: number?,
    min: number?,
    sec: number?,
    isdst: boolean?,
}

declare os : {
    time: @checked (time: DateTypeArg?) -> number
}

@checked declare function require(target : any) : any
@checked declare function getAllTheArgsWrong(one: string, two: number, three: boolean) : any
`;

/** The additive declaration at NonStrictTypeChecker.test.cpp:656–663. */
export const NONSTRICT_BUFFER_DEFINITIONS = `
declare buffer: {
    create: @checked (size: number) -> buffer,
    readi8: @checked (b: buffer, offset: number) -> number,
    writef64: @checked (b: buffer, offset: number, value: number) -> (),
}
`;

/** Fixture.cpp:630–634; these identities belong to this frontend's builtin arena. */
export function registerNonStrictTestGlobals(frontend: Frontend): void {
  for (const name of ["game", "workspace", "script"])
    addGlobalBinding(frontend.globals, name, frontend.builtinTypes.anyType, "@luau");
}

/**
 * Compose with #1368's shared hidden-type installer, rather than duplicating its
 * genuine generic/negation/metatable graph. The installer is required.
 */
export function createNonStrictFixtureFrontend(registerHiddenTypes: (frontend: Frontend) => void): Frontend {
  const frontend = new Frontend();
  registerHiddenTypes(frontend);
  registerNonStrictTestGlobals(frontend);
  return frontend;
}

/** NonStrictTypeChecker.test.cpp:672–689 is a per-case addition, not the default. */
export function registerNonStrictBuiltinsVariant(frontend: Frontend): void {
  registerBuiltinGlobals(frontend, frontend.globals);
  registerNonStrictTestGlobals(frontend);
}

/**
 * Called on EVERY check, including shared-frontend checks. Extra definitions
 * precede the standard definitions just as the buffer case's explicit load does.
 * The shared harness must load these through its real definition-file loader.
 */
export function nonStrictCheckDefinitions(extra: readonly string[] = []): string[] {
  return [...extra, NONSTRICT_DEFINITIONS];
}

/** Preserve the exact executed generated block source (lines 866–880), depth 250. */
export function nonStrictBlockRecursionSource(): string {
  return "do ".repeat(250) + "local a = 1" + " end".repeat(250);
}
