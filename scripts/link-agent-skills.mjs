import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const toolDirectories = [".claude", ".codex", ".github"];
export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Inspect every destination before changing any of them. Existing links are
// accepted only when they already resolve to this checkout's shared source.
export function linkAgentSkills(root = repositoryRoot, { repairLinks = false } = {}) {
  root = fs.realpathSync(root);
  const source = path.join(root, ".agents", "skills");
  const sourceStat = fs.lstatSync(source);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error("Shared skills source must be a real directory");
  if (fs.realpathSync(source) !== source) throw new Error("Shared skills source must stay inside this checkout");
  const plans = toolDirectories.map((tool) => {
    const parent = path.join(root, tool);
    const parentStat = fs.lstatSync(parent, { throwIfNoEntry: false });
    if (parentStat && (!parentStat.isDirectory() || parentStat.isSymbolicLink())) throw new Error(`Refusing unsafe tool directory: ${parent}`);
    const destination = path.join(parent, "skills");
    const stat = fs.lstatSync(destination, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      let target;
      try { target = fs.realpathSync(destination); } catch {}
      if (target !== source) {
        if (!repairLinks) throw new Error(`Refusing foreign or broken link: ${destination}. To explicitly replace only link entries while preserving their targets, run node scripts/link-agent-skills.mjs --repair-links from this checkout. See .agents/skills/RUNNERS.md, Migration and recovery.`);
        return { destination, action: "repair" };
      }
      return { destination, action: "exists" };
    }
    if (stat && (!stat.isDirectory() || fs.readdirSync(destination).length)) throw new Error(`Refusing populated directory or file: ${destination}. Preserve and reconcile its local skills and driver artifacts before installation; no data was replaced. See .agents/skills/RUNNERS.md, Migration and recovery.`);
    return { destination, action: stat ? "empty" : "create" };
  });
  for (const plan of plans) {
    if (plan.action === "exists") continue;
    fs.mkdirSync(path.dirname(plan.destination), { recursive: true });
    if (plan.action === "empty") fs.rmdirSync(plan.destination);
    if (plan.action === "repair") fs.unlinkSync(plan.destination);
    fs.symlinkSync(process.platform === "win32" ? source : path.relative(path.dirname(plan.destination), source), plan.destination, process.platform === "win32" ? "junction" : "dir");
  }
  return plans.map(({ destination }) => ({ destination, target: fs.realpathSync(destination), kind: process.platform === "win32" ? "junction" : "symlink" }));
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== "--repair-links")) throw new Error("Usage: node scripts/link-agent-skills.mjs [--repair-links]");
    console.log(JSON.stringify(linkAgentSkills(repositoryRoot, { repairLinks: process.argv.includes("--repair-links") }), null, 2));
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
