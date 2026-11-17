import { describe, expect, it } from "vitest";
import { assetNameOf, imageFileNameOf } from "../../attributes/imageFileName";
import { testCompiler } from "../engineUnderTest";

const SCRIPT = "file:///proj/main.sd";

const missingAudio = (audioUri: string, ref: string) => {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: SCRIPT,
        type: "script",
        name: "main",
        ext: "sd",
        text: `scene start\n  ((play music ${ref}))\n  done\nend\n`,
        version: 1,
        languageId: "sparkdown",
      },
      { uri: audioUri, type: "audio", name: assetNameOf(audioUri, "audio"), ext: "wav" },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: SCRIPT } }).program;
  return (program.diagnostics?.[SCRIPT] ?? [])
    .map((d: any) => (typeof d.message === "string" ? d.message : d.message.value))
    .filter((m: string) => m.startsWith("Cannot find audio"));
};

describe("percent-encoded asset file names (I-2436)", () => {
  it("names a percent-encoded non-ASCII file by its decoded stem", () => {
    expect(assetNameOf("file:///proj/Assets/Audio/caf%C3%A9.wav", "audio")).toBe("café");
    expect(assetNameOf("file:///proj/Assets/Images/caf%C3%A9%40smile.png", "image")).toBe("café@smile");
    expect(assetNameOf("file:///proj/Assets/Images/caf%C3%A9~hair.png", "image")).toBe("café");
  });

  it("finds a non-ASCII audio file from its VS Code URI", () => {
    expect(missingAudio("file:///proj/Assets/Audio/caf%C3%A9.wav", "café")).toEqual([]);
  });

  it("keeps ASCII, hyphen, @ and ~ names and image splitting unchanged", () => {
    expect(assetNameOf("file:///proj/Assets/Audio/door-bell.wav", "audio")).toBe("door-bell");
    expect(assetNameOf("file:///proj/Assets/Images/bunny%40happy.png", "image")).toBe("bunny@happy");
    expect(imageFileNameOf("file:///proj/Assets/Images/bunny%40happy~2_ears.png")).toEqual({
      name: "bunny%40happy",
      picture: "bunny%40happy",
      alternate: "happy",
      layer: "ears",
      order: 2,
    });
  });

  it("keeps a stem that is not a valid percent-encoding", () => {
    expect(assetNameOf("file:///proj/Assets/Audio/100%.wav", "audio")).toBe("100%");
    expect(assetNameOf("file:///proj/Assets/Images/a%40b%.png", "image")).toBe("a@b%");
  });
});
