import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import {
  collectDefineTypeNames,
  defineTypeNameWalkStats,
  resetDefineTypeNameWalkStats,
} from "../../compiler/utils/collectDefineTypeNames";
import { programContent } from "../programListing";

const URI = "inmemory:///main.sd";

let nextVersion = 2;

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

function fixture() {
  const L: string[] = [];
  L.push("title: Define Type Fixture");
  L.push("author: Anonymous");
  L.push("");
  L.push("define base_actor as object with");
  L.push("  hp = 10");
  L.push("end");
  L.push("");
  L.push("define hero as base_actor with");
  L.push(`  name = "Hero"`);
  L.push("end");
  L.push("");
  L.push("define villain as base_actor with");
  L.push(`  name = "Villain"`);
  L.push("end");
  L.push("");
  L.push("define spawner as object with");
  L.push("  rate = 1");
  L.push("end");
  L.push("");
  for (let b = 0; b < 12; b++) {
    L.push(`function build_${b}()`);
    for (let i = 0; i < 30; i++) {
      L.push(`  local pad_${b}_${i} = ${i} + 1`);
    }
    L.push("  if pad_" + b + "_1 > 0 then");
    L.push("    for i = 1, 3 do");
    L.push(`      local made_${b} = new spawner()`);
    L.push("    end");
    L.push("  end");
    L.push(`  return pad_${b}_1`);
    L.push("end");
    L.push("");
  }
  for (let s = 0; s < 12; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    for (let i = 0; i < 12; i++) {
      L.push(`  Action describing room ${s} in careful detail, line ${i}.`);
    }
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

function open(text: string) {
  const registry = new SparkdownDocumentRegistry(["compilations"]);
  registry.add({
    textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" },
  });
  return registry;
}

function insert(registry: SparkdownDocumentRegistry, text: string, offset: number, inserted: string) {
  const at = posAt(text, offset);
  registry.update({
    textDocument: { uri: URI, version: nextVersion++ },
    contentChanges: [{ range: { start: at, end: at }, text: inserted }],
  });
  return text.slice(0, offset) + inserted + text.slice(offset);
}

function replace(
  registry: SparkdownDocumentRegistry,
  text: string,
  find: string,
  replacement: string,
) {
  const offset = text.indexOf(find);
  expect(offset, `fixture is missing ${JSON.stringify(find)}`).toBeGreaterThanOrEqual(0);
  registry.update({
    textDocument: { uri: URI, version: nextVersion++ },
    contentChanges: [
      {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replacement,
      },
    ],
  });
  return text.slice(0, offset) + replacement + text.slice(offset + find.length);
}

function configured(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return compiler;
}

function names(registry: SparkdownDocumentRegistry) {
  return [...registry.defineTypeNames(URI)].sort();
}

function coldNames(registry: SparkdownDocumentRegistry) {
  const tree = registry.tree(URI)!;
  const text = registry.get(URI)!.getText();
  return [...collectDefineTypeNames(tree, (f, t) => text.slice(f, t))].sort();
}

describe("define type names are collected incrementally (#649)", () => {
  it("costs a registry that does not lower nothing per edit", () => {
    let text = fixture();
    const registry = new SparkdownDocumentRegistry([
      "declarations",
      "formatting",
      "references",
    ]);
    resetDefineTypeNameWalkStats();
    registry.add({
      textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" },
    });
    expect(defineTypeNameWalkStats().nodes).toBe(0);

    const offset = text.lastIndexOf("careful") + "careful".length;
    resetDefineTypeNameWalkStats();
    text = insert(registry, text, offset, "z");
    const edited = defineTypeNameWalkStats();
    expect(
      edited.nodes,
      `a registry with no compilation annotator walked ${edited.nodes} nodes over ${JSON.stringify(edited.ranges)}`,
    ).toBe(0);

    expect(names(registry)).toEqual(coldNames(registry));
  });

  it("visits only the rebuilt region after an edit", () => {
    let text = fixture();
    const registry = open(text);
    resetDefineTypeNameWalkStats();
    coldNames(registry);
    const fullWalkNodes = defineTypeNameWalkStats().nodes;
    expect(fullWalkNodes).toBeGreaterThan(2000);

    const offset = text.lastIndexOf("careful") + "careful".length;
    resetDefineTypeNameWalkStats();
    text = insert(registry, text, offset, "z");
    const edited = defineTypeNameWalkStats();

    expect(
      edited.nodes,
      `an edit walked ${edited.nodes} nodes; a cold walk of the whole document is ${fullWalkNodes}. ` +
        `Ranges walked: ${JSON.stringify(edited.ranges)}`,
    ).toBeLessThan(1000);
    expect(names(registry)).toEqual(coldNames(registry));
  });

  it("matches a cold walk when a type name is added, removed or renamed", () => {
    let text = fixture();
    const registry = open(text);

    text = replace(registry, text, "define spawner as object with", "define spawner as base_actor with");
    expect(names(registry)).toEqual(coldNames(registry));

    text = replace(registry, text, "define spawner as base_actor with", "define maker as base_actor with");
    while (text.includes("new spawner()")) {
      text = replace(registry, text, "new spawner()", "new maker()");
    }
    expect(names(registry)).toEqual(coldNames(registry));
    expect(names(registry)).toContain("maker");
    expect(names(registry)).not.toContain("spawner");

    text = replace(registry, text, "define hero as base_actor with", "define hero as object with");
    text = replace(registry, text, "define villain as base_actor with", "define villain as object with");
    text = replace(registry, text, "define maker as base_actor with", "define maker as object with");
    expect(names(registry)).toEqual(coldNames(registry));
    expect(names(registry)).not.toContain("base_actor");

    text = replace(registry, text, "local made_0 = new maker()", "local made_0 = new maker()\n      local also_0 = new hero()");
    expect(names(registry)).toEqual(coldNames(registry));
    expect(names(registry)).toContain("hero");
  });

  it("does not re-walk every script on each compile", () => {
    const text = fixture();
    const compiler = configured(text);
    compiler.compile({ textDocument: { uri: URI } });

    resetDefineTypeNameWalkStats();
    compiler.compile({ textDocument: { uri: URI } });
    expect(defineTypeNameWalkStats().nodes).toBe(0);

    const offset = text.lastIndexOf("careful") + "careful".length;
    const at = posAt(text, offset);
    resetDefineTypeNameWalkStats();
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: "z" }],
    });
    compiler.compile({ textDocument: { uri: URI } });
    const walked = defineTypeNameWalkStats();
    expect(
      walked.nodes,
      `an edit plus a compile walked ${walked.nodes} nodes over ${JSON.stringify(walked.ranges)}`,
    ).toBeLessThan(1000);
  });

  it("compiles the same program as a cold compile when a name enters the set far from its defines", () => {
    const text = fixture();
    const incremental = configured(text);
    incremental.compile({ textDocument: { uri: URI } });

    const find = "local made_0 = new spawner()";
    const offset = text.indexOf(find);
    expect(offset).toBeGreaterThanOrEqual(0);
    const inserted = "\n      local also_0 = new hero()";
    const at = posAt(text, offset + find.length);
    incremental.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: inserted }],
    });
    const afterText =
      text.slice(0, offset + find.length) + inserted + text.slice(offset + find.length);
    const incrementalProgram = incremental.compile({
      textDocument: { uri: URI },
    }).program;
    const coldProgram = configured(afterText).compile({
      textDocument: { uri: URI },
    }).program;

    expect(programContent(incrementalProgram.chunks)).toEqual(
      programContent(coldProgram.chunks),
    );
    expect(JSON.stringify(incrementalProgram.context)).toEqual(
      JSON.stringify(coldProgram.context),
    );
    expect(JSON.stringify(incrementalProgram.diagnostics)).toEqual(
      JSON.stringify(coldProgram.diagnostics),
    );
  });
});
