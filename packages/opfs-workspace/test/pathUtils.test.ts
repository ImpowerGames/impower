import { describe, expect, it } from "vitest";
import { getFileExtension } from "../src/utils/getFileExtension";
import { getFileName } from "../src/utils/getFileName";
import { getName } from "../src/utils/getName";
import { getParentPath } from "../src/utils/getParentPath";
import { getPathFromUri } from "../src/utils/getPathFromUri";
import { getUriFromPath } from "../src/utils/getUriFromPath";

// BEHAVIORAL SPEC for the opfs-workspace path utilities. These assert the
// DESIRED behavior derived from how the utilities are consumed (flat
// `file://<projectId>/<path>` URIs, nested OPFS directories, multi-dot asset
// filenames). Where `main` gets it wrong, the test is named to make the gap
// obvious and is allowed to fail — it documents a bug/oracle, not a goal to
// force green.

describe("getFileName", () => {
  it("returns the basename for a nested path", () => {
    expect(getFileName("a/b/c.png")).toBe("c.png");
  });

  it("returns the whole string when there is no directory", () => {
    expect(getFileName("main.sd")).toBe("main.sd");
  });

  it("returns the last segment even for a multi-dot filename", () => {
    expect(getFileName("images/a.b.c.png")).toBe("a.b.c.png");
  });

  it("treats a leading slash as an empty leading segment (basename unaffected)", () => {
    expect(getFileName("/images/logo.png")).toBe("logo.png");
  });
});

describe("getParentPath", () => {
  it("returns the directory portion of a nested path", () => {
    expect(getParentPath("a/b/c.png")).toBe("a/b");
  });

  it("returns empty string for a top-level file", () => {
    expect(getParentPath("main.sd")).toBe("");
  });

  it("preserves multiple directory levels", () => {
    expect(getParentPath("proj/images/ui/btn.png")).toBe("proj/images/ui");
  });
});

describe("getName (basename without extension)", () => {
  it("strips the extension from a simple filename", () => {
    expect(getName("main.sd")).toBe("main");
  });

  it("strips the directory and the extension", () => {
    expect(getName("a/b/logo.png")).toBe("logo");
  });

  it("returns the whole name when there is no extension", () => {
    expect(getName("README")).toBe("README");
  });

  // DESIRED: for `a.b.c.png` the display name is everything before the FINAL
  // extension, i.e. `a.b.c`. main's getName uses split(".")[0] and returns
  // only `a`, dropping the rest of a multi-dot name.
  it("keeps interior dots in a multi-dot name (drops only the final extension)", () => {
    expect(getName("images/a.b.c.png")).toBe("a.b.c");
  });
});

describe("getFileExtension", () => {
  it("returns the extension of a simple filename", () => {
    expect(getFileExtension("logo.png")).toBe("png");
  });

  it("returns the extension from a nested path", () => {
    expect(getFileExtension("a/b/logo.png")).toBe("png");
  });

  it("returns the extension from a full file:// uri", () => {
    expect(getFileExtension("file://proj/images/logo.png")).toBe("png");
  });

  // DESIRED: the extension is the segment AFTER THE FINAL dot. main uses
  // split(".")[1], so for `a.b.c.png` it returns `b` instead of `png`.
  it("returns the LAST dotted segment for a multi-dot filename", () => {
    expect(getFileExtension("a.b.c.png")).toBe("png");
  });

  it("returns the LAST dotted segment for a multi-dot uri", () => {
    expect(getFileExtension("file://proj/sprite.idle.001.png")).toBe("png");
  });
});

describe("getPathFromUri / getUriFromPath round-trip", () => {
  it("strips the file:// scheme to yield the OPFS path", () => {
    expect(getPathFromUri("file://proj/images/logo.png")).toBe(
      "proj/images/logo.png",
    );
  });

  it("re-adds the file:// scheme", () => {
    expect(getUriFromPath("proj/images/logo.png")).toBe(
      "file://proj/images/logo.png",
    );
  });

  it("round-trips a nested uri unchanged", () => {
    const uri = "file://proj/audio/music/theme.mp3";
    expect(getUriFromPath(getPathFromUri(uri))).toBe(uri);
  });

  it("round-trips a nested path unchanged", () => {
    const path = "proj/audio/music/theme.mp3";
    expect(getPathFromUri(getUriFromPath(path))).toBe(path);
  });
});
