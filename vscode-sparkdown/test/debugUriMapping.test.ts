import { describe, expect, it } from "vitest";
import { URI } from "vscode-uri";
import {
  debugPathToUri as mapPathToUri,
  debugUriToPath as mapUriToPath,
} from "../src/debugger/debugUriMapping";

const debugPathToUri = (
  path: string,
  knownUris: string[],
  rootUris: string[] = [],
) => mapPathToUri(URI, path, knownUris, rootUris);
const debugUriToPath = (uri: string) => mapUriToPath(URI, uri);

const fileUri = URI.file("/projects/game/main.sd").toString();
const testWebUri = "vscode-test-web://mount/main.sd";
const memfsUri = "memfs:/sample-folder/main.sd";
const knownUris = [fileUri, testWebUri, memfsUri];

describe("debug source uri mapping (#1662)", () => {
  it.each([
    ["file", fileUri],
    ["vscode-test-web", testWebUri],
    ["memfs", memfsUri],
  ])("round-trips a %s document uri", (_scheme, uri) => {
    expect(debugPathToUri(debugUriToPath(uri), knownUris)).toBe(uri);
  });

  it("maps the client's bare path of a mounted document to its own uri", () => {
    expect(debugPathToUri("\\main.sd", [testWebUri])).toBe(testWebUri);
    expect(debugPathToUri("/main.sd", [testWebUri])).toBe(testWebUri);
  });

  it("keeps the scheme of a client path that is already a uri", () => {
    expect(debugPathToUri(testWebUri, [])).toBe(testWebUri);
    expect(debugPathToUri(memfsUri, [])).toBe(memfsUri);
  });

  it("maps a bare path under a non-file workspace folder when no document matches", () => {
    expect(debugPathToUri("/main.sd", [], ["vscode-test-web://mount/"])).toBe(
      testWebUri,
    );
    expect(
      debugPathToUri("/projects/main.sd", [], [URI.file("/projects").toString()]),
    ).toBe(URI.file("/projects/main.sd").toString());
  });

  it("falls back to a file uri for an unknown local path", () => {
    expect(debugPathToUri("/projects/other/main.sd", knownUris)).toBe(
      URI.file("/projects/other/main.sd").toString(),
    );
  });
});
