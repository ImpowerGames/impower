import { describe, expect, it } from "vitest";
import getValidFileName from "../../src/modules/spark-editor/utils/getValidFileName";
import { sanitizeRelativePath } from "../../src/modules/spark-editor/utils/sanitizeRelativePath";

describe("sanitizeRelativePath", () => {
  it("sanitizes a flat name identically to getValidFileName (back-compat)", () => {
    for (const name of ["my file.png", "weird@name!.sd", "ok_name.sd", "a.b.c.png"]) {
      expect(sanitizeRelativePath(name)).toBe(getValidFileName(name));
    }
  });

  it("preserves folder structure, sanitizing each segment", () => {
    expect(sanitizeRelativePath("art/my file.png")).toBe("art/my_file.png");
    expect(sanitizeRelativePath("a b/c@d.png")).toBe("a_b/c_d.png");
    expect(sanitizeRelativePath("chapters/sub/intro.sd")).toBe("chapters/sub/intro.sd");
  });

  it("normalizes Windows-style backslash separators", () => {
    expect(sanitizeRelativePath("art\\sub\\x.png")).toBe("art/sub/x.png");
  });

  it("drops empty and '.' segments", () => {
    expect(sanitizeRelativePath("./a//b.png")).toBe("a/b.png");
    expect(sanitizeRelativePath("a/./b/.png")).toBe("a/b/.png");
  });

  it("strips a leading slash (absolute -> relative)", () => {
    expect(sanitizeRelativePath("/abs/path.png")).toBe("abs/path.png");
  });

  it("rejects path-traversal attempts", () => {
    expect(sanitizeRelativePath("../etc/passwd")).toBeNull();
    expect(sanitizeRelativePath("a/../../b")).toBeNull();
    expect(sanitizeRelativePath("a/..")).toBeNull();
  });

  it("returns null when nothing usable remains", () => {
    expect(sanitizeRelativePath("")).toBeNull();
    expect(sanitizeRelativePath("/")).toBeNull();
    expect(sanitizeRelativePath(".")).toBeNull();
    expect(sanitizeRelativePath("//")).toBeNull();
  });
});
