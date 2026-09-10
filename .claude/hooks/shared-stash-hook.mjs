// PreToolUse hook for the Bash and PowerShell tools: refuses a git command
// that would move this repository's stash stack.
//
// The stack belongs to the repository, not to the worktree. This checkout
// has a dozen worktrees with sessions running in them at once, and they all
// push onto and pop off the same stack, so `git stash pop` takes whatever
// sits at stash@{0} at that moment: another session's work lands in this
// tree and this session's changes stay on the stack under someone else's
// name. Reading the stack (`list`, `show`) and `create`, which writes a
// commit object and leaves the ref alone, are not refused.
//
// The command is read with the tokenizer next to this file, so a mention of
// the phrase in a quoted string, a comment or a here-doc body is not a
// match, and an invocation counts only at command position. Like the
// typed-issue hook this is a guardrail against forgetting, not against
// evasion: a git call built from a shell variable or a wrapper script is not
// seen.
//
// Exercised by shared-stash-hook.test.mjs next to this file, which also runs
// the literal command string .claude/settings.json ships.

import { pathToFileURL } from "node:url";
import { baseName, isShellCommandString, programBefore, readCommand } from "./typed-issue-hook.mjs";

// The stash subcommands left alone: they read the stack, or in `create`'s
// case write a commit object and leave the ref where it was. Every other
// subcommand pushes onto the stack, pops off it, or applies what is on it
// (`push`, `save`, `pop`, `apply`, `drop`, `clear`, `store`, `branch`), and
// so does a bare `git stash`.
const READS_THE_STACK = new Set(["list", "show", "create"]);

// git's own options, before the subcommand, that take the next token as
// their value when it is not glued on with `=`.
const GIT_VALUE_OPTIONS = new Set([
  "-C", "-c", "--git-dir", "--work-tree", "--namespace",
  "--super-prefix", "--config-env", "--attr-source",
]);

const REASON =
  "git stash moves a stack that belongs to the whole repository rather than to this worktree, and this checkout has " +
  "several worktrees with sessions running in them at once: a pop or an apply takes whatever sits at stash@{0} when it " +
  "runs, which may be another session's work pushed since. To set a file aside, copy it aside and copy it back; to prove " +
  "a test red on the pre-change source, run `node .claude/skills/drive-web-editor/driver.mjs redgreen`, which snapshots " +
  "the files, reverts them, runs the test and restores them by content hash inside one process. `git stash list`, " +
  "`git stash show` and `git stash create` are not refused.";

/**
 * Given the tokens after `git`, the stash subcommand this call runs, or null
 * when it is not a stash call. A bare `git stash` reads as `push`.
 */
function stashSubcommand(args) {
  let i = 0;
  // Skip git's own options, so `git -C ../other stash pop` is still seen.
  while (i < args.length) {
    const t = args[i].text;
    if (!t.startsWith("-")) break;
    const name = t.split("=")[0];
    // `-C <dir>`, `-c <name>=<value>`; a glued `-Cdir` or `--git-dir=<path>`
    // carries its value in the token itself.
    i += GIT_VALUE_OPTIONS.has(name) && !t.includes("=") && t.length === name.length ? 2 : 1;
  }
  if (args[i]?.text.toLowerCase() !== "stash") return null;
  // The word after `stash` is the subcommand. An option before it is a push
  // with options (`git stash -u`), and a bare `git stash` is a push too.
  for (let k = i + 1; k < args.length; k++) {
    const t = args[k].text;
    if (t.startsWith("-")) continue;
    return t.toLowerCase();
  }
  return "push";
}

/**
 * Returns a deny reason for the command, or null to allow it. `shell` is
 * "powershell" or "bash"; when omitted the command is read both ways and
 * refused if either reading refuses it. Substitutions and -c strings are
 * analysed to a depth of three, as in the typed-issue hook.
 */
export function decide(command, shell, depth = 0) {
  if (typeof command !== "string" || command.length === 0 || depth > 3) return null;
  if (shell !== "powershell" && shell !== "bash") return decide(command, "bash", depth) ?? decide(command, "powershell", depth);
  const { segments, subs } = readCommand(command, shell);
  for (const sub of subs) {
    const inner = decide(sub, shell, depth + 1);
    if (inner) return inner;
  }
  for (const { tokens: seg, positions } of segments) {
    for (let i = 0; i < seg.length; i++) {
      const tok = seg[i];
      if (tok.quoted && isShellCommandString(seg, i, positions)) {
        const program = programBefore(seg, i - 1);
        const innerShell = program >= 0 && /^(pwsh|powershell)$/.test(baseName(seg[program])) ? "powershell" : program >= 0 ? "bash" : shell;
        const inner = decide(tok.text, innerShell, depth + 1);
        if (inner) return inner;
      }
      if (!positions.has(i) || baseName(tok) !== "git") continue;
      const sub = stashSubcommand(seg.slice(i + 1));
      // Anything that is not one of the reading subcommands moves the stack:
      // the listed ones do, and so does a word this hook does not know, since
      // `git stash -m wip` names its message where a subcommand would stand
      // and is a push.
      if (sub === null || READS_THE_STACK.has(sub)) continue;
      return REASON;
    }
  }
  return null;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let command;
  let shell;
  try {
    const payload = JSON.parse(raw);
    command = payload?.tool_input?.command;
    const tool = String(payload?.tool_name ?? "").toLowerCase();
    shell = tool === "powershell" ? "powershell" : tool === "bash" ? "bash" : undefined;
  } catch {
    // An unparseable payload is refused only when it looks like it carries a
    // stash call, so a broken harness cannot let one through and cannot
    // block unrelated commands either.
    if (/\bgit\s+stash\b/i.test(raw)) deny("The stash hook could not parse the tool payload, so it cannot tell whether this command moves the shared stash stack. " + REASON);
    return;
  }
  const reason = decide(command, shell);
  if (reason) deny(reason);
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase();
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`shared-stash-hook: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
