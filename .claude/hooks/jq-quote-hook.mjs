import { pathToFileURL } from "node:url";
import { jqQuoteReason } from "../../.agents/hooks/write-hazards.mjs";

// workaround(powershell): Windows PowerShell 5.1 strips double quotes from native command arguments, breaking gh --jq filters
export async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const reason = jqQuoteReason(JSON.parse(raw)?.tool_input?.command);
  if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) {
  main().catch((error) => { console.error(`jq-quote hook: ${error?.stack ?? error}`); process.exitCode = 2; });
}
