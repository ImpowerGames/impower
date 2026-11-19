import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import * as run from "./issue-run.mjs";

const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-reads-")));
console.log(`scratch: ${tmp}`);

const REPO = "acme/widgets", ROOT = 100;
const field = (name, option) => ({ data_type: "single_select", issue_field_name: name, single_select_option: { name: option } });

function server() {
  const issues = new Map(), subs = new Map(), blockers = new Map();
  const add = (number, { parent = null, state = "open", type = "Task", effort = "Medium", priority = null } = {}) => {
    issues.set(number, { number, title: `ticket ${number}`, state, body: "## Acceptance criteria\n\n- [ ] Works.\n", type: { name: type }, effort, priority });
    if (parent !== null) subs.set(parent, [...(subs.get(parent) ?? []), number]);
  };
  const shape = (n, bare) => {
    const i = issues.get(n);
    const { effort, priority, ...rest } = i;
    if (bare) return rest;
    const blocking = blockers.get(n) ?? [];
    return {
      ...rest,
      sub_issues_summary: { total: (subs.get(n) ?? []).length, completed: 0, percent_completed: 0 },
      issue_dependencies_summary: { blocked_by: blocking.filter((b) => issues.get(b).state === "open").length, total_blocked_by: blocking.length, blocking: 0, total_blocking: 0 },
      issue_field_values: [effort && field("Effort", effort), priority && field("Priority", priority)].filter(Boolean),
    };
  };
  return { issues, subs, blockers, add, shape };
}

