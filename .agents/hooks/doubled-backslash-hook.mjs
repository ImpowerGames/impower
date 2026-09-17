// PreToolUse hook for a runner's shell tool: refuses a command string that
// contains two consecutive backslashes.
//
// A runner's shell tool can collapse every pair of backslashes in the command
// string to a single backslash before the shell runs it. Single quotes and
// quoted here-doc delimiters do not prevent the collapse, because it happens
// before the shell parses anything, and a lone backslash is left alone. The
// runner notes record which tools do this and which preserve the string.
//
// The damage is silent and second-order: source that escapes a backslash,
// such as the regex `\\b` or the CSS content `\\00b7`, arrives one level less
// escaped, the language then reads it as a backspace or a NUL, and the file
// still parses, looks right in an editor and greps clean.
//
// So the trigger is exactly two consecutive backslashes anywhere in the
// command. A here-doc without them passes, and a lone backslash passes.
// Content that needs doubled backslashes goes into a file through an editor
// capability, which passes bytes through untouched, or through a shell tool
// the runner notes list as preserving the string.

import { pathToFileURL } from "node:url";

const REASON =
  "This shell command contains a doubled backslash, and this runner's shell tool collapses every pair of backslashes " +
  "to a single one before the shell runs the command; single quotes and quoted here-docs do not prevent it. An escaped " +
  "backslash such as the regex \\\\b or the CSS content \\\\00b7 therefore arrives as a backspace or a NUL byte in " +
  "whatever file it lands in, and the file still parses. Put the content in a file with an editor capability and run " +
  "that file, or use a shell tool the runner notes list as preserving backslashes. A lone backslash is not collapsed " +
  "and is fine.";

/**
 * Returns a deny reason for the command, or null to allow it. The test is
 * deliberately a plain substring match: the collapse applies to the whole
 * command string, inside quotes, here-doc bodies and comments alike, so no
 * tokenizer can carve out a safe region.
 */
export function decide(command) {
  if (typeof command !== "string" || !command.includes("\\\\")) return null;
  return REASON;
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

export async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let command;
  try {
    command = JSON.parse(raw)?.tool_input?.command;
  } catch {
    // An unparseable payload never blocks: this hook guards against a silent
    // corruption, and a broken harness must not turn it into a blanket refusal.
    return;
  }
  const reason = decide(command);
  if (reason) deny(reason);
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase();
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`doubled-backslash-hook: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
