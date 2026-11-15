import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import PlayerBar from "../../components/PlayerBar/PlayerBar";
import type { PlayerBarState } from "../../components/PlayerBar/playerBarState";
import { requestReplayBeat } from "../../components/PlayerBar/replayBeat";
import type { PlayerBarView } from "../../GamePlayerController";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define mia as character with
  name = "MIA"
end

scene start
  MIA: First line.
  MIA: Hello <wait:1> there.
  MIA: Third line.
end
`;

const WAITING = 6;

type Harness = Awaited<ReturnType<typeof createPlayerHarness>>;

let harness: Harness | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
    container = undefined;
  }
  harness?.dispose();
  harness = undefined;
});

const replayBar = (state: PlayerBarState, view: PlayerBarView) =>
  h(PlayerBar, {
    state,
    controls: { run: true, replay: true },
    runRefusal: view.runRefusal,
    starting: view.starting,
    onReplayBeat: requestReplayBeat,
  });

async function previewWithReplayControl(line: number) {
  const player = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line },
    manualClock: true,
  });
  harness = player;
  const win = player.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  player.controller.registerProtocolHandlers();
  const host = document.createElement("div");
  container = host;
  document.body.append(host);
  player.controller.subscribeBar((state: PlayerBarState, view: PlayerBarView) =>
    render(replayBar(state, view), host),
  );
  await player.compile();
  await player.select(line);
  await settle(40);
  const button = () =>
    host.querySelector<HTMLButtonElement>("#replay-beat-button")!;
  return { player, button };
}

const beatPlaying = (player: Harness) =>
  player.controller.getGameState().beat?.playing;

describe("the Game Preview bar's Replay beat control (#2259)", () => {
  it("plays the shown beat once through the player and rests on its still", async () => {
    const { player, button } = await previewWithReplayControl(WAITING);
    const still = player.overlay.textContent ?? "";
    expect(still).toContain("there.");
    expect(button().getAttribute("aria-disabled")).toBeNull();
    expect(button().getAttribute("aria-pressed")).toBe("false");

    act(() => button().click());
    await settle(20);
    await player.tick(100, 3);
    expect(beatPlaying(player)).toBe(true);
    expect(button().getAttribute("aria-pressed")).toBe("true");

    let elapsed = 300;
    for (; elapsed < 6000 && beatPlaying(player); elapsed += 100) {
      await player.tick(100);
    }
    expect(beatPlaying(player)).toBe(false);
    expect(elapsed).toBeGreaterThanOrEqual(1000);
    await settle(20);
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(player.overlay.textContent).toBe(still);
    expect(player.playing()).toBeFalsy();
  }, 120_000);
});
