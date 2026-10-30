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
const PULL_REQUEST = "PULL_REQUEST_TEMPLATE.md";
assert.ok(repos.cutover || existsSync(publicDir), "before the cutover the public set waits under .agents/templates/public/");
const publicSet = existsSync(publicDir) ? publicDir : chooserDir;
assert.deepEqual(readdirSync(publicSet).filter((name) => name !== PULL_REQUEST).sort(), PUBLIC, "the public chooser offers a bug report and a feature request");
assert.match(read(publicSet + "config.yml"), /^blank_issues_enabled: false$/m, "the public chooser keeps blank issues off");
console.log("ok: the internal templates name their types and the public set is a bug report, a feature request and the chooser configuration");

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

const pullRequestFile = `${root}.github/${PULL_REQUEST}`;
const stagedPullRequest = publicDir + PULL_REQUEST;
const reportFile = fileURLToPath(new URL("./pr-report.md", import.meta.url));
const withoutComments = (text) => text.replace(/<!--[\s\S]*?-->/g, "");
const headings = (text) => withoutComments(text).split("\n").filter((line) => line.startsWith("#")).map((line) => line.replace(/^#+\s*/, ""));
const REPORT = ["Motivation", "Changes", "Type of change", "Testing and verification", "Checklist", "Notes for reviewers"];
const report = read(reportFile);
assert.deepEqual(headings(report), REPORT, "the PR report keeps the sections the public body loses at the cutover, in order");
assert.match(withoutComments(report).trim().split("\n")[0], new RegExp(`^PR report for ${repos.code}#<pull request number> at head <full head SHA>\\.$`), "the PR report names its pull request and head first");

function checkPullRequest(cutover, text) {
  if (!cutover) {
    assert.deepEqual(headings(text), ["Summary", ...REPORT], "before the cutover the public body keeps the summary and every section the PR report would carry");
    assert.match(text, /^Closes #$/m, "before the cutover the public body closes the issue in this repository");
    return;
  }
  assert.deepEqual(headings(text), [], "after the cutover the public body has no sections; they go in the PR report");
  assert.deepEqual(withoutComments(text).split("\n").map((line) => line.trim()).filter(Boolean), [`Closes ${repos.internal}#`], "after the cutover the public body is a summary paragraph and the closing reference to the internal ticket");
}
assert.ok(repos.cutover || existsSync(stagedPullRequest), `before the cutover the shrunk pull request template waits at .agents/templates/public/${PULL_REQUEST}`);
const shrunk = read(existsSync(stagedPullRequest) ? stagedPullRequest : pullRequestFile);
const full = `## Summary\n\nA summary.\n\nCloses #\n\n${withoutComments(report).trim().split("\n").slice(1).join("\n")}\n`;
checkPullRequest(false, full);
checkPullRequest(true, shrunk);
assert.throws(() => checkPullRequest(true, full), /no sections/, "the full body fails with the switch on");
assert.throws(() => checkPullRequest(false, shrunk), /keeps the summary and every section/, "the shrunk body fails with the switch off");
assert.throws(() => checkPullRequest(true, shrunk.replace(`Closes ${repos.internal}#`, "Closes #")), /closing reference to the internal ticket/, "a shrunk body closing a bare number fails with the switch on");
console.log("ok: the pull request check passes each position's template and refuses the other's");

checkPullRequest(repos.cutover, read(pullRequestFile));
if (repos.cutover && existsSync(stagedPullRequest)) assert.equal(read(pullRequestFile), read(stagedPullRequest), `.github/${PULL_REQUEST} matches .agents/templates/public/${PULL_REQUEST}`);
console.log(`ok: switch ${repos.cutover ? "on" : "off"}, .github/${PULL_REQUEST} matches its position`);


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