function fakeGh(gh, { bare = false } = {}) {
  const calls = [];
  const http = (status, headers, body = "") => [`HTTP/2.0 ${status}`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), "", body].join("\r\n");
  const limits = { used: 100 };
  const listOf = (endpoint, n) => (endpoint === "sub_issues" ? gh.subs.get(n) ?? [] : gh.blockers.get(n) ?? []).map((k) => gh.shape(k, bare));
  const exec = (cmd, args) => {
    calls.push(args.join(" "));
    if (cmd === "git") {
      if (args[0] === "worktree") return "";
      if (args[0] === "rev-list") return "";
      return "m1\n";
    }
    if (args[0] === "pr") return "[]";
    if (args[0] === "run") return "[]";
    if (args[0] === "api" && args[1] === "-i") {
      const match = args.find((a) => a.startsWith("If-None-Match: "))?.slice("If-None-Match: ".length);
      const [, n, endpoint] = /issues\/(\d+)\/(sub_issues|dependencies\/blocked_by)\?/.exec(args.at(-1));
      const body = JSON.stringify(listOf(endpoint === "sub_issues" ? "sub_issues" : "blocked_by", Number(n)));
      const etag = `W/"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;
      if (match === etag) {
        const error = new Error("gh: HTTP 304");
        error.stdout = http("304 Not Modified", { Etag: etag, "X-Ratelimit-Remaining": 5000 - limits.used, "X-Ratelimit-Used": limits.used, "X-Ratelimit-Limit": 5000, "X-Ratelimit-Reset": 1795118245 });
        throw error;
      }
      limits.used++;
      return http("200 OK", { Etag: etag, "X-Ratelimit-Remaining": 5000 - limits.used, "X-Ratelimit-Used": limits.used, "X-Ratelimit-Limit": 5000, "X-Ratelimit-Reset": 1795118245 }, body);
    }
    if (args[0] === "api" && args[1] === "--paginate") {
      const target = args.at(-1);
      const fields = /issues\/(\d+)\/issue-field-values$/.exec(target);
      if (fields) return JSON.stringify([gh.shape(Number(fields[1]), false).issue_field_values]);
      const list = /issues\/(\d+)\/(sub_issues|dependencies\/blocked_by)$/.exec(target);
      if (list) { limits.used++; return JSON.stringify([listOf(list[2] === "sub_issues" ? "sub_issues" : "blocked_by", Number(list[1]))]); }
    }
    const one = /^repos\/[\w.-]+\/[\w.-]+\/issues\/(\d+)$/.exec(args[1] ?? "");
    if (args[0] === "api" && one) return JSON.stringify(gh.shape(Number(one[1]), bare));
    throw new Error(`unexpected gh call: ${args.join(" ")}`);
  };
  const parallel = (jobs) => jobs.map(([cmd, args]) => { try { return { ok: true, stdout: exec(cmd, args) }; } catch (error) { return { ok: false, stdout: error.stdout ?? "", stderr: error.message }; } });
  return { calls, limits, exec, parallel };
}

const snapshotWith = (gh, { cacheDir, bare = false } = {}) => {
  const fake = fakeGh(gh, { bare });
  const client = run.githubClient({ repository: REPO }, tmp, { run: fake.exec, parallel: fake.parallel, cache: run.conditionalCache?.(cacheDir) });
  const snap = run.takeSnapshot({ repository: REPO, issue: ROOT }, client);
  const { observedAt, ...rest } = snap;
  return { snap: rest, calls: fake.calls, client, limits: fake.limits };
};
const subIssueCalls = (calls) => calls.filter((c) => c.includes("/sub_issues"));
const blockerCalls = (calls) => calls.filter((c) => c.includes("/dependencies/blocked_by"));
const fieldCalls = (calls) => calls.filter((c) => c.includes("issue-field-values"));
const freshDir = (name) => path.join(tmp, name);

const gh = server();
gh.add(ROOT, { type: "Feature" });
gh.add(101, { parent: ROOT, effort: "Low", priority: "High" });
gh.add(102, { parent: ROOT });
gh.add(103, { parent: 102, effort: "High", priority: "Low" });
gh.add(104, { parent: 102, priority: "Medium" });
gh.blockers.set(104, [101]);

const reference = snapshotWith(gh, { cacheDir: freshDir("bare"), bare: true });
assert.equal(subIssueCalls(reference.calls).length, 5, "without summaries every ticket's sub-issue list is read, as before");
assert.equal(fieldCalls(reference.calls).length, 4, "without field values every ticket's fields are read, as before");

const cold = snapshotWith(gh, { cacheDir: freshDir("shared") });
assert.deepEqual(cold.snap, reference.snap, "summaries and field values change nothing the snapshot reports");
assert.deepEqual(subIssueCalls(cold.calls).map((c) => /issues\/(\d+)\//.exec(c)[1]), ["100", "102"], "only tickets whose summary reports sub-issues have them listed");
assert.deepEqual(blockerCalls(cold.calls).map((c) => /issues\/(\d+)\//.exec(c)[1]), ["104"], "only a ticket whose summary reports a blocker has its blockers read");
assert.deepEqual(fieldCalls(cold.calls), [], "Effort and Priority come from the issue objects");
const byNumber = Object.fromEntries(cold.snap.tickets.map((t) => [t.number, t]));
assert.deepEqual(byNumber[104].blockers, [{ number: 101, state: "open", delivered: false }], "a blocked ticket keeps its blockers");
assert.deepEqual([byNumber[101].effort, byNumber[101].priority, byNumber[103].effort, byNumber[103].priority, byNumber[104].priority], ["Low", "High", "High", "Low", "Medium"]);
assert.ok([...subIssueCalls(cold.calls), ...blockerCalls(cold.calls)].every((c) => !c.includes("If-None-Match")), "an empty cache sends unconditional requests");

const warm = snapshotWith(gh, { cacheDir: freshDir("shared") });
assert.deepEqual(warm.snap, reference.snap, "a snapshot served from 304 answers matches");
const conditional = [...subIssueCalls(warm.calls), ...blockerCalls(warm.calls)];
assert.equal(conditional.length, 3);
assert.ok(conditional.every((c) => c.includes("If-None-Match: W/")), "every remaining read sends the cached ETag");
assert.equal(warm.limits.used, 100, "unchanged answers cost nothing");
assert.deepEqual(warm.client.allowance(), { remaining: 4900, used: 100, limit: 5000, reset: 1795118245, resetsAt: new Date(1795118245 * 1000).toISOString() }, "the client reports the separate allowance from the last read's headers");

for (const name of fs.readdirSync(freshDir("shared"))) fs.writeFileSync(path.join(freshDir("shared"), name), "{not json");
const unreadable = snapshotWith(gh, { cacheDir: freshDir("shared") });
assert.deepEqual(unreadable.snap, reference.snap, "an unreadable cache entry falls back to an unconditional read");
assert.ok([...subIssueCalls(unreadable.calls), ...blockerCalls(unreadable.calls)].every((c) => !c.includes("If-None-Match")));
const restored = snapshotWith(gh, { cacheDir: freshDir("shared") });
assert.ok([...subIssueCalls(restored.calls), ...blockerCalls(restored.calls)].every((c) => c.includes("If-None-Match")), "the fallback read refills the cache");

const missing = path.join(freshDir("shared"), fs.readdirSync(freshDir("shared"))[0]);
fs.rmSync(missing);
const partial = snapshotWith(gh, { cacheDir: freshDir("shared") });
assert.deepEqual(partial.snap, reference.snap, "a missing cache entry falls back to an unconditional read");
assert.equal([...subIssueCalls(partial.calls), ...blockerCalls(partial.calls)].filter((c) => !c.includes("If-None-Match")).length, 1, "only the missing entry is read unconditionally");

gh.add(105, { parent: 102, effort: "Low" });
gh.blockers.set(103, [104]);
gh.issues.get(101).state = "closed";
gh.subs.set(102, gh.subs.get(102).filter((n) => n !== 104));
gh.subs.set(101, [104]);
const changed = snapshotWith(gh, { cacheDir: freshDir("shared") });
const cleared = snapshotWith(gh, { cacheDir: freshDir("cleared") });
const bareChanged = snapshotWith(gh, { cacheDir: freshDir("bare-changed"), bare: true });
assert.deepEqual(changed.snap, cleared.snap, "after a sub-issue is added, a blocker added and one closed, and a parent changed, the cached snapshot matches one with the cache cleared");
assert.deepEqual(changed.snap, bareChanged.snap, "and matches the per-ticket reads");
const changedBy = Object.fromEntries(changed.snap.tickets.map((t) => [t.number, t]));
assert.deepEqual([changedBy[104].parent, changedBy[105].parent, changedBy[103].blockers.map((b) => b.number), changedBy[104].blockers.map((b) => [b.number, b.state])], [101, 102, [104], [[101, "closed"]]]);

{
  const cache = run.conditionalCache(freshDir("race"));
  cache.set("k", "W/\"1\"", [{ number: 1 }]);
  cache.set("k", "W/\"2\"", [{ number: 2 }]);
  assert.deepEqual(cache.get("k"), { key: "k", etag: "W/\"2\"", body: [{ number: 2 }] }, "a later write replaces the entry whole");
  assert.equal(cache.get("other"), null);
  assert.deepEqual(fs.readdirSync(freshDir("race")).filter((f) => f.endsWith(".tmp")), [], "writes leave no temporary files");
}

{
  const fake = fakeGh(gh);
  const client = run.githubClient({ repository: REPO }, tmp, { run: fake.exec, parallel: fake.parallel, cache: run.conditionalCache(freshDir("cli")) });
  assert.equal(client.allowance(), null, "nothing is known before a read");
  assert.equal(client.allowance(ROOT).remaining, 4899, "the allowance read takes the remaining count from a sub_issues read");
  assert.equal(subIssueCalls(fake.calls).length, 1);
}

{
  const exhausted = (cmd, args) => {
    if (args[1] !== "-i") throw new Error(`unexpected gh call: ${args.join(" ")}`);
    const error = new Error("gh: API rate limit exceeded (HTTP 403)");
    error.stdout = "HTTP/2.0 403 Forbidden\r\nX-Ratelimit-Limit: 5000\r\nX-Ratelimit-Remaining: 0\r\nX-Ratelimit-Used: 5000\r\nX-Ratelimit-Reset: 1795118245\r\n\r\n{\"message\":\"API rate limit exceeded\"}";
    throw error;
  };
  const client = run.githubClient({ repository: REPO }, tmp, { run: exhausted, parallel: () => [], cache: run.conditionalCache(freshDir("exhausted")) });
  assert.deepEqual(client.allowance(ROOT), { remaining: 0, used: 5000, limit: 5000, reset: 1795118245, resetsAt: new Date(1795118245 * 1000).toISOString() }, "an exhausted allowance still reports its reset time");
  assert.throws(() => client.subIssues(ROOT), /rate limit exceeded/, "a snapshot read still fails on the 403");
  const silent = run.githubClient({ repository: REPO }, tmp, { run: () => { throw new Error("gh: network down"); }, parallel: () => [], cache: run.conditionalCache(freshDir("silent")) });
  assert.throws(() => silent.allowance(ROOT), /network down/, "a failure with no allowance headers is reported, not hidden");
}

{
  const fake = fakeGh(gh);
  const bodies = ["## Acceptance criteria\n\n- [ ] A.\n", "## Acceptance criteria\n\n- [ ] A.\n- [ ] B.\n"];
  const scopeWith = (bodyAt) => {
    let reads = 0;
    const client = run.githubClient({ repository: REPO }, tmp, { run: fake.exec, parallel: fake.parallel, cache: run.conditionalCache(freshDir("scope")) });
    return run.readIssueScope({ issue: ROOT }, { ...client, issue: (n) => ({ ...client.issue(n), body: n === ROOT ? bodyAt(reads++) : "" }) });
  };
  const edited = scopeWith((i) => bodies[Math.min(i, 1)]);
  const settled = scopeWith(() => bodies[1]);
  assert.equal(edited.acceptanceSha256, settled.acceptanceSha256, "a criteria edit made while the tree is walked is in the scope's acceptance hash");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("snapshot-reads: ok");
