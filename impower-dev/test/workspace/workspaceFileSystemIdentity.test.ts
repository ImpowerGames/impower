import { describe, expect, it } from "vitest";

import WorkspaceFileSystem from "../../src/modules/spark-editor/workspace/WorkspaceFileSystem";

const proto = WorkspaceFileSystem.prototype;
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

  describe("known gaps on main", () => {
    it("getDisplayName keeps interior dots of a multi-dot filename", () => {
      expect(getDisplayName("file://proj1/sprite.idle.001.png")).toBe(
        "sprite.idle.001",
      );
    });
  });
});
