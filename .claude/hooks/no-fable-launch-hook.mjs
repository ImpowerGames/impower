import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FABLE = /fable/i;
const MODEL_TEXT = /\bmodel["']?\s*[:=]\s*["'`]?[^\s"'`,}]*fable/i;
const LAUNCH_ARG = /(?:--model|--writer-model)(?:\s+|\s*=\s*)["'`]?[^\s"'`,}]*fable/i;
const NAME_A_MODEL = "Pass an explicit model (opus, sonnet or haiku) so the launch cannot inherit a Fable model";

function pinnedModel(type, projectDir) {
  if (typeof type !== "string" || !/^[\w.-]+$/.test(type)) return null;
  try {
    const text = fs.readFileSync(path.join(projectDir, ".claude", "agents", `${type}.md`), "utf8");
    return text.match(/^---[\s\S]*?^model:\s*(\S+)/m)?.[1] ?? null;
  } catch { return null; }
}

export function launcherModel(transcriptPath) {
  try {
    const lines = fs.readFileSync(transcriptPath, "utf8").trimEnd().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const model = lines[i].match(/"model":"([^"]+)"/)?.[1];
      if (model) return model;
    }
  } catch {}
  return null;
}

export function decide(payload, { projectDir = process.env.CLAUDE_PROJECT_DIR ?? ".", parentModel } = {}) {
  const tool = payload?.tool_name ?? "";
  const input = payload?.tool_input ?? {};
  const hit = (value) => typeof value === "string" && FABLE.test(value);
  const parentIsFable = () => FABLE.test(parentModel ?? launcherModel(payload?.transcript_path) ?? "");
  if (tool === "Agent" || tool === "Task") {
    if (hit(input.model) || hit(input.subagent_type)) return "names a Fable model";
    if (input.model) return null;
    const pinned = pinnedModel(input.subagent_type, projectDir);
    if (pinned && pinned !== "inherit") return hit(pinned) ? "uses an agent definition pinned to Fable" : null;
    return `names no model. ${NAME_A_MODEL}`;
  }
  if (/hand_off_to_session$/.test(tool)) return parentIsFable() ? "hands a Fable session's task to a fork, which keeps its model. Start a fresh session with an explicit model instead" : null;
  if (/start_session$/.test(tool)) {
    if (hit(input.model) || hit(input.preset)) return "names a Fable model";
    if (input.initiation === "offer") return null;
    if (input.proposal_id && !input.prompt) return null;
    if (input.context === "fork")return parentIsFable() ? "forks a Fable session, and a fork always inherits its model. Start a fresh session with an explicit model instead" : null;
    return input.model ? null : `names no model. ${NAME_A_MODEL}`;
  }
  if (/set_session_model$/.test(tool)) return hit(input.model) ? "names a Fable model" : null;
  if (tool === "Workflow") {
    const script = input.script ?? (input.scriptPath ? (() => { try { return fs.readFileSync(input.scriptPath, "utf8"); } catch { return ""; } })() : "");
    if (MODEL_TEXT.test(script)) return "names a Fable model in the workflow script";
    const agents = (script.match(/\bagent\s*\(/g) ?? []).length;
    const models = (script.match(/\bmodel\s*:/g) ?? []).length;
    if ((agents > models || /fork/.test(script)) && parentIsFable()) return `runs from a Fable session with workflow agents that name no model or fork. ${NAME_A_MODEL} on every agent() call`;
    return null;
  }
  if ((tool === "Bash" || tool === "PowerShell") && LAUNCH_ARG.test(input.command ?? "")) return "names a Fable model argument";
  return null;
}

export async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const reason = decide(JSON.parse(raw || "{}"));
  if (reason) {
    process.stderr.write(`no-fable hook: this launch ${reason}. Agents may launch Opus and below only; never start a Fable subagent, session or writer.\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) {
  main().catch((error) => { console.error(error); process.exitCode = 2; });
}
