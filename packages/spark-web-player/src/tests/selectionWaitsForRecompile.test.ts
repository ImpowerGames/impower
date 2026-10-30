import { describe, expect, test } from "vitest";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";

const URI = "file://proj/main.sd";

const PROGRAM = {
  uri: URI,
  version: 3,
  summary: true,
  runnable: true,
  scripts: { [URI]: 3 },
} as any;

function controllerWithProgram() {
  const controller: any = new GamePlayerController(
    document.createElement("div"),
    {} as any,
  );
  controller._program = PROGRAM;
  controller.previews = [] as { file: string; line: number }[];
  controller.updatePreview = async (
    _program: unknown,
    file: string,
    line: number,
  ) => {
    controller.previews.push({ file, line });
  };
  return controller;
}

function selection(line: number, programOutdated?: boolean) {
  return {
    method: "compiler/didSelect",
    params: {
      textDocument: { uri: URI },
      selectedRange: {
        start: { line, character: 0 },
        end: { line, character: 0 },
      },
      docChanged: false,
      userEvent: true,
      programOutdated,
    },
  } as any;
}

describe("a click made before the edit it follows has been compiled (#489)", () => {
  test("is not previewed against the program the edit has outrun", async () => {
    const controller = controllerWithProgram();

    await controller.handleSelectedCompilerDocument(selection(8, true));

    expect(controller.previews).toEqual([]);
  });

  test("is remembered, so the compile it is waiting for previews it", async () => {
    const controller = controllerWithProgram();

    await controller.handleSelectedCompilerDocument(selection(8, true));
    expect(controller._options.startFrom).toEqual({ file: URI, line: 8 });

    await controller.loadProgram(PROGRAM);

    expect(controller.previews).toEqual([{ file: URI, line: 8 }]);
  });

  test("is previewed at once when the program is still current", async () => {
    const controller = controllerWithProgram();

    await controller.handleSelectedCompilerDocument(selection(8, false));

    expect(controller.previews).toEqual([{ file: URI, line: 8 }]);
  });

  test("in a file the program never read still asks for a compile", async () => {
    const compiled: string[] = [];
    setWorkspace({
      compileTextDocument: async (p: any) => {
        compiled.push(p.textDocument.uri);
      },
    } as any);
    const controller = controllerWithProgram();

    try {
      await controller.handleSelectedCompilerDocument({
        ...selection(2, true),
        params: {
          ...selection(2, true).params,
          textDocument: { uri: "file://proj/other.sd" },
        },
      });

      expect(compiled).toEqual(["file://proj/other.sd"]);
      expect(controller.previews).toEqual([]);
    } finally {
      setWorkspace(undefined as any);
    }
  });

  test("is previewed at once when the compiler said nothing either way", async () => {
    const controller = controllerWithProgram();

    await controller.handleSelectedCompilerDocument(selection(8, undefined));

    expect(controller.previews).toEqual([{ file: URI, line: 8 }]);
  });
});
