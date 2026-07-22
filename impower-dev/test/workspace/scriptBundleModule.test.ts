import type { FileData } from "@impower/spark-editor-protocol/src/types";
import { describe, expect, it } from "vitest";
import {
  bundleScripts,
  splitScriptBundle,
} from "../../src/modules/spark-editor/workspace/utils/scriptBundle";

const PROJECT = "proj";
const ROOT = `file://${PROJECT}/`;

// Project-relative path from a file uri (mirrors WorkspaceFileSystem.getRelativePath).
const rel = (uri: string) => (uri.startsWith(ROOT) ? uri.slice(ROOT.length) : uri);

// Build a minimal script FileData from a project-relative path + body.
const mk = (relativePath: string, text: string): FileData => {
  const base = relativePath.split("/").slice(-1)[0]!;
  const dot = base.lastIndexOf(".");
  const name = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot + 1) : "";
  return {
    uri: ROOT + relativePath,
    name,
    ext,
    type: "script",
    src: "",
    version: 0,
    languageId: "sparkdown",
    text,
  } as FileData;
};

describe("scriptBundle", () => {
  it("round-trips main + multiple flat scripts (regression: the old splitter collapsed all onto main.sd)", () => {
    const files = [
      mk("main.sd", "MAIN"),
      mk("dialogue.sd", "DIALOGUE"),
      mk("choices.sd", "CHOICES"),
    ];
    const bundle = bundleScripts(files, "main.sd", rel);
    const out = splitScriptBundle(bundle, "main.sd");
    expect(out).toEqual({
      "main.sd": "MAIN",
      "dialogue.sd": "DIALOGUE",
      "choices.sd": "CHOICES",
    });
  });

  it("preserves nested folders and same-basename files in different folders", () => {
    const files = [
      mk("main.sd", "MAIN"),
      mk("chapters/intro.sd", "CH INTRO"),
      mk("extras/intro.sd", "EX INTRO"),
    ];
    const bundle = bundleScripts(files, "main.sd", rel);
    expect(bundle).toContain("//// chapters/intro.sd ////");
    expect(bundle).toContain("//// extras/intro.sd ////");
    const out = splitScriptBundle(bundle, "main.sd");
    // Two files sharing the basename `intro.sd` survive as DISTINCT keys.
    expect(out["chapters/intro.sd"]).toBe("CH INTRO");
    expect(out["extras/intro.sd"]).toBe("EX INTRO");
    expect(out["main.sd"]).toBe("MAIN");
    expect(Object.keys(out).sort()).toEqual([
      "chapters/intro.sd",
      "extras/intro.sd",
      "main.sd",
    ]);
  });

  it("reads an old flat bundle (no slashes) unchanged — back-compat", () => {
    const legacyBundle =
      "MAIN\n\n//// dialogue.sd ////\n\nDIALOGUE\n\n//// choices.sd ////\n\nCHOICES";
    const out = splitScriptBundle(legacyBundle, "main.sd");
    expect(out).toEqual({
      "main.sd": "MAIN",
      "dialogue.sd": "DIALOGUE",
      "choices.sd": "CHOICES",
    });
  });

  it("re-bundles a flat project byte-identically to the legacy format (zero Drive churn)", () => {
    const files = [mk("main.sd", "MAIN"), mk("dialogue.sd", "DIALOGUE")];
    const bundle = bundleScripts(files, "main.sd", rel);
    expect(bundle).toBe("MAIN\n\n//// dialogue.sd ////\n\nDIALOGUE");
  });

  it("handles a main-only project", () => {
    const files = [mk("main.sd", "ONLY MAIN")];
    const bundle = bundleScripts(files, "main.sd", rel);
    expect(bundle).toBe("ONLY MAIN");
    expect(splitScriptBundle(bundle, "main.sd")).toEqual({ "main.sd": "ONLY MAIN" });
  });

  it("tolerates CRLF separators on read", () => {
    const crlf = "MAIN\r\n\r\n//// a.sd ////\r\n\r\nA BODY";
    const out = splitScriptBundle(crlf, "main.sd");
    expect(out["main.sd"]).toBe("MAIN");
    expect(out["a.sd"]).toBe("A BODY");
  });

  it("still round-trips bodies that contain blank lines and separators-like prose", () => {
    const files = [
      mk("main.sd", "line one\n\nline two"),
      mk("notes.sd", "para a\n\npara b\n\npara c"),
    ];
    const bundle = bundleScripts(files, "main.sd", rel);
    const out = splitScriptBundle(bundle, "main.sd");
    expect(out["main.sd"]).toBe("line one\n\nline two");
    expect(out["notes.sd"]).toBe("para a\n\npara b\n\npara c");
  });

  it("maps the leading body to main even when no main file is present", () => {
    const files = [mk("dialogue.sd", "DIALOGUE")];
    const bundle = bundleScripts(files, "main.sd", rel);
    const out = splitScriptBundle(bundle, "main.sd");
    expect(out["dialogue.sd"]).toBe("DIALOGUE");
  });
});
