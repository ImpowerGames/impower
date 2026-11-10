import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getScriptReferences } from "../../../packages/sparkdown-language-server/src/utils/providers/getScriptReferences";
import { describe, expect, it } from "vitest";
import { scriptRows } from "../../src/modules/spark-editor/workspace/scriptsListing";

const PROJECT = "file:///p/";

const FIXTURE: Record<string, string> = {
  "main.sd": "scene start\n  -> chapter_one\n  -> chapter_three\nend\n",
  "Scripts/chapter_1.sd": "scene chapter_one\n  raffles: Hi.\n  & greet()\n  -> chapter_two\nend\n",
  "Scripts/chapter_2.sd": "scene chapter_two\n  raffles: Again.\n  & greet()\nend\n",
  "Scripts/chapter_3.sd": "scene chapter_three\n  raffles: Last.\nend\n",
  "Scripts/cast.sd": 'define raffles as character with\n  name = "RAFFLES"\nend\n',
  "Scripts/helpers.sd": "function greet()\n  return 1\nend\n",
  "Scripts/unused.sd": "scene unused\n  Nobody comes here.\nend\n",
};

const referencesOf = () => {
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  for (const [path, text] of Object.entries(FIXTURE)) {
    documents.set({ textDocument: { uri: PROJECT + path, text, version: 1, languageId: "sparkdown" } });
  }
  const workspace = {
    document: (uri: string) => documents.get(uri),
    annotations: (uri: string) => documents.annotations(uri),
    uris: () => documents.keys(),
    compilerConfig: undefined,
  } as Parameters<typeof getScriptReferences>[0];
  return getScriptReferences(workspace, undefined).map((r) => ({
    from: r.from.slice(PROJECT.length),
    to: r.to.slice(PROJECT.length),
    divert: r.divert,
  }));
};

const listing = {
  files: Object.fromEntries(Object.keys(FIXTURE).map((path) => [path, { modified: 1, size: 1 }])),
  folders: ["Scripts"],
};

const order = (sort: string) =>
  scriptRows({ listing, references: referencesOf(), folder: "", query: "", sort }).map(
    (row) => `${row.name}:${sort.startsWith("uses") ? row.uses : row.position}`,
  );

describe("Uses and Story order from the language server's script references", () => {
  it("sorts by Uses, most used first, with the counts the references give", () => {
    expect(order("uses-desc")).toEqual([
      "Main:0",
      "cast.sd:3",
      "helpers.sd:2",
      "chapter_1.sd:1",
      "chapter_2.sd:1",
      "chapter_3.sd:1",
      "unused.sd:0",
    ]);
  });

  it("sorts by Story order, Main first, then each script as the story first reaches it, unreached last", () => {
    expect(order("story-asc").map((entry) => entry.split(":")[0])).toEqual([
      "Main",
      "chapter_1.sd",
      "chapter_2.sd",
      "chapter_3.sd",
      "cast.sd",
      "helpers.sd",
      "unused.sd",
    ]);
  });
});
