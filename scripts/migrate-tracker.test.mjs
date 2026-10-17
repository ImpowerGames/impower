// Unit tests for scripts/migrate-tracker.mjs: the reference rewrite rules,
// the transfer order, journal resume after a crash at each step, restore and
// verify against an in-memory tracker that drops what a transfer may drop,
// and the pacer's budgets.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readRepos } from "../.agents/repos.mjs";
import {
  Journal,
  Pacer,
  awaitSettle,
  bareRefs,
  bareResolver,
  closingRefs,
  closingResolver,
  ghClient,
  main,
  migrationLine,
  parseArgs,
  rewriteBareRefs,
  rewriteClosingRefs,
  runRehearsal,
  runRestore,
  runRewrite,
  runTransfer,
  runVerify,
  summarize,
  takeSnapshot,
  transferMap,
} from "./migrate-tracker.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repos = { code: "Org/code", internal: "Org/internal", autolinkPrefix: "I-", cutover: false };
const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), "migrate-tracker-"));

// ---------------------------------------------------------------------------
// Rewrite rules

const map = new Map([
  [12, 3],
  [3, 7],
  [40, 41],
]);
const snap = { pullRequests: [{ number: 20 }], kept: [25] };
const resolve = bareResolver(snap, map, repos);
const rw = (s) => rewriteBareRefs(s, resolve);

test("a bare reference to a migrated ticket takes its new number, a pull request or kept issue is qualified", () => {
  assert.equal(rw("See #12, #20 and #25."), "See #3, Org/code#20 and Org/code#25.");
  assert.equal(rw("#12 at the start\n(#40) [#3] {#12}"), "#3 at the start\n(#41) [#7] {#3}");
  assert.equal(rw("a number the code repository never had: #999"), "a number the code repository never had: #999");
});

test("the rewrite maps every reference once, from the old numbers, even when a new number is another old one", () => {
  // 12 -> 3 and 3 -> 7: a sequential replace would turn #12 into #7.
  assert.equal(rw("#12 then #3"), "#3 then #7");
});

test("references inside code spans, fences and code elements are left alone", () => {
  assert.equal(rw("`#12` and #12"), "`#12` and #3");
  assert.equal(rw("``a ` #12`` #12"), "``a ` #12`` #3");
  assert.equal(rw("```\n#12\n```\n#12"), "```\n#12\n```\n#3");
  assert.equal(rw("~~~sd\n#12\n~~~\n#12"), "~~~sd\n#12\n~~~\n#3");
  assert.equal(rw("````\n```\n#12\n````\n#12"), "````\n```\n#12\n````\n#3", "a shorter fence does not close a longer one");
  assert.equal(rw("- item\n  ```\n  #12\n  ```\n> ```\n> #40\n> ```\n#12"), "- item\n  ```\n  #12\n  ```\n> ```\n> #40\n> ```\n#3", "fences in list items and quotes");
  assert.equal(rw("```\n#12 in an unclosed fence"), "```\n#12 in an unclosed fence");
  assert.equal(rw("<code>#12</code> <pre>\n#12\n</pre> #12"), "<code>#12</code> <pre>\n#12\n</pre> #3");
  assert.equal(rw("```js\r\n#12\r\n```\r\n#12"), "```js\r\n#12\r\n```\r\n#3", "CRLF line ends");
});

test("an unmatched backtick and a span broken by a blank line do not hide what follows", () => {
  assert.equal(rw("a ` stray #12"), "a ` stray #3");
  assert.equal(rw("`open\n\n#12 `"), "`open\n\n#3 `");
});

test("qualified, word-joined, URL, entity and escaped forms are not bare references", () => {
  const text = "Org/code#12 other/repo#12 word#12 https://x.test/page#12 &#12; \x5c#12 #12abc #12";
  assert.equal(rw(text), "Org/code#12 other/repo#12 word#12 https://x.test/page#12 &#12; \x5c#12 #12abc #3");
  assert.deepEqual(bareRefs(text), [12]);
});

test("link destinations and written-out URLs keep their fragments", () => {
  assert.equal(rw("https://example.com/?q=#12 and #12"), "https://example.com/?q=#12 and #3");
  assert.equal(rw("[section](#12) and [#12](https://x.test/#12) (#12)"), "[section](#12) and [#3](https://x.test/#12) (#3)", "link text and a parenthesised reference still map");
  assert.equal(rw('[docs](#12 "title") then #40'), '[docs](#12 "title") then #41');
  assert.equal(rw("[ref]: #12\n\nsee #12"), "[ref]: #12\n\nsee #3", "a link reference definition");
  assert.deepEqual(bareRefs("<https://x.test/#12> (#40)"), [40]);
});

test("the migration line names the old repository, so the rewrite leaves it", () => {
  const line = migrationLine(repos, { number: 12, state: "closed", closedAt: "2026-09-03T10:00:00Z" });
  assert.equal(line, "Migrated from Org/code#12; originally closed 2026-09-03");
  assert.equal(rw(line), line);
  assert.equal(migrationLine(repos, { number: 12, state: "open", closedAt: null }), "Migrated from Org/code#12");
});

test("closing lines on a public pull request are rewritten to the internal repository", () => {
  const closing = closingResolver(map, repos);
  const body = [
    "Summary mentioning #12.",
    "",
    "Closes #12",
    "fixes: Org/code#40",
    "Resolves https://github.com/Org/code/issues/3",
    "Closes #25",
    "Closes other/repo#12",
    "`Closes #12`",
  ].join("\n");
  assert.equal(
    rewriteClosingRefs(body, closing),
    ["Summary mentioning #12.", "", "Closes Org/internal#3", "fixes: Org/internal#41", "Resolves Org/internal#7", "Closes #25", "Closes other/repo#12", "`Closes #12`"].join("\n"),
  );
  assert.deepEqual(closingRefs("Closes #4 and fixed Org/x#5\n```\nCloses #6\n```"), [
    { repo: null, number: 4 },
    { repo: "Org/x", number: 5 },
  ]);
});

// ---------------------------------------------------------------------------
// An in-memory tracker

