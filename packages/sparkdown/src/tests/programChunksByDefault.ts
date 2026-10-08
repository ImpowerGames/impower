// Every compile a test makes builds statement chunks, as every host's does
// (#703, #704), unless the test names `programChunks` itself: a compiler that
// has not been told otherwise is configured with `programChunks: true`. The
// tests that compare the two compile paths pass the field. #705 deletes the
// current engine and the field with it, and this file with them; until then
// it lets the tests that compile through `SparkdownCompiler` move onto the
// program's compile path ahead of the deletion. It is the package's vitest
// setup file (`vitest.config.ts`).
//
// A compile of such a compiler that builds chunks has no compiled story and
// no path-location table, which a test written for the current engine would
// read and find absent on both sides of a comparison; and one that falls
// back has the current engine's, which such a test would read without
// saying so. Reading either throws in both cases, so that every such test
// reads the program's chunks instead, or names the current engine's compile
// path (`currentEngineCompiler`).
import "../inkjs/engine/Container";
import { SparkdownCompiler } from "../compiler/classes/SparkdownCompiler";
import type { SparkdownCompilerConfig } from "../compiler/types/SparkdownCompilerConfig";

const configure = SparkdownCompiler.prototype.configure;
const compile = SparkdownCompiler.prototype.compile;

// The compiler compiles the builtins prelude with a compiler of its own
// (`getCompiledPrelude`), whose statement chunks it reads; that compile is
// the compiler's, not a test's, and is left as it is.
const PRELUDE_URI = "file:///__builtins__.sd";

// The compilers this file turned `programChunks` on for.
const chunkedByDefault = new WeakSet<SparkdownCompiler>();

SparkdownCompiler.prototype.configure = function (
  this: SparkdownCompiler,
  config: SparkdownCompilerConfig,
) {
  const told = (this as unknown as { _config?: SparkdownCompilerConfig })
    ._config?.programChunks;
  const prelude = config.files?.some((file) => file.uri === PRELUDE_URI);
  if (config.programChunks === undefined && told === undefined && !prelude) {
    chunkedByDefault.add(this);
    return configure.call(this, { ...config, programChunks: true });
  }
  if (config.programChunks !== undefined) {
    chunkedByDefault.delete(this);
  }
  return configure.call(this, config);
};

/** The program a test is handed: the compile's own program, whose `compiled`
 *  and `pathLocations` throw `message` when read. The compiler keeps the
 *  program itself, which is left as it is. */
const guarded = <T extends object>(program: T, message: (key: string) => string): T =>
  new Proxy(program, {
    get(target, key, receiver) {
      if (key === "compiled" || key === "pathLocations") {
        throw new Error(message(key));
      }
      return Reflect.get(target, key, receiver);
    },
  });

SparkdownCompiler.prototype.compile = function (
  this: SparkdownCompiler,
  ...args: Parameters<SparkdownCompiler["compile"]>
) {
  const result = compile.apply(this, args);
  const program = result?.program as
    | {
        chunks?: unknown;
        compiled?: unknown;
        pathLocations?: unknown;
        fallback?: { construct: string; uri: string; line: number };
      }
    | undefined;
  if (!program || !chunkedByDefault.has(this)) {
    return result;
  }
  if (program.fallback) {
    const { construct, uri, line } = program.fallback;
    return {
      ...result,
      program: guarded(
        result.program,
        (key) =>
          `The compile fell back to the current engine for ${construct} at ${uri} line ${line + 1}: its \`${key}\` is that engine's. Compile with currentEngineCompiler() and say why.`,
      ),
    };
  }
  if (program.chunks && program.compiled === undefined) {
    return {
      ...result,
      program: guarded(
        result.program,
        (key) =>
          `A compile with statement chunks has no \`${key}\`: read \`program.chunks\` (programListing.ts), or compile with currentEngineCompiler().`,
      ),
    };
  }
  return result;
} as SparkdownCompiler["compile"];
