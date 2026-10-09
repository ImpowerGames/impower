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