/**
 * Holds issues per repository in REST shape. Transfer moves an issue to the
 * destination with the next number, refuses a closed one as GitHub does, and
 * leaves a redirect at the old address. `drops` lists what transfer loses:
 * any of type, parent, blockedBy, projects, fields, labels, milestone.
 */
function fakeTracker({ drops = [] } = {}) {
  const repo = (name) => ({ name, issues: new Map(), next: 1, comments: [], labels: [], milestones: [], redirects: new Map() });
  const repos_ = new Map([
    ["org/code", repo("Org/code")],
    ["org/internal", repo("Org/internal")],
  ]);
  const at = (name) => repos_.get(name.toLowerCase());
  const calls = [];
  const fail = { on: null };
  const items = new Map(); // project -> [{ id, issueId, repo, number, status }]
  let ids = 1000;
  const url = (name, n) => `https://api.github.com/repos/${name}/issues/${n}`;
  const maybeFail = (op, arg) => {
    calls.push([op, arg]);
    if (fail.on && fail.on(op, arg)) {
      fail.on = null;
      throw new Error(`injected failure in ${op}`);
    }
  };
  const view = (r, issue) => {
    const children = [...r.issues.values()].filter((i) => i.parent === `${r.name}#${issue.number}`).length;
    return {
      ...structuredClone(issue.rest),
      number: issue.number,
      repository_url: `https://api.github.com/repos/${r.name}`,
      parent_issue_url: issue.parent ? url(...issue.parent.split("#")) : null,
      sub_issues_summary: { total: children + issue.foreignChildren.length },
      issue_dependencies_summary: { total_blocked_by: issue.blockedBy.length },
      issue_field_values: issue.fields.map((f) => ({ issue_field_id: f.fieldId, issue_field_name: f.name, single_select_option: { name: f.value } })),
      comments: r.comments.filter((c) => c.number === issue.number).length,
    };
  };
  const find = (name, n) => {
    const r = at(name);
    const issue = r.issues.get(n);
    if (issue) return { r, issue };
    const moved = r.redirects.get(n);
    if (moved) return find(...moved);
    const error = new Error(`404 ${name}#${n}`);
    error.status = 404;
    throw error;
  };
  const byId = (id) => {
    for (const r of repos_.values()) for (const issue of r.issues.values()) if (issue.rest.id === id) return { r, issue };
    throw new Error(`no issue with id ${id}`);
  };
  const tracker = {
    calls,
    fail,
    items,
    late: false,
    pendingRewrite: new Map(),
    add(name, n, rest, extra = {}) {
      const r = at(name);
      r.issues.set(n, { number: n, rest: { id: ids++, title: `issue ${n}`, body: `body of ${n}`, state: "open", state_reason: null, closed_at: null, labels: [], assignees: [], milestone: null, type: null, author_association: "MEMBER", user: { login: "member" }, ...rest }, parent: null, blockedBy: [], fields: [], foreignChildren: [], ...extra });
      r.next = Math.max(r.next, n + 1);
      return r.issues.get(n);
    },
    raw: (name, n) => find(name, n).issue,
    commentStore: (name) => at(name).comments,
    async getRepo() {
      return {};
    },
    async listIssues(name) {
      const r = at(name);
      return [...r.issues.values()].map((i) => view(r, i));
    },
    async getIssue(name, n) {
      const { r, issue } = find(name, n);
      return view(r, issue);
    },
    async findIssue(name, n) {
      try {
        return await tracker.getIssue(name, n);
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    },
    async updateIssue(name, n, fields) {
      maybeFail("updateIssue", `${name}#${n}`);
      const { issue } = find(name, n);
      const rest = issue.rest;
      // GitHub applies state_reason only when the state changes.
      if (fields.state === "open" && rest.state !== "open") Object.assign(rest, { state: "open", state_reason: "reopened", closed_at: null });
      if (fields.state === "closed" && rest.state !== "closed") Object.assign(rest, { state: "closed", state_reason: fields.state_reason ?? "completed", closed_at: "2026-10-17T00:00:00Z" });
      if ("body" in fields) rest.body = fields.body;
      if ("title" in fields) rest.title = fields.title;
      if ("type" in fields) rest.type = fields.type ? { name: fields.type } : null;
      if ("labels" in fields) rest.labels = fields.labels.map((name_) => ({ name: name_ }));
      if ("assignees" in fields) rest.assignees = fields.assignees.map((login) => ({ login }));
      if ("milestone" in fields) rest.milestone = fields.milestone === null ? null : { title: at(name).milestones.find((m) => m.number === fields.milestone).title };
      const key = `${at(name).name}#${n}`;
      if (tracker.pendingRewrite.has(key)) {
        rest.body = tracker.pendingRewrite.get(key);
        tracker.pendingRewrite.delete(key);
      }
      return view(at(name), issue);
    },
    async transferIssue(name, n, dest) {
      const { r, issue } = find(name, n);
      if (issue.rest.state !== "open") throw new Error("GitHub transfers only open issues");
      const d = at(dest);
      const number = d.next++;
      const moved = { ...issue, number, rest: { ...issue.rest } };
      if (drops.includes("type")) moved.rest.type = null;
      if (drops.includes("labels")) moved.rest.labels = moved.rest.labels.filter((l) => d.labels.some((x) => x.name === l.name));
      if (drops.includes("milestone")) moved.rest.milestone = null;
      if (drops.includes("blockedBy")) moved.blockedBy = [];
      if (drops.includes("fields")) moved.fields = [];
      if (drops.includes("parent")) moved.parent = null;
      // GitHub gives the moved issue and its comments new ids, and writes
      // each bare reference as a qualified one: to the destination for an
      // issue that already moved, to the source otherwise.
      const oldId = issue.rest.id;
      moved.rest.id = ids++;
      const qualify = (text) =>
        text
          .split(/(`[^`]*`)/)
          .map((part, k) =>
            k % 2
              ? part
              : part.replace(/(^|[\s(])#(\d+)(?!\w)/g, (all, lead, m) => {
                  const ref = Number(m);
                  if (ref === n) return `${lead}${d.name}#${number}`;
                  const there = r.redirects.get(ref);
                  if (there) return `${lead}${at(there[0]).name}#${there[1]}`;
                  return r.issues.has(ref) ? `${lead}${r.name}#${ref}` : all;
                }),
          )
          .join("");
      moved.rest.body = qualify(moved.rest.body ?? "");
      r.issues.delete(n);
      r.redirects.set(n, [dest, number]);
      d.issues.set(number, moved);
      for (const other of [...r.issues.values(), ...d.issues.values()]) {
        if (other.parent === `${r.name}#${n}`) other.parent = drops.includes("parent") ? null : `${d.name}#${number}`;
        other.blockedBy = other.blockedBy.map((b) => (b === `${r.name}#${n}` ? `${d.name}#${number}` : b));
      }
      for (const list of items.values()) {
        for (const item of list) if (item.issueId === oldId) Object.assign(item, { issueId: moved.rest.id, repo: d.name, number });
        if (drops.includes("projects")) list.splice(0, list.length, ...list.filter((item) => item.issueId !== moved.rest.id));
      }
      for (const c of r.comments.filter((c) => c.number === n)) {
        r.comments.splice(r.comments.indexOf(c), 1);
        d.comments.push({ ...c, id: ids++, number, body: qualify(c.body) });
      }
      // With `late`, the transfer's background rewrite of the body lands after
      // the next edit of the moved issue and undoes it.
      if (tracker.late) tracker.pendingRewrite.set(`${d.name}#${number}`, moved.rest.body);
      // The step's own failure comes after the move, as a lost response would.
      maybeFail("transferIssue", `${name}#${n}`);
      return { number };
    },
    async subIssues(name, n) {
      const r = at(name);
      return [...r.issues.values()].filter((i) => i.parent === `${r.name}#${n}`).map((i) => view(r, i));
    },
    async addSubIssue(name, parent, childId) {
      maybeFail("addSubIssue", `${name}#${parent}`);
      byId(childId).issue.parent = `${at(name).name}#${parent}`;
    },
    async blockedBy(name, n) {
      const { issue } = find(name, n);
      return issue.blockedBy.map((ref) => tracker.getIssueSync(ref));
    },
    getIssueSync(ref) {
      const [name, n] = ref.split("#");
      const { r, issue } = find(name, Number(n));
      return view(r, issue);
    },
    async addBlockedBy(name, n, blockerId) {
      maybeFail("addBlockedBy", `${name}#${n}`);
      const blocker = byId(blockerId);
      find(name, n).issue.blockedBy.push(`${blocker.r.name}#${blocker.issue.number}`);
    },
    async setIssueFields(name, n, values) {
      maybeFail("setIssueFields", `${name}#${n}`);
      const { issue } = find(name, n);
      for (const v of values) {
        issue.fields = issue.fields.filter((f) => f.fieldId !== v.field_id);
        issue.fields.push({ fieldId: v.field_id, name: v.field_id === 1 ? "Effort" : "Priority", value: v.value });
      }
    },
    async projectFields(p) {
      return [{ id: 100 + p, name: "Status", data_type: "single_select", options: [{ id: "todo", name: { raw: "Todo" } }, { id: "done", name: { raw: "Done" } }] }];
    },
    async projectItems(p) {
      return (items.get(p) ?? []).map((item) => ({ id: item.id, content_type: "Issue", content: { id: item.issueId, number: item.number, repository_url: `https://api.github.com/repos/${item.repo}` }, archived_at: null, fields: item.status ? [{ id: 100 + p, value: { id: item.status.toLowerCase(), name: { raw: item.status } } }] : [] }));
    },
    async addProjectItem(p, issueId) {
      maybeFail("addProjectItem", p);
      const { r, issue } = byId(issueId);
      const item = { id: ids++, issueId, repo: r.name, number: issue.number, status: null };
      items.set(p, [...(items.get(p) ?? []), item]);
      return { id: item.id };
    },
    async setProjectItemField(p, itemId, fieldId, value) {
      const item = items.get(p).find((i) => i.id === itemId);
      item.status = value === null ? null : value === "todo" ? "Todo" : "Done";
    },
    async labels(name) {
      return at(name).labels;
    },
    async createLabel(name, label) {
      at(name).labels.push(label);
      return label;
    },
    async milestones(name) {
      return at(name).milestones;
    },
    async createMilestone(name, m) {
      const made = { ...m, number: at(name).milestones.length + 1 };
      at(name).milestones.push(made);
      return made;
    },
    async repoComments(name) {
      const r = at(name);
      return r.comments.map((c) => ({ id: c.id, body: c.body, created_at: c.created_at ?? `2026-01-01T00:00:${String(c.seq ?? 0).padStart(2, "0")}Z`, user: { login: c.author ?? "member" }, issue_url: url(r.name, c.number) }));
    },
    async issueComments(name, n) {
      return (await tracker.repoComments(name)).filter((c) => c.issue_url.endsWith(`/issues/${n}`));
    },
    async updateComment(name, id, body) {
      maybeFail("updateComment", id);
      at(name).comments.find((c) => c.id === id).body = body;
    },
    pulls: [],
    async openPulls() {
      return tracker.pulls;
    },
    async updatePull(name, n, body) {
      tracker.pulls.find((p) => p.number === n).body = body;
    },
    // GitHub's own computation, independent of the tool's parser: each
    // closing keyword's reference resolved to the issue it names now (a
    // moved issue at its new address), pull requests and unknown numbers
    // dropped. `computed` overrides it per pull request.
    computed: new Map(),
    async closingRefs(name, n) {
      if (tracker.computed.has(n)) return tracker.computed.get(n);
      const out = [];
      for (const m of tracker.pulls.find((p) => p.number === n).body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)/gi)) {
        try {
          const { r, issue } = find(m[1] ?? name, Number(m[2]));
          if (!issue.rest.pull_request) out.push({ repo: r.name, number: issue.number });
        } catch {
          // An unknown number closes nothing.
        }
      }
      return out;
    },
    async createIssue(name, fields) {
      maybeFail("createIssue", fields.title);
      const r = at(name);
      const n = r.next;
      const milestone = fields.milestone ? { title: r.milestones.find((m) => m.number === fields.milestone).title } : null;
      tracker.add(name, n, { title: fields.title, body: fields.body ?? "", type: fields.type ? { name: fields.type } : null, labels: (fields.labels ?? []).map((l) => ({ name: l })), assignees: (fields.assignees ?? []).map((login) => ({ login })), milestone });
      // A lost response: the issue exists, the caller hears nothing.
      if (tracker.loseCreate?.(fields.title)) {
        tracker.loseCreate = null;
        throw new Error("injected lost response after the issue was created");
      }
      return view(r, r.issues.get(n));
    },
    async issuesSince(name) {
      return tracker.listIssues(name);
    },
    async createComment(name, n, body) {
      at(name).comments.push({ id: ids++, number: n, body, seq: at(name).comments.length });
    },
    async deleteIssue(name, n) {
      maybeFail("deleteIssue", `${name}#${n}`);
      const { r } = find(name, n);
      r.issues.delete(n);
      r.comments = r.comments.filter((c) => c.number !== n);
    },
    async orgIssueFields() {
      return [{ id: 1, name: "Effort", data_type: "single_select", options: [{ name: "Low" }, { name: "High" }] }];
    },
    async latestPull() {
      return { number: 3, state: "closed" };
    },
    async currentUser() {
      return { login: "member" };
    },
  };
  return tracker;
}

