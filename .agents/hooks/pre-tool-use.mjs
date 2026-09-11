import { pathToFileURL } from "node:url";
import { decide } from "./policy.mjs";

export function normalize(payload, harness) {
  if (!["claude", "codex"].includes(harness)) throw new Error("Supply the hook adapter: claude or codex");
  if (!payload || typeof payload !== "object") throw new Error("Expected a tool event object");
  const tool = String(payload.tool_name ?? "").toLowerCase();
  const input = payload.tool_input;
  if (tool === "apply_patch") {
    if (typeof input?.command !== "string") throw new Error("Patch event is missing command text");
    const paths = [...input.command.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)\r?$/gm)].map((m) => m[1].trimEnd());
    return { kind: "edit", paths };
  }
  if (tool === "write" || tool === "edit" || tool === "multiedit") {
    if (typeof input?.file_path !== "string") throw new Error("Edit event is missing file_path");
    return { kind: "edit", paths: [input.file_path] };
  }
  if (tool === "bash" || tool === "powershell") {
    if (typeof input?.command !== "string") throw new Error("Shell event is missing command text");
    // The unified exec Bash alias also covers PowerShell; it is not a shell
    // identity. Evaluate both dialects instead of guessing from that alias.
    return { kind: "shell", command: input.command, shell: harness === "claude" ? tool : undefined };
  }
  return { kind: "other" };
}

export async function main(harness = process.argv[2]) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const reason = decide(normalize(JSON.parse(raw), harness));
  if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) {
  main().catch((error) => { console.error(`Repository hook could not check this operation: ${error.message}`); process.exitCode = 2; });
}
