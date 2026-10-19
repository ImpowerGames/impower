// A display the worker never answers must not hold the page back: the page's
// programs are conflated behind the display of the one before, so an answer
// that never comes would keep every later program, and the preview with it,
// from the page for the rest of the session (#1080).
//
// The controller's constructor only stores its host and refs, so it is driven
// directly with a stand-in for its link to the worker, which answers each
// display the test lets it answer and holds the rest.

import { afterEach, describe, expect, test } from "vitest";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";
import { programIdentity } from "../utils/programIdentity";

const URI = "file://proj/main.sd";

const program = (version: number) =>
  ({
    uri: URI,
    version,
    scripts: { [URI]: version },
    files: {},
    summary: true,
    runnable: true,
  }) as any;

type Display = {
  params: { program: string; line: number };
  answer: (result: { displayed: boolean }) => void;
};

/**
 * A controller previewing from `URI` line 4, whose worker holds every display
 * `holds` names (by the order the displays were asked for, from 1) and
 * answers the others at once.
 */
function controllerWhoseWorkerHolds(holds: number[]) {
  const displays: Display[] = [];
  setWorkspace({
    programHeld: async () => {},
    gameLink: {
      detach() {},
      request: (_type: unknown, params: Display["params"]) =>
        new Promise((answer) => {
          displays.push({ params, answer });
          if (!holds.includes(displays.length)) {
            answer({ displayed: true });
          }
        }),
    },
  } as any);
  const controller: any = new GamePlayerController(
    document.createElement("div"),
    {} as any,
  );
  controller._app = {};
  controller._options = { startFrom: { file: URI, line: 4 } };
  const runs: { version: number; line: number }[] = [];
  controller.beginPreviewRuntimeRun = (p: any, _link: unknown, _file: string, line: number) =>
    runs.push({ version: p.version, line });
  return { controller, displays, runs };
}

/** Let every chain of already-settled promises run out. */
async function settle() {
  for (let i = 0; i < 50; i++) {
    await Promise.resolve();
  }
}

/** Whether `promise` has settled once the microtasks queued so far ran out. */
async function settled(promise: Promise<unknown>) {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  await settle();
  return done;
}

describe("a preview display the worker never answers", () => {
  afterEach(() => setWorkspace(undefined as any));

  test("a program sent after it is taken by the page and displayed", async () => {
    const { controller, displays, runs } = controllerWhoseWorkerHolds([2]);
    await controller.loadProgram(program(1));
    expect(controller.getGameState().position).toEqual({ uri: URI, line: 4 });

    const unanswered = controller.loadProgram(program(2));
    await settle();
    expect(displays.map((d) => d.params.program)).toEqual([1, 2].map((v) => programIdentity(program(v))));

    const newer = controller.loadProgram(program(3));
    expect(await settled(newer)).toBe(true);
    expect(controller.getGameState().programVersion).toBe(3);
    expect(displays.map((d) => d.params.program)).toEqual([1, 2, 3].map((v) => programIdentity(program(v))));
    expect(runs.at(-1)).toEqual({ version: 3, line: 4 });
    expect(controller.getGameState().position).toEqual({ uri: URI, line: 4 });
    expect(await settled(unanswered)).toBe(true);
  });

  test("a selection made after it is previewed, and the program after that is taken", async () => {
    const { controller, displays, runs } = controllerWhoseWorkerHolds([1]);
    const unanswered = controller.loadProgram(program(1));
    await settle();
    expect(displays).toHaveLength(1);

    const selecting = controller.handleSelectedCompilerDocument({
      params: {
        textDocument: { uri: URI },
        selectedRange: { start: { line: 6 } },
        userEvent: true,
      },
    });
    expect(await settled(selecting)).toBe(true);
    expect(displays.at(-1)!.params.line).toBe(6);
    expect(runs.at(-1)).toEqual({ version: 1, line: 6 });
    expect(controller.getGameState().position).toEqual({ uri: URI, line: 6 });

    const newer = controller.loadProgram(program(2));
    expect(await settled(newer)).toBe(true);
    expect(controller.getGameState().programVersion).toBe(2);
    expect(runs.at(-1)).toEqual({ version: 2, line: 6 });
    expect(await settled(unanswered)).toBe(true);
  });

  test("its answer, arriving late, does not overwrite the newer frame", async () => {
    const { controller, displays, runs } = controllerWhoseWorkerHolds([1]);
    const unanswered = controller.loadProgram(program(1));
    await settle();

    const selecting = controller.handleSelectedCompilerDocument({
      params: {
        textDocument: { uri: URI },
        selectedRange: { start: { line: 6 } },
        userEvent: true,
      },
    });
    await settled(selecting);
    const newer = controller.loadProgram(program(2));
    await settled(newer);
    const shown = { position: controller.getGameState().position, runs: [...runs] };
    expect(shown.position).toEqual({ uri: URI, line: 6 });

    displays[0]!.answer({ displayed: true });
    await settle();
    await settled(unanswered);
    expect(controller.getGameState().position).toEqual(shown.position);
    expect(runs).toEqual(shown.runs);
    expect(controller.getGameState().programVersion).toBe(2);
  });
});
