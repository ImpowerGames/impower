// A click on a script line is answered by resolving that line against the
// compiled program's path locations, which describe the script as it was when
// the program was compiled. The compile that follows an edit is debounced, so
// every click made in the first fraction of a second after typing lands while
// the player still holds the pre-edit program — and resolving there names
// whatever used to stand at that line number. In #489 two lines were typed
// into a dialogue block and the click on the new line previewed the line the
// edit had pushed two lines down, for as long as the recompile took.
//
// The compiler stamps `programOutdated` on the selection when a script the
// program was built from has been edited since. These tests pin what the
// player does with it: hold, and let the compile the edit scheduled — which
// starts from this very selection — answer it when it lands.

import { describe, expect, test } from "vitest";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";

const URI = "file://proj/main.sd";

const PROGRAM = {
  uri: URI,
  version: 3,
  compiled: {},
  pathLocations: {},
  scripts: { [URI]: 3 },
} as any;

/** A controller holding a compiled program, with the preview recorded rather
 *  than run: `updatePreview` builds a game and a pixi Application, and none of
 *  that is what these tests are about. */
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
    // What `loadProgram` previews from when the program arrives. Without it
    // the held click would be lost and the preview would sit on the previous
    // beat until the author clicked again — the symptom the ticket describes.
    expect(controller._options.startFrom).toEqual({ file: URI, line: 8 });

    await controller.loadProgram(PROGRAM, undefined);

    expect(controller.previews).toEqual([{ file: URI, line: 8 }]);
  });

  test("is previewed at once when the program is still current", async () => {
    const controller = controllerWithProgram();

    await controller.handleSelectedCompilerDocument(selection(8, false));

    expect(controller.previews).toEqual([{ file: URI, line: 8 }]);
  });

  test("in a file the program never read still asks for a compile", async () => {
    // Nothing is being resolved against the outdated program here — the file
    // has no lines in it at all — so the request that would bring the file
    // into a program must still go out. Holding it would leave a click in a
    // script the program does not include answered by nothing at all.
    const compiled: string[] = [];
    setWorkspace({
      compileTextDocument: async (p: any) => {
        compiled.push(p.textDocument.uri);
      },
    } as any);
    const controller = controllerWithProgram();

    // The workspace is a module singleton, so a failed assertion that skipped
    // the reset would leave this stub standing for every test after it.
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
    // An older host, or a selection raised on a path that does not compute the
    // verdict, must behave as it always did rather than freezing the preview.
    const controller = controllerWithProgram();

    await controller.handleSelectedCompilerDocument(selection(8, undefined));

    expect(controller.previews).toEqual([{ file: URI, line: 8 }]);
  });
});
