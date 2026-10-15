// The game webview saves the script it was initialized with, for VS Code to
// restore its panel with when the workspace reopens. It had stopped saving it,
// so a restored panel had no script to resume (#1886).

import { describe, expect, it } from "vitest";
import { initializedDocumentUri } from "../webviews/game-webview/initializedDocumentUri";

const initialize = (uri?: string) => ({
  jsonrpc: "2.0",
  method: "initialize",
  id: 1,
  params: {
    initializationOptions: { settings: {}, uri },
    capabilities: {},
    rootUri: null,
    processId: 0,
  },
});

describe("saving the Game Preview's script", () => {
  it("saves the script the player is initialized with", () => {
    expect(initializedDocumentUri(initialize("file:///project/main.sd"))).toBe(
      "file:///project/main.sd",
    );
  });

  it("saves nothing for an initialization without a script", () => {
    expect(initializedDocumentUri(initialize())).toBeUndefined();
  });

  it("saves nothing for other messages", () => {
    expect(
      initializedDocumentUri({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri: "file:///project/main.sd" } },
      }),
    ).toBeUndefined();
    expect(initializedDocumentUri({})).toBeUndefined();
  });
});
