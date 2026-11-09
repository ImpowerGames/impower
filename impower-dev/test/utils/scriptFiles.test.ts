import { describe, expect, it } from "vitest";
import globToRegex from "../../src/modules/spark-editor/utils/globToRegex";
import {
  isScriptExtension,
  isScriptPath,
  SCRIPT_FILES_GLOB,
  scriptFilesGlob,
  setScriptFiles,
} from "../../src/modules/spark-editor/utils/scriptFiles";
import WorkspaceConfiguration from "../../src/modules/spark-editor/workspace/WorkspaceConfiguration";

describe("script file typing", () => {
  it("types .sd and .luau files as scripts and nothing else", () => {
    expect(isScriptExtension("sd")).toBe(true);
    expect(isScriptExtension("luau")).toBe(true);
    expect(isScriptExtension("lua")).toBe(false);
    expect(isScriptExtension("png")).toBe(false);
    expect(isScriptExtension("")).toBe(false);
  });

  it("types a path by its basename's extension", () => {
    expect(isScriptPath("main.sd")).toBe(true);
    expect(isScriptPath("scripts/lib/util.luau")).toBe(true);
    expect(isScriptPath("file://proj/scripts/util.luau")).toBe(true);
    expect(isScriptPath("assets/hero.png")).toBe(false);
    expect(isScriptPath("assets/luau")).toBe(false);
    expect(isScriptPath("notes.luau/readme.txt")).toBe(false);
    expect(isScriptPath(".luau")).toBe(false);
  });

  it("follows the configured script endings, in any case, and falls back to sd and luau when none are left", () => {
    try {
      setScriptFiles("*.{sd,luau,story}");
      expect(isScriptPath("scripts/chapter.STORY")).toBe(true);
      expect(scriptFilesGlob.value).toBe("*.{sd,luau,story}");
      setScriptFiles("*.{story}");
      expect(isScriptExtension("sd")).toBe(false);
      expect(isScriptExtension("story")).toBe(true);
      setScriptFiles("");
      expect(scriptFilesGlob.value).toBe(SCRIPT_FILES_GLOB);
      expect(isScriptExtension("story")).toBe(false);
    } finally {
      setScriptFiles(SCRIPT_FILES_GLOB);
    }
  });

  it("types the workspace configuration's script files with the shared glob, which matches .sd and .luau", () => {
    expect(new WorkspaceConfiguration().settings.scriptFiles).toBe(
      SCRIPT_FILES_GLOB,
    );
    const pattern = globToRegex(SCRIPT_FILES_GLOB);
    expect(pattern.test("file://proj/scripts/util.luau")).toBe(true);
    expect(pattern.test("file://proj/main.sd")).toBe(true);
    expect(pattern.test("file://proj/assets/hero.png")).toBe(false);
  });
});
