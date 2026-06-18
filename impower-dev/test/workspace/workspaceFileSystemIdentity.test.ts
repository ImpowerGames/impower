import { describe, expect, it, vi } from "vitest";

// Stub the Workspace singleton (Worker-spawning, circular import). We invoke
// pure identity helpers via prototype.method.call — no instance constructed.
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs: {}, ls: {}, configuration: { settings: {} } },
}));

import WorkspaceFileSystem from "../../src/modules/spark-editor/workspace/WorkspaceFileSystem";

const proto = WorkspaceFileSystem.prototype;
// `self` carries the real prototype helpers that some methods call internally
// (getDisplayName -> this.getFilename). Bind them so the methods see a complete
// `this` while we still avoid constructing the (Worker-spawning) instance.
const self = {
  _scheme: "file://",
  getFilename: proto.getFilename,
  getFileUri: proto.getFileUri,
  getDirectoryUri: proto.getDirectoryUri,
} as unknown as WorkspaceFileSystem;

const getDirectoryUri = (id: string) => proto.getDirectoryUri.call(self, id);
const getFileUri = (id: string, fn: string) =>
  proto.getFileUri.call(self, id, fn);
const getFilename = (uri: string) => proto.getFilename.call(self, uri);
const getDisplayName = (uri: string) => proto.getDisplayName.call(self, uri);
const getUriFromPath = (p: string) => proto.getUriFromPath.call(self, p);

// AREA 5: WorkspaceFileSystem identity (getFileUri / getFilename /
// getDisplayName) — flat file://<projectId>/<filename> URIs that must
// round-trip and handle nested paths.

describe("WorkspaceFileSystem uri identity", () => {
  it("getDirectoryUri prefixes the scheme onto the projectId", () => {
    expect(getDirectoryUri("proj1")).toBe("file://proj1");
  });

  it("getFileUri joins projectId and filename under the scheme", () => {
    expect(getFileUri("proj1", "main.sd")).toBe("file://proj1/main.sd");
  });

  it("getFileUri supports a nested filename path", () => {
    expect(getFileUri("proj1", "images/ui/btn.png")).toBe(
      "file://proj1/images/ui/btn.png",
    );
  });

  it("getFilename recovers the basename from a uri", () => {
    expect(getFilename("file://proj1/main.sd")).toBe("main.sd");
  });

  it("getFilename recovers the basename from a nested uri", () => {
    expect(getFilename("file://proj1/images/ui/btn.png")).toBe("btn.png");
  });

  it("getFileUri -> getFilename round-trips a flat filename", () => {
    const uri = getFileUri("proj1", "dialogue.sd");
    expect(getFilename(uri)).toBe("dialogue.sd");
  });

  it("getDisplayName strips the extension off the basename", () => {
    expect(getDisplayName("file://proj1/dialogue.sd")).toBe("dialogue");
  });

  it("getDisplayName of a nested asset is its basename minus extension", () => {
    expect(getDisplayName("file://proj1/images/logo.png")).toBe("logo");
  });

  it("getUriFromPath drops a single leading slash before prefixing the scheme", () => {
    expect(getUriFromPath("/proj1/main.sd")).toBe("file://proj1/main.sd");
    expect(getUriFromPath("proj1/main.sd")).toBe("file://proj1/main.sd");
  });

  // DESIRED: a multi-dot display name keeps interior dots, dropping only the
  // final extension. getDisplayName uses split(".")[0], so for `a.b.c.png` it
  // returns `a` instead of `a.b.c`.
  describe("known gaps on main", () => {
    it("getDisplayName keeps interior dots of a multi-dot filename", () => {
      expect(getDisplayName("file://proj1/sprite.idle.001.png")).toBe(
        "sprite.idle.001",
      );
    });
  });
});
