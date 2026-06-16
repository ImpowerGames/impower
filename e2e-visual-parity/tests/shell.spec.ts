import { expect, test } from "@playwright/test";
import { BASIC_FIXTURE } from "../fixtures/basic";
import { loadAllowlist, validateAllowlist } from "../helpers/allowlist";
import { h } from "../helpers/handles";
import {
  compareCheckpoint,
  setupStacks,
  type Checkpoint,
} from "../helpers/parity-fixture";

const SCENARIO = "shell-hydrated-default-logic";

const CHECKPOINTS: Checkpoint[] = [
  {
    // Whole editor: looser gate — icon-heavy chrome + any intentional restyles.
    id: "full-viewport",
    maxDiffRatio: 0.02,
    probes: [
      { name: "project-name-input", at: h.projectName, props: ["fontSize", "fontWeight", "color"] },
      { name: "sync-caption", at: h.syncCaption, props: ["fontSize", "color"] },
      { name: "editor", at: h.editor, props: ["fontFamily", "fontSize", "lineHeight", "backgroundColor"] },
    ],
  },
  {
    // Script-editor region clip — tighter; CodeMirror is the same lib in both.
    id: "script-editor",
    target: h.editor,
    maxDiffRatio: 0.01,
    probes: [
      { name: "editor-content", at: h.editorContent, props: ["fontFamily", "fontSize", "lineHeight", "whiteSpace", "color"] },
      { name: "editor-gutters", at: h.editorGutters, props: ["color", "backgroundColor", "fontSize"] },
    ],
  },
];

test("@smoke allowlist.yaml is valid", () => {
  const issues = validateAllowlist(loadAllowlist(), new Date());
  expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
});

test("@smoke shell parity (hydrated default Logic view)", async ({ browser }) => {
  const al = loadAllowlist();
  const now = new Date();
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    const failures: string[] = [];
    for (const cp of CHECKPOINTS) {
      const r = await compareCheckpoint(SCENARIO, cp, a, b, al, now);
      console.log(
        `[${cp.id}] pixel ${(r.pixel.ratio * 100).toFixed(3)}% (<=${(r.pixel.maxDiffRatio * 100).toFixed(2)}%) ${r.pixel.pass ? "PASS" : "FAIL"} | probes ${r.probes.length} | failures ${r.failures.length}`,
      );
      for (const f of r.failures) console.log("    " + f);
      failures.push(...r.failures);
    }
    expect(failures, `\nunsuppressed parity failures:\n${failures.join("\n")}`).toEqual([]);
  } finally {
    await dispose();
  }
});
