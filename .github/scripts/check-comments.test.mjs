import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { baseFromPatch, checkComments, listPullRequestFiles, LISTING_LIMIT, needsCheck, parsePatch } from "./check-comments.mjs";
import { loadTypescript } from "../../.agents/hooks/comment-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(root, ".github/scripts/check-comments.mjs");
const typescript = loadTypescript(root);
assert.ok(typescript || process.env.COMMENT_POLICY_REQUIRE_TYPESCRIPT !== "1", "COMMENT_POLICY_REQUIRE_TYPESCRIPT is set, so typescript must resolve from this checkout or its main checkout");
if (!typescript) console.log("SKIP: typescript does not resolve from this checkout or its main checkout, so the JavaScript and TypeScript cases ran through the fallback scanner only");

const scratch = [];
const tempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratch.push(dir);
  return dir;
};

function repository(withTypescript) {
  const checkout = tempDir("check-comments-");
  const git = (...args) => {
    const result = spawnSync("git", ["-C", checkout, "-c", "user.name=check", "-c", "user.email=check@example.invalid", "-c", "core.autocrlf=false", ...args], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout;
  };
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(checkout, rel)), { recursive: true });
    fs.writeFileSync(path.join(checkout, rel), text);
  };
  git("init", "-q", "-b", "main");
  write("package-lock.json", JSON.stringify({
    packages: {
      "": { name: "fixture-monorepo" },
      "packages/sparkle": { name: "@impower/sparkle" },
      "node_modules/@impower/sparkle": { resolved: "packages/sparkle", link: true },
    },
  }));
  if (withTypescript && typescript) {
    const real = typescriptEntry();
    write("node_modules/typescript/package.json", JSON.stringify({ name: "typescript", version: typescript.version, main: "index.js" }));
    write("node_modules/typescript/index.js", `module.exports = require(${JSON.stringify(real)});\n`);
    write(".gitignore", "node_modules/\n");
  }
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD").trim();
  };
  const record = (base, file, status = "modified") => {
    const patch = git("diff", "--no-color", "-U3", base, "HEAD", "--", file);
    const numstat = git("diff", "--numstat", base, "HEAD", "--", file).split("\t");
    const at = patch.indexOf("@@");
    return { filename: file, status, additions: Number(numstat[0]) || 0, deletions: Number(numstat[1]) || 0, ...(at < 0 ? {} : { patch: patch.slice(at).replace(/\n$/, "") }) };
  };
  return { checkout, git, write, commit, record };
}

function typescriptEntry() {
  const common = spawnSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", windowsHide: true }).stdout.trim();
  for (const base of [root, path.dirname(common)]) {
    try {
      return createRequire(path.join(base, "package.json")).resolve("typescript");
    } catch {}
  }
  throw new Error("typescript loaded but its entry does not resolve");
}

