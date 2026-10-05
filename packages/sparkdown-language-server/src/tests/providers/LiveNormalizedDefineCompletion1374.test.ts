import "@impower/sparkdown/src/inkjs/engine/Container";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { complete } from "./completionHarness";

// Scratch qualification for the whole project proposed for live verification.
// No test-only context is injected. Canonical main defines its own party.
// Marked main explicitly includes the supporting party; the marked statement's
// existing ignored execution leaves that real included context unchanged.
const evidence = fileURLToPath(new URL("../../../../../docs/verification/1374/fixtures/", import.meta.url));
const project = `${evidence}/artwork`;
const uri = "file://local/main.sd";
const definitions = readFileSync(`${project}/scripts/definitions.sd`, "utf8");
const svg = readFileSync(`${project}/assets/mia.svg`, "utf8");

test.each(["canonical", "marked"])("normalized live artwork completion project is qualified: %s", mode => {
  const original = readFileSync(mode === "canonical"
    ? `${project}/main.sd`
    : `${evidence}/artwork-marked.sd`, "utf8");
  const typed = original.replace('"sd"', '"sad"');
  expect(typed === original).toBe(false);
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri: "file://local/scripts/definitions.sd", type: "script", name: "definitions", ext: "sd", text: definitions, version: 1, languageId: "sparkdown" },
    { uri, type: "script", name: "main", ext: "sd", text: typed, version: 2, languageId: "sparkdown" },
    { uri: "file://local/assets/mia.svg", type: "image", name: "mia", ext: "svg", data: svg, version: 1 },
  ] });
  const program = compiler.compile({ textDocument: { uri } }).program;
  const cursorSource = typed.replace('"sad"', '"sa@1d"');
  const result = complete(cursorSource, { program });
  const sad = result.items.find(item => item.label === "face.sad");
  console.log(JSON.stringify({
    fixture: mode, uri, original, typed, definitions, svg,
    diagnostics: program.diagnostics ?? {},
    diagnosticsPropertyPresent: Object.hasOwn(program, "diagnostics"),
    scripts: program.scripts,
    image: program.context?.["image"]?.["mia"],
    filteredImage: program.context?.["filtered_image"]?.["party"],
    labels: result.labels,
    sad,
  }));
  if (mode === "marked") {
    expect(Object.keys(program.scripts)).toContain("file://local/scripts/definitions.sd");
  } else {
    expect(Object.keys(program.scripts)).not.toContain("file://local/scripts/definitions.sd");
  }
  expect(Object.keys(program.scripts)).toContain(uri);
  expect(program.context?.["image"]?.["mia"]?.attribute_vocabulary?.groups?.face?.options).toEqual(["happy", "sad"]);
  expect(program.context?.["filtered_image"]?.["party"]?.image?.$name).toBe("mia");
  expect(Object.values(program.diagnostics ?? {}).flat().some(diagnostic => diagnostic.severity === 1)).toBe(false);
  expect(sad).toBeDefined();
  expect(sad?.data.filtered).toEqual({ image: "mia", attributes: ["face.sad"] });
});
