// Exercises the shared-stash hook two ways: the decision table runs against
// decide() directly, and a set of payloads run through the literal PreToolUse
// "command" string that .claude/settings.json ships, under bash and, when one
// is installed, under dash as a plain POSIX shell. Run:
//   node .claude/hooks/shared-stash-hook.test.mjs

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decide } from "./shared-stash-hook.mjs";
import { decide as typedDecide } from "./typed-issue-hook.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;

function check(ok, label, detail) {
  if (ok) console.log(`PASS: ${label}`);
  else {
    failed++;
    console.log(`FAIL: ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

const denies = [
  ["a bare stash", "git stash"],
  ["a stash push", "git stash push -m wip"],
  ["a stash push with a pathspec", "git stash push -- packages/sparkdown/src/x.ts"],
  ["a stash save", "git stash save wip"],
  ["a stash pop", "git stash pop"],
  ["a stash pop of a numbered entry", "git stash pop stash@{2}"],
  ["a stash apply", "git stash apply"],
  ["a stash drop", "git stash drop stash@{0}"],
  ["a stash clear", "git stash clear"],
  ["a stash branch", "git stash branch wip"],
  ["a stash with only options", "git stash -u"],
  ["a stash whose message stands where a subcommand would", "git stash -m wip"],
  // After `--` every token is a pathspec, so these push a file whose name
  // happens to read like a subcommand that only reads the stack.
  ["a stash of a file named list", "git stash -- list"],
  ["a stash of a file named show", "git stash -- show"],
  ["a stash of a file named create", "git stash -- create"],
  ["a stash of a file named list after -u", "git stash -u -- list"],
  ["a stash in another worktree by -C", "git -C ../impower.worktrees/fix/1-x stash pop"],
  ["a stash after a -c setting", "git -c core.autocrlf=false stash pop"],
  ["a stash after a glued --git-dir", "git --git-dir=../other/.git stash pop"],
  ["a stash after a separate --git-dir", "git --git-dir ../other/.git stash pop"],
  ["a stash through a full path", "/usr/bin/git stash pop"],
  ["a stash through git.exe", "C:\\tools\\git.exe stash pop"],
  ["a stash through a quoted git.exe path", '& "C:\\Program Files\\Git\\cmd\\git.exe" stash pop'],
  ["a stash in mixed case", "GIT STASH POP"],
  ["a stash after a cd", 'cd "C:/Users/dev/impower" && git stash pop'],
  ["a stash after a pipe", "echo x | git stash pop"],
  ["a stash after an environment assignment", "GIT_PAGER=cat git stash pop"],
  ["a stash inside bash -c", 'bash -c "git stash pop"'],
  ["a stash inside pwsh -Command", 'pwsh -Command "git stash pop"'],
  ["a stash inside a command substitution", 'OUT="$(git stash pop)"'],
  ["a stash inside a for loop", "for i in 1 2; do git stash pop; done"],
  ["a stash after a here-doc", "cat > m.txt <<'EOF'\nnote\nEOF\ngit stash pop"],
  ["a stash through sudo", "sudo git stash pop"],
  ["a push and a later pop in one command", "git stash push && npm test && git stash pop"],
];

const allows = [
  ["a stash list", "git stash list"],
  ["a stash list with options", "git stash list --oneline -n 5"],
  ["a stash show", "git stash show -p stash@{0}"],
  ["a stash create", "git stash create"],
  // The subcommand stands before the `--`, so it is the subcommand and what
  // follows only limits what it reads.
  ["a stash list limited to a path", "git stash list -- packages"],
  ["a commit", "git commit -F msg.txt"],
  ["a status", "git status --short"],
  ["the phrase inside a quoted string", "echo 'git stash pop is refused here'"],
  ["the phrase inside a here-doc body", "cat > note.md <<'EOF'\ndo not run git stash pop\nEOF"],
  ["the phrase in a comment", "npm test # never git stash pop between runs"],
  ["a grep for the phrase", "grep -rn 'git stash pop' .claude"],
  ["another program named in passing", "node scripts/stash-report.mjs"],
  ["a stash in a path that is not a git call", "cat ../stash/notes.md"],
  ["an empty command", ""],
  ["a non-string command", null],
];

for (const [label, command] of denies) {
  const reason = decide(command);
  check(typeof reason === "string" && reason.length > 0, `denied: ${label}`, JSON.stringify(reason));
}
for (const [label, command] of allows) {
  const reason = decide(command);
  check(reason === null, `allowed: ${label}`, JSON.stringify(reason));
}

// The reason has to name what to do instead, because the skills no longer
// carry a sentence saying it.
{
  const reason = decide("git stash pop");
  check(/copy it aside and copy it back/.test(reason), "the reason names copying the file aside", JSON.stringify(reason));
  check(/redgreen/.test(reason), "the reason names redgreen for a red/green proof", JSON.stringify(reason));
  check(/git stash list/.test(reason), "the reason names what is still allowed", JSON.stringify(reason));
}

// The two hooks share one reading of the command line, so a quoting rule
// holds for both. A stash inside a substitution and a create inside one are
// each seen by their own hook and by neither of the other's.
{
  check(typeof decide('N="$(git stash pop)"') === "string", "the shared reader finds a stash inside double quotes");
  check(decide('gh api -X POST repos/ImpowerGames/impower/issues -f title=x') === null, "the stash hook is silent on an untyped create");
  check(typeof typedDecide("gh issue create --title x") === "string", "the typed-issue hook still refuses an untyped create after the shared reader landed");
  check(typedDecide("git stash pop") === null, "the typed-issue hook is silent on a stash");
}

// The wired command string, under bash and under a plain POSIX shell.
{
  const settings = JSON.parse(readFileSync(resolve(root, ".claude", "settings.json"), "utf8"));
  const entry = (settings.hooks?.PreToolUse ?? []).find(
    (e) => /\bBash\b/.test(e.matcher) && /\bPowerShell\b/.test(e.matcher),
  );
  const hook = entry?.hooks.find((h) => h.command.includes("shared-stash-hook.mjs"));
  check(Boolean(hook), "settings.json wires shared-stash-hook.mjs for Bash|PowerShell");
  if (hook) {
    const shells = ["bash"];
    if (spawnSync("dash", ["-c", "true"]).status === 0) shells.push("dash");
    else console.log("NOTE: dash is not installed; the POSIX-shell pass is skipped");
    for (const shell of shells) {
      const run = (payload, env = {}) =>
        spawnSync(shell, ["-c", hook.command], {
          input: payload,
          encoding: "utf8",
          env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
        });
      const wire = (label, payload, expectDeny, env) => {
        const r = run(payload, env);
        const out = r.stdout ?? "";
        let parsed = null;
        try {
          parsed = out ? JSON.parse(out) : null;
        } catch {}
        const denied = parsed?.hookSpecificOutput?.permissionDecision === "deny";
        const ok =
          r.status === 0 &&
          !(r.stderr ?? "").trim() &&
          denied === expectDeny &&
          (expectDeny ? typeof parsed.hookSpecificOutput.permissionDecisionReason === "string" : out === "");
        check(ok, `[${shell}] ${expectDeny ? "wired deny" : "wired allow"}: ${label}`, `status=${r.status} stderr=${JSON.stringify(r.stderr)} stdout=${JSON.stringify(out)}`);
      };
      const payload = (tool_name, tool_input) => JSON.stringify({ tool_name, tool_input });
      wire("Bash git stash pop", payload("Bash", { command: "git stash pop", description: "restore the file" }), true);
      wire("PowerShell git stash push", payload("PowerShell", { command: "git stash push -m wip" }), true);
      wire("Bash git stash list", payload("Bash", { command: "git stash list" }), false);
      wire("the phrase only in the description", payload("Bash", { command: "npm test", description: "never git stash pop here" }), false);
      wire("a command with no stash at all", payload("Bash", { command: "git status --short" }), false);
      wire("payload without tool_input", payload("Bash", undefined), false);
      wire("unparseable payload mentioning git stash", "{not json git stash pop", true);
      wire("unparseable payload without a stash", "{not json", false);
      wire("deny reason survives a percent sign", payload("Bash", { command: "git stash push -m '100%'" }), true);
      wire("large payload with a stash at the end", payload("Bash", { command: "echo " + "x".repeat(200000) + "; git stash pop" }), true);
      wire("large payload without a stash", payload("Bash", { command: "echo " + "x".repeat(200000) }), false);
    }
  }
}

console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
