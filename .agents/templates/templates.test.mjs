// Run: node .agents/templates/templates.test.mjs
//
// The Bug, Feature and Task templates agents file with live under
// .agents/templates/issues/; the human-facing bug report, feature request and
// chooser configuration live under .agents/templates/public/ until the
// cutover moves them into .github/ISSUE_TEMPLATE/. This check holds three
// things together:
//   - each internal template names the issue type agents create it with;
//   - .github/ISSUE_TEMPLATE/ matches the switch in .agents/repos.json: while
//     it is off, the public chooser still serves the internal templates, so
//     the copies there match .agents/templates/issues/; once it is on, the
//     chooser offers exactly a bug report and a feature request;
//   - the internal repository's own .github/ISSUE_TEMPLATE/ copies, read
//     through the API, match .agents/templates/issues/. That part prints a
//     SKIP line and passes when the repository or its template directory
//     cannot be read (no gh login, no access, or no copies there yet).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRepos } from "../repos.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const internalDir = fileURLToPath(new URL("./issues/", import.meta.url));
const publicDir = fileURLToPath(new URL("./public/", import.meta.url));
const chooserDir = `${root}.github/ISSUE_TEMPLATE/`;
const normalize = (text) => text.replace(/\r\n/g, "\n");
const read = (file) => normalize(readFileSync(file, "utf8"));
const repos = readRepos();

const TYPES = { "bug_report.md": "Bug", "feature_request.md": "Feature", "task.md": "Task" };

assert.deepEqual(readdirSync(internalDir).sort(), Object.keys(TYPES).sort(), "the internal templates are the Bug, Feature and Task forms");
for (const [name, type] of Object.entries(TYPES)) {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(read(internalDir + name));
  assert.ok(front, `${name} starts with front matter`);
  assert.match(front[1], new RegExp(`^type: ${type}$`, "m"), `${name} names the ${type} type`);
}
const PUBLIC = ["bug_report.md", "config.yml", "feature_request.md"];
// The public set waits under .agents/templates/public/ until the cutover, which
// may move it into .github/ISSUE_TEMPLATE/; after that the chooser holds it.
assert.ok(repos.cutover || existsSync(publicDir), "before the cutover the public set waits under .agents/templates/public/");
const publicSet = existsSync(publicDir) ? publicDir : chooserDir;
assert.deepEqual(readdirSync(publicSet).sort(), PUBLIC, "the public chooser offers a bug report and a feature request");
assert.match(read(publicSet + "config.yml"), /^blank_issues_enabled: false$/m, "the public chooser keeps blank issues off");
console.log("ok: the internal templates name their types and the public set is a bug report, a feature request and the chooser configuration");

// Throws when a chooser directory does not match the switch's position.
function checkChooser(cutover, dir) {
  if (!cutover) {
    assert.deepEqual(readdirSync(dir).sort(), ["config.yml", ...Object.keys(TYPES)].sort(), "before the cutover the chooser still serves the internal templates");
    for (const name of Object.keys(TYPES)) assert.equal(read(dir + name), read(internalDir + name), `.github/ISSUE_TEMPLATE/${name} matches .agents/templates/issues/${name}; edit the copy under .agents/templates/issues/ and mirror it until the cutover`);
    return;
  }
  assert.deepEqual(readdirSync(dir).sort(), PUBLIC, "after the cutover the chooser offers exactly a bug report and a feature request");
  for (const name of Object.keys(TYPES)) if (existsSync(dir + name)) assert.notEqual(read(dir + name), read(internalDir + name), `after the cutover .github/ISSUE_TEMPLATE/${name} is the human-facing form, not the internal one`);
  assert.match(read(dir + "config.yml"), /^blank_issues_enabled: false$/m, "the public chooser keeps blank issues off");
  if (existsSync(publicDir)) for (const name of PUBLIC) assert.equal(read(dir + name), read(publicDir + name), `.github/ISSUE_TEMPLATE/${name} matches .agents/templates/public/${name}`);
}

// Both positions against fixtures: the current chooser and the public set.
{
  const scratch = mkdtempSync(path.join(tmpdir(), "issue-templates-"));
  console.log(`Scratch directory: ${scratch}`);
  try {
    const fixture = (name, files) => {
      const dir = path.join(scratch, name) + path.sep;
      mkdirSync(dir);
      for (const [file, source] of Object.entries(files)) writeFileSync(dir + file, readFileSync(source));
      return dir;
    };
    const before = fixture("before", { "config.yml": publicSet + "config.yml", ...Object.fromEntries(Object.keys(TYPES).map((name) => [name, internalDir + name])) });
    const after = fixture("after", Object.fromEntries(PUBLIC.map((name) => [name, publicSet + name])));
    checkChooser(false, before);
    checkChooser(true, after);
    assert.throws(() => checkChooser(true, before), /exactly a bug report and a feature request/, "the internal set fails with the switch on");
    assert.throws(() => checkChooser(false, after), /still serves the internal templates/, "the public set fails with the switch off");
    writeFileSync(before + "task.md", "drifted\n");
    assert.throws(() => checkChooser(false, before), /task\.md matches/, "a drifted copy fails with the switch off");
    console.log("ok: the chooser check passes each position's set and refuses the other's and a drifted copy");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

checkChooser(repos.cutover, chooserDir);
console.log(`ok: switch ${repos.cutover ? "on" : "off"}, .github/ISSUE_TEMPLATE/ matches its position`);

// The internal repository's copies, read through the REST contents API.
const remote = (name) => {
  const r = spawnSync("gh", ["api", `repos/${repos.internal}/contents/.github/ISSUE_TEMPLATE/${name}`, "--jq", ".content"], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  if (r.error || r.status !== 0) return { error: (r.error?.message ?? r.stderr ?? "").trim().split("\n")[0] || `exit ${r.status}` };
  return { text: normalize(Buffer.from(r.stdout.replace(/\s+/g, ""), "base64").toString("utf8")) };
};
const fetched = Object.keys(TYPES).map((name) => ({ name, ...remote(name) }));
const unread = fetched.filter((f) => f.error !== undefined);
if (unread.length) {
  console.log(`SKIP: ${repos.internal} .github/ISSUE_TEMPLATE/ could not be read (${unread.map((f) => `${f.name}: ${f.error}`).join("; ")}); its copies are not compared`);
} else {
  for (const { name, text } of fetched) assert.equal(text, read(internalDir + name), `${repos.internal} .github/ISSUE_TEMPLATE/${name} matches .agents/templates/issues/${name}`);
  console.log(`ok: ${repos.internal} serves the same Bug, Feature and Task templates`);
}
