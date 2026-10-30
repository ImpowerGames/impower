import { pathToFileURL } from "node:url";
import { dotNetRelativePathReason } from "../../.agents/hooks/write-hazards.mjs";

// workaround(powershell): .NET file calls resolve a relative path against the process directory, not the PowerShell location
export async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const reason = dotNetRelativePathReason(JSON.parse(raw)?.tool_input?.command);
  if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) {
  main().catch((error) => { console.error(`dotnet-path hook: ${error?.stack ?? error}`); process.exitCode = 2; });
}
