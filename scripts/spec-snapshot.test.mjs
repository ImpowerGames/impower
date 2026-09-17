import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { takeSnapshot, readSnapshot, snapshotDigest, bodyDigest, mentionedIssues, parseArgs, writeSnapshot, DIGEST } from "./spec-snapshot.mjs";

const script = fileURLToPath(new URL("./spec-snapshot.mjs", import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-spec-snapshot-"));
console.log(`Scratch directory: ${scratch}`);
const issues = {
  900: { number: 900, title: "Parent", state: "open", updated_at: "2026-09-16T01:04:43Z", type: { name: "Feature" }, body: "## Problem\r\n\r\nSlices: #901 (geometry), #902 (block). Related: #903 and #904.\r\nSee issues/905 too, and #906.\r\n" },
  901: { number: 901, title: "Slice one", state: "open", updated_at: "2026-09-16T00:26:13Z", type: { name: "Task" }, body: "## Description\n\nSplit from #900. First." },
  902: { number: 902, title: "Slice two", state: "open", updated_at: "2026-09-16T00:26:14Z", type: { name: "Task" }, body: "Split from #900. Second. Blocked by #901." },
  903: { number: 903, title: "Related", state: "closed", updated_at: "2026-09-01T00:00:00Z", type: { name: "Feature" }, body: "An earlier feature that mentions #900 without being split from it." },
  904: { number: 904, title: "A pull request", state: "open", updated_at: "2026-09-02T00:00:00Z", pull_request: { url: "pull" }, body: "Split from #900 in a pull request body." },
  905: { number: 905, title: "Unmentioned slice", state: "open", updated_at: "2026-09-16T21:16:43Z", type: { name: "Task" }, body: "Split from #900. A language-wide task the parent forgot to list." },
  906: { number: 906, title: "Another parent's slice", state: "open", updated_at: "2026-09-03T00:00:00Z", type: { name: "Task" }, body: "Split from #1900. A different parent." },
  907: { number: 907, title: "Language-wide task", state: "open", updated_at: "2026-09-16T13:35:19Z", type: { name: "Task" }, body: "Accept percentage keys in keyframes. Needed by the morph block of #900." },
  908: { number: 908, title: "Unrelated", state: "open", updated_at: "2026-09-04T00:00:00Z", type: { name: "Task" }, body: "A ticket with no relation to the parent." },
};
const fetched = [];
const fetchIssue = (number) => { fetched.push(number); const issue = issues[number]; if (!issue) throw new Error(`no issue ${number}`); return structuredClone(issue); };

const snapshot = takeSnapshot({ parent: 900, fetchIssue });
assert.deepEqual(snapshot.tickets.map((ticket) => ticket.number), [900, 901, 902], "the parent first, then each mentioned issue that says Split from the parent, in number order; a related issue, a pull request and another parent's slice are not slices");
assert.deepEqual(mentionedIssues(issues[900].body), [901, 902, 903, 904, 906], "issues/905 is a path, not a mention");
assert.deepEqual(fetched, [900, 901, 902, 903, 904, 906]);
assert.equal(snapshot.tickets[0].body.includes("\r"), false, "bodies are normalized to LF");
assert.equal(snapshot.tickets[0].bodyDigest, bodyDigest(issues[900].body));
assert.equal(snapshot.tickets[0].type, "Feature");
assert.equal(snapshot.digest, snapshotDigest(snapshot.tickets));
assert.match(snapshot.digest, DIGEST);
assert.equal(takeSnapshot({ parent: 900, fetchIssue }).digest, snapshot.digest, "the digest is deterministic");
const added = takeSnapshot({ parent: 900, slices: [905], fetchIssue });
assert.deepEqual(added.tickets.map((ticket) => ticket.number), [900, 901, 902, 905], "a named slice the parent omits is added");
assert.notEqual(added.digest, snapshot.digest);
assert.deepEqual(takeSnapshot({ parent: 900, slices: [903, 907], fetchIssue }).tickets.map((ticket) => ticket.number), [900, 901, 902, 903, 907], "a named ticket the parent lists, or that mentions the parent, is a slice without the split phrase");
assert.throws(() => takeSnapshot({ parent: 900, slices: [908], fetchIssue }), /#908 is not a slice of #900/, "a named ticket unrelated to the parent is refused");
assert.throws(() => takeSnapshot({ parent: 900, slices: [904], fetchIssue }), /not an issue/);
assert.throws(() => takeSnapshot({ parent: 904, fetchIssue }), /not an issue/);
assert.throws(() => takeSnapshot({ parent: 900, slices: [900], fetchIssue }), /other than the parent/);
assert.throws(() => takeSnapshot({ parent: 0, fetchIssue }), /parent issue number/);
const edited = takeSnapshot({ parent: 900, fetchIssue: (number) => number === 902 ? { ...issues[902], body: issues[902].body + " edited" } : fetchIssue(number) });
assert.notEqual(edited.digest, snapshot.digest, "an edited body changes the digest");
const touched = takeSnapshot({ parent: 900, fetchIssue: (number) => number === 901 ? { ...issues[901], updated_at: "2026-09-17T00:00:00Z" } : fetchIssue(number) });
assert.notEqual(touched.digest, snapshot.digest, "a changed updated_at changes the digest");

const file = path.join(scratch, "snapshot.json");
const written = writeSnapshot({ parent: 900, out: file, slices: [], fetchIssue });
assert.equal(written.digest, snapshot.digest);
assert.deepEqual(written.tickets.map((ticket) => ticket.number), [900, 901, 902]);
assert.equal(readSnapshot(file).digest, snapshot.digest, "a written snapshot reads back with the same digest");
assert.throws(() => writeSnapshot({ parent: 900, out: file, slices: [], fetchIssue }), /EEXIST/, "a snapshot file is never overwritten");
assert.throws(() => readSnapshot(path.join(scratch, "missing.json")), /Cannot read snapshot/);
assert.throws(() => readSnapshot("relative.json"), /absolute/);
const tamperedBody = JSON.parse(fs.readFileSync(file, "utf8"));
tamperedBody.tickets[1].body += " quietly edited";
fs.writeFileSync(path.join(scratch, "tampered-body.json"), JSON.stringify(tamperedBody));
assert.throws(() => readSnapshot(path.join(scratch, "tampered-body.json")), /does not match its digest/);
const tamperedDigest = JSON.parse(fs.readFileSync(file, "utf8"));
tamperedDigest.tickets[1].body += " edited";
tamperedDigest.tickets[1].bodyDigest = bodyDigest(tamperedDigest.tickets[1].body);
fs.writeFileSync(path.join(scratch, "tampered-digest.json"), JSON.stringify(tamperedDigest));
assert.throws(() => readSnapshot(path.join(scratch, "tampered-digest.json")), /does not match its digest/, "a body digest repaired without the snapshot digest still fails");
const duplicated = JSON.parse(fs.readFileSync(file, "utf8"));
duplicated.tickets.push(duplicated.tickets[1]);
duplicated.digest = snapshotDigest(duplicated.tickets);
fs.writeFileSync(path.join(scratch, "duplicated.json"), JSON.stringify(duplicated));
assert.throws(() => readSnapshot(path.join(scratch, "duplicated.json")), /does not match its digest/);
fs.writeFileSync(path.join(scratch, "wrong-shape.json"), JSON.stringify({ version: 1, parent: 900, tickets: [{ number: 901 }] }));
assert.throws(() => readSnapshot(path.join(scratch, "wrong-shape.json")), /not a spec snapshot/);
fs.writeFileSync(path.join(scratch, "not-json.json"), "{");
assert.throws(() => readSnapshot(path.join(scratch, "not-json.json")), /Cannot read snapshot/);

assert.deepEqual(parseArgs(["900", file, "--slices", "905, 907"]), { parent: 900, out: file, slices: [905, 907] });
assert.deepEqual(parseArgs(["900", file]), { parent: 900, out: file, slices: [] });
assert.throws(() => parseArgs(["900", "relative.json"]), /absolute/);
assert.throws(() => parseArgs(["abc", file]), /Usage/);
assert.throws(() => parseArgs(["900"]), /Usage/);
assert.throws(() => parseArgs(["900", file, "--bogus"]), /Unknown argument/);
const cli = spawnSync(process.execPath, [script, "900", "relative.json"], { encoding: "utf8", windowsHide: true });
assert.equal(cli.status, 1);
assert.match(cli.stderr, /absolute/);
console.log("PASS: slice discovery by Split from, named slices the parent lists or omits, refused unrelated numbers, digest determinism and sensitivity, refused edits and duplicates, and CLI argument checks");
