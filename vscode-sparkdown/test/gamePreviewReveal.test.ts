import { describe, expect, it } from "vitest";
import { revealsPreview } from "../webviews/game-webview/revealsPreview";

const gameState = (position: { uri: string; line: number } | null) => ({
  jsonrpc: "2.0",
  method: "preview/didChangeGameState",
  params: {
    mounted: true,
    programLoaded: true,
    programVersion: 1,
    launchState: "preview",
    position,
    completion: null,
  },
});

describe("revealing the Game Preview panel", () => {
  it("reveals it when the game has displayed a beat", () => {
    expect(
      revealsPreview({
        jsonrpc: "2.0",
        method: "game/previewed",
        params: { location: null, address: "0" },
      }),
    ).toBe(true);
  });

  it("reveals it when a preview update has finished, though it displayed no beat", () => {
    expect(revealsPreview(gameState({ uri: "file:///main.sd", line: 3 }))).toBe(
      true,
    );
  });

  it("keeps it hidden while no preview update has finished", () => {
    expect(revealsPreview(gameState(null))).toBe(false);
    expect(revealsPreview({ jsonrpc: "2.0", method: "preview/connected", params: { type: "game" } })).toBe(false);
  });
});
