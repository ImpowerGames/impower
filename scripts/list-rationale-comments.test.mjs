import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadTypescript } from "../.agents/hooks/comment-policy.mjs";
import { listRationaleComments, listedFile, rationalePattern, toCsv } from "./list-rationale-comments.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "list-rationale-comments.mjs");
const repoRoot = path.resolve(path.dirname(script), "..");
const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "list-rationale-comments-"));

function typescriptEntry() {
  const common = spawnSync("git", ["-C", repoRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", windowsHide: true }).stdout.trim();
  for (const base of [repoRoot, path.dirname(common)]) {
    try {
      return createRequire(path.join(base, "package.json")).resolve("typescript");
    } catch {}
  }
  throw new Error("typescript loaded but its entry does not resolve");
}

try {
  const git = (...args) => {
    const result = spawnSync("git", ["-C", checkout, "-c", "user.name=check", "-c", "user.email=check@example.invalid", "-c", "core.autocrlf=false", ...args], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  };
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(checkout, rel)), { recursive: true });
    fs.writeFileSync(path.join(checkout, rel), text);
  };
  git("init", "-q", "-b", "main");
  write("package-lock.json", JSON.stringify({ packages: { "": { name: "fixture" }, "node_modules/vite": { version: "1.0.0" } } }));
  write("src/a.ts", [
    "// Kept as an explicit guard because the parser",
    "// reads twice.",
    "export const a = 1;",
    "// @ts-expect-error",
    "export const b: number = \"x\";",
    "// workaround(vite): replaces process.env until 6.1",
    "// Returns the sum.",
    "export const c = `// on purpose ${a}`;",
    "",
  ].join("\n"));
  write("src/a.test.ts", "// on purpose\nexport {};\n");
  write("src/tests/b.ts", "// on purpose\nexport {};\n");
  write("packages/sparkdown/src/inkjs/c.ts", "// on purpose\nexport {};\n");
  write("dist/bundle.js", "// on purpose\n");
  write("style.css", "/* Row direction set explicitly. */\n.a { display: flex; }\n");
  write("config.yaml", "# Must be first.\nkey: value\n");
  write("notes.md", "On purpose.\n");
  const typescript = loadTypescript(repoRoot);
  if (typescript) {
    write("node_modules/typescript/package.json", JSON.stringify({ name: "typescript", version: typescript.version, main: "index.js" }));
    write("node_modules/typescript/index.js", `module.exports = require(${JSON.stringify(typescriptEntry())});\n`);
    write(".gitignore", "node_modules/\n");
  } else console.log("SKIP: typescript does not resolve from this checkout or its main checkout, so only the fallback scanner ran");
  git("add", "-A");
  git("commit", "-q", "-m", "fixture");
  write("src/untracked.ts", "// on purpose\n");

  assert.ok(rationalePattern.test("kept as a guard"));
  assert.ok(rationalePattern.test("Re-assert the border"));
  assert.ok(!rationalePattern.test("preassertion and indecisions"), "a term inside a longer word preceded by letters is not a match");
  assert.ok(!listedFile("src/a.test.ts") && !listedFile("src/tests/b.ts") && !listedFile("dist/bundle.js"), "tests and build output are not listed");
  assert.ok(!listedFile("packages/sparkdown/src/inkjs/c.ts"), "exempt paths are not listed");
  assert.ok(!listedFile("notes.md") && listedFile("style.css") && listedFile("config.yaml"));

  const { files, rows } = listRationaleComments(checkout);
  assert.equal(files, 3, "only tracked, non-test, non-exempt code files are listed");
  assert.deepEqual(rows.map((row) => `${row.path}:${row.line}:${row.commentLine}`), ["config.yaml:1:1", "src/a.ts:1:1", "style.css:1:1"],
    "a rationale-worded comment is listed by line; a directive, a workaround note, a description, a template literal and the exempt, test, build and untracked files are not");

  const csv = toCsv([{ path: "a, b.ts", line: 3, commentLine: 2, text: "say \"why\"" }]);
  assert.equal(csv, "path,line,comment_line,text\n\"a, b.ts\",3,2,\"say \"\"why\"\"\"\n");

  const cli = spawnSync(process.execPath, [script, "--root", checkout], { encoding: "utf8", windowsHide: true });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout.split("\n")[0], "path,line,comment_line,text");
  assert.equal(cli.stdout.trim().split("\n").length, 4);
  assert.match(cli.stderr, /^3 files listed, 3 comments, 3 lines$/m);
  const json = spawnSync(process.execPath, [script, "--root", checkout, "--format", "json"], { encoding: "utf8", windowsHide: true });
  assert.equal(JSON.parse(json.stdout).length, 3);
  const bad = spawnSync(process.execPath, [script, "--format", "xml"], { encoding: "utf8", windowsHide: true });
  assert.notEqual(bad.status, 0, "an unknown argument is refused");

  console.log("ok: list-rationale-comments lists rationale-worded refused comments in tracked, non-test, non-exempt code files");
} finally {
  fs.rmSync(checkout, { recursive: true, force: true });
}
