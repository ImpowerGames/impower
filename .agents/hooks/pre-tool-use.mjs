import { pathToFileURL } from "node:url";
import { decide } from "./policy.mjs";
import { gate } from "./session-title.mjs";

function eventCwd(payload) {
  return typeof payload.cwd === "string" && payload.cwd ? payload.cwd : undefined;
}

function patchFiles(command) {
  const files = [];
  let file = null, hunk = null;
  for (const line of command.split(/\r?\n/)) {
    const header = /^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/.exec(line);
    if (header) {
      const target = header[2].trimEnd();
      if (header[1] === "Move to") {
        if (file) file.path = target;
        continue;
      }
      hunk = null;
      file = header[1] === "Delete File" ? null : header[1] === "Add File" ? { path: target, added: [] } : { path: target, source: target, hunks: [] };
      if (file) files.push(file);
    } else if (file && hunk && line.trimEnd() === "*** End of File") hunk.eof = true;
    else if (!file || line.startsWith("*** ")) continue;
    else if (file.added) {
      if (line.startsWith("+")) file.added.push(line.slice(1));
    } else if (line.startsWith("@@")) {
      if (!hunk || hunk.lines.length) file.hunks.push((hunk = { anchors: [], lines: [] }));
      const anchor = line.slice(2).trim();
      if (anchor) hunk.anchors.push(anchor);
    } else if (/^[ +-]/.test(line)) {
      if (!hunk) file.hunks.push((hunk = { anchors: [], lines: [] }));
      hunk.lines.push({ op: line[0], text: line.slice(1) });
    }
  }
  return files.map(({ added, ...rest }) => (added ? { ...rest, content: added.length ? added.join("\n") + "\n" : "" } : rest));
}

export function normalize(payload, harness) {
  if (!["claude", "codex"].includes(harness)) throw new Error("Supply the hook adapter: claude or codex");
  if (!payload || typeof payload !== "object") throw new Error("Expected a tool event object");
  const tool = String(payload.tool_name ?? "").toLowerCase();
  const input = payload.tool_input;
  if (tool === "apply_patch") {
    if (typeof input?.command !== "string") throw new Error("Patch event is missing command text");
    const paths = [...input.command.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)\r?$/gm)].map((m) => m[1].trimEnd());
    const contents = input.command.split(/\r?\n/).filter((line) => line.startsWith("+")).map((line) => line.slice(1));
    return { kind: "edit", paths, contents, files: patchFiles(input.command), cwd: eventCwd(payload) };
  }
  if (tool === "write" || tool === "edit" || tool === "multiedit") {
    if (typeof input?.file_path !== "string") throw new Error("Edit event is missing file_path");
    const contents = [input.content, input.new_string, ...(Array.isArray(input.edits) ? input.edits.map((e) => e?.new_string) : [])];
    const file = typeof input.content === "string" ? { path: input.file_path, content: input.content } : { path: input.file_path, edits: Array.isArray(input.edits) ? input.edits : [input] };
    return { kind: "edit", paths: [input.file_path], contents, files: [file], cwd: eventCwd(payload) };
  }
  if (tool === "bash" || tool === "powershell") {
    if (typeof input?.command !== "string") throw new Error("Shell event is missing command text");
    return { kind: "shell", command: input.command, shell: harness === "claude" ? tool : undefined, cwd: eventCwd(payload) };
  }
  return { kind: "other" };
}

export async function main(harness = process.argv[2]) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const payload = JSON.parse(raw);
  const reason = decide(normalize(payload, harness)) ?? gate(payload, harness);
  if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) {
  main().catch((error) => { console.error(`Repository hook could not check this operation: ${error.message}`); process.exitCode = 2; });
}
