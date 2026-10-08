// Every compile a test makes builds statement chunks, as every host's does
// (#703, #704), unless the test names `programChunks` itself: a compiler that
// has not been told otherwise is configured with `programChunks: true`. The
// tests that compare the two compile paths pass the field. #705 deletes the
// current engine and the field with it, and this file with them; until then
// it lets the tests that compile through `SparkdownCompiler` move onto the
// program's compile path ahead of the deletion. It is the package's vitest
// setup file (`vitest.config.ts`).
import "../inkjs/engine/Container";
import { SparkdownCompiler } from "../compiler/classes/SparkdownCompiler";
import type { SparkdownCompilerConfig } from "../compiler/types/SparkdownCompilerConfig";

const configure = SparkdownCompiler.prototype.configure;

// The compiler compiles the builtins prelude with a compiler of its own
// (`getCompiledPrelude`), whose compiled story it reads; that compile is the
// compiler's, not a test's, and is left as it is.
const PRELUDE_URI = "file:///__builtins__.sd";

SparkdownCompiler.prototype.configure = function (
  this: SparkdownCompiler,
  config: SparkdownCompilerConfig,
) {
  const told = (this as unknown as { _config?: SparkdownCompilerConfig })
    ._config?.programChunks;
  const prelude = config.files?.some((file) => file.uri === PRELUDE_URI);
  return configure.call(
    this,
    config.programChunks === undefined && told === undefined && !prelude
      ? { ...config, programChunks: true }
      : config,
  );
};