/** Five internal issues, one outsider issue and a pull request, with links, Projects and fields. */
function seed(tracker) {
  tracker.add("Org/code", 1, { type: { name: "Feature" }, labels: [{ name: "area" }], milestone: { title: "M1" } });
  tracker.add("Org/code", 2, { author_association: "NONE", user: { login: "outsider" }, state: "closed", state_reason: "completed", closed_at: "2022-04-01T00:00:00Z" });
  tracker.add("Org/code", 3, { pull_request: {} });
  tracker.add("Org/code", 4, { type: { name: "Task" }, state: "closed", state_reason: "not_planned", closed_at: "2026-09-03T10:00:00Z", body: "Part of #1; see #3 and `#1`." }, { parent: "Org/code#1", fields: [{ fieldId: 1, name: "Effort", value: "Low" }] });
  tracker.add("Org/code", 5, { type: { name: "Bug" }, assignees: [{ login: "member" }] }, { blockedBy: ["Org/code#4"], fields: [{ fieldId: 1, name: "Effort", value: "High" }, { fieldId: 2, name: "Priority", value: "Medium" }] });
  tracker.add("Org/code", 6, { type: { name: "Task" }, state: "closed", state_reason: null, closed_at: "2025-01-02T00:00:00Z", body: "Duplicate of #5" });
  tracker.items.set(8, [{ id: 1, issueId: tracker.raw("Org/code", 5).rest.id, repo: "Org/code", number: 5, status: "Todo" }]);
  tracker.items.set(1, [{ id: 2, issueId: tracker.raw("Org/code", 1).rest.id, repo: "Org/code", number: 1, status: null }]);
  tracker.add("Org/code", 7, { type: { name: "Task" } });
  tracker.createLabel("Org/code", { name: "area", color: "ededed", description: "" });
  tracker.createMilestone("Org/code", { title: "M1", state: "open", description: "" });
  return tracker;
}

