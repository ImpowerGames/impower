import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";

const uri = "file:///project/main.sd";
const video: File = {
  uri: "file:///project/assets/bunny_idle.webm",
  type: "video",
  name: "bunny_idle",
  ext: "webm",
  src: "/file:/local/assets/bunny_idle.webm",
};

const guideAnimateExamples = () =>
  readFileSync(new URL("../../../docs/guide/Video.md", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => /^\| `(\[\[animate [^`]*\]\])` \|/.exec(line)?.[1])
    .filter((example): example is string => example !== undefined);

describe("video guide animate example (I-1736)", () => {
  it("documents one [[animate]] example", () => {
    expect(guideAnimateExamples()).toHaveLength(1);
  });

  it("compiles after a movie on the same layer without naming a missing image", () => {
    const [example] = guideAnimateExamples();
    const text = `[[show portrait bunny_idle]]\n${example}\n`;
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        { uri, name: "main", type: "script", ext: "sd", text, version: 1, languageId: "sparkdown" },
        video,
      ],
    });
    const program = compiler.compile({ textDocument: { uri } }).program;
    const messages = (program.diagnostics?.[uri] ?? []).map((d) =>
      typeof d.message === "string" ? d.message : d.message.value,
    );
    expect(messages).toEqual([]);
  });
});
