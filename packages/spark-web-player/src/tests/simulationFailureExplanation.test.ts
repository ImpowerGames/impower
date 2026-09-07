// #379 — the status bar explains why a preview could not be simulated.
//
// When the editor cannot simulate its way to the line the author is previewing
// from, the row at the bottom of the Game Preview turns red and shows
// `main : 3 → 🞪 → main : 6`. Until now that was the whole message: which two
// lines were involved, and nothing about why, so an author had no way to tell
// a script they had broken from a line that simply is not reachable.
//
// What must hold:
//   - each cause gets its own sentence, and none of them hedges between causes
//     the engine can already tell apart;
//   - the row explains itself on hover — a `title` for the pointer and a
//     matching `aria-label` for a screen reader;
//   - a healthy preview carries no explanation at all, so nothing stale is left
//     hanging off a row that is no longer in its failed state;
//   - a failure the engine cannot yet name still says something, rather than
//     leaving the red row silent again.
//
// The tooltip itself is drawn by the browser, not the page, so what is checked
// here is the attribute the browser draws it from.

import { describe, expect, test } from "vitest";
import { GamePlayerController } from "../GamePlayerController";
import {
  describeSimulationFailure,
  SIMULATION_FAILURE_MESSAGES,
  UNEXPLAINED_SIMULATION_FAILURE,
} from "../utils/describeSimulationFailure";

describe("the sentence chosen for each cause", () => {
  test("a search stopped by a ceiling blames time, and names both usual causes", () => {
    const message = describeSimulationFailure("fail", "timeout");
    expect(message).toBe(
      "Ran out of time when searching for a route to this line. " +
        "Possibly because of an infinite loop or a scene that is too long.",
    );
  });

  test("a search that looked everywhere says no path reaches the line", () => {
    expect(describeSimulationFailure("fail", "exhausted")).toBe(
      "No path through this scene reaches this line. " +
        "A condition or choice may always skip it.",
    );
  });

  test("a line outside the story flow says there is nothing to preview", () => {
    expect(describeSimulationFailure("fail", "unroutable")).toBe(
      "There's nothing to preview on this line.",
    );
  });

  test("a route that would not replay says so, rather than blaming the script", () => {
    expect(describeSimulationFailure("fail", "diverged")).toBe(
      "Found a route to this line, but replaying it stopped short of getting there.",
    );
  });

  test("a broken search does not blame the script", () => {
    // The distinction that matters most here: this sentence must not read like
    // the "exhausted" one, which tells an author their script is at fault. It
    // says only that the attempt went wrong, and stops there.
    expect(describeSimulationFailure("fail", "errored")).toBe(
      "Something went wrong while searching for a route to this line.",
    );
    expect(describeSimulationFailure("fail", "errored")).not.toBe(
      SIMULATION_FAILURE_MESSAGES.exhausted,
    );
  });

  test("no two causes share a sentence", () => {
    // The point of carrying a cause at all is that the author reads something
    // different for each one. Two causes sharing wording would pass every test
    // above while telling them nothing.
    const sentences = Object.values(SIMULATION_FAILURE_MESSAGES);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  test("a failure with no cause attached still says something", () => {
    expect(describeSimulationFailure("fail", undefined)).toBe(
      UNEXPLAINED_SIMULATION_FAILURE,
    );
  });

  test("nothing is said about a preview that did not fail", () => {
    expect(describeSimulationFailure("success", undefined)).toBeNull();
    expect(describeSimulationFailure("simulating", undefined)).toBeNull();
    expect(describeSimulationFailure("none", undefined)).toBeNull();
    expect(describeSimulationFailure(undefined, undefined)).toBeNull();
    // Even a cause left over from an earlier attempt says nothing once the
    // preview is no longer failing.
    expect(describeSimulationFailure("success", "timeout")).toBeNull();
  });
});

function statusRow() {
  const host = document.createElement("div");
  const leftItems = document.createElement("div");
  const locationItems = document.createElement("div");
  const launchLabel = document.createElement("span");
  const connectionLabel = document.createElement("span");
  const executedLabel = document.createElement("span");
  const executionInfo = document.createElement("div");
  leftItems.appendChild(locationItems);
  const refs = {
    leftItems,
    locationItems,
    launchLabel,
    connectionLabel,
    executedLabel,
    executionInfo,
  } as any;
  const controller = new GamePlayerController(host, refs);
  // `updateExecutionLabels` only reads the game to know one is there at all.
  (controller as any)._game = { state: "previewing" };
  (controller as any)._program = { pathLocations: {}, scripts: {} };
  return { controller: controller as any, locationItems };
}

const executedParams = (extra: Record<string, unknown>) => ({
  executedPaths: [],
  locations: [],
  conditions: [],
  choices: [],
  state: "previewing",
  ...extra,
});

describe("the row itself", () => {
  test("a failed preview explains itself on hover and to a screen reader", () => {
    const { controller, locationItems } = statusRow();

    controller.updateExecutionLabels(
      executedParams({ simulation: "fail", simulationFailure: "timeout" }),
    );

    expect(locationItems.classList.contains("error")).toBe(true);
    expect(locationItems.getAttribute("title")).toBe(
      SIMULATION_FAILURE_MESSAGES.timeout,
    );
    expect(locationItems.getAttribute("aria-label")).toBe(
      SIMULATION_FAILURE_MESSAGES.timeout,
    );
  });

  test("the explanation changes when the cause does", () => {
    const { controller, locationItems } = statusRow();

    controller.updateExecutionLabels(
      executedParams({ simulation: "fail", simulationFailure: "timeout" }),
    );
    controller.updateExecutionLabels(
      executedParams({ simulation: "fail", simulationFailure: "exhausted" }),
    );

    expect(locationItems.getAttribute("title")).toBe(
      SIMULATION_FAILURE_MESSAGES.exhausted,
    );
  });

  test("a preview that then succeeds is left with no explanation on it", () => {
    // The row is reused across every edit and every cursor move, so an
    // explanation left behind would sit on a healthy row claiming a failure
    // that is over.
    const { controller, locationItems } = statusRow();

    controller.updateExecutionLabels(
      executedParams({ simulation: "fail", simulationFailure: "unroutable" }),
    );
    expect(locationItems.hasAttribute("title")).toBe(true);

    controller.updateExecutionLabels(executedParams({ simulation: "success" }));

    expect(locationItems.classList.contains("error")).toBe(false);
    expect(locationItems.hasAttribute("title")).toBe(false);
    expect(locationItems.hasAttribute("aria-label")).toBe(false);
  });
});
