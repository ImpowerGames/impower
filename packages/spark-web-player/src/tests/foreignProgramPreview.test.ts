// Opening a script compiles it, and a script the story does not include
// compiles on its own, into a program that holds only that script. On a cold
// start in VS Code every script of the project is open, so such programs reach
// the player beside the story's. When one came last, the player previewed the
// point it was showing against it: the point is not in it, so nothing
// displayed, the panel was never revealed and it stayed black for good
// (#1874).

import { describe, expect, test } from "vitest";
import { GamePlayerController } from "../GamePlayerController";

const MAIN = "file://proj/main.sd";
const LOOSE = "file://proj/scripts/unused.sd";

const program = (uri: string, version: number) =>
  ({
    uri,
    version,
    // The summary of a program that runs, as the page is sent one.
    summary: true,
    runnable: true,
    scripts: { [uri]: 1 },
  }) as any;

/** A controller previewing `MAIN` at line 8, with the preview recorded
 *  rather than run: `updatePreview` builds a game and a pixi Application,
 *  and none of that is what these tests are about. */
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
    // PLAY runs the program the player holds, which stays the story's.
    expect(controller._program.uri).toBe(MAIN);
  });

  test("is not previewed when it arrives first, and the story's still is", async () => {
    const controller = controllerPreviewingMain();

    await controller.loadProgram(program(LOOSE, 1));
    await controller.loadProgram(program(MAIN, 1));

    expect(controller.previews).toEqual([{ program: MAIN, line: 8 }]);
  });

  test("is not previewed when it is the first the player is sent", async () => {
    // Before its first program the player has no point of its own: it
    // previews from the one each program was compiled to start from, which
    // the compile of every open script names alike.
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

    // A selection in that script, which compiles it again.
    controller._options.startFrom = { file: LOOSE, line: 2 };
    await controller.loadProgram(program(LOOSE, 2));

    expect(controller.previews).toEqual([
      { program: MAIN, line: 8 },
      { program: LOOSE, line: 2 },
    ]);
  });
});