try {
  {
    const head = ["keep", "new line", "another", "4", "5", "6", "7", "8", "9", "10", "11", "tail", ""].join("\n");
    const { added, hunks } = parsePatch("@@ -1,2 +1,3 @@\n keep\n-old line\n+new line\n+another\n\\ No newline at end of file\n@@ -10,0 +12 @@\n+tail");
    assert.deepEqual([...added], [2, 3, 12]);
    assert.equal(baseFromPatch(head, hunks), ["keep", "old line", "4", "5", "6", "7", "8", "9", "10", "11", ""].join("\n"), "the base is rebuilt from the head and the patch");
    const emptied = parsePatch("@@ -1,2 +0,0 @@\n-gone\n-too");
    assert.deepEqual([...emptied.added], [], "a hunk that empties a file adds nothing");
    assert.equal(baseFromPatch("", emptied.hunks), "gone\ntoo\n");
    assert.throws(() => baseFromPatch("other\n", parsePatch("@@ -1 +1 @@\n-a\n+b").hunks), /does not match the head file/, "a patch that does not fit the head fails rather than guessing");
  }

  const repo = repository(true);
  const { write, commit, record, checkout } = repo;
  write("src/existing.ts", "export const a = 1; // legacy note kept from before the rule\nexport const b = 2;\n");
  write("src/shared.ts", "// keeps the row direction, since the host forces column on every element\nexport const s = 1;\n");
  write("src/short.ts", "// short legacy note\nexport const t = 1;\n");
  write("src/fixture.test.ts", "export const fixture = \"// a string that only looks like the copied comment text\";\n");
  write("packages/sparkdown/src/inkjs/Story.ts", "export class Story {}\n");
  write("src/gone.ts", "// a prose comment in a file the pull request deletes\nexport {};\n");
  write("README.md", "# Fixture\n");
  write("src/literal.ts", "export const fixture = \"/* prose that was only a string */\";\n");
  write("src/template.ts", "export const t = `\n// prose that was only template text\n`;\n");
  const separators = { "src/line-separator.ts": 0x2028, "src/paragraph-separator.ts": 0x2029, "src/carriage-return.ts": 13 };
  for (const file of Object.keys(separators)) write(file, "export {};\n");
  write("src/wrapped.css", "/* keeps the panel layout\n * stacked, since the host page forces a column on every element */\n.a { color: red; }\n");
  write("src/unpatched-legacy.ts", "// a legacy comment kept in a file whose patch the listing omits\nexport const q = 1;\n");
  const base = commit("base");

  write("src/existing.ts", "export const a = 2; // legacy note kept from before the rule\n// re-asserts the border, since the normalize reset clears it\nexport const b = 2;\n");
  write("src/directive.ts", "// @ts-expect-error the fixture's value is untyped\nexport const d: number = \"\";\n// workaround(node): fs.watch fires twice on Windows in Node 24, https://github.com/nodejs/node/issues/1\nexport const w = 1;\n");
  write("src/workspace.ts", "// workaround(sparkle): the reset forces column\nexport const n = 1;\n");
  write("packages/sparkdown/src/inkjs/Story.ts", "// upstream prose the rule never judges\nexport class Story {}\n");
  write("src/copy.ts", "export const c = 1;\n// Keeps the row   direction, since the host forces column on every element\n");
  write("src/fixture-copy.ts", "// a string that only looks like the copied comment text\nexport const f = 1;\n");
  write("src/short-copy.ts", "// short legacy note\nexport const u = 1;\n");
  write("src/unpatched.ts", "// a comment in a file whose patch the listing omits\nexport const p = 1;\n");
  write("README.md", "# Fixture\n\n<!-- a prose note in markdown -->\n");
  fs.rmSync(path.join(checkout, "src/gone.ts"));
  write("src/literal.ts", "/* prose that was only a string */\nexport {};\n");
  write("src/template.ts", "export {}; // prose that was only template text\n");
  for (const [file, code] of Object.entries(separators)) write(file, `export {};${String.fromCharCode(code)}// prose after a JavaScript line terminator\n`);
  write("src/wrapped-copy.css", ".b { color: blue; }\n/* keeps the panel layout stacked, since the host page forces a column on every element */\n");
  write("src/unpatched-legacy.ts", "// a legacy comment kept in a file whose patch the listing omits\nexport const q = 2;\n");
  commit("head");

  const records = [
    record(base, "src/existing.ts"),
    record(base, "src/directive.ts", "added"),
    record(base, "src/workspace.ts", "added"),
    record(base, "packages/sparkdown/src/inkjs/Story.ts"),
    record(base, "src/copy.ts", "added"),
    record(base, "src/fixture-copy.ts", "added"),
    record(base, "src/short-copy.ts", "added"),
    { ...record(base, "src/unpatched.ts", "added"), patch: undefined },
    record(base, "README.md"),
    record(base, "src/gone.ts", "removed"),
    record(base, "src/literal.ts"),
    record(base, "src/template.ts"),
    ...Object.keys(separators).map((file) => record(base, file)),
    record(base, "src/wrapped-copy.css", "added"),
    { ...record(base, "src/unpatched-legacy.ts"), patch: undefined },
  ];
  const result = checkComments({ root: checkout, records, mergeBase: base });
  const at = (file) => result.findings.filter((f) => f.file === file);

  assert.equal(result.truncated, false);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(at("src/existing.ts").map((f) => f.line), [2], "only the added prose line is a finding; the legacy comment on the edited line moved with it");
  assert.match(at("src/existing.ts")[0].reasons.join("\n"), /neither a directive a tool reads nor a `workaround\(<name>\):` note/);
  assert.match(at("src/existing.ts")[0].text, /re-asserts the border/);
  assert.deepEqual(at("src/directive.ts"), [], "a directive and a marked note naming a platform pass");
  assert.match(at("src/workspace.ts")[0]?.reasons.join("\n") ?? "", /`sparkle` is a package of this repository/, "a note naming a workspace package is refused");
  assert.deepEqual(at("packages/sparkdown/src/inkjs/Story.ts"), [], "an exempt path is never judged");
  assert.deepEqual(at("README.md"), [], "a markdown file is not a code file");
  assert.deepEqual(at("src/gone.ts"), [], "a removed file adds nothing");

  const copy = at("src/copy.ts");
  assert.deepEqual(copy.map((f) => f.line), [2]);
  assert.ok(copy[0].reasons.some((r) => /src\/shared\.ts:1/.test(r) && /src\/copy\.ts:2/.test(r)), `a duplicate names both files: ${copy[0].reasons.join(" | ")}`);
  assert.ok(!at("src/fixture-copy.ts")[0]?.reasons.some((r) => /fixture\.test\.ts/.test(r)), "text inside a string literal elsewhere is not a comment");
  assert.ok(!at("src/short-copy.ts")[0]?.reasons.some((r) => /short\.ts/.test(r)), "a comment under 30 characters is never reported as a duplicate");
  assert.deepEqual(at("src/unpatched.ts").map((f) => f.line), [1], "a file without a patch is compared with its base version");
  assert.deepEqual(at("src/literal.ts").map((f) => f.line), [1], "removed text that was a string, not a comment, does not excuse an added comment");
  assert.deepEqual(at("src/template.ts").map((f) => f.line), [1], "removed text that was template content, not a comment, does not excuse an added comment");
  for (const file of Object.keys(separators)) assert.deepEqual(at(file).map((f) => f.line), [1], `${file}: a comment after a JavaScript-only line terminator is found on the patch's physical line`);
  assert.ok(at("src/wrapped-copy.css")[0]?.reasons.some((r) => /src\/wrapped\.css:1/.test(r)), "a duplicate of a block comment wrapped with leading asterisks names the original");
  assert.deepEqual(at("src/unpatched-legacy.ts"), [], "a file without a patch keeps the comments its merge base held");

  const workflow = fs.readFileSync(path.join(root, ".github/workflows/comment-check.yml"), "utf8");
  assert.match(workflow, /compare\/\$BASE_SHA\.\.\.\$HEAD_SHA" --jq '\.merge_base_commit\.sha'/, "the workflow takes the merge base the files endpoint diffs against");
  assert.match(workflow, /--merge-base "\$MERGE_BASE"/, "the workflow passes that merge base to the script");
  assert.match(workflow, /check-comments\.mjs --files "\$RUNNER_TEMP\/pull-request-files\.json" --detect/, "the workflow decides whether to run the check with the classifier's own file types");
  assert.match(workflow, /if: needs\.changes\.outputs\.relevant == 'true'/);
  assert.doesNotMatch(workflow, /changed-paths/, "no second list of code file types routes the check");

  const file = (filename, status = "modified") => ({ filename, status });
  for (const name of ["src/theme.CSS", "src/a.TS", "scripts/run.Sh", "src/page.Html", "config.YML"]) assert.equal(needsCheck([file(name)]), true, `${name} is a code file whatever its extension's case`);
  assert.equal(needsCheck([file("README.md"), file("docs/a.sd")]), false, "a pull request that changes no code file skips the check");
  assert.equal(needsCheck([file("packages/sparkdown/src/inkjs/Story.ts"), file("impower-app/src/a.tsx")]), false, "a pull request confined to exempt paths skips the check");
  assert.equal(needsCheck([file("src/a.ts", "removed")]), false, "a pull request that only deletes code adds no comment");
  assert.equal(needsCheck(Array.from({ length: LISTING_LIMIT }, (_, k) => file(`docs/page-${k}.md`))), true, "a listing at the cap runs the check, which fails on it");
  const output = path.join(tempDir("check-comments-output-"), "output");
  const detectListing = path.join(tempDir("check-comments-detect-listing-"), "files.json");
  for (const [files, expected] of [[[file("src/theme.CSS")], "true"], [[file("README.md")], "false"]]) {
    fs.writeFileSync(detectListing, JSON.stringify(files));
    fs.writeFileSync(output, "");
    const detect = spawnSync(process.execPath, [script, "--files", detectListing, "--detect"], { cwd: tempDir("check-comments-detect-"), encoding: "utf8", windowsHide: true, env: { ...process.env, GITHUB_OUTPUT: output, COMMENT_POLICY_REQUIRE_TYPESCRIPT: "1" } });
    assert.equal(detect.status, 0, detect.stdout + detect.stderr);
    assert.equal(fs.readFileSync(output, "utf8"), `relevant=${expected}\n`, `--detect writes relevant=${expected} for ${files[0].filename}`);
  }

  if (typescript) assert.ok(result.scanners.has(`TypeScript ${typescript.version}`), [...result.scanners].join(", "));

  const listing = path.join(tempDir("check-comments-listing-"), "files.json");
  const run = (files, env = {}, cwd = checkout) => {
    fs.writeFileSync(listing, JSON.stringify(files));
    return spawnSync(process.execPath, [script, "--files", listing, "--merge-base", base], { cwd, encoding: "utf8", windowsHide: true, env: { ...process.env, GITHUB_STEP_SUMMARY: "", COMMENT_POLICY_REQUIRE_TYPESCRIPT: "", ...env } });
  };

  const failing = run(records);
  assert.equal(failing.status, 1, failing.stdout + failing.stderr);
  for (const where of ["src/existing.ts:2", "src/workspace.ts:1", "src/copy.ts:2", "src/unpatched.ts:1"]) assert.ok(failing.stdout.includes(where), `the report names ${where}:\n${failing.stdout}`);
  assert.match(failing.stdout, /::error file=src\/existing\.ts,line=2,endLine=2::/, "each finding is annotated on its line");
  assert.match(failing.stdout, /AGENTS\.md, Repository-wide rules/, "the report states the rule");
  assert.match(failing.stdout, typescript ? new RegExp(`Scanned with TypeScript ${typescript.version.replaceAll(".", "\\.")}`) : /Scanned with the fallback JavaScript scanner/);

  const passing = run([record(base, "src/directive.ts", "added"), record(base, "README.md")]);
  assert.equal(passing.status, 0, passing.stdout + passing.stderr);
  assert.match(passing.stdout, /No added comment breaks the rule/);

  const none = run([record(base, "README.md")]);
  assert.equal(none.status, 0, none.stdout + none.stderr);

  const truncated = run(Array.from({ length: LISTING_LIMIT }, (_, k) => ({ filename: `docs/page-${k}.md`, status: "added", additions: 1, patch: "@@ -0,0 +1 @@\n+text" })));
  assert.equal(truncated.status, 1, "a listing at the endpoint's cap fails rather than passes");
  assert.match(truncated.stdout, /3000 files/);

  const bare = repository(false);
  bare.write("src/a.ts", "export {};\n");
  const bareBase = bare.commit("base");
  bare.write("src/a.ts", "export {};\n// prose\n");
  bare.commit("head");
  fs.writeFileSync(listing, JSON.stringify([bare.record(bareBase, "src/a.ts")]));
  const required = spawnSync(process.execPath, [script, "--files", listing, "--merge-base", bareBase], { cwd: bare.checkout, encoding: "utf8", windowsHide: true, env: { ...process.env, GITHUB_STEP_SUMMARY: "", COMMENT_POLICY_REQUIRE_TYPESCRIPT: "1" } });
  assert.equal(required.status, 1);
  assert.match(required.stdout + required.stderr, /COMMENT_POLICY_REQUIRE_TYPESCRIPT/, "a required scanner that does not resolve fails rather than falling back");
  const fallback = spawnSync(process.execPath, [script, "--files", listing, "--merge-base", bareBase], { cwd: bare.checkout, encoding: "utf8", windowsHide: true, env: { ...process.env, GITHUB_STEP_SUMMARY: "", COMMENT_POLICY_REQUIRE_TYPESCRIPT: "" } });
  assert.equal(fallback.status, 1);
  assert.match(fallback.stdout, /Scanned with the fallback JavaScript scanner/, "the report names the fallback when it judged the file");

  {
    const escaped = "@@ -1 +1 @@\n-a\n+    .replace(/[\\u0000-\\u001f\\u007f]/g, \"\")";
    const pages = [Array.from({ length: 100 }, (_, k) => ({ filename: `src/f${k}.ts`, patch: k === 7 ? escaped : "" })), [{ filename: "src/last.ts" }]];
    const asked = [];
    const fetch = async (url, init) => {
      asked.push({ url, init });
      const page = Number(new URL(url).searchParams.get("page"));
      return { ok: true, status: 200, text: async () => JSON.stringify(pages[page - 1] ?? []) };
    };
    const listed = await listPullRequestFiles({ repository: "owner/repo", number: 5, token: "t", api: "https://api.example.invalid", fetch });
    assert.equal(listed.length, 101, "every page is read until one comes back short");
    assert.equal(listed[7].patch, escaped, "a patch holding the text \\u0000 keeps it, rather than a control character in its place");
    assert.deepEqual(asked.map(({ url }) => url), [1, 2].map((p) => `https://api.example.invalid/repos/owner/repo/pulls/5/files?per_page=100&page=${p}`));
    assert.equal(asked[0].init.headers.authorization, "Bearer t");

    const full = Array.from({ length: 100 }, (_, k) => ({ filename: `f${k}` }));
    let calls = 0;
    const capped = await listPullRequestFiles({ repository: "o/r", number: 1, token: "t", fetch: async () => (calls++, { ok: true, status: 200, text: async () => JSON.stringify(full) }) });
    assert.equal(capped.length, LISTING_LIMIT, "listing stops at the endpoint's cap");
    assert.equal(calls, LISTING_LIMIT / 100);

    await assert.rejects(listPullRequestFiles({ repository: "o/r", number: 1, token: "t", fetch: async () => ({ ok: false, status: 403, text: async () => "forbidden" }) }), /answered 403: forbidden/, "a refused page fails rather than listing fewer files");
  }

  console.log("ok: check-comments judges added comments, duplicates, exempt paths, missing patches and truncated listings, and lists a pull request's files");
} finally {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
}
