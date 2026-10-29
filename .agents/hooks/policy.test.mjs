import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { decide } from "./policy.mjs";
import { normalize } from "./pre-tool-use.mjs";
import { createRequire } from "node:module";
import { classifyComment, loadTypescript, refusedComments, scanComments, stripComments } from "./comment-policy.mjs";
import { testShell } from "../skills/drive-web-editor/redgreen.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const event = (tool_name, tool_input) => ({ session_id: "policy-test", tool_name, tool_input });

{
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "comment-policy-"));
  const outside = fs.mkdtempSync(path.join(process.env.IMPOWER_SYSTEM_TMPDIR || os.tmpdir(), "comment-policy-outside-"));
  try {
    fs.mkdirSync(path.join(checkout, ".git"));
    fs.mkdirSync(path.join(checkout, ".agents/hooks"), { recursive: true });
    fs.copyFileSync(path.join(root, ".agents/hooks/comment-policy.json"), path.join(checkout, ".agents/hooks/comment-policy.json"));
    fs.writeFileSync(path.join(checkout, "package-lock.json"), JSON.stringify({
      packages: {
        "": { name: "fixture-monorepo" },
        "packages/sparkle": { name: "@impower/sparkle" },
        "packages/spark-engine": { name: "@impower/spark-engine" },
        "node_modules/@impower/sparkle": { resolved: "packages/sparkle", link: true },
        "node_modules/@codemirror/view": { version: "6.0.0" },
        "packages/sparkle/node_modules/idiomorph": { version: "0.3.0" },
      },
    }));
    const at = (rel) => path.join(checkout, rel);
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
      fs.writeFileSync(at(rel), text);
    };
    const judge = (tool, input, harness = "claude") => decide(normalize({ ...event(tool, input), cwd: checkout }, harness));
    write("src/a.ts", "// legacy rationale the file already holds\nexport const a = 1;\n");
    const added = (line) => judge("Edit", { file_path: at("src/a.ts"), old_string: "export const a = 1;", new_string: `${line}\nexport const a = 1;` });

    const prose = added("// keeps the row direction, since the host forces column");
    assert.match(prose ?? "", /comment rule \(AGENTS\.md, Repository-wide rules\)/, "a prose comment is refused with the rule as the reason");
    assert.match(prose, /src\/a\.ts:2: `\/\/ keeps the row direction/, "the reason names the file and the first offending line");
    assert.equal(added("// @ts-expect-error the fixture's value is untyped"), null);
    assert.equal(added("// workaround(chromium): rows collapse in Chromium 131, https://crbug.com/1"), null);
    assert.equal(added("// workaround(@codemirror/view): measure runs late in 6.0.0, https://github.com/codemirror/dev/issues/1"), null);
    assert.equal(added("// workaround(idiomorph): a nested lockfile entry is a dependency too"), null);
    assert.equal(added("// SPDX-License-Identifier: MPL-2.0"), null, "adding a licence notice is never refused");
    assert.equal(added("/* Copyright (c) 2024 Example Holder. Released under the MIT License. */"), null);
    assert.match(added("// Copyright handling must stay centralized because the generator depends on it") ?? "", /neither a directive/, "prose that mentions copyright is refused on the edit route");
    for (const name of ["sparkle", "spark-engine", "@impower/sparkle"]) assert.match(added(`// workaround(${name}): the reset forces column`) ?? "", /is a package of this repository/, name);
    assert.match(added("// workaround(left-pad): not installed") ?? "", /neither a dependency in a package-lock\.json nor a platform/);
    assert.match(added("// workaround: no name") ?? "", /takes the form/);
    assert.equal(judge("Edit", { file_path: at("src/a.ts"), old_string: "export const a = 1;", new_string: "export const a = 2;" }), null, "an edit near a legacy comment introduces none");
    assert.equal(judge("Edit", { file_path: at("src/a.ts"), old_string: "// legacy rationale the file already holds\nexport const a = 1;", new_string: "// legacy rationale the file already holds\nexport const a = 2;" }), null, "unchanged context lines are not introduced");
    assert.match(judge("MultiEdit", { file_path: at("src/a.ts"), edits: [{ old_string: "a = 1", new_string: "a = 3" }, { old_string: "export", new_string: "/* added block */ export" }] }) ?? "", /`\/\* added block \*\/`/);

    const legacy = "// legacy note\nexport const b = 1; // trailing legacy note\n";
    write("src/b.ts", legacy);
    assert.equal(judge("Write", { file_path: at("src/b.ts"), content: legacy + "export const c = 2;\n" }), null, "a whole-file write that introduces no comment is allowed");
    assert.match(judge("Write", { file_path: at("src/b.ts"), content: legacy + "export const c = 2; // a new note\n" }) ?? "", /src\/b\.ts:3/, "a whole-file write that adds one is refused");
    assert.match(judge("Write", { file_path: at("src/new.mjs"), content: "export {};\n# not a comment in JavaScript\n/** prose doc */\n" }) ?? "", /src\/new\.mjs:3/);
    assert.equal(judge("Write", { file_path: at("src/new.mjs"), content: "/** @type {number} */\nexport const n = 1;\n" }), null);

    for (const rel of ["packages/sparkdown/src/inkjs/engine/Story.ts", "impower-app/src/a.tsx", "impower-dev/src/modules/spark-editor/workspace/types/RemoteStorageTypes.ts", "docs/guide.md"]) {
      assert.equal(judge("Write", { file_path: at(rel), content: "// upstream prose\nexport {};\n" }), null, `${rel} is never judged`);
    }
    assert.equal(judge("Write", { file_path: path.join(outside, "a.ts"), content: "// prose\n" }), null, "a file outside a checkout carrying the policy is not judged");

    const patch = (body) => judge("apply_patch", { command: `*** Begin Patch\n${body}\n*** End Patch` }, "codex");
    assert.match(patch("*** Update File: src/a.ts\n@@\n export const a = 1;\n+// a patch note\n+export const z = 0;") ?? "", /src\/a\.ts:3: `\/\/ a patch note`/);
    write("src/template.ts", "export const t = `\nalpha\nmiddle\nomega\n`;\nexport const after = 1;\n");
    assert.equal(patch("*** Update File: src/template.ts\n@@\n alpha\n+// literal text\n middle"), null, "a hunk inside a template literal adds text, not a comment");
    assert.match(patch("*** Update File: src/template.ts\n@@\n-alpha\n+alpha changed\n@@\n export const after = 1;\n+// forbidden note") ?? "", /src\/template\.ts:7: `\/\/ forbidden note`/, "a hunk is judged in the patched file, not beside the other hunks");

    write("src/anchored.ts", "export const t = `\n  target();\n`;\nfunction f() {\n  target();\n}\n");
    assert.match(patch("*** Update File: src/anchored.ts\n@@ function f() {\n   target();\n+  // forbidden prose\n }") ?? "", /src\/anchored\.ts:6: `\/\/ forbidden prose`/, "a hunk is placed after its @@ anchor");
    assert.equal(patch("*** Update File: src/anchored.ts\n@@\n   target();\n+  // literal text\n `;"), null, "without an anchor the first matching context is the template");

    write("src/eof.ts", "export const t = `\ntarget();\n`;\ntarget();\n");
    assert.match(patch("*** Update File: src/eof.ts\n@@\n target();\n+// forbidden prose\n*** End of File") ?? "", /src\/eof\.ts:5: `\/\/ forbidden prose`/, "an End of File hunk matches the file's last lines");

    write("src/trailing.ts", "export const a = 1; // legacy note\n");
    assert.equal(judge("Edit", { file_path: at("src/trailing.ts"), old_string: "a = 1", new_string: "a = 2" }), null, "editing code beside a legacy comment introduces no comment");
    assert.equal(judge("Write", { file_path: at("src/trailing.ts"), content: "export const a = 2; // legacy note\n" }), null);
    assert.match(judge("Edit", { file_path: at("src/trailing.ts"), old_string: "// legacy note", new_string: "// legacy note, reworded" }) ?? "", /src\/trailing\.ts:1/, "a reworded comment is a new comment");
    assert.match(judge("Edit", { file_path: at("src/trailing.ts"), old_string: "export const a = 1; // legacy note", new_string: "export const a = 1; // legacy note\nexport const b = 1; // legacy note" }) ?? "", /src\/trailing\.ts:2/, "a copy of an existing comment is introduced");
    assert.equal(patch("*** Update File: src/a.ts\n@@\n-// legacy rationale the file already holds\n-export const a = 1;\n+export const a = 1;\n+// legacy rationale the file already holds"), null, "a moved comment line is not introduced");
    assert.match(patch("*** Add File: src/c.ts\n+export {};\n+// added prose") ?? "", /src\/c\.ts:2/);
    assert.equal(patch("*** Add File: src/d.ts\n+// @ts-nocheck\n+export {};"), null);

    const typescript = loadTypescript(root);
    assert.ok(typescript || process.env.COMMENT_POLICY_REQUIRE_TYPESCRIPT !== "1", "COMMENT_POLICY_REQUIRE_TYPESCRIPT is set, so typescript must resolve from this checkout or its main checkout");
    if (!typescript) console.log("SKIP: typescript does not resolve from this checkout or its main checkout, so the JavaScript and TypeScript cases ran through the fallback scanner only");
    const labelBlock = "outer: {} /[/*]/.test(\"/\"); // yes";
    const heuristicLimits = new Map([[labelBlock, "a brace after a statement label is read as an object literal, so the regex after it reads as division"]]);
    const javascript = (file) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(file);
    const comments = (text, file) => {
      const fallback = scanComments(text, file, { scanner: "fallback" }).map((c) => c.text);
      if (!typescript || !javascript(file)) return fallback;
      const exact = scanComments(text, file).map((c) => c.text);
      if (heuristicLimits.has(text)) assert.notDeepEqual(fallback, exact, `known fallback limit still differs: ${heuristicLimits.get(text)}`);
      else assert.deepEqual(fallback, exact, `both scanners agree on ${JSON.stringify(text)}`);
      return exact;
    };
    if (typescript) assert.deepEqual(comments(labelBlock, "a.js"), ["// yes"]);
    assert.match(scanComments("a(); // x", "src/a.ts", { root: checkout })[0].scanner, /^the fallback JavaScript scanner/, "a checkout without typescript, whose main checkout cannot be found, takes the fallback");
    assert.match(added("// prose through the fallback") ?? "", /scanned with the fallback JavaScript scanner/, "the refusal names the scanner that judged the file");
    if (typescript) {
      assert.equal(scanComments("a(); // x", "src/a.ts")[0].scanner, `TypeScript ${typescript.version}`);
      const tsCheckout = fs.mkdtempSync(path.join(os.tmpdir(), "comment-policy-ts-"));
      try {
        fs.mkdirSync(path.join(tsCheckout, ".git"));
        fs.mkdirSync(path.join(tsCheckout, ".agents/hooks"), { recursive: true });
        fs.copyFileSync(path.join(root, ".agents/hooks/comment-policy.json"), path.join(tsCheckout, ".agents/hooks/comment-policy.json"));
        fs.mkdirSync(path.join(tsCheckout, "node_modules/typescript"), { recursive: true });
        fs.writeFileSync(path.join(tsCheckout, "node_modules/typescript/package.json"), JSON.stringify({ name: "typescript", version: typescript.version, main: "index.js" }));
        const common = spawnSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", windowsHide: true }).stdout.trim();
        const resolveFrom = (base) => {
          try {
            return createRequire(path.join(base, "package.json")).resolve("typescript");
          } catch {
            return null;
          }
        };
        const real = resolveFrom(root) ?? resolveFrom(path.dirname(common));
        fs.writeFileSync(path.join(tsCheckout, "node_modules/typescript/index.js"), `module.exports = require(${JSON.stringify(real)});\n`);
        fs.mkdirSync(path.join(tsCheckout, "src"));
        fs.writeFileSync(path.join(tsCheckout, "src/a.ts"), "export const a = 1;\n");
        const reason = decide(normalize({ ...event("Edit", { file_path: path.join(tsCheckout, "src/a.ts"), old_string: "export", new_string: "// prose\nexport" }), cwd: tsCheckout }, "claude"));
        assert.match(reason ?? "", new RegExp(`src/a\\.ts:1: .*scanned with TypeScript ${typescript.version.replaceAll(".", "\\.")}`), "a checkout holding typescript is judged by TypeScript's scanner");
      } finally {
        fs.rmSync(tsCheckout, { recursive: true, force: true });
      }
    }
    assert.deepEqual(comments(String.raw`const s = "// no", t = '/* no */', u = /\/\/no[/]/g; // yes`, "a.ts"), ["// yes"]);
    assert.deepEqual(comments("const t = `a // no ${f(/* yes */ 1, `b // no ${2}`)} c // no`; const r = x / 2 / y; // yes", "a.ts"), ["/* yes */", "// yes"]);
    assert.deepEqual(comments("const v = <a href=\"http://x\">see</a>; // yes", "a.tsx"), ["// yes"]);
    assert.deepEqual(comments("const a = {} / 2; // yes\nlet b = 2; const c = b++ / 2; // yes\nif (x) {} /re/.test(y); // yes\nconst o = { k: 1 } / 3; // yes\nconst s = `${d}` / 2; // yes", "a.ts"), ["// yes", "// yes", "// yes", "// yes", "// yes"]);
    assert.deepEqual(comments("const n = function() {} / 2; // yes\nswitch (1) { case 1: {} /[/*]/.test(\"/\"); default: {} /a/.test(\"a\"); } // yes\nexport default {} / 2; // yes", "a.ts"), ["// yes", "// yes", "// yes"]);
    assert.deepEqual(comments("const s = \"a\\\r\n// no\";\r\n// yes\r\n", "a.ts"), ["// yes"]);
    assert.deepEqual(comments("const r = /a//* yes */; const q = /b/// yes\nconst n = function () {} / 2; // yes\nfunction g() {} /c/.test(d); // yes", "a.ts"), ["/* yes */", "// yes", "// yes", "// yes"]);
    assert.deepEqual(comments("switch (1) { case true ? 1 : 2: {} /[/*]/.test(\"/\"); case a?.b ?? c: {} /d/.test(e); } // yes", "a.ts"), ["// yes"]);
    const breaks = [0x2028, 0x2029, 13].map((code) => String.fromCharCode(code));
    for (const lineBreak of breaks) {
      for (const scanner of typescript ? ["fallback", "typescript"] : ["fallback"]) {
        assert.deepEqual(scanComments(`a(); // yes${lineBreak}b(); // yes`, "a.ts", { scanner }).map((c) => [c.text, c.line]), [["// yes", 1], ["// yes", 2]], `JavaScript line terminator ${lineBreak.charCodeAt(0)} through the ${scanner} scanner`);
      }
    }
    assert.deepEqual(comments("|\n  # no\n", "a.yaml"), []);
    assert.deepEqual(comments("key: |2\n  value\n # yes\nnext: ok\nother: >\n    text\n  # yes\n- |\n  # no\n", "a.yaml"), ["# yes", "# yes"]);
    assert.deepEqual(comments("echo \"$(case x in\nx)\n  # yes\n  echo hi;;\n(y) echo y;;\nesac)\" # yes\n", "a.sh"), ["# yes", "# yes"]);
    assert.deepEqual(comments("Write-Output \"$(\n  # yes\n  Get-Date\n) # no\" # yes\n$h = @\"\n$( <# yes #> 1 ) # no\n\"@\n", "a.ps1"), ["# yes", "# yes", "<# yes #>"]);
    assert.deepEqual(comments("const id = <T = string>(x: T) => x;\n// yes\nconst k = <const T,>(x: T) => x; // yes", "a.tsx"), ["// yes", "// yes"]);
    assert.deepEqual(comments("const a = b <c && d > e;\n// yes\n", "a.tsx"), ["// yes"], "a guess at JSX that never closes is rescanned as code");
    assert.deepEqual(comments("if (true) /[/*]/.test(\"/\"); while (x) /a\\/b/.test(y); f(a) / 2 / g; // yes", "a.ts"), ["// yes"]);
    assert.deepEqual(comments("const el = <p>https://example.com {/* yes */} <br/> it's <b>x</b></p>; // yes", "a.tsx"), ["/* yes */", "// yes"]);
    assert.deepEqual(comments("const id = <T,>(x: T) => x; // yes\nconst f = <>a // no</>; // yes", "a.tsx"), ["// yes", "// yes"]);
    assert.deepEqual(comments("const i = (\n  <input\n    // yes\n    size={1} /* yes */\n    title=\"// no\"\n  />\n);", "a.tsx"), ["// yes", "/* yes */"]);
    assert.deepEqual(comments("<div title=\"<!-- no -->\">ok</div><script>if (a<!--b) x</script><style>p{}</style><!-- yes -->", "a.html"), ["<!-- yes -->"]);
    assert.deepEqual(comments("#!/usr/bin/env node\nreturn /re/.test(s) // yes", "a.mjs"), ["// yes"]);
    assert.deepEqual(comments(".a { content: '/* no */'; } /* yes */ // no", "a.css"), ["/* yes */"]);
    assert.deepEqual(comments("<p>// no</p><!-- yes -->", "a.html"), ["<!-- yes -->"]);
    assert.deepEqual(comments("#!/bin/sh\necho \"# no\" '# no' a#no $# ${#x} # yes\ncat <<'EOF'\n# no\nEOF\n# yes", "a.sh"), ["# yes", "# yes"]);
    assert.deepEqual(comments("s = '# no' + \"\"\"\n# no\n\"\"\"  # yes", "a.py"), ["# yes"]);
    assert.deepEqual(comments("$a = 'x # no' + \"y `\" # no\" ; a#no # yes\n<# yes #>\n@'\n# no\n'@", "a.ps1"), ["# yes", "<# yes #>"]);
    assert.deepEqual(comments("a: 'x # no' # yes\nb: c#no\nbody: |\n  ## Heading, not a comment\n  text # no\nsteps:\n  - shell: pwsh\n    run: |\n      Write-Output \"foo `\" # no\" # yes\n# lookaround: yes", "a.yml"), ["# yes", "# yes", "# lookaround: yes"], "a run block is scanned in its shell's language and other block scalars are text");
    const workflow = ({ top = [], job = [], step = [] } = {}) => [
      ...top,
      "jobs:",
      "  build:",
      "    runs-on: ubuntu-latest",
      ...job,
      "    steps:",
      "      - name: probe",
      ...step,
      "        run: |",
      "          # shell",
      "          <# block #>",
      "          cat <<EOF",
      "          # heredoc",
      "          EOF",
      "      - run: echo next # next",
      "",
    ].join("\n");
    const sh = ["# shell", "# block #>", "# next"], ps = ["# shell", "<# block #>", "# heredoc", "# next"], py = ["# shell", "# block #>", "# heredoc", "# next"];
    assert.deepEqual(comments(workflow({ step: ["        shell: pwsh"] }), "w.yml"), ps, "the step's shell selects the scanner");
    assert.deepEqual(comments(workflow({ step: ["        shell: python"], job: ["    defaults:", "      run:", "        shell: pwsh"] }), "w.yml"), py, "the step's shell wins over the job default");
    assert.deepEqual(comments(workflow({ job: ["    defaults:", "      run:", "        shell: powershell"], top: ["defaults:", "  run:", "    shell: bash"] }), "w.yml"), ps, "the job default wins over the workflow default");
    assert.deepEqual(comments(workflow({ top: ["defaults:", "  run:", "    shell: pwsh"] }), "w.yml"), ps, "the workflow default applies when the job sets none");
    assert.deepEqual(comments(workflow(), "w.yml"), sh, "an unset shell is sh");
    assert.deepEqual(comments(workflow({ step: ["        shell: cmd"] }), "w.yml"), ["# next"], "a cmd run block has no scanner and stays text");
    assert.deepEqual(comments("steps:\n  - shell: cmd\n    run: echo ok\n  - run: |\n      # yes\n      echo ok\n    shell: bash\n", "w.yml"), ["# yes"], "a step whose run comes first keeps its own shell, not the step before");
    assert.deepEqual(comments("steps:\n  - shell: pwsh\n    run: echo ok\n  - run: |\n      cat <<'EOF'\n      # no\n      EOF\n", "w.yml"), [], "a run-first step after a PowerShell step is sh");
    assert.deepEqual(comments("steps:\n  - 'run': |\n      # yes\n  - \"run\": |\n      # yes\n", "w.yml"), ["# yes", "# yes"], "a quoted run key is a run key");
    const folded = "steps:\n  - run: >\n      echo first\n      # prose\n      echo second\n\n      echo third # tail\n";
    assert.deepEqual(comments(folded, "w.yml"), ["# prose\n      echo second", "# tail"], "a folded run block is scanned as its folded value, so a comment runs to the end of its folded line");
    assert.equal(stripComments(folded, "w.yml", { root: checkout }), "steps:\n  - run: >\n      echo first\n\n      echo third\n", "stripping a folded comment removes every physical line it covers");
    assert.deepEqual(comments("echo \"$(\n  # yes\n  echo \"# no\" $((1 + 2))\n)\" # yes\n", "a.sh"), ["# yes", "# yes"]);
    assert.deepEqual(comments("printf '%s' foo\\\n#no\nprintf '%s' foo \\\n#yes\n", "a.sh"), ["#yes"], "a line continuation joins the word across lines, so # after it starts a comment only where a word would start");
    assert.equal(stripComments("printf '%s' foo\\\n#bar\n", "a.sh", { root: checkout }), "printf '%s' foo\\\n#bar\n");
    assert.deepEqual(comments("EOF=1\nx=$((1<<EOF))\n((y = 1 << EOF))\n# yes\nprintf '%s' \"$x\" # yes\n", "a.sh"), ["# yes", "# yes"], "an arithmetic shift is not a heredoc");
    assert.deepEqual(comments("Write-Output a=#no b,#no\nWrite-Output 1<# no #>2\nWrite-Output 1 <# yes #> 2\n", "a.ps1"), ["#>2", "<# yes #>"], "PowerShell comments start only at a token start");

    const kind = (text, file = "src/a.ts") => classifyComment(text, file, { root: checkout }).kind;
    assert.equal(kind("/// <reference types=\"vite/client\" />"), "directive");
    assert.equal(kind("/* eslint-disable no-console */"), "directive");
    assert.equal(kind("/** @type {number} */"), "refused", "TypeScript reads JSDoc types only in JavaScript files");
    assert.equal(kind("/**\n * @param {string} a the name\n * @returns {number}\n */", "src/a.js"), "directive");
    assert.equal(kind("/**\n * Describes the function.\n * @param {string} a\n */", "src/a.js"), "refused");
    assert.equal(kind("// value-level: the token carries the flag"), "directive");
    assert.equal(kind("// not a node name"), "directive");
    assert.equal(kind("// not a node name, since it is a global"), "refused");
    assert.equal(kind("// Luau: LintGlobalAsLocal / LintSameLineStatement", "src/tests/a.test.ts"), "directive");
    assert.equal(kind("// Luau:", "src/tests/a.test.ts"), "refused");
    assert.equal(kind("// Sparkdown-specific", "src/tests/a.test.ts"), "directive");
    assert.equal(kind("// Sparkdown-specific: the rules about loop ranges", "src/tests/a.test.ts"), "refused");
    assert.equal(kind("# lookaround: Luau owns the suffix", "definitions/yaml/g.yaml"), "directive");
    assert.equal(kind("// agent-tooling-timeout-ms: 600000", "scripts/x.test.mjs"), "directive");
    assert.equal(kind("<!-- prettier-ignore -->", "a.html"), "directive");
    assert.equal(kind("// @vitest-environment jsdom", "src/a.test.ts"), "directive");
    assert.equal(kind("/* @vite-ignore */"), "directive");
    assert.equal(kind("/// @internal"), "refused");
    assert.equal(kind("//"), "refused");
    assert.equal(kind("// prose", "packages/spark-evaluate/src/_modules/x.ts"), "exempt");
    assert.equal(kind("// prose", "packages/sparkdown/src/tests/luau-conformance/upstream/ast/luau-ast.cjs"), "exempt");
    assert.equal(kind("/* Copyright (c) 2015 Tobias Nickel */", "packages/sparkdown/src/txml/txml.ts"), "exempt");
    assert.equal(kind("// prose", "packages/sparkdown/vendor/luau-analysis/backend.js"), "exempt");
    assert.equal(kind("// prose", "README.md"), "exempt");
    assert.equal(kind("// SPDX-License-Identifier: MIT"), "licence");
    assert.equal(kind("# SPDX-License-Identifier: Apache-2.0", "scripts/a.sh"), "licence");
    assert.equal(kind("/**\n * Based on rainbowBrackets <https://github.com/eriknewland/rainbowbrackets>\n *\n * Copyright (c) 2023 eriknewland\n * Released under the MIT License.\n */"), "licence");
    assert.equal(kind("/* © Example Holder */", "a.css"), "licence");
    assert.equal(kind("// Copyright 2021 Matthijs Steen"), "licence");
    assert.equal(kind("/* This Source Code Form is subject to the terms of the Mozilla Public\n * License, v. 2.0. If a copy of the MPL was not distributed with this\n * file, You can obtain one at https://mozilla.org/MPL/2.0/. */"), "licence", "the Exhibit A opening is recognised across a line break");
    assert.equal(kind("/**\n * Based on awesome-line-wrapping.js by dralletje\n * <https://gist.github.com/dralletje/058fe51415fe7dbac4709a65c615b52e>\n */"), "refused", "an attribution with no licence identifier or copyright statement is prose");
    assert.equal(kind("// copyright notices are kept"), "refused");
    assert.equal(kind("// Copyright"), "refused");
    assert.equal(kind("/* Released under the Apache-2.0 license. */"), "licence");
    assert.equal(kind("// This software is released under the MIT License."), "licence");
    assert.equal(kind("// Luau is MIT-licensed"), "licence");
    assert.equal(kind("// code licensed under the BSD terms"), "licence");
    assert.equal(kind("// see `LICENSE-luau.txt`"), "licence");
    assert.equal(kind("# terms in LICENSE.md", "scripts/a.py"), "licence");
    assert.equal(kind("// the license check runs before the build"), "refused", "the word license without a named licence is prose");
    assert.equal(kind("// MIT"), "refused");
    assert.equal(kind("// LICENSED_FEATURES gates the menu"), "refused");
    assert.equal(kind("// ©2024 Example Holder"), "licence");
    assert.equal(kind("// SPDX-FileCopyrightText: 2024 Example Holder"), "licence");
    assert.equal(kind("// Copyright (C) Microsoft Corporation. All rights reserved."), "licence");
    assert.equal(kind("// MIT License"), "licence", "a licence title on its own is a notice");
    assert.equal(kind("// Permission is hereby granted, free of charge, to any person obtaining a copy"), "licence");
    assert.equal(kind("// covered by the MPL 2.0 License"), "licence");
    for (const prose of [
      "// Copyright handling must stay centralized because the generator depends on it",
      "// MIT license detection runs before the build because the cache needs it",
      "// LICENSE checks must stay before the build because the cache needs it",
      "// the MIT License text is read from the package",
      "// The generator throws when LICENSE.md is missing because the cache needs it",
    ]) assert.equal(kind(prose), "refused", `${prose} discusses licences without being a notice`);
    assert.equal(kind("// see LICENSE.md"), "licence");
    assert.equal(kind("/** @type BuildOptions */", "src/a.js"), "directive", "TypeScript reads a type name without braces");
    assert.equal(kind("/** @type BuildOptions */"), "refused");

    const refusedLines = (text, file = "src/a.ts") => refusedComments(text, file, { root: checkout }).map((c) => c.line);
    assert.deepEqual(refusedLines("// workaround(webkit): first line\n// continues the note\n// still the note\nx();\n// @ts-ignore\n// not a continuation\n  // indented differently"), [6, 7]);
    assert.deepEqual(refusedLines("// workaround(webkit): note\nx(); // not a continuation"), [2]);
    const luau = "// Copying types, ported from Luau's `Clone.cpp`; Luau is MIT-licensed (see\n// `LICENSE-luau.txt`).\n//\n// The clone walks each type once.\nexport {};\n";
    assert.deepEqual(refusedLines(luau), [3, 4], "a paragraph of line comments holding a licence notice is kept whole, and the paragraph after it is judged alone");
    assert.deepEqual(refusedLines("// Constraints, ported from Luau's `Constraint.h`; Luau is\n// MIT-licensed (see `LICENSE-luau.txt`). The generator emits\n// one per relationship.\nexport {};\n"), [], "a licence named across a line break is recognised");
    assert.deepEqual(refusedLines("// prose\n  // Luau is MIT-licensed\nexport {};\n"), [1], "a line comment at another column is a separate paragraph");

    const strip = (text, file) => {
      const fallback = stripComments(text, file, { root: checkout, scanner: "fallback" });
      if (typescript && javascript(file)) assert.equal(stripComments(text, file), fallback, `both scanners strip ${JSON.stringify(text)} alike`);
      return fallback;
    };
    const source = [
      "// a whole-line note",
      "import { a } from \"./a\"; // a trailing note",
      "",
      "/**",
      " * A block note",
      " */",
      "",
      "// @ts-expect-error the value is untyped",
      "const b = f(/* inline */ a, c/* tight */d, /* lead */ e);",
      "// workaround(chromium): rows collapse in Chromium 131, https://crbug.com/1",
      "// with a continuation line",
      "const s = \"// kept\";",
      "",
      "// last note",
      "",
    ].join("\n");
    const expected = [
      "import { a } from \"./a\";",
      "",
      "// @ts-expect-error the value is untyped",
      "const b = f(a, c d, e);",
      "// workaround(chromium): rows collapse in Chromium 131, https://crbug.com/1",
      "// with a continuation line",
      "const s = \"// kept\";",
      "",
    ].join("\n");
    const stripped = strip(source, "src/a.ts");
    assert.equal(stripped, expected, "a removed comment takes its line and one neighbouring blank line when it stood between two blanks, at the file start, or at the file end");
    const codeTokens = (text) => {
      let code = "", at = 0;
      for (const c of scanComments(text, "src/a.ts")) {
        code += text.slice(at, c.start) + " ";
        at = c.end;
      }
      return (code + text.slice(at)).match(/[\w$]+|\S/g);
    };
    assert.deepEqual(codeTokens(stripped), codeTokens(source), "stripping leaves the non-comment token stream identical");
    assert.equal(strip("a();\r\n// note\r\nb();\r\n", "src/a.ts"), "a();\r\nb();\r\n");
    assert.equal(strip("if (receiver.name === \"_G\") return; // not a node name\n", "src/a.ts"), "if (receiver.name === \"_G\") return; // not a node name\n", "the opt-out scripts/check-node-names.mjs reads survives the strip");
    assert.equal(strip("describe(\"x\", () => {\n  // note\n\n  test();\n});\n", "src/a.ts"), "describe(\"x\", () => {\n  test();\n});\n", "a removed run directly after an opening bracket takes the blank line below it");
    assert.equal(strip("if (a) {\n  b();\n\n  // note\n}\n", "src/a.ts"), "if (a) {\n  b();\n}\n", "a removed run directly before a closing bracket takes the blank line above it");
    assert.equal(strip("f({\n  // one\n\n  // two\n});\n", "src/a.ts"), "f({\n});\n", "removals that meet across a blank line keep neither the blank nor any code between them");
    const asi = "function f() { return /* why\n*/ 1; }";
    const asiStripped = strip(asi, "src/a.ts");
    assert.equal(asiStripped, "function f() { return\n1; }", "a removed block comment holding a line break leaves one, so automatic semicolon insertion is unchanged");
    assert.equal(new Function(`${asiStripped}; return f();`)(), new Function(`${asi}; return f();`)());
    assert.equal(strip("<div title=\"<!-- kept -->\">ok</div><!-- note -->\n", "a.html"), "<div title=\"<!-- kept -->\">ok</div>\n");
    const adjacent = "function f() { return /* first *//* second\n*/ 1; }";
    const adjacentStripped = strip(adjacent, "src/a.ts");
    assert.equal(adjacentStripped, "function f() { return\n1; }", "merged removals keep the strongest separator either needed");
    assert.equal(new Function(`${adjacentStripped}; return f();`)(), undefined);
    assert.equal(strip("div/* prose */.active { color: red; }\na /* prose */ b {}\n", "a.css"), "div.active { color: red; }\na  b {}\n", "CSS removal inserts no whitespace a selector would read");
    assert.equal(strip("<p>hello<!-- prose -->world</p>\n", "a.html"), "<p>helloworld</p>\n", "HTML removal inserts no text");
    assert.equal(strip("<pre>A\n<!-- note --> B</pre><pre>A <!-- note -->\nB</pre>\n  <!-- line -->\n", "a.html"), "<pre>A\n B</pre><pre>A \nB</pre>\n  \n", "HTML removal takes the comment and nothing around it");
    const separator = String.fromCharCode(0x2028);
    const terminated = `function f() { const value = 1; // prose${separator}return value + 1; }`;
    const terminatedStripped = strip(terminated, "src/a.ts");
    assert.equal(terminatedStripped, `function f() { const value = 1;${separator}return value + 1; }`);
    assert.equal(new Function(`${terminatedStripped}; return f();`)(), 2);
    const adjacentRegex = "function f() { const r = /a//* prose */; return r.test(\"a\"); }";
    assert.equal(new Function(`${strip(adjacentRegex, "src/a.ts")}; return f();`)(), true, "a regex followed directly by a comment keeps its code");
    const crlf = "const s = \"a\\\r\n// literal\";\r\n";
    assert.equal(strip(crlf, "src/a.ts"), crlf);
    assert.equal(strip(source, "packages/sparkdown/src/inkjs/a.ts"), source, "an exempt file is returned unchanged");
    const mpl = "/* This Source Code Form is subject to the terms of the Mozilla Public\n * License, v. 2.0. If a copy of the MPL was not distributed with this\n * file, You can obtain one at https://mozilla.org/MPL/2.0/. */\n";
    const mit = "/**\n * Based on rainbowBrackets <https://github.com/eriknewland/rainbowbrackets>\n *\n * Copyright (c) 2023 eriknewland\n * Released under the MIT License.\n */\n";
    const ported = "// Copying types, ported from Luau's `Clone.cpp`; Luau is MIT-licensed (see\n// `LICENSE-luau.txt`).\n";
    const fullMit = [
      "// MIT License",
      "//",
      "// Copyright (c) 2024 Example Holder",
      "//",
      "// Permission is hereby granted, free of charge, to any person obtaining a copy",
      "// of this software and associated documentation files (the \"Software\"), to deal",
      "// in the Software without restriction.",
      "//",
      "// The above copyright notice and this permission notice shall be included in all",
      "// copies or substantial portions of the Software.",
      "//",
      "// THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR",
      "// IMPLIED.",
      "",
    ].join("\n");
    const symbols = "// ©2024 Example Holder\n// SPDX-FileCopyrightText: 2024 Example Holder\n";
    const apache = [
      "// Copyright 2024 Example Holder",
      "//",
      "// Licensed under the Apache License, Version 2.0 (the \"License\");",
      "// you may not use this file except in compliance with the License.",
      "// You may obtain a copy of the License at",
      "//",
      "//     http://www.apache.org/licenses/LICENSE-2.0",
      "//",
      "// Unless required by applicable law or agreed to in writing, software",
      "// distributed under the License is distributed on an \"AS IS\" BASIS,",
      "// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.",
      "// See the License for the specific language governing permissions and",
      "// limitations under the License.",
      "",
    ].join("\n");
    for (const notice of [mpl, mit, ported, fullMit, symbols, apache]) {
      assert.equal(strip(`${notice}\n// prose\nexport const n = 1;\n`, "src/a.ts"), `${notice}\nexport const n = 1;\n`, "a licence notice is kept verbatim while the prose beside it goes");
    }
    assert.equal(strip(`${fullMit.trimEnd()}\n//\n// The parser reads the header first.\nexport const n = 1;\n`, "src/a.ts"), `${fullMit}export const n = 1;\n`, "an empty comment line joins two notice paragraphs, not a notice and the prose after it");
    assert.equal(strip("// Copyright handling must stay centralized because the generator depends on it\nexport const n = 1;\n", "src/a.ts"), "export const n = 1;\n");
    const mixedDoc = "/**\n * Loads raw files.\n * @type {import('esbuild').Plugin}\n */\nconst p = {};\n";
    assert.equal(strip(mixedDoc, "src/a.js"), "/** @type {import('esbuild').Plugin} */\nconst p = {};\n", "a JavaScript doc comment keeps the type tags TypeScript reads and loses its prose");
    assert.equal(strip(mixedDoc, "src/a.ts"), "const p = {};\n", "TypeScript reads no JSDoc types in a TypeScript file");
    assert.equal(strip("  /**\n   * Adds.\n   * @param {number} a the left side\n   * @returns {number}\n   */\n  function f(a) { return a; }\n", "src/a.mjs"), "  /**\n   * @param {number} a the left side\n   * @returns {number}\n   */\n  function f(a) { return a; }\n");
    assert.equal(strip("/** Prose. @type is described here **/\nconst q = 1;\n", "src/a.js"), "const q = 1;\n");
  } finally {
    fs.rmSync(checkout, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
  console.log("PASS: comment policy classifier, scanner, strip function and edit route");
}
// Control bytes are built from their code points so that no tool writing this
// file can decode an escape into the byte itself.
const nul = String.fromCharCode(0), esc = String.fromCharCode(0x1b), bs = String.fromCharCode(92);
const writeHazards = [
  [event("Write", { file_path: "src/key.ts", content: `const SEP = "${nul}";\n` }), true],
  [event("Edit", { file_path: "src/key.ts", old_string: "a", new_string: `b${esc}[0m` }), true],
  [event("apply_patch", { command: `*** Begin Patch\n*** Update File: src/key.ts\n@@\n-a\n+const SEP = "${nul}";\n*** End Patch` }), true],
  [event("Write", { file_path: "src/key.ts", content: `const SEP = "${bs}u0000";\r\n\tx\n` }), false],
  [event("Bash", { command: `Set-Location C:/w; [IO.File]::WriteAllText("packages/a.ts", $t)` }), true],
  [event("Bash", { command: `$p = 'packages/a.ts'; $t = [System.IO.File]::ReadAllText($p)` }), true],
  [event("Bash", { command: `$w = "src"; [IO.File]::WriteAllText("$w/a.ts", $t)` }), true],
  [event("Bash", { command: `[IO.Path]::GetFullPath('a.ts')` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText('C:${bs}w${bs}a.ts', $t); [IO.File]::ReadAllText("/tmp/a")` }), false],
  [event("Bash", { command: `$w = "C:/w"; [System.IO.File]::WriteAllText("$w/a.ts", $t); [IO.File]::ReadAllText((Join-Path $PWD 'a'))` }), false],
  [event("Bash", { command: `Get-ChildItem | % { [IO.File]::ReadAllText($_.FullName) }` }), false],
  // Review round 1 (PR #754): expression arguments, text that only looks like a call, variable roots.
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path 'packages' 'a.ts'), $t)` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText(('packages/a.ts'), $t)` }), true],
  [event("Bash", { command: "[IO.File]::WriteAllText( `\n  'packages/a.ts', $t)" }), true],
  [event("Bash", { command: `# [IO.File]::ReadAllText('a.ts')\ngit status` }), false],
  [event("Bash", { command: `$body = @"\n[IO.File]::WriteAllText('a.ts', $t)\n"@\nSet-Content -Path (Join-Path $PWD 'notes.md') -Value $body` }), false],
  [event("Bash", { command: `Write-Output '[IO.File]::WriteAllText(''rel.ts'', $t)'` }), false],
  [event("Bash", { command: `$w = "$env:TEMP/x.ts"; [IO.File]::WriteAllText($w, $t)` }), false],
  [event("Bash", { command: `$r = "C:/w"; $w = "$r/a.ts"; [IO.File]::WriteAllText($w, $t)` }), false],
  [event("Bash", { command: `$r = "src"; $w = "$r/a.ts"; [IO.File]::WriteAllText($w, $t)` }), true],
  // Review round 2 (PR #754): compact assignments, named Join-Path parameters, subexpressions.
  [event("Bash", { command: `$p='packages/a.ts'; [IO.File]::WriteAllText($p, $t)` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -ChildPath 'a.ts' -Path 'packages'), $t)` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -Path:packages -ChildPath:a.ts), $t)` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -Resolve 'packages' 'a.ts'), $t)` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -Path $($PWD) -ChildPath 'a.ts'), $t)` }), false],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path (Get-Location) 'a.ts'), $t)` }), false],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -ChildPath 'a.ts' -Path $PWD), $t)` }), false],
  // Review round 3 (PR #754): a $() subexpression in a double-quoted string runs; common switches take no value.
  [event("Bash", { command: `Write-Output "$([IO.File]::WriteAllText('packages/a.ts', 'x'))"` }), true],
  [event("Bash", { command: `Write-Output "$([IO.File]::WriteAllText('C:/w/a.ts', 'x'))"` }), false],
  [event("Bash", { command: `$r = "C:/w"; Write-Output "$([IO.File]::WriteAllText("$r/a.ts", 'x'))"` }), false],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -Verbose 'C:/absolute-root' 'child.ts'), 'x')` }), false],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -Verbose 'packages' 'child.ts'), 'x')` }), true],
];
const inRoot = (e) => ({ ...e, cwd: root });
const checks = [
  [event("Bash", { command: "git stash pop" }), true],
  [event("Bash", { command: "git stash list" }), false],
  [inRoot(event("Bash", { command: "cd packages/sparkdown && npx vitest run" })), true],
  [inRoot(event("Bash", { command: "node scripts/test-suite.mjs start packages/sparkdown" })), true],
  [inRoot(event("Bash", { command: "node scripts/test-suite.mjs status .git/test-suites/run-1" })), false],
  [inRoot(event("Bash", { command: "npm run typecheck" })), true],
  [inRoot(event("Bash", { command: "npm run typecheck -- packages/sparkdown/tsconfig.json" })), false],
  [event("Bash", { command: "gh issue create --title x" }), true],
  [event("Bash", { command: "gh issue create --title x --type Task -R ImpowerGames/impower-internal" }), false],
  [event("Bash", { command: 'irm -InFile $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"}' }), true],
  [event("Write", { file_path: "C:\\repo\\packages\\sparkdown\\language\\sparkdown.language-grammar.json" }), true],
  [event("Edit", { file_path: "definitions/yaml/sparkdown.language-grammar.yaml" }), false],
  [event("apply_patch", { command: "*** Begin Patch\n*** Update File: ordinary.txt\n@@\n-a\n+b\n*** Add File: packages/sparkdown/language/sparkdown.language-config.json\n+{}\n*** End Patch" }), true],
  [event("apply_patch", { command: "*** Begin Patch\r\n*** Update File: plain.txt\r\n*** Move to: vscode-sparkdown/language/sparkdown.language-snippets.json\r\n@@\r\n-a\r\n+b\r\n*** End Patch" }), true],
  [event("apply_patch", { command: "*** Begin Patch\n*** Delete File: packages/sparkdown/language/sparkdown.language-grammar.json\n*** End Patch" }), true],
  [event("apply_patch", { command: "*** Begin Patch\n*** Add File: docs/example.txt\n+*** Update File: packages/sparkdown/language/sparkdown.language-grammar.json\n*** End Patch" }), false],
  ...writeHazards,
  // Codex's shell tool may be bash, where the quotes survive and no other tool exists (PR #803 round 1).
  [event("Bash", { command: `gh pr checks 1 --jq '.[] | select(.name == "test-suite")'` }), false],
];
const config = JSON.parse(fs.readFileSync(path.join(root, ".codex/hooks.json"), "utf8"));
const group = config.hooks.PreToolUse[0], hook = group.hooks[0];
const shell = process.platform === "win32" ? "powershell.exe" : "bash";
const args = process.platform === "win32" ? ["-NoProfile", "-NonInteractive", "-Command", hook.commandWindows] : ["-c", hook.command];
for (const [payload, blocked] of checks) {
  assert.ok(new RegExp(group.matcher).test(payload.tool_name), "configured matcher covers " + payload.tool_name);
  assert.equal(Boolean(decide(normalize(payload, "codex"))), blocked, JSON.stringify(payload));
  const child = spawnSync(shell, args, { cwd: path.join(root, "scripts"), input: JSON.stringify(payload), encoding: "utf8", windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(Boolean(child.stdout.trim() && JSON.parse(child.stdout).hookSpecificOutput?.permissionDecision === "deny"), blocked, child.stdout);
}
const malformed = spawnSync(shell, args, { cwd: root, input: "{broken", encoding: "utf8", windowsHide: true });
assert.equal(malformed.status, 2);
assert.match(malformed.stderr, /could not check/);
assert.throws(() => normalize(event("apply_patch", {}), "codex"), /missing/);
assert.throws(() => normalize(event("Bash", {}), "codex"), /missing/);
assert.throws(() => normalize({}, "unknown"), /adapter/);

// The portable command is also checked explicitly with Git for Windows bash.
const bash = process.platform === "win32" ? testShell() : "bash";
const portable = spawnSync(bash, ["-c", hook.command], { cwd: path.join(root, "scripts"), input: JSON.stringify(checks[0][0]), encoding: "utf8", windowsHide: true });
assert.equal(portable.status, 0, portable.stderr);
assert.match(portable.stdout, /permissionDecision.*deny/);
const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
const missingNode = spawnSync(bash, ["-c", "node() { return 127; }; " + settings.hooks.PreToolUse[0].hooks[0].command], { cwd: root, input: JSON.stringify(checks[5][0]), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8", windowsHide: true });
assert.equal(missingNode.status, 2, "missing runtime must block generated-file edits");
assert.match(missingNode.stderr, /node|runtime/i, "a blocking runtime failure needs an actionable reason");
if (process.platform === "win32") {
  const missingCommand = hook.commandWindows.replace("& node ", "& impower_node_missing_probe ");
  assert.notEqual(missingCommand, hook.commandWindows);
  const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", missingCommand], { cwd: root, input: JSON.stringify(checks[0][0]), encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 2, "a missing Windows runtime must block, not report a non-blocking hook failure");
  assert.match(result.stderr, /Repository hook|node|runtime/i);
}
// Claude-only tool shapes: MultiEdit content, the PowerShell dialect, and the
// PowerShell hook that .claude/settings.json ships, run under bash.
assert.ok(decide(normalize(event("MultiEdit", { file_path: "src/key.ts", edits: [{ old_string: "a", new_string: "b" }, { old_string: "c", new_string: `d${nul}` }] }), "claude")));
assert.equal(decide(normalize(event("Bash", { command: `[IO.File]::ReadAllText('a.ts')` }), "claude")), null, "bash has no .NET calls");
const dotnetHook = settings.hooks.PreToolUse.find((g) => g.matcher === "PowerShell").hooks[0].command;
for (const [command, blocked] of [[`$p = 'packages/a.ts'; [IO.File]::WriteAllText($p, $t)`, true], [`[IO.File]::WriteAllText('C:/w/a.ts', $t)`, false], ["git status", false]]) {
  const assertion = decide(normalize(event("PowerShell", { command }), "claude"));
  assert.equal(Boolean(assertion), blocked, command);
  const run = spawnSync(bash, ["-c", dotnetHook], { cwd: root, input: JSON.stringify(event("PowerShell", { command })), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8", windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(/permissionDecision.*deny/.test(run.stdout), blocked, command + " through the shipped hook");
}
// gh --jq filters holding a double quote reach jq damaged through Windows PowerShell 5.1 (#798).
const jqHook = settings.hooks.PreToolUse.find((g) => g.matcher === "PowerShell").hooks[1].command;
const listing = `gh api repos/o/r/issues/1/comments --paginate --jq '.[] | [.id, (.body | split("${bs}n")[0])] | @tsv'`;
assert.equal(decide(normalize(event("Bash", { command: listing }), "claude")), null, "bash passes embedded double quotes intact");
for (const [command, blocked] of [
  [listing, true],
  [`gh run list -q '.[] | select(.name | test("ubuntu"))'`, true],
  ['gh pr view 1 --jq=".title + `"x`""', true],
  // Review round 1 (PR #803): an attached -q value, and gh after an assignment or a wrapper.
  [`gh api rate_limit -q'.rate.limit | tostring == "5000"'`, true],
  [`$out = gh api x --jq '.a == "b"'`, true],
  [`env gh api x --jq '.a == "b"'`, true],
  [`gh pr checks 1 --jq '.[] | .name'`, false],
  [`git log -q --format='"%s"'`, false],
  [`Write-Output "gh --jq '.a + x'"`, false],
]) {
  assert.equal(Boolean(decide(normalize(event("PowerShell", { command }), "claude"))), blocked, command);
  const run = spawnSync(bash, ["-c", jqHook], { cwd: root, input: JSON.stringify(event("PowerShell", { command })), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8", windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(/permissionDecision.*deny/.test(run.stdout), blocked, command + " through the shipped hook");
}
console.log("PASS: shared policy, complete multi-file patches, native hook configuration, nested cwd and blocking failures");
