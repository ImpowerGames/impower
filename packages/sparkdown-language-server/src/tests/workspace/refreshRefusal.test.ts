// The refreshes the server sends after a compile reach the web editor's
// connection before the editor's client has registered for them, and the
// connection refuses them as unhandled (#1785). A refresh carries no result,
// so the refusal must not surface as an uncaught rejection.
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const main = "file:///project/main.sd";

function setup() {
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  const refused: string[] = [];
  Object.assign(workspace, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.svg$/,
    _documentVersions: new Map([[main, 1]]),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
    _watchedFiles: new Map([[main, {}]]),
    _programStates: new Map(),
    _entryPrograms: new Map(),
    sendNotification: vi.fn(),
    // What vscode-jsonrpc answers for a method nobody registered.
    _connection: {
      sendRequest: (method: string) => {
        refused.push(method);
        return Promise.reject(new Error(`Unhandled method ${method}`));
      },
    },
  });
  return { workspace, refused };
}

let uncaught: unknown[] = [];
const onUncaught = (reason: unknown) => {
  uncaught.push(reason);
};
beforeEach(() => {
  uncaught = [];
  process.on("unhandledRejection", onUncaught);
});
afterEach(() => {
  process.off("unhandledRejection", onUncaught);
});

describe("refresh requests a client refuses", () => {
  it("are not left as uncaught rejections after a compile", async () => {
    const { workspace, refused } = setup();
    workspace.onCompiledTextDocument({ program: { uri: main, diagnostics: {} } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refused).toEqual(["workspace/foldingRange/refresh", "workspace/semanticTokens/refresh"]);
    expect(uncaught.map(String)).toEqual([]);
  });
});