async function seeded({ drops } = {}) {
  const tracker = fakeTracker({ drops });
  seed(tracker);
  return tracker;
}

// ---------------------------------------------------------------------------
// Snapshot

test("the snapshot keeps outsider-filed issues public and leaves pull requests out", async () => {
  const tracker = await seeded();
  const snapshot = await takeSnapshot(tracker, repos);
  assert.deepEqual(snapshot.issues.map((i) => i.number), [1, 4, 5, 6, 7]);
  assert.deepEqual(snapshot.kept, [2]);
  assert.deepEqual(snapshot.pullRequests.map((p) => p.number), [3]);
  const four = snapshot.issues.find((i) => i.number === 4);
  assert.equal(four.parent, "Org/code#1");
  assert.deepEqual(four.fields, [{ name: "Effort", fieldId: 1, value: "Low" }]);
  assert.deepEqual(snapshot.issues.find((i) => i.number === 1).children, ["Org/code#4"]);
  assert.deepEqual(snapshot.issues.find((i) => i.number === 5).blockedBy.map((b) => b.ref), ["Org/code#4"]);
  assert.deepEqual(snapshot.issues.find((i) => i.number === 5).projects.map((p) => [p.project, p.status]), [[8, "Todo"]]);
  const summary = summarize(snapshot);
  assert.equal(summary.migrate, 5);
  assert.equal(summary.keep, 1);
  assert.deepEqual(summary.byState, { closed: 2, open: 3 });
  assert.deepEqual(summary.byType, { Bug: 1, Feature: 1, Task: 3 });
});

// ---------------------------------------------------------------------------
// Transfer

async function transferred(tracker, dir, { snapshot } = {}) {
  snapshot ??= await takeSnapshot(tracker, repos);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runTransfer({ tracker, repos, snapshot, journal });
  return { snapshot, journal };
}

test("transfer runs in ascending old number, reopens a closed issue first and closes it again with its reason", async () => {
  const tracker = await seeded();
  // The transfer's background body rewrite lands after the next edit: the
  // migration line must already be on the body by then.
  tracker.late = true;
  const snapshot = await takeSnapshot(tracker, repos);
  snapshot.issues.reverse();
  const dir = scratch();
  const { journal } = await transferred(tracker, dir, { snapshot });
  const transfers = tracker.calls.filter(([op]) => op === "transferIssue").map(([, arg]) => arg);
  assert.deepEqual(transfers, ["Org/code#1", "Org/code#4", "Org/code#5", "Org/code#6", "Org/code#7"]);
  assert.deepEqual([...transferMap(journal)], [[1, 1], [4, 2], [5, 3], [6, 4], [7, 5]], "new numbers keep the old order");
  const reopenBeforeTransfer = tracker.calls.findIndex(([op, arg]) => op === "updateIssue" && arg === "Org/code#4") < tracker.calls.findIndex(([op, arg]) => op === "transferIssue" && arg === "Org/code#4");
  assert.ok(reopenBeforeTransfer);
  const four = tracker.raw("Org/internal", 2).rest;
  assert.equal(four.state, "closed");
  assert.equal(four.state_reason, "not_planned");
  assert.ok(four.body.endsWith("\n\nMigrated from Org/code#4; originally closed 2026-09-03"), "the line survives the late body rewrite");
  assert.equal(four.body, "Part of Org/internal#1; see Org/code#3 and `#1`.\n\nMigrated from Org/code#4; originally closed 2026-09-03", "the transfer qualified the bare references");
  assert.equal(tracker.raw("Org/internal", 4).rest.state_reason, "completed", "a closed issue without a reason closes as completed");
  assert.equal(tracker.raw("Org/internal", 1).rest.body, "body of 1\n\nMigrated from Org/code#1");
  assert.equal(tracker.raw("Org/code", 2).rest.author_association, "NONE", "the outsider issue stays");
});

