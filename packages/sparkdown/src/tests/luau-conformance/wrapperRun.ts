// The wrapper `function run()` the conformance harness and the lint corpus
// place an upstream Luau chunk in. A lint naming `run` is the wrapper's only
// when no other function in the script has that name.

/** Every function a script names `run`: a function statement, its last
 *  segment for a member (`function T.run()`), or a table field holding a
 *  function value (`{ run = function() end }`), the names Luau gives a
 *  function. */
const RUN_FUNCTION = /(?<![A-Za-z0-9_])(?:function\s+(?:[A-Za-z_]\w*\s*[.:]\s*)*run\s*\(|run\s*=\s*function(?![A-Za-z0-9_]))/g;

/** Whether the only function a script names `run` is the wrapper on its first line. */
export function onlyRunIsWrapper(text: string): boolean {
  return text.startsWith("function run()") && [...text.matchAll(RUN_FUNCTION)].length === 1;
}
