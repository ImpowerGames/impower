import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const intents = vi.hoisted(() => ({
  setAccount: vi.fn(),
  loadProject: vi.fn(async () => {}),
  reviewDeviceStorage: vi.fn(async () => {}),
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    sync: { google: { getCurrentAccount: async () => null } },
    window: intents,
  },
}));

const { useWorkspaceSession } =
  await import("../../src/modules/spark-editor/components/main-window/useWorkspaceSession");
const { BACKUP_REMINDER_CHECK_MS } =
  await import("../../src/modules/spark-editor/utils/storagePersistence");

function Session() {
  useWorkspaceSession();
  return null;
}

let host: HTMLElement | undefined;
let visibility: DocumentVisibilityState = "visible";

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(async () => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Session, null), host!));
  await settle();
});

afterEach(async () => {
  await act(async () => render(null, host!));
  host?.remove();
  host = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("the session's storage review", () => {
  it("reviews storage once the project has loaded", () => {
    expect(intents.loadProject).toHaveBeenCalledTimes(1);
    expect(intents.reviewDeviceStorage).toHaveBeenCalledTimes(1);
    expect(
      intents.loadProject.mock.invocationCallOrder[0]!,
    ).toBeLessThan(intents.reviewDeviceStorage.mock.invocationCallOrder[0]!);
  });

  it("looks again every hour, so an editor left open still gets its reminder", async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKUP_REMINDER_CHECK_MS);
    });
    expect(intents.reviewDeviceStorage).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKUP_REMINDER_CHECK_MS);
    });
    expect(intents.reviewDeviceStorage).toHaveBeenCalledTimes(3);
  });

  it("looks again when the editor comes back into view, and not when it leaves", async () => {
    visibility = "hidden";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(intents.reviewDeviceStorage).toHaveBeenCalledTimes(1);
    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(intents.reviewDeviceStorage).toHaveBeenCalledTimes(2);
  });

  it("stops looking once the session unmounts", async () => {
    await act(async () => render(null, host!));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * BACKUP_REMINDER_CHECK_MS);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(intents.reviewDeviceStorage).toHaveBeenCalledTimes(1);
  });
});
