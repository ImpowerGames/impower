import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { describe, expect, test, vi } from "vitest";
import { programIdentity } from "../utils/programIdentity";
import { putAtStartPoint } from "../main/workers/putAtStartPoint";
import { createPlayerHarness, MAIN_URI } from "./worker/playerHarness";

const PROGRAM = {
  uri: "file://proj/main.sd",
  version: 3,
  scripts: { "file://proj/main.sd": 3 },
} as any;

const SIMULATED_SAVE = JSON.stringify({
  label: "the state at main.3",
  simulatedFrom: "main",
  modules: {},
  context: {},
  story: "{}",
  runtime: "{}",
});

const TRUNCATED_SAVE = '{"simulatedFrom":"main","stor';

function recordingGame(startAddress: ProgramAddress | null) {
  const calls: string[] = [];
  const game: any = {
    calls,
    state: "initial",
    startAddress,
    simulateFlow: undefined as string | null | undefined,
    routeStartOf: (_address: ProgramAddress) => "main",
    simulation: undefined as string | undefined,
    program: { uri: PROGRAM.uri, scripts: PROGRAM.scripts, version: 99 },
    routeErrors: [],
    simulate: () => {
      calls.push("simulate");
    },
    load: (checkpoint: string) => {
      try {
        const save = JSON.parse(checkpoint);
        calls.push(`load:${save.label}`);
        if (save.simulatedFrom) {
          game.simulation = "success";
        }
        return true;
      } catch {
        calls.push("load-failed");
        return false;
      }
    },
    start: () => {
      calls.push("start");
    },
    setRoutePins: () => {},
    connection: { receive: () => {} },
    connect: async () => {},
    destroy: () => {},
    getLastExecutedDocumentLocation: () => null,
  };
  return game;
}

const MATCHING_PROGRAM_ID = programIdentity(PROGRAM);

type WorkerAnswer = {
  checkpoint?: string;
  simulatedAddress?: ProgramAddress | null;
  simulatedProgramId?: string;
};

const WORKER_SOURCE = ["-> start", "", "scene start", "  The line.", "end", ""].join("\n");

async function playInWorker(game: any, worker: WorkerAnswer) {
  const line = 3;
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: WORKER_SOURCE }],
    startFrom: { file: MAIN_URI, line },
  });
  try {
    await h.compile();
    await h.select(line);
    h.workerState.gameState.createGame = ((options: any) => {
      game.program = options.program;
      return game;
    }) as any;
    h.workerState.player.putAtStartPoint = (built) =>
      putAtStartPoint(built, {
        checkpoint: worker.checkpoint,
        address: worker.simulatedAddress,
        programId:
          !("simulatedProgramId" in worker) ||
          worker.simulatedProgramId === MATCHING_PROGRAM_ID
            ? programIdentity(built.program)
            : worker.simulatedProgramId,
      });
    await h.controller.startGameAndApp();
    await h.controller.destroyGameAndApp();
  } finally {
    h.dispose();
  }
}

vi.setConfig({ testTimeout: 120_000 });

describe("pressing play reuses the worker's route search", () => {
  test("the worker's checkpoint is loaded instead of searching again", async () => {
    const game = recordingGame(3);
    await playInWorker(game, {
      simulatedAddress: 3,
      checkpoint: SIMULATED_SAVE,
    });

    expect(game.calls).toContain("load:the state at main.3");
    expect(game.calls).not.toContain("simulate");
    expect(game.simulation).toBe("success");
    expect(game.calls.indexOf("load:the state at main.3")).toBeLessThan(
      game.calls.indexOf("start"),
    );
  });

  test("a start point with no route is not searched for again", async () => {
    const game = recordingGame(3);
    await playInWorker(game, {
      simulatedAddress: 3,
      checkpoint: undefined,
    });

    expect(game.calls).not.toContain("simulate");
    expect(game.calls.some((c: string) => c.startsWith("load:"))).toBe(false);
    expect(game.simulation).toBe("fail");
    expect(game.simulateFlow).toBe("main");
    expect(game.calls).toContain("start");
  });

  test("a checkpoint that will not load falls back to searching here", async () => {
    const game = recordingGame(3);
    await playInWorker(game, {
      simulatedAddress: 3,
      checkpoint: TRUNCATED_SAVE,
    });

    expect(game.calls).toContain("load-failed");
    expect(game.calls).toContain("simulate");
  });

  test("a checkpoint for a different start point is not loaded", async () => {
    const game = recordingGame(3);
    await playInWorker(game, {
      simulatedAddress: 7,
      checkpoint: SIMULATED_SAVE,
    });

    expect(game.calls.some((c: string) => c.startsWith("load:"))).toBe(false);
    expect(game.calls).toContain("simulate");
  });

  test("an answer about a different version of the script is not used", async () => {
    const game = recordingGame(3);
    await playInWorker(game, {
      simulatedAddress: 3,
      checkpoint: SIMULATED_SAVE,
      simulatedProgramId: programIdentity({
        uri: PROGRAM.uri,
        scripts: { [PROGRAM.uri]: 4 },
      }),
    });

    expect(game.calls.some((c: string) => c.startsWith("load:"))).toBe(false);
    expect(game.calls).toContain("simulate");
  });

  test("an answer with no program identity at all is not used", async () => {
    const game = recordingGame(3);
    await playInWorker(game, {
      simulatedAddress: 3,
      checkpoint: SIMULATED_SAVE,
      simulatedProgramId: undefined,
    });

    expect(game.calls.some((c: string) => c.startsWith("load:"))).toBe(false);
    expect(game.calls).toContain("simulate");
  });

  test("with no worker answer at all, the play path still searches", async () => {
    const game = recordingGame(3);
    await playInWorker(game, {
      simulatedAddress: undefined,
      checkpoint: undefined,
      simulatedProgramId: undefined,
    });

    expect(game.calls).toContain("simulate");
    expect(game.calls.indexOf("simulate")).toBeLessThan(
      game.calls.indexOf("start"),
    );
  });

  test("a game that resolves no start path still searches", async () => {
    const game = recordingGame(null);
    await playInWorker(game, {
      simulatedAddress: undefined,
      checkpoint: undefined,
      simulatedProgramId: undefined,
    });

    expect(game.calls).toContain("simulate");
  });
});

describe("the worker's own route reaches the rule", () => {
  test("PLAY's game is put at its start point from the route the worker replayed", async () => {
    const line = 3;
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: WORKER_SOURCE }],
      startFrom: { file: MAIN_URI, line },
    });
    try {
      await h.compile();
      await h.select(line);
      const handed: any[] = [];
      h.workerState.player.putAtStartPoint = (built, route, profilerId) => {
        handed.push({ built, route });
        return putAtStartPoint(built, route, profilerId);
      };
      expect(await h.controller.startGameAndApp()).toBe(true);
      expect(handed).toHaveLength(1);
      const [{ built, route }] = handed;
      expect(route.address).toBe(built.startAddress);
      expect(route.programId).toBe(programIdentity(built.program));
      expect(route.checkpoint).toBeTruthy();
      expect(built.simulation).toBe("success");
      await h.controller.destroyGameAndApp();
    } finally {
      h.dispose();
    }
  });
});
