import { describe, expect, test } from "vitest";
import BUILTINS_PRELUDE from "../../compiler/builtins/builtins.sd?raw";
import {
  declaredGlobalNames,
  SparkdownCompiler,
} from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///__builtins__.sd";

/** The builtins prelude compiled as the compiler compiles it once for every
 *  program, with statement chunks or with its story serialized. */
const compilePrelude = (programChunks: boolean) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: false,
    definitions: { builtins: {} as any },
    programChunks,
    emitCompiledProgram: !programChunks,
    files: [
      {
        uri: URI,
        type: "script",
        name: "__builtins__",
        ext: "sd",
        text: BUILTINS_PRELUDE,
        version: 0,
        languageId: "sparkdown",
      } as any,
    ],
  });
  return compiler.compile({ textDocument: { uri: URI } }).program;
};

/** The globals the current engine's serialized story of the prelude declares
 *  in its "global decl" container, without the scoped `$` names: where the
 *  compiler read the prelude's global names from before its statement
 *  chunks. */
const namesInGlobalDecl = (compiled: unknown): Set<string> => {
  const names = new Set<string>();
  const root = (compiled as { root?: unknown } | undefined)?.root;
  const terminal = Array.isArray(root) ? root[root.length - 1] : undefined;
  const globalDecl =
    terminal && typeof terminal === "object"
      ? (terminal as Record<string, unknown>)["global decl"]
      : undefined;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === "object") {
      const entry = node as Record<string, unknown>;
      // `{"VAR=": name}` declares a global; `re: true` marks a reassignment.
      const declared = entry["VAR="];
      if (
        typeof declared === "string" &&
        !declared.startsWith("$") &&
        !entry["re"]
      ) {
        names.add(declared);
      }
      for (const value of Object.values(entry)) {
        if (Array.isArray(value)) {
          visit(value);
        }
      }
    }
  };
  visit(globalDecl);
  return names;
};

describe("the builtins prelude's global names", () => {
  test("are the globals its declaration chunks declare, as its serialized story's global decl names them", () => {
    const chunked = compilePrelude(true);
    expect(chunked.chunks).toBeDefined();
    expect(chunked.chunks).toBeDefined();
    const fromChunks = declaredGlobalNames(chunked.chunks!);

    const serialized = compilePrelude(false);
    const fromStory = namesInGlobalDecl(serialized.compiled);

    // Not vacuous: the type roots are there, and neither a scoped name nor a
    // name the prelude's context holds that is no runtime global (#437).
    expect(fromStory.size).toBeGreaterThan(10);
    expect(fromStory.has("config")).toBe(true);
    expect(fromStory.has("game")).toBe(true);
    expect(fromStory.has("main")).toBe(false);
    expect([...fromChunks].sort()).toEqual([...fromStory].sort());
  });
});
