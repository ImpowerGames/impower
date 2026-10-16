// Shared by the builder and bounded syntax preparation; test-only, never production.
export const compileProfile = "luau-conformance-assert-v1";
export const assertionPolicy = "pinned-doctest-require-operation";
export const compileFlags = Object.freeze([
  "-std=c++17", "-O2", "-fexceptions", "-DNDEBUG", "-DLUAU_ENABLE_ASSERT",
]);
