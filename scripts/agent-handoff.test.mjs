import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runHandoff } from "./agent-handoff.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-handoff-"));
console.log(`Scratch repository: ${scratch}`);
const worktree = path.join(scratch, "repo");
fs.mkdirSync(worktree);
const git = (...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
git("init");
git("commit", "--allow-empty", "-m", "fixture");
const child = path.join(scratch, "child.mjs");
fs.writeFileSync(child, `import fs from "node:fs"; let p=""; for await (const chunk of process.stdin) p+=chunk; const file=/Write (.*?) with the editor tool/.exec(p)[1]; const head=/reviewed head=([a-f0-9]+)/.exec(p)[1]; fs.writeFileSync(file, JSON.stringify({head,next:process.argv[2]==="first"?"second":null,commentIds:[],summary:"complete"}));`);
const prompt = path.join(scratch, "prompt.txt");
fs.writeFileSync(prompt, "test fixture");
const config = { worktree, writer: "writer-test", reviewer: "reviewer-test", maxSteps: 2, first: "first", journal: path.join(scratch, "journal.jsonl"), steps: {
  first: { role: "implement", model: "writer-test", executable: process.execPath, args: [child, "first", "--model", "writer-test"], prompt, next: ["second"] },
  second: { role: "implement", model: "writer-test", executable: process.execPath, args: [child, "second", "--model", "writer-test"], prompt, next: [null] },
}};
const file = path.join(scratch, "plan.json");
const write = () => fs.writeFileSync(file, JSON.stringify(config));
write(); await runHandoff(file);
const rows = fs.readFileSync(config.journal, "utf8").trim().split("\n").map(JSON.parse);
assert.equal(rows.at(-1).event, "finished");
assert.ok(rows.findIndex((r) => r.event === "exited") < rows.findIndex((r) => r.index === 1), "second child must launch after first exits");
await assert.rejects(runHandoff(file), /Journal exists/);
config.journal = path.join(scratch, "second.jsonl");
config.steps.first.next = [null];
write(); await assert.rejects(runHandoff(file), /Undeclared transition/);
config.journal = path.join(scratch, "third.jsonl");
config.writer = config.reviewer;
write(); await assert.rejects(runHandoff(file), /distinct/);
config.writer = "writer-test";
const lock = git("rev-parse", "--path-format=absolute", "--git-path", "agent-handoff.lock").trim();
fs.writeFileSync(lock, "active coordinator");
write(); await assert.rejects(runHandoff(file), /EEXIST/);
fs.unlinkSync(lock);
config.steps.first.role = "review";
config.steps.first.model = "reviewer-test";
config.steps.first.args = [child, "first", "--model", "reviewer-test"];
config.steps.first.next = ["second"];
write(); await assert.rejects(runHandoff(file), /posted comment IDs/);
console.log("PASS: sequential completion, replay refusal, distinct routes, declared transitions, coordinator lock and missing-review refusal");