for (const [label, failure] of [
  ["after the reopen", (op, arg) => op === "updateIssue" && arg === "Org/code#4"],
  ["after the transfer, before its record", (op, arg) => op === "transferIssue" && arg === "Org/code#4"],
  ["at the closing edit", (op, arg) => op === "updateIssue" && arg === "Org/internal#2"],
]) {
  test(`a transfer interrupted ${label} resumes without repeating a step`, async () => {
    const tracker = await seeded();
    const dir = scratch();
    const snapshot = await takeSnapshot(tracker, repos);
    tracker.fail.on = failure;
    // The reopen's failure is injected after GitHub applied it: reopen it first so the state matches.
    if (label === "after the reopen") {
      const original = tracker.updateIssue;
      tracker.updateIssue = async (name, n, fields) => {
        if (name === "Org/code" && n === 4) {
          tracker.fail.on = null;
          tracker.updateIssue = original;
          await original(name, n, fields);
          throw new Error("injected failure after the reopen landed");
        }
        return original(name, n, fields);
      };
    }
    await assert.rejects(transferred(tracker, dir, { snapshot }), /injected failure/);
    const before = new Journal(path.join(dir, "journal.jsonl"));
    assert.ok(!before.of("transfer").some((r) => r.old === 5), "the run stopped at the failing issue");
    await transferred(tracker, dir, { snapshot });
    const journal = new Journal(path.join(dir, "journal.jsonl"));
    assert.deepEqual([...transferMap(journal)], [[1, 1], [4, 2], [5, 3], [6, 4], [7, 5]]);
    assert.equal(tracker.calls.filter(([op, arg]) => op === "transferIssue" && arg === "Org/code#4").length, 1, "issue 4 moved once");
    for (const n of [1, 2, 3, 4, 5]) {
      const body = tracker.raw("Org/internal", n).rest.body;
      assert.equal(body.split("Migrated from").length, 2, `one migration line on new #${n}`);
    }
    assert.equal(tracker.raw("Org/internal", 2).rest.state, "closed");
    // A third run finds everything finished and calls nothing.
    const calls = tracker.calls.length;
    await transferred(tracker, dir, { snapshot });
    assert.equal(tracker.calls.length, calls);
  });
}

test("a resumed transfer reopens and recloses an issue closed with the wrong reason", async () => {
  const tracker = await seeded();
  const dir = scratch();
  const snapshot = await takeSnapshot(tracker, repos);
  // Issue 4 (closed as not planned) moved, then the run died; something closed it as completed since.
  tracker.fail.on = (op, arg) => op === "transferIssue" && arg === "Org/code#4";
  await assert.rejects(transferred(tracker, dir, { snapshot }), /injected failure/);
  tracker.raw("Org/internal", 2).rest.state = "closed";
  tracker.raw("Org/internal", 2).rest.state_reason = "completed";
  await transferred(tracker, dir, { snapshot });
  assert.equal(tracker.raw("Org/internal", 2).rest.state_reason, "not_planned");
  assert.ok(tracker.calls.some(([op, arg]) => op === "updateIssue" && arg === "Org/internal#2"));
});

