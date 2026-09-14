// Shared reviewer-only environment boundary; originating monitor keeps its own
// inherited host capability. Match the provider adapter's shared filter.
export function reviewerEnvironment(source=process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name])=>!(/^(?:CLAUDE_|CLAUDECODE$|CODEX_(?!HOME$)|NODE_REPL_|CUA_|GIT_)/i.test(name))));
}
