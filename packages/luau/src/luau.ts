// Thin TypeScript wrapper around Luau.Web — the Emscripten build of the
// Luau compiler + VM from https://github.com/luau-lang/luau (CLI/src/Web.cpp).
//
// The CMake target Luau.Web is built with -sSINGLE_FILE=1, so the wasm blob
// is embedded into Luau.Web.js as base64 and there is no separate .wasm file
// to fetch — the loader is fully self-contained.
//
// Two C entry points are exported:
//   const char* executeScript(const char* source);
//   const char* checkScript(const char* source, int useNewSolver);
//
// Both return a static C string with the result/error text, or NULL on
// success in the case of executeScript when there is no stdout output.

type EmscriptenModule = {
  ccall: (
    name: string,
    returnType: "string" | "number" | null,
    argTypes: Array<"string" | "number">,
    args: Array<string | number>
  ) => string | number | null;
  cwrap: (
    name: string,
    returnType: "string" | "number" | null,
    argTypes: Array<"string" | "number">
  ) => (...args: Array<string | number>) => string | number | null;
};

type EmscriptenModuleFactory = (
  config?: Partial<{
    print: (text: string) => void;
    printErr: (text: string) => void;
    locateFile: (path: string) => string;
  }>
) => Promise<EmscriptenModule>;

export interface Luau {
  /**
   * Compile and execute Luau source. Returns combined stdout + any error
   * message. Throws if the compile/runtime failure cannot be captured.
   */
  execute(source: string): string;
  /**
   * Type-check the given Luau source. Returns an empty string if there are
   * no errors, otherwise a multi-line error report with line numbers.
   */
  check(source: string, useNewSolver?: boolean): string;
  /** True if the underlying WASM build exports checkScript. */
  readonly hasCheck: boolean;
}

let cached: Promise<Luau> | undefined;

export function loadLuau(): Promise<Luau> {
  if (!cached) cached = loadLuauOnce();
  return cached;
}

async function loadLuauOnce(): Promise<Luau> {
  // The Emscripten output is shipped as a side-effecting ES module that
  // attaches a default-exported factory. We import it dynamically so it is
  // only fetched when the demo actually needs it.
  const mod = await import("./wasm/Luau.Web.js");
  const factory: EmscriptenModuleFactory =
    (mod as { default?: EmscriptenModuleFactory }).default ??
    (mod as unknown as EmscriptenModuleFactory);

  const output: string[] = [];
  const instance = await factory({
    print: (text) => output.push(text),
    printErr: (text) => output.push(text),
  });

  const executeScript = instance.cwrap("executeScript", "string", ["string"]);
  // checkScript is only present in newer Luau builds; older releases (e.g.
  // 0.661) only export executeScript. Detect availability before wrapping
  // so we can degrade gracefully.
  const hasCheck =
    typeof (instance as unknown as Record<string, unknown>)._checkScript ===
    "function";
  const checkScript = hasCheck
    ? instance.cwrap("checkScript", "string", ["string", "number"])
    : null;

  return {
    hasCheck,
    execute(source: string): string {
      output.length = 0;
      // executeScript returns nullptr on success and an error string on
      // failure. Print output is delivered via Module.print → output[].
      const result = executeScript(source) as string | null;
      const stdout = output.join("\n");
      if (result && stdout) return `${stdout}\n${result}`;
      return result || stdout;
    },
    check(source: string, useNewSolver = false): string {
      if (!checkScript) {
        throw new Error(
          "checkScript is not available in this build of Luau. " +
            "Bump LUAU_REF in scripts/build-wasm.mjs to a version that exports it."
        );
      }
      const result = checkScript(source, useNewSolver ? 1 : 0) as string | null;
      return result || "";
    },
  };
}
