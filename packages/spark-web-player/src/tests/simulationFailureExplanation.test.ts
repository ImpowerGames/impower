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
    expect(describeSimulationFailure("fail", "errored")).toBe(
      "Something went wrong while searching for a route to this line.",
    );
    expect(describeSimulationFailure("fail", "errored")).not.toBe(
      SIMULATION_FAILURE_MESSAGES.exhausted,
    );
  });

  test("no two causes share a sentence", () => {
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
  (controller as any)._workerGame = {};
  (controller as any)._program = {
    uri: "file://proj/main.sd",
    scripts: {},
    summary: true,
  };
  return { controller: controller as any, locationItems };
}

const executedParams = (extra: Record<string, unknown>) => ({
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