test("a transfer that cannot set the original reason stops without marking the issue finished", async () => {
  const tracker = await seeded();
  const dir = scratch();
  const snapshot = await takeSnapshot(tracker, repos);
  const updateIssue = tracker.updateIssue;
  tracker.updateIssue = async (name, n, fields) => {
    const result = await updateIssue(name, n, fields);
    if (name === "Org/internal" && fields.state === "closed") tracker.raw(name, n).rest.state_reason = "completed";
    return name === "Org/internal" && fields.state === "closed" ? { ...result, state_reason: "completed" } : result;
  };
  await assert.rejects(transferred(tracker, dir, { snapshot }), /not marking Org\/code#4 finished/);
  assert.ok(!new Journal(path.join(dir, "journal.jsonl")).of("transfer").some((r) => r.old === 4 && r.step === "finished"));
});

test("a dry-run transfer plans from the snapshot and calls nothing", async () => {
  const tracker = await seeded();
  const snapshot = await takeSnapshot(tracker, repos);
  const calls = tracker.calls.length;
  const plan = await runTransfer({ tracker, repos, snapshot, journal: { of: () => [], append: () => assert.fail("journaled") }, dryRun: true });
  assert.equal(tracker.calls.length, calls);
  assert.deepEqual({ pending: plan.pending, reopenAndClose: plan.reopenAndClose, first: plan.first, last: plan.last }, { pending: 5, reopenAndClose: 2, first: 1, last: 7 });
  assert.deepEqual(plan.requests, { reads: 7, writes: 12 });
});

test("an issue closed since the snapshot stops the transfer", async () => {
  const tracker = await seeded();
  const snapshot = await takeSnapshot(tracker, repos);
  tracker.raw("Org/code", 1).rest.state = "closed";
  await assert.rejects(transferred(tracker, scratch(), { snapshot }), /open in the snapshot and is closed now/);
});

// ---------------------------------------------------------------------------
// Restore and verify

test("verify finds what transfer dropped, restore re-applies it, and verify then passes", async () => {
  const tracker = await seeded({ drops: ["type", "labels", "milestone", "parent", "blockedBy", "projects", "fields"] });
  const dir = scratch();
  const { snapshot, journal } = await transferred(tracker, dir);
  snapshot.kind = "rehearsal";
  const before = await runVerify({ tracker, repos, snapshot, journal });
  const fields = new Set(before.map((d) => d.field));
  for (const f of ["type", "labels", "milestone", "parent", "children", "blockedBy", "projects", "fields"]) assert.ok(fields.has(f), `verify reports ${f}`);

  const plan = await runRestore({ tracker, repos, snapshot, journal, dryRun: true });
  assert.ok(plan.dryRun);
  assert.equal(tracker.calls.filter(([op]) => ["addSubIssue", "addBlockedBy", "addProjectItem", "setIssueFields"].includes(op)).length, 0, "a dry run writes nothing");

  const restored = await runRestore({ tracker, repos, snapshot, journal });
  assert.deepEqual(restored.unrestorable, [], "the parent's lost child comes back through the child's own parent link");
  assert.equal(tracker.raw("Org/internal", 2).parent, "Org/internal#1");
  assert.deepEqual(tracker.raw("Org/internal", 3).blockedBy, ["Org/internal#2"]);
  assert.deepEqual((await tracker.labels("Org/internal")).map((l) => l.name), ["area"], "a missing label is created by name");
  assert.deepEqual((await runVerify({ tracker, repos, snapshot, journal })).map((d) => d.field), ["text of body:2", "text of body:4"], "only the rewrite is left");
  await runRewrite({ tracker, repos, snapshot, journal });
  assert.deepEqual(await runVerify({ tracker, repos, snapshot, journal }), []);

  // A second restore finds nothing left to do.
  const writes = tracker.calls.length;
  const again = await runRestore({ tracker, repos, snapshot, journal });
  assert.equal(again.issues, 0);
  assert.equal(tracker.calls.length, writes);
});

test("verify compares title, author and creation time, and restore puts a title back", async () => {
  const tracker = await seeded();
  tracker.raw("Org/code", 7).rest.created_at = "2026-01-02T03:04:05Z";
  const dir = scratch();
  const { snapshot, journal } = await transferred(tracker, dir);
  await runRewrite({ tracker, repos, snapshot, journal });
  const seven = tracker.raw("Org/internal", 5).rest;
  Object.assign(seven, { title: "renamed", user: { login: "someone" }, created_at: "2026-10-17T00:00:00Z" });
  assert.deepEqual((await runVerify({ tracker, repos, snapshot, journal })).map((d) => d.field), ["title", "author", "createdAt"]);
  const restored = await runRestore({ tracker, repos, snapshot, journal });
  assert.equal(seven.title, "issue 7");
  assert.deepEqual(restored.unrestorable.map((u) => u.field), ["author", "createdAt"]);
});

test("restore clears a value the original lacked and names what it cannot restore", async () => {
  const tracker = await seeded();
  // Issue 1 is in Project 1 with no Status; issue 7 has no type... once the snapshot says so.
  const dir = scratch();
  const snapshot = await takeSnapshot(tracker, repos);
  snapshot.issues.find((i) => i.number === 7).type = null;
  snapshot.issues.find((i) => i.number === 5).projects[0].archived = true;
  const { journal } = await transferred(tracker, dir, { snapshot });
  tracker.items.get(1)[0].status = "Todo";
  const restored = await runRestore({ tracker, repos, snapshot, journal });
  assert.equal(tracker.raw("Org/internal", 5).rest.type, null, "the type is cleared");
  assert.equal(tracker.items.get(1)[0].status, null, "the Status is cleared");
  assert.deepEqual(restored.unrestorable.map((u) => [u.old, u.field]), [[5, "projects"]], "an archived item it cannot archive is named");
  assert.match(restored.unrestorable[0].reason, /cannot archive/);
});

test("restore and rewrite refuse until every snapshot issue is transferred", async () => {
  const tracker = await seeded();
  const snapshot = await takeSnapshot(tracker, repos);
  const journal = new Journal(path.join(scratch(), "journal.jsonl"));
  await assert.rejects(runRestore({ tracker, repos, snapshot, journal }), /needs every snapshot issue transferred/);
  await assert.rejects(runRewrite({ tracker, repos, snapshot, journal }), /needs every snapshot issue transferred/);
});

// ---------------------------------------------------------------------------
// Rewrite

test("rewrite sets bodies and comments from the snapshot's originals, once, through an interruption and a late transfer rewrite", async () => {
  const tracker = await seeded();
  // Comments on the code repository, which transfer moves with new ids and qualified references.
  tracker.commentStore("Org/code").push(
    { id: 501, number: 5, body: "Blocked by #4; see #2 and #3." },
    { id: 502, number: 7, body: "```\n#1\n```\nmoved from #1; #6 duplicates #5" },
  );
  const dir = scratch();
  const { snapshot, journal } = await transferred(tracker, dir);
  const comment = (n) => tracker.commentStore("Org/internal").find((c) => c.number === n);
  assert.equal(comment(3).body, "Blocked by Org/internal#2; see Org/code#2 and Org/code#3.", "the transfer qualified the comment");
  assert.notEqual(comment(3).id, 501, "and gave it a new id");

  // Old 4 -> new 2, 5 -> 3, 6 -> 4, 7 -> 5: mapping #5 twice would land on a wrong ticket.
  const updateComment = tracker.updateComment;
  tracker.updateComment = async (name, id, body) => {
    if (id === comment(5).id && !tracker.failedOnce) {
      tracker.failedOnce = true;
      await updateComment(name, id, body);
      throw new Error("injected failure after the edit landed");
    }
    return updateComment(name, id, body);
  };
  await assert.rejects(runRewrite({ tracker, repos, snapshot, journal }), /injected failure/);
  await runRewrite({ tracker, repos, snapshot, journal: new Journal(path.join(dir, "journal.jsonl")) });
  const body = (n) => tracker.raw("Org/internal", n).rest.body;
  assert.equal(body(2), "Part of #1; see Org/code#3 and `#1`.\n\nMigrated from Org/code#4; originally closed 2026-09-03");
  assert.equal(body(4), "Duplicate of #3\n\nMigrated from Org/code#6; originally closed 2025-01-02");
  assert.equal(comment(3).body, "Blocked by #2; see Org/code#2 and Org/code#3.");
  assert.equal(comment(5).body, "```\n#1\n```\nmoved from #1; #4 duplicates #3", "mapped once, from the original");
  assert.deepEqual(await runVerify({ tracker, repos, snapshot, journal }), []);

  // A third run edits nothing.
  const edits = () => new Journal(path.join(dir, "journal.jsonl")).of("rewrite").length;
  const before = edits();
  const again = await runRewrite({ tracker, repos, snapshot, journal: new Journal(path.join(dir, "journal.jsonl")) });
  assert.deepEqual([again.bodies, again.comments, edits()], [0, 0, before]);

  // A transfer's late rewrite that undid an edit, or an old reference added
  // since, is a difference, and a rerun sets the text again.
  tracker.raw("Org/internal", 2).rest.body = "Part of Org/internal#1; see Org/code#3 and `#1`.\n\nMigrated from Org/code#4; originally closed 2026-09-03";
  comment(3).body += " and #7";
  const differences = await runVerify({ tracker, repos, snapshot, journal });
  assert.deepEqual(differences.map((d) => d.field), ["text of body:2", `text of comment:${comment(3).id}`]);
  assert.deepEqual(differences[1].actual.bareReferences, [2, 7]);
  await runRewrite({ tracker, repos, snapshot, journal });
  assert.deepEqual(await runVerify({ tracker, repos, snapshot, journal }), []);
});

test("comments by one author in one second pair by their text, not their order", async () => {
  const tracker = await seeded();
  tracker.commentStore("Org/code").push({ id: 601, number: 5, body: "First, naming #4." }, { id: 602, number: 5, body: "Second, naming #1." });
  const dir = scratch();
  const { snapshot, journal } = await transferred(tracker, dir);
  // The transfer wrote the two in the other order, with the same time and author.
  const moved = tracker.commentStore("Org/internal").filter((c) => c.number === 3);
  [moved[0].body, moved[1].body] = [moved[1].body, moved[0].body];
  await runRewrite({ tracker, repos, snapshot, journal });
  const bodies = tracker.commentStore("Org/internal").filter((c) => c.number === 3).map((c) => c.body);
  assert.deepEqual(bodies, ["Second, naming #1.", "First, naming #2."]);
  assert.deepEqual(await runVerify({ tracker, repos, snapshot, journal }), []);
});

test("a comment thread that no longer matches the snapshot is reported and left alone", async () => {
  const tracker = await seeded();
  tracker.commentStore("Org/code").push({ id: 501, number: 5, body: "See #4." });
  const dir = scratch();
  const { snapshot, journal } = await transferred(tracker, dir);
  tracker.commentStore("Org/internal").push({ id: 999, number: 3, body: "A comment added since #4.", seq: 9 });
  const result = await runRewrite({ tracker, repos, snapshot, journal });
  assert.deepEqual(result.mismatchedThreads, [{ old: 5, new: 3, mismatch: "1 comments in the snapshot, 2 now" }]);
  assert.equal(tracker.commentStore("Org/internal").find((c) => c.id === 999).body, "A comment added since #4.");
  assert.ok((await runVerify({ tracker, repos, snapshot, journal })).some((d) => d.field === "comment thread"));
});

test("rewrite edits the closing lines of open public pull requests, and verify checks their computed references", async () => {
  const tracker = await seeded();
  const dir = scratch();
  const { snapshot, journal } = await transferred(tracker, dir);
  const into = (branch) => ({ ref: branch, repo: { default_branch: "main" } });
  tracker.pulls.push({ number: 30, body: "Summary.\n\nCloses #5\nCloses #2", base: into("main") }, { number: 31, body: "No linked issue.", base: into("main") }, { number: 32, body: "Closes Org/internal#9", base: into("feature") });
  const before = await runVerify({ tracker, repos, snapshot, journal });
  assert.deepEqual(before.filter((d) => d.pull === 30).map((d) => d.field), ["closing line", "closing reference unexpected"], "the stale line, and GitHub's own resolution of it that the line does not name");
  await runRewrite({ tracker, repos, snapshot, journal });
  assert.equal(tracker.pulls[0].body, "Summary.\n\nCloses Org/internal#3\nCloses #2", "the kept public issue keeps its bare reference");
  assert.equal(tracker.pulls[1].body, "No linked issue.");
  assert.deepEqual(await runVerify({ tracker, repos, snapshot, journal }), [], "a pull request into another branch has no computed references to check");

  // GitHub's computed set is checked against the body both ways.
  tracker.computed.set(30, [{ repo: "Org/code", number: 2 }]);
  assert.deepEqual((await runVerify({ tracker, repos, snapshot, journal })).map((d) => [d.field, d.expected]), [["closing reference missing", "org/internal#3"]]);
  tracker.computed.set(30, [{ repo: "Org/internal", number: 999 }, { repo: "Org/code", number: 2 }]);
  assert.deepEqual((await runVerify({ tracker, repos, snapshot, journal })).map((d) => d.field), ["closing reference missing", "closing reference unexpected"]);
});

// ---------------------------------------------------------------------------
// Rehearsal

const rehearsalIssues = async (tracker, name) => (await tracker.listIssues(name)).filter((i) => i.title.startsWith("[migrate-tracker rehearsal"));

test("a rehearsal survives a lost creation response, passes verify and leaves no test issue", async () => {
  const tracker = await seeded({ drops: ["parent", "blockedBy"] });
  const dir = path.join(scratch(), "rehearsal-a");
  fs.mkdirSync(dir);
  tracker.loseCreate = (title) => title.endsWith("] child");
  await assert.rejects(runRehearsal({ tracker, repos, dir, journal: new Journal(path.join(dir, "journal.jsonl")) }), /lost response/);
  assert.equal((await rehearsalIssues(tracker, "Org/code")).length, 2, "the child exists though its creation was not recorded");
  const result = await runRehearsal({ tracker, repos, dir, journal: new Journal(path.join(dir, "journal.jsonl")) });
  assert.equal(tracker.calls.filter(([op, arg]) => op === "createIssue" && arg.endsWith("] child")).length, 1, "the child was found by its title, not made twice");
  assert.equal(result.survival.fields.parent["#9"], 'dropped or changed: expected "Org/internal#1", found null');
  assert.equal(result.verify, "passed");
  assert.deepEqual([...(await rehearsalIssues(tracker, "Org/code")), ...(await rehearsalIssues(tracker, "Org/internal"))], []);
});

test("rehearsal clean-up deletes an issue whose creation was never recorded", async () => {
  const tracker = await seeded();
  const dir = path.join(scratch(), "rehearsal-b");
  fs.mkdirSync(dir);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  journal.append({ mode: "rehearsal", step: "creating", role: "parent", title: "[migrate-tracker rehearsal rehearsal-b] parent" });
  tracker.add("Org/code", 20, { title: "[migrate-tracker rehearsal rehearsal-b] parent" });
  const { cleanup } = await runRehearsal({ tracker, repos, dir, journal, cleanupOnly: true });
  assert.deepEqual(cleanup, { parent: "gone from Org/code#20" });
  assert.deepEqual(await rehearsalIssues(tracker, "Org/code"), []);
});

// ---------------------------------------------------------------------------
// Pacing, arguments and the repos file

test("the pacer holds requests to the hourly budget and writes to the minute and hour budgets", async () => {
  let t = 0;
  const slept = [];
  const pacer = new Pacer({ perHour: 3, writesPerMinute: 2, writesPerHour: 3, now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } });
  await pacer.take(true);
  await pacer.take(true);
  await pacer.take(true);
  assert.deepEqual(slept, [60e3], "the third write waits for the minute window");
  await pacer.take(false);
  assert.equal(slept.length, 2, "the fourth request waits for the hour window");
  assert.equal(slept[1], 3540e3, "until the first request, made a minute earlier, leaves the hour");
  assert.equal(pacer.total, 4);
});

