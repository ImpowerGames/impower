export const GAPS = [
  ["Game.setStartFrom: the line lookup (the accessor and its indexes)", /^(programLocator|ProgramRoot)\.ts:|^Game\.ts:setStartFrom$/],
  ["define scoping and builtin overrides", /^scopeDefineInstances\.ts:|^SparkdownCompiler\.ts:applyBuiltinOverrides$/],
  ["populateSceneAssets", /^SparkdownCompiler\.ts:populateSceneAssets$/],
  ["the edited text: inverting and applying the changes", /^invertContentChanges\.ts:|^main\.js:|^SparkdownDocumentRegistry\.ts:/],
  ["the rest of compileStory and previewCompile", /^SparkdownCompiler\.ts:/],
  ["the profiler and the profiled bundle's names", /^(profile\.ts|usertiming|performance|observe|primordials):|:__name$/],
  ["garbage collector", /:\(garbage collector\)$/],
];

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
