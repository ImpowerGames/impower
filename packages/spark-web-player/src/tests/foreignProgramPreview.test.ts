import { describe, expect, test } from "vitest";
import { GamePlayerController } from "../GamePlayerController";

const MAIN = "file://proj/main.sd";
const LOOSE = "file://proj/scripts/unused.sd";

const program = (uri: string, version: number) =>
  ({
    uri,
    version,
    summary: true,
    runnable: true,
    scripts: { [uri]: 1 },
  }) as any;

function controllerPreviewingMain() {
  const controller: any = new GamePlayerController(
    document.createElement("div"),
    {} as any,
  );
  controller._options = { startFrom: { file: MAIN, line: 8 } };
  controller.previews = [] as { program: string; line: number }[];
  controller.updatePreview = async (
    previewed: { uri: string },
    _file: string,
    line: number,
  ) => {
    controller.previews.push({ program: previewed.uri, line });
  };
  return controller;
}

describe("a program compiled for a script the preview is not showing (#1874)", () => {
  test("is not previewed when it arrives after the story's", async () => {
    const controller = controllerPreviewingMain();

    await controller.loadProgram(program(MAIN, 1));
    await controller.loadProgram(program(LOOSE, 1));

    expect(controller.previews).toEqual([{ program: MAIN, line: 8 }]);
    expect(controller._program.uri).toBe(MAIN);
  });

  test("is not previewed when it arrives first, and the story's still is", async () => {
    const controller = controllerPreviewingMain();

    await controller.loadProgram(program(LOOSE, 1));
    await controller.loadProgram(program(MAIN, 1));

    expect(controller.previews).toEqual([{ program: MAIN, line: 8 }]);
  });

  test("is not previewed when it is the first the player is sent", async () => {
    const controller = controllerPreviewingMain();
    controller._options = undefined;
    const startFrom = { file: MAIN, line: 8 };

    await controller.loadProgram({ ...program(LOOSE, 1), startFrom });
    await controller.loadProgram({ ...program(MAIN, 1), startFrom });

    expect(controller.previews).toEqual([{ program: MAIN, line: 8 }]);
  });

  test("is previewed once the preview moves to its script", async () => {
    const controller = controllerPreviewingMain();
    await controller.loadProgram(program(MAIN, 1));

    controller._options.startFrom = { file: LOOSE, line: 2 };
    await controller.loadProgram(program(LOOSE, 2));

    expect(controller.previews).toEqual([
      { program: MAIN, line: 8 },
      { program: LOOSE, line: 2 },
    ]);
  });
});
