// A compile's answer carries what the worker's route search to the program's
// start point established (`RouteSearchLog.report`): the page takes it with
// the program, and PLAY starts from it (`playStartsFromWorkerRoute.test.ts`).
// The worker writes it into the compile's event, so the compile answers with
// that event's fields.
import { describe, expect, it } from "vitest";
import { programIdentity } from "../../utils/programIdentity";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The line the preview starts from.
end
`;

const LINE = SOURCE.split("\n").findIndex((l) =>
  l.includes("The line the preview starts from."),
);

describe("a compile's answer", () => {
  it("carries what the route search to its start point established", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: LINE },
    });
    try {
      const result = await h.compile();
      expect(result.program.summary).toBe(true);
      expect(result.simulationErrors).toEqual([]);
      expect("simulationFailure" in result).toBe(true);
      expect(result.simulatedProgramId).toBe(programIdentity(result.program));
      expect(result.simulatedAddress).toBeDefined();
    } finally {
      h.dispose();
    }
  }, 120_000);
});
