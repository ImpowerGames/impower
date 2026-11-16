const LEADING_WHITESPACE = String.raw`((?:[^\S\n\r])*)`;

const NAME_START = String.raw`(?<![a-zA-Z0-9_]|[a-zA-Z0-9_]@)`;

const NOT_AFTER_SEPARATOR = String.raw`(?<![.:,](?:[^\S\n\r]){0,32})`;

export const VSCODE_REASSIGNMENT_GUARD = NAME_START + NOT_AFTER_SEPARATOR;

export const VSCODE_GUARDED_REASSIGNMENTS = [
  "LuauReassignment",
  "LuauSparkdownReassignment",
  "LuauSparkdownExplicitReassignment",
] as const;

export const withVscodeReassignmentGuard = <T extends { repository: object }>(grammar: T): T => {
  const repository = grammar.repository as Record<string, { begin?: string }>;
  for (const name of VSCODE_GUARDED_REASSIGNMENTS) {
    const rule = repository[name];
    if (!rule?.begin?.startsWith(LEADING_WHITESPACE + "(")) {
      throw new Error(`${name}.begin no longer starts with its leading-whitespace capture, so VS Code's reassignment guard has no place to go`);
    }
    rule.begin = LEADING_WHITESPACE + VSCODE_REASSIGNMENT_GUARD + rule.begin.slice(LEADING_WHITESPACE.length);
  }
  return grammar;
};
