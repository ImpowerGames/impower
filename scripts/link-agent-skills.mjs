import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const toolDirectories = [".claude", ".codex", ".github"];
export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function copiedTree(directory, canonical) {
  const rows = [];
  function visit(local, shared) {
    if ([".state.json", ".state.json.tmp", ".chrome-profile"].includes(path.basename(local))) return false;
    const stat = fs.lstatSync(local);
    const source = fs.lstatSync(shared, { throwIfNoEntry: false });
    if (!source || stat.isSymbolicLink() || source.isSymbolicLink()) return false;
    if (stat.isDirectory() && source.isDirectory()) {
      if (fs.realpathSync(local) !== local || fs.realpathSync(shared) !== shared) return false;
      rows.push([local, stat.dev, stat.ino]);
      return fs.readdirSync(local).every((name) => visit(path.join(local, name), path.join(shared, name)));
    }
    if (!stat.isFile() || !source.isFile() || stat.nlink !== 1 || source.nlink !== 1 || (stat.dev === source.dev && stat.ino === source.ino)) return false;
    rows.push([local, stat.dev, stat.ino, createHash("sha256").update(fs.readFileSync(local)).digest("hex")]);
    return true;
  }
  return visit(directory, canonical) && rows.some((row) => row.length === 4) ? JSON.stringify(rows) : null;
}

function backupDirectory(parent, root) {
  if (!path.isAbsolute(parent)) throw new Error("--adopt-copy requires an existing absolute backup parent outside the checkout");
  parent = path.resolve(parent);
  for (let current = parent; ; current = path.dirname(current)) {
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing unsafe backup parent: ${current}`);
    if (path.dirname(current) === current) break;
  }
  const relative = path.relative(root, fs.realpathSync(parent));
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Backup parent must be outside the checkout");
  return fs.mkdtempSync(path.join(parent, "agent-skills-copy-"));
}

export function linkAgentSkills(root = repositoryRoot, { repairLinks = false, adoptCopy, reportPlan = () => {} } = {}) {
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
      try { target = fs.realpathSync(destination); }
      catch (error) { if (error.code !== "ENOENT") throw new Error(`Cannot resolve link ${destination}: ${error.message}; no links were changed`); }
      if (target !== source) {
        if (!repairLinks) throw new Error(`Refusing foreign or broken link: ${destination}. To explicitly replace only link entries while preserving their targets, run node scripts/link-agent-skills.mjs --repair-links from this checkout. See .agents/skills/RUNNERS.md, Migration and recovery.`);
        return { destination, action: "repair", previousTarget: fs.readlinkSync(destination) };
      }
      return { destination, action: "exists" };
    }
    const populated = () => new Error(`Refusing populated directory or file: ${destination}. Preserve and reconcile its local skills and driver artifacts using .agents/skills/references/runner-recovery.md, then run node scripts/link-agent-skills.mjs from this checkout; no data was replaced.`);
    if (stat && !stat.isDirectory()) throw populated();
    const entries = stat ? fs.readdirSync(destination) : [];
    if (entries.length) {
      const links = entries.filter((name) => fs.lstatSync(path.join(destination, name)).isSymbolicLink());
      if (links.length !== entries.length) {
        const snapshot = copiedTree(destination, source);
        if (!snapshot) throw populated();
        if (!adoptCopy) throw new Error(`Refusing copied canonical skills directory: ${destination}. To preserve the entire copy in an existing private backup parent outside the checkout and install the shared link, run node scripts/link-agent-skills.mjs --adopt-copy <absolute-backup-parent> from this checkout. See .agents/skills/references/runner-recovery.md.`);
        return { destination, action: "adopt", snapshot };
      }
      if (!repairLinks) throw new Error(`Refusing directory of links: ${destination} holds only links (${entries.join(", ")}) in place of this checkout's shared link. To replace those link entries with the shared link while preserving their targets, run node scripts/link-agent-skills.mjs --repair-links from this checkout. See .agents/skills/RUNNERS.md, Migration and recovery.`);
      return { destination, action: "repair", previousTarget: Object.fromEntries(links.map((name) => [name, fs.readlinkSync(path.join(destination, name))])) };
    }
    return { destination, action: stat ? "empty" : "create" };
  });
  const copies = plans.filter((plan) => plan.action === "adopt");
  if (copies.length) {
    const backupRoot = backupDirectory(adoptCopy, root);
    for (const plan of copies) plan.backup = path.join(backupRoot, path.basename(path.dirname(plan.destination)));
  }
  reportPlan(plans.map(({ snapshot, ...plan }) => ({ ...plan, target: source })));
  for (const plan of copies) {
    if (copiedTree(plan.destination, source) !== plan.snapshot) throw new Error(`Copied skills changed during planning: ${plan.destination}; no links were changed`);
  }
  for (const plan of plans) {
    if (plan.action === "exists") continue;
    fs.mkdirSync(path.dirname(plan.destination), { recursive: true });
    if (plan.action === "empty") fs.rmdirSync(plan.destination);
    if (plan.action === "adopt") fs.renameSync(plan.destination, plan.backup);
    if (plan.action === "repair" && typeof plan.previousTarget === "string") fs.unlinkSync(plan.destination);
    else if (plan.action === "repair") { for (const name of Object.keys(plan.previousTarget)) fs.unlinkSync(path.join(plan.destination, name)); fs.rmdirSync(plan.destination); }
    fs.symlinkSync(process.platform === "win32" ? source : path.relative(path.dirname(plan.destination), source), plan.destination, process.platform === "win32" ? "junction" : "dir");
  }
  return plans.map(({ snapshot, ...plan }) => ({ ...plan, target: fs.realpathSync(plan.destination), kind: process.platform === "win32" ? "junction" : "symlink" }));
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    let adoptCopy;
    let repairLinks = false;
    while (args.length) {
      const arg = args.shift();
      if (arg === "--repair-links" && !repairLinks) repairLinks = true;
      else if (arg === "--adopt-copy" && !adoptCopy && args[0] && !args[0].startsWith("--")) adoptCopy = args.shift();
      else throw new Error("Usage: node scripts/link-agent-skills.mjs [--repair-links] [--adopt-copy <absolute-backup-parent>]");
    }
    console.log(JSON.stringify(linkAgentSkills(repositoryRoot, { repairLinks, adoptCopy, reportPlan: (plans) => console.log(JSON.stringify({ event: "planned", plans })) }), null, 2));
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
