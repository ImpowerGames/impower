// How profile-shares.mjs --groups divides a profile's time: the preview
// benchmark's unattributed time (GAPS, #706). Each entry is [group, RegExp
// over `<source file>:<function>`]; the first match wins, and a function no
// entry matches is listed as unassigned.

// What fills the preview benchmark's unattributed worker time (#706), for
// `profile-shares.mjs --gaps --under "(root)"`. Self time only, so a group is
// the work its functions do themselves; `main.js` is the text document class
// of vscode-languageserver-textdocument.
export const GAPS = [
  ["Game.setStartFrom: the line lookup (the accessor and its indexes)", /^(programLocator|ProgramRoot)\.ts:|^Game\.ts:setStartFrom$/],
  ["define scoping and builtin overrides", /^scopeDefineInstances\.ts:|^SparkdownCompiler\.ts:applyBuiltinOverrides$/],
  ["populateSceneAssets", /^SparkdownCompiler\.ts:populateSceneAssets$/],
  ["the edited text: inverting and applying the changes", /^invertContentChanges\.ts:|^main\.js:|^SparkdownDocumentRegistry\.ts:/],
  ["the rest of compileStory and previewCompile", /^SparkdownCompiler\.ts:/],
  ["the profiler and the profiled bundle's names", /^(profile\.ts|usertiming|performance|observe|primordials):|:__name$/],
  ["garbage collector", /:\(garbage collector\)$/],
];

// Where the compiler's time goes, for the parsed-hierarchy bypass profile
// (#1712), by the source file's directory: run profile-shares.mjs with
// --by-path, and --under the function that drives a phase
// (`updateSyntaxTree` for incrementalParse and fullParse, `parseIncrementally`
// for ink/parse, `buildProgramChunks` for program/chunks). Self time only.
// The statement memo's stand-ins (`Memoized*`) are parsed classes but are
// counted with the memo, ahead of the parsed hierarchy.
const SPARKDOWN = "packages/sparkdown/src/";
const PARSED = `${SPARKDOWN}inkjs/compiler/Parser/ParsedHierarchy/`;
const under = (dir, file = "") => new RegExp(`^${dir}${file}`.replace(/\./g, "[.]"));
export const BYPASS = [
  ["parse: the grammar's tokenizer and the Lezer tree", /^(packages\/textmate-grammar-tree\/|node_modules\/@lezer\/)/],
  ["reading Luau source (compiler/typecheck)", under(`${SPARKDOWN}compiler/typecheck/`)],
  ["text slicing and regular expressions (@codemirror/state, RegExp)", /^(node_modules\/@codemirror\/state\/|\(vm\):RegExp)/],
  ["the statement memo, its recording and its stand-ins", /^packages\/sparkdown\/src\/(compiler\/lower\/(statementMemo|recordingContext)[.]ts|inkjs\/compiler\/Parser\/ParsedHierarchy\/(\w+\/)?Memoized\w*[.]ts):/],
  ["lowering: the lowerers and their helpers", under(`${SPARKDOWN}compiler/lower/`)],
  ["parsed hierarchy: the weave (Weave.ts)", under(PARSED, "Weave.ts:")],
  ["parsed hierarchy: every other class (construction, Prepare, resolution, naming)", under(PARSED)],
  ["the compilation annotator (CompilationAnnotator.ts)", under(`${SPARKDOWN}compiler/classes/annotators/`, "CompilationAnnotator.ts:")],
  ["the other annotators", /^packages\/sparkdown\/src\/compiler\/classes\/(annotators\/|SparkdownCombinedAnnotator[.]ts|SparkdownAnnotator[.]ts)/],
  ["the program resolver (ProgramResolver.ts)", under(`${SPARKDOWN}program/`, "ProgramResolver.ts:")],
  ["writing chunks: the writer, emitter, chunk store and root", under(`${SPARKDOWN}program/`)],
  ["SparkdownCompiler.ts (assembly, flow reuse, numbering, scoping)", under(`${SPARKDOWN}compiler/classes/`, "SparkdownCompiler.ts:")],
  ["the rest of the inkjs compiler", under(`${SPARKDOWN}inkjs/`)],
  ["the rest of the sparkdown compiler", under(SPARKDOWN)],
  ["garbage collector", /:\(garbage collector\)$/],
];
