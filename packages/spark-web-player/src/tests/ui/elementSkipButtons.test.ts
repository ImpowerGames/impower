import { h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../GamePlayerController", () => ({
  GamePlayerController: class {
    subscribeBar() {
      return () => {};
    }
    setup() {}
    dispose() {}
  },
  setWorkspace: () => {},
  whenControllerListening: () => Promise.resolve(),
}));

import SparkWebPlayer from "../../SparkWebPlayer";

describe("the player's skip buttons", () => {
  it("appear and disappear as the host turns skipButtons on and off", () => {
    const host = document.createElement("spark-web-player");
    document.body.appendChild(host);
    const show = (skipButtons: boolean) =>
      act(() => {
        render(h(SparkWebPlayer, { toolbar: true, skipButtons }), host);
      });
    const skip = (label: string) =>
      host.querySelector(`[aria-label='${label}']`);

    show(false);
    expect(skip("Skip back")).toBeNull();

    show(true);
    expect(skip("Skip back")).not.toBeNull();
    expect(skip("Skip forward")).not.toBeNull();

    show(false);
    expect(skip("Skip back")).toBeNull();
    expect(skip("Skip forward")).toBeNull();
  });
});
