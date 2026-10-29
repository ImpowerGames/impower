import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import type { File } from "../../compiler/types/File";

const URI = "file://proj/main.sd";

const asset = (type: string, name: string, ext: string): File => ({
  uri: `file://proj/${name}.${ext}`,
  type,
  name,
  ext,
  src: `/file:/proj/${name}.${ext}?v=1`,
});

const ASSETS: File[] = [
  asset("video", "intro", "webm"),
  asset("image", "bunny", "png"),
  asset("audio", "theme", "mp3"),
];

function diagnosticsFor(source: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
      ...ASSETS,
    ],
  });
  const result = compiler.compile({ textDocument: { uri: URI } });
  const out: string[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      out.push(typeof raw === "string" ? raw : raw?.value ?? JSON.stringify(d));
    }
  }
  return out;
}

function referencesFor(source: string, text: string) {
  const reg = new SparkdownDocumentRegistry(["references"]);
  const uri = "file:///ref.sd";
  reg.set({
    textDocument: { uri, text: source, version: 1, languageId: "sparkdown" },
  });
  const references = reg.annotations(uri)!.references;
  const out: { symbolIds?: string[]; kind?: string }[] = [];
  const cur = references.iter();
  while (cur.value) {
    if (source.slice(cur.from, cur.to).trim() === text) {
      out.push((cur.value as any).type ?? {});
    }
    cur.next();
  }
  return out;
}

describe("[[play NAME]] validation", () => {
  test.each([
    "[[play intro]]",
    "[[play intro loop]]",
    "[[play intro mute]]",
    "[[play intro with fade]]",
    "[[play intro loop mute with fade]]",
  ])("%s with a video name produces no diagnostics", (line) => {
    expect(diagnosticsFor(`${line}\n`)).toEqual([]);
  });

  test("an image name is reported as a video that cannot be found", () => {
    const diags = diagnosticsFor(`[[play bunny]]\n`);
    expect(diags).toContain("Cannot find video named `bunny`");
    expect(diags.some((m) => m.includes("Unrecognized"))).toBe(false);
  });

  test("an unknown name is reported as a video that cannot be found", () => {
    expect(diagnosticsFor(`[[play ghost]]\n`)).toContain(
      "Cannot find video named `ghost`",
    );
  });

  test.each([
    "[[play intro bunny]]",
    "[[play intro intro]]",
    "[[play intro+bunny]]",
    "[[play intro loop bunny]]",
    "[[play intro mute loop bunny]]",
    "[[play intro with fade bunny]]",
  ])(
    "%s names more than one video and is reported",
    (line) => {
      const diags = diagnosticsFor(`${line}\n`);
      expect(diags.some((m) => m.startsWith("`play` takes one video name"))).toBe(true);
      expect(diags.some((m) => m.includes("Cannot find image"))).toBe(false);
    },
  );

  test("a `play` with no name is reported", () => {
    const diags = diagnosticsFor(`[[play]]\n`);
    expect(diags.some((m) => m.startsWith("`play` takes one video name"))).toBe(true);
  });

  test("((play CHANNEL NAME)) stays the audio verb", () => {
    expect(diagnosticsFor(`((play music theme))\n`)).toEqual([]);
  });
});

describe("[[play NAME]] references", () => {
  test("the name in the target slot resolves to video.<name>", () => {
    const refs = referencesFor(`[[play intro with fade]]\n`, "intro");
    expect(refs).toHaveLength(1);
    expect(refs[0]?.symbolIds).toEqual(["video.intro"]);
    expect(refs[0]?.kind).toBe("read");
  });

  test("the target of ((play CHANNEL NAME)) is still a channel", () => {
    const refs = referencesFor(`((play music theme))\n`, "music");
    expect(refs[0]?.symbolIds).toEqual(["channel.music"]);
  });
});
