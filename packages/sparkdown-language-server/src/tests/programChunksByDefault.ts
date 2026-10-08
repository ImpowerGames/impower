// The package's vitest setup file: every compile a test makes through
// `SparkdownCompiler` builds statement chunks unless the test names
// `programChunks` itself, as every host's compile does (#703, #704), and a
// test that reads a chunked compile's `compiled` or `pathLocations` fails
// (sparkdown's `programChunksByDefault.ts`, which this loads). A `Game`
// runs a program with chunks on the program engine unless told otherwise
// (`GameConfiguration.programChunks`). #705 deletes the current engine, the
// field and this file.
import "../../../sparkdown/src/tests/programChunksByDefault";