test("gh calls retry a rate limit always, and a server error only for an idempotent request", async () => {
  const replies = (list) => {
    const calls = [];
    return { calls, run: (args) => (calls.push(args), list.shift() ?? { status: 0, stdout: "{}", stderr: "" }) };
  };
  const pacer = new Pacer({ sleep: async () => {} });
  const busy = { status: 1, stdout: "", stderr: "gh: Server Error (HTTP 502)" };
  const limited = { status: 1, stdout: "", stderr: "GraphQL: was submitted too quickly (transferIssue)" };
  const quiet = async () => {};

  const read = replies([busy]);
  await ghClient({ pacer, run: read.run, sleep: quiet }).api("GET", "repos/o/r/issues/1");
  assert.equal(read.calls.length, 2, "a read is retried after a server error");

  const create = replies([busy]);
  await assert.rejects(ghClient({ pacer, run: create.run, sleep: quiet }).api("POST", "repos/o/r/issues", { title: "t" }), /HTTP 502/);
  assert.equal(create.calls.length, 1, "a POST that may have landed is not repeated");

  const transfer = replies([busy]);
  await assert.rejects(ghClient({ pacer, run: transfer.run, sleep: quiet }).command(["issue", "transfer", "1", "o/x", "-R", "o/r"]), /HTTP 502/);
  assert.equal(transfer.calls.length, 1, "nor a transfer");

  const refused = replies([limited, { status: 0, stdout: "https://github.com/o/x/issues/9\n", stderr: "" }]);
  assert.equal(await ghClient({ pacer, run: refused.run, sleep: quiet }).command(["issue", "transfer", "1", "o/x", "-R", "o/r"]), "https://github.com/o/x/issues/9\n");
  assert.equal(refused.calls.length, 2, "a refused transfer is retried");
});

