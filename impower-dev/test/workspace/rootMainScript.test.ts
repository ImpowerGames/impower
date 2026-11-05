import type { FileData } from "@impower/spark-editor-protocol/src/types";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { useDiagnosticColor } = await import(
  "../../src/modules/spark-editor/workspace/useDiagnosticColor"
);
const { default: WorkspaceFileSystem } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceFileSystem"
);

const PROJECT = "local";
const uriOf = (path: string) => `file://${PROJECT}/${path}`;

describe("useDiagnosticColor identifies Main by its root path", () => {
  let host: HTMLDivElement | undefined;

  const colourOf = async (filename?: string) => {
    host = document.body.appendChild(document.createElement("div"));
    const Probe = () => h("output", null, useDiagnosticColor(filename));
    await act(async () => render(h(Probe, null), host!));
    return host.querySelector("output")!.textContent;
  };

  const problems = (summary: Record<string, { errors: number; warnings: number }>) => {
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: PROJECT },
      debug: {
        ...workspace.current.debug,
        diagnosticsSummary: Object.fromEntries(
          Object.entries(summary).map(([path, counts]) => [
            uriOf(path),
            { ...counts, infos: 0 },
          ]),
        ),
      },
    } as typeof workspace.current;
  };

  beforeEach(() => {
    problems({});
  });

  afterEach(async () => {
    if (host) {
      await act(async () => render(null, host!));
      host.remove();
      host = undefined;
    }
  });

  it("leaves Main's book clean when only a nested scripts/main.sd has problems", async () => {
    problems({ "scripts/main.sd": { errors: 2, warnings: 0 } });
    expect(await colourOf("main.sd")).toBe("");
  });

  it("colours Main by the root main.sd's own problems", async () => {
    problems({ "main.sd": { errors: 0, warnings: 1 } });
    expect(await colourOf("main.sd")).toBe("text-warning-strong");
  });

  it("counts a nested scripts/main.sd among the other scripts, and only it", async () => {
    problems({
      "main.sd": { errors: 3, warnings: 0 },
      "scripts/main.sd": { errors: 0, warnings: 1 },
    });
    expect(await colourOf()).toBe("text-warning-strong");
    expect(await colourOf("scripts/main.sd")).toBe("text-warning-strong");
  });
});

describe("WorkspaceFileSystem synthesises the root main.sd", () => {
  const script = (path: string): FileData => ({
    uri: uriOf(path),
    name: path.split("/").pop()!.replace(/\.sd$/, ""),
    ext: "sd",
    type: "script",
    src: "",
    version: 0,
    text: "scene nested\nend\n",
  });

  const load = async (stored: FileData[]) => {
    const fs = {
      _scheme: "file://",
      _files: {} as Record<string, FileData>,
      _unstoredUris: new Set<string>(),
      getDirectoryUri: WorkspaceFileSystem.prototype.getDirectoryUri,
      getFileUri: WorkspaceFileSystem.prototype.getFileUri,
      withProjectLock: (WorkspaceFileSystem.prototype as any).withProjectLock,
      openProjectStore: async () => ({ files: stored, folders: [] }),
      purgeExpiredTrash: async () => {},
      _ls: { connection: { onRequest: () => {} }, start: async () => {} },
    };
    URL.createObjectURL ??= () => "blob:starter";
    await (WorkspaceFileSystem.prototype as any).loadInitialFiles.call(fs, PROJECT);
    return fs;
  };

  it("adds the starter root main.sd when the project holds only a nested main.sd", async () => {
    const fs = await load([script("scripts/main.sd")]);
    expect(Object.keys(fs._files).sort()).toEqual([uriOf("main.sd"), uriOf("scripts/main.sd")]);
    expect(fs._unstoredUris.has(uriOf("main.sd"))).toBe(true);
  });

  it("keeps a stored root main.sd as it is", async () => {
    const fs = await load([script("main.sd")]);
    expect(Object.keys(fs._files)).toEqual([uriOf("main.sd")]);
    expect(fs._unstoredUris.size).toBe(0);
  });
});
