import { pathToFileURL } from "node:url";

const REASON =
  "This shell command contains a doubled backslash, and this runner's shell tool collapses every pair of backslashes " +
  "to a single one before the shell runs the command; single quotes and quoted here-docs do not prevent it. An escaped " +
  "backslash such as the regex \\\\b or the CSS content \\\\00b7 therefore arrives as a backspace or a NUL byte in " +
  "whatever file it lands in, and the file still parses. Put the content in a file with an editor capability and run " +
  "that file, or use a shell tool the runner notes list as preserving backslashes. A lone backslash is not collapsed " +
  "and is fine.";

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
    if (raw.includes("\\\\\\\\")) deny("The doubled-backslash hook could not parse the tool payload, but the payload still contains a doubled backslash. " + REASON);
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
