import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, test, vi } from "vitest";
import { URI } from "vscode-uri";

vi.mock("vscode", () => ({
  workspace: { fs: { readFile: async () => new Uint8Array() } },
}));

import { getWorkspaceAudioFile } from "../src/utils/getWorkspaceAudioFile";
import { getWorkspaceFontFile } from "../src/utils/getWorkspaceFontFile";
import { getWorkspaceImageFile } from "../src/utils/getWorkspaceImageFile";
import { getWorkspaceVideoFile } from "../src/utils/getWorkspaceVideoFile";

const MAIN = "file:///proj/main.sd";
const fileUri = (path: string) => URI.file(path) as never;

const missingAudio = (file: { uri: string; name: string; type: string; ext: string }, ref: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: `scene start\n  ((play music ${ref}))\n  done\nend\n`,
        version: 1,
        languageId: "sparkdown",
      },
      file,
    ],
  } as never);
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
    return (program.diagnostics?.[MAIN] ?? [])
      .map((d: any) => (typeof d.message === "string" ? d.message : d.message.value))
      .filter((m: string) => m.startsWith("Cannot find audio"));
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

describe("the extension names a percent-encoded asset file by its decoded name (I-2436)", () => {
  test("café.wav, read from its VS Code URI, satisfies ((play music café))", async () => {
    const file = await getWorkspaceAudioFile(fileUri("/proj/Assets/Audio/café.wav"));
    expect(file.uri).toBe("file:///proj/Assets/Audio/caf%C3%A9.wav");
    expect(file.name).toBe("café");
    expect(missingAudio(file, "café")).toEqual([]);
    expect(missingAudio(file, "cafe")).toEqual(["Cannot find audio named `cafe`"]);
  });

  test("every asset reader decodes the name and keeps ASCII, @ and ~ names", async () => {
    expect((await getWorkspaceVideoFile(fileUri("/proj/Assets/Video/über intro.mp4"))).name).toBe("über intro");
    expect((await getWorkspaceFontFile(fileUri("/proj/Assets/Fonts/naïve.ttf"))).name).toBe("naïve");
    expect((await getWorkspaceImageFile(fileUri("/proj/Assets/Images/café@smile.png"))).name).toBe("café@smile");
    expect((await getWorkspaceImageFile(fileUri("/proj/Assets/Images/bunny~2_ears.png"))).name).toBe("bunny");
    expect((await getWorkspaceAudioFile(fileUri("/proj/Assets/Audio/door-bell.wav"))).name).toBe("door-bell");
  });
});
