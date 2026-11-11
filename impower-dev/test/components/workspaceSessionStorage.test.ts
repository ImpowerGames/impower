import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const intents = vi.hoisted(() => ({
  setAccount: vi.fn(),
  loadProject: vi.fn(async () => {}),
  refreshDeviceStorage: vi.fn(async () => {}),
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    sync: { google: { getCurrentAccount: async () => null } },
    window: intents,
  },
}));

const { useWorkspaceSession } =
  await import("../../src/modules/spark-editor/components/main-window/useWorkspaceSession");

function Session() {
  useWorkspaceSession();
  return null;
}

let host: HTMLElement | undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  host = document.body.appendChild(document.createElement("div"));
});

afterEach(async () => {
  await act(async () => render(null, host!));
  host?.remove();
  host = undefined;
  vi.clearAllMocks();
  intents.loadProject.mockImplementation(async () => {});
});

describe("the session's storage status", () => {
  it("reads the device storage once, after the project has loaded", async () => {
    await act(async () => render(h(Session, null), host!));
    await settle();
    expect(intents.loadProject).toHaveBeenCalledTimes(1);
    expect(intents.refreshDeviceStorage).toHaveBeenCalledTimes(1);
    expect(intents.loadProject.mock.invocationCallOrder[0]!).toBeLessThan(
      intents.refreshDeviceStorage.mock.invocationCallOrder[0]!,
    );
  });

  it("does not read it for a session that unmounted before the project loaded", async () => {
    let finishLoad: () => void = () => {};
    intents.loadProject.mockImplementation(
      () => new Promise<void>((resolve) => (finishLoad = resolve)),
    );
    await act(async () => render(h(Session, null), host!));
    await settle();
    await act(async () => render(null, host!));
    finishLoad();
    await settle();
    expect(intents.loadProject).toHaveBeenCalledTimes(1);
    expect(intents.refreshDeviceStorage).not.toHaveBeenCalled();
  });
});