test("restore and rewrite wait for the last transfer to settle", async () => {
  const slept = [];
  const journal = { of: () => [{ mode: "transfer", at: "2026-10-17T00:00:00.000Z" }] };
  const at = (iso) => () => Date.parse(iso);
  await awaitSettle(journal, 120e3, { now: at("2026-10-17T00:00:30.000Z"), sleep: async (ms) => slept.push(ms) });
  await awaitSettle(journal, 120e3, { now: at("2026-10-17T00:05:00.000Z"), sleep: async (ms) => slept.push(ms) });
  await awaitSettle({ of: () => [] }, 120e3, { sleep: async (ms) => slept.push(ms) });
  assert.deepEqual(slept, [90e3]);
});

test("arguments name one mode and an attempt directory", () => {
  assert.equal(parseArgs(["--snapshot", "x", "--dry-run"]).mode, "snapshot");
  assert.equal(parseArgs(["--transfer", "--dir", "x"]).dryRun, false);
  assert.throws(() => parseArgs(["--transfer"]), /--dir/);
  assert.throws(() => parseArgs(["--transfer", "--verify", "--dir", "x"]), /one mode/);
  assert.throws(() => parseArgs(["--snapshot", "--dry-run"]), /needs a value/);
  assert.throws(() => parseArgs(["--verify", "--dir", "x", "--keep"]), /--rehearsal/);
});

test("the tool reads both repository names from the repos file and spells neither", () => {
  const source = fs.readFileSync(path.join(here, "migrate-tracker.mjs"), "utf8");
  const real = readRepos();
  for (const slug of [real.code, real.internal]) assert.ok(!source.includes(slug), `migrate-tracker.mjs spells ${slug}`);
  assert.match(source, /readRepos\(\)/);
});

test("main refuses an attempt directory inside a Git work tree", async () => {
  await assert.rejects(main(["--snapshot", path.join(here, "snapshot-here"), "--dry-run"], { repos, tracker: fakeTracker(), out: () => {}, log: () => {} }), /inside a Git work tree/);
});

test("main writes a snapshot once and its dry run writes nothing", async () => {
  const dir = path.join(scratch(), "attempt");
  const out = [];
  const tracker = await seeded();
  assert.equal(await main(["--snapshot", dir, "--dry-run"], { repos, tracker, out: (s) => out.push(s), log: () => {} }), 0);
  assert.ok(!fs.existsSync(dir));
  const report = JSON.parse(out[0]);
  assert.deepEqual({ migrate: report.migrate, keep: report.keep, keptNumbers: report.keptNumbers }, { migrate: 5, keep: 1, keptNumbers: [2] });
  assert.equal(await main(["--snapshot", dir], { repos, tracker, out: () => {}, log: () => {} }), 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "snapshot.json"), "utf8")).issues.length, 5);
  await assert.rejects(main(["--snapshot", dir], { repos, tracker, out: () => {}, log: () => {} }), /taken once/);
});
