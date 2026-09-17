// Exercises the doubled-backslash hook two ways: the decision table runs
// against decide() directly, and payloads run through the literal PreToolUse
// "command" string that .claude/settings.json ships, under bash. Run:
//   node .claude/hooks/doubled-backslash-hook.test.mjs

import { testShell } from "../../.agents/skills/drive-web-editor/redgreen.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decide } from "./doubled-backslash-hook.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;

function check(ok, label, detail) {
  if (ok) console.log(`PASS: ${label}`);
  else {
    failed++;
    console.log(`FAIL: ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

// Each entry is written so the JavaScript string holds the bytes the tool
// would receive: "\\\\" here is two backslash characters.
const denies = [
  ["a doubled backslash in a here-doc body", "python - <<'PY'\nimport re\nre.compile(r\"\\\\b\")\nPY"],
  ["a doubled backslash in a quoted argument", "printf '%s' 'A\\\\B'"],
  ["a Windows path in a JSON payload", "gh api -f body='C:\\\\Users\\\\x'"],
  ["four consecutive backslashes", "echo 'x\\\\\\\\y'"],
  ["a doubled backslash inside a comment", "npm test # matches \\\\d+"],
  ["a doubled backslash after a pipe", "echo x | sed 's/\\\\./-/'"],
];

const allows = [
  ["a here-doc with no backslash", "git commit -F - <<'EOF'\nfix: a thing\nEOF"],
  ["a here-doc with lone backslashes", "python - <<'PY'\nprint('a\\tb')\nPY"],
  ["lone backslashes in a quoted argument", "printf '%s' 'x\\ny' | od -c"],
  ["a lone backslash before a letter", "grep '\\bword\\b' file.txt"],
  ["a Windows path with single separators", "ls 'C:\\Users\\x'"],
  ["the shell's left-shift operator", "echo $((1 << 3))"],
  ["a herestring with a lone backslash", "cat <<< 'a\\b'"],
  ["forward slashes", "echo 'a//b'"],
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

// The reason has to say what to do instead and what is still allowed.
{
  const reason = decide("echo 'A\\\\B'");
  check(/editor capability/.test(reason), "the reason names the editor capability", JSON.stringify(reason));
  check(/runner notes/.test(reason), "the reason points at the runner notes for a preserving shell tool", JSON.stringify(reason));
  check(/lone backslash is not collapsed/.test(reason), "the reason says a lone backslash is fine", JSON.stringify(reason));
}

// The wired command string, under bash, with the payloads the harness sends.
{
  const settings = JSON.parse(readFileSync(resolve(root, ".claude", "settings.json"), "utf8"));
  const entry = (settings.hooks?.PreToolUse ?? []).find((e) => e.matcher === "Bash");
  const hook = entry?.hooks.find((h) => h.command.includes("doubled-backslash-hook.mjs"));
  check(Boolean(hook), "settings.json wires doubled-backslash-hook.mjs for the Bash tool only");
  const powershellWired = (settings.hooks?.PreToolUse ?? []).some(
    (e) => /PowerShell/.test(e.matcher) && e.hooks.some((h) => h.command.includes("doubled-backslash-hook.mjs")),
  );
  check(!powershellWired, "the PowerShell tool, which preserves backslashes, is not wired");
  if (hook) {
    const shell = process.platform === "win32" ? testShell() : "bash";
    const run = (payload, env = {}) =>
      spawnSync(shell, ["-c", hook.command], {
        windowsHide: true,
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
      // A refusal the agent cannot act on is half a fix: the wired output must
      // carry the reason with its guidance, not only the decision.
      const reason = parsed?.hookSpecificOutput?.permissionDecisionReason;
      const guided = !expectDeny || (typeof reason === "string" && /editor capability/.test(reason) && /runner notes/.test(reason));
      check(r.status === 0 && denied === expectDeny && guided, `wired: ${label}`, `status=${r.status} stdout=${JSON.stringify(out)} stderr=${JSON.stringify(r.stderr)}`);
    };
    const dangerous = JSON.stringify({ tool_name: "Bash", tool_input: { command: "echo 'A\\\\B'" } });
    wire("a doubled backslash is refused with the guidance", dangerous, true);
    wire("a lone backslash passes", JSON.stringify({ tool_name: "Bash", tool_input: { command: "echo 'A\\B'" } }), false);
    wire("a here-doc without backslashes passes", JSON.stringify({ tool_name: "Bash", tool_input: { command: "cat <<'EOF'\nhello\nEOF" } }), false);
    wire("an empty payload passes", "", false);
    wire("unrelated unparseable text passes", "not json", false);
    // A truncated payload still carrying the four-backslash JSON encoding of a
    // doubled backslash is refused, as the sibling hooks refuse a broken
    // payload that still resembles what they guard.
    wire("a truncated payload that still shows a doubled backslash is refused", dangerous.slice(0, -1), true);
    wire("a truncated payload with only a lone backslash passes", JSON.stringify({ tool_name: "Bash", tool_input: { command: "echo 'A\\B'" } }).slice(0, -1), false);
    {
      const r = run(JSON.stringify({ tool_input: { command: "ls" } }), { CLAUDE_PROJECT_DIR: resolve(root, "nowhere") });
      check(r.status === 2 && /not found/.test(r.stderr), "wired: a missing hook file refuses with exit 2", `status=${r.status} stderr=${JSON.stringify(r.stderr)}`);
    }
  }
}

if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("PASS: doubled-backslash decision table, reason wording and wired command");
