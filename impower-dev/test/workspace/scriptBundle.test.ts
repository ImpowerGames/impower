import { FileData } from "@impower/spark-editor-protocol/src/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Workspace singleton instantiates Workers at module load and is
// circular-imported by WorkspaceFileSystem. Stub it so importing the class is
// side-effect-free; we never construct WorkspaceFileSystem (which would spawn a
// Worker) — we invoke its methods via prototype.method.call(fakeThis, ...).
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs: {}, ls: {}, configuration: { settings: {} } },
}));

import WorkspaceFileSystem from "../../src/modules/spark-editor/workspace/WorkspaceFileSystem";

const PROJECT = "proj1";

// Minimal `this` providing the helpers bundle/split actually touch. getFileUri
// and getDirectoryUri are the REAL prototype implementations.
function makeFakeFs(files: Record<string, FileData>) {
  return {
    _scheme: "file://",
    getDirectoryUri: WorkspaceFileSystem.prototype.getDirectoryUri,
    getFileUri: WorkspaceFileSystem.prototype.getFileUri,
    getFiles: async () => files,
  } as unknown as WorkspaceFileSystem;
}

function scriptFile(
  projectId: string,
  filename: string,
  text: string,
): [string, FileData] {
  const uri = `file://${projectId}/${filename}`;
  const dot = filename.lastIndexOf(".");
  const name = dot >= 0 ? filename.slice(0, dot) : filename;
  const ext = dot >= 0 ? filename.slice(dot + 1) : "";
  return [
    uri,
    { uri, name, ext, type: "script", src: "", version: 0, text },
  ];
}

const bundle = (fs: WorkspaceFileSystem) =>
  WorkspaceFileSystem.prototype.bundleProjectText.call(fs, PROJECT);

const split = (fs: WorkspaceFileSystem, content: string) =>
  WorkspaceFileSystem.prototype.splitProjectTextContent.call(
    fs,
    PROJECT,
    content,
  );

describe("script bundle round-trip (bundleProjectText <-> splitProjectTextContent)", () => {
  it("main.sd is the leading body of the bundle", async () => {
    const files = Object.fromEntries([
      scriptFile(PROJECT, "main.sd", "MAIN BODY"),
      scriptFile(PROJECT, "dialogue.sd", "DIALOGUE BODY"),
    ]);
    const text = await bundle(makeFakeFs(files));
    expect(text.startsWith("MAIN BODY")).toBe(true);
  });

  it("round-trips a two-script project: every script's content survives keyed by uri", async () => {
    const files = Object.fromEntries([
      scriptFile(PROJECT, "main.sd", "MAIN BODY"),
      scriptFile(PROJECT, "dialogue.sd", "DIALOGUE BODY"),
    ]);
    const fs = makeFakeFs(files);
    const text = await bundle(fs);
    const chunks = split(fs, text);
    expect(chunks[`file://${PROJECT}/main.sd`]).toBe("MAIN BODY");
    expect(chunks[`file://${PROJECT}/dialogue.sd`]).toBe("DIALOGUE BODY");
  });

  it("round-trips MANY scripts (all survive, none dropped or merged)", async () => {
    const entries = [
      scriptFile(PROJECT, "main.sd", "MAIN"),
      scriptFile(PROJECT, "a.sd", "AAA"),
      scriptFile(PROJECT, "b.sd", "BBB"),
      scriptFile(PROJECT, "c.sd", "CCC"),
    ];
    const fs = makeFakeFs(Object.fromEntries(entries));
    const chunks = split(fs, await bundle(fs));
    expect(chunks[`file://${PROJECT}/main.sd`]).toBe("MAIN");
    expect(chunks[`file://${PROJECT}/a.sd`]).toBe("AAA");
    expect(chunks[`file://${PROJECT}/b.sd`]).toBe("BBB");
    expect(chunks[`file://${PROJECT}/c.sd`]).toBe("CCC");
    expect(Object.keys(chunks).length).toBe(4);
  });

  it("preserves blank lines inside a script body", async () => {
    const body = "line one\n\nline three\n\n\nline six";
    const files = Object.fromEntries([
      scriptFile(PROJECT, "main.sd", "MAIN"),
      scriptFile(PROJECT, "spaced.sd", body),
    ]);
    const fs = makeFakeFs(files);
    const chunks = split(fs, await bundle(fs));
    expect(chunks[`file://${PROJECT}/spaced.sd`]).toBe(body);
  });

  it("preserves a blank-line-containing MAIN body", async () => {
    const body = "intro\n\n== START ==\n\n  Hello.\n";
    const files = Object.fromEntries([
      scriptFile(PROJECT, "main.sd", body),
      scriptFile(PROJECT, "other.sd", "OTHER"),
    ]);
    const fs = makeFakeFs(files);
    const chunks = split(fs, await bundle(fs));
    // bundleProjectText .trim()s the whole bundle; main body content (minus
    // leading/trailing whitespace) must survive.
    expect(chunks[`file://${PROJECT}/main.sd`]).toBe(body.trim());
  });

  // KNOWN GAP: two scripts sharing a basename but living in different folders.
  // bundleProjectText writes only `${name}.${ext}` (the basename) into the
  // separator, and splitProjectTextContent maps a separator filename straight to
  // getFileUri(projectId, filename). So nested scripts collapse onto the same
  // top-level uri and collide. DESIRED: the two distinct folder paths survive.
  describe("known gaps on main", () => {
    it("two scripts sharing a basename in different folders do NOT collide", async () => {
      const files = Object.fromEntries([
        scriptFile(PROJECT, "main.sd", "MAIN"),
        scriptFile(PROJECT, "scenes/intro.sd", "INTRO BODY"),
        scriptFile(PROJECT, "acts/intro.sd", "ACTS INTRO BODY"),
      ]);
      const fs = makeFakeFs(files);
      const chunks = split(fs, await bundle(fs));
      // DESIRED: both nested scripts round-trip to their own uris with their own
      // content. On main the separator drops the folder, so both map to
      // file://proj1/intro.sd and one body is lost.
      expect(chunks[`file://${PROJECT}/scenes/intro.sd`]).toBe("INTRO BODY");
      expect(chunks[`file://${PROJECT}/acts/intro.sd`]).toBe(
        "ACTS INTRO BODY",
      );
    });
  });
});
