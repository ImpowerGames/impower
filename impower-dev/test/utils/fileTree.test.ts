import { describe, expect, it } from "vitest";
import {
  buildFileTree,
  computeFolderMoves,
  filterPaths,
  flattenVisibleRows,
  FOLDER_SENTINEL,
} from "../../src/modules/spark-editor/utils/fileTree";

describe("buildFileTree", () => {
  it("keeps flat files at the top level, folders before files, alpha within group", () => {
    const tree = buildFileTree(["main.sd", "zebra.png", "apple.sd"]);
    expect(tree.map((n) => n.name)).toEqual(["apple.sd", "main.sd", "zebra.png"]);
    expect(tree.every((n) => !n.isDirectory)).toBe(true);
  });

  it("nests files under implicit, deduped folders", () => {
    const tree = buildFileTree([
      "main.sd",
      "chapters/intro.sd",
      "chapters/ending.sd",
      "backgrounds/forest.png",
    ]);
    // Folders (backgrounds, chapters) sort before the file (main.sd).
    expect(tree.map((n) => `${n.isDirectory ? "d:" : "f:"}${n.name}`)).toEqual([
      "d:backgrounds",
      "d:chapters",
      "f:main.sd",
    ]);
    const chapters = tree.find((n) => n.name === "chapters")!;
    expect(chapters.path).toBe("chapters");
    expect(chapters.children.map((n) => n.name)).toEqual(["ending.sd", "intro.sd"]);
    expect(chapters.children.map((n) => n.path)).toEqual([
      "chapters/ending.sd",
      "chapters/intro.sd",
    ]);
  });

  it("supports same-basename files in different folders without collision", () => {
    const tree = buildFileTree(["a/forest.png", "b/forest.png"]);
    const a = tree.find((n) => n.name === "a")!;
    const b = tree.find((n) => n.name === "b")!;
    expect(a.children[0]!.path).toBe("a/forest.png");
    expect(b.children[0]!.path).toBe("b/forest.png");
  });

  it("materializes an empty folder from a sentinel without showing the sentinel", () => {
    const tree = buildFileTree(["emptydir/.folder", "main.sd"]);
    const empty = tree.find((n) => n.name === "emptydir")!;
    expect(empty.isDirectory).toBe(true);
    expect(empty.children).toEqual([]);
  });

  it("builds deep nesting", () => {
    const tree = buildFileTree(["a/b/c/deep.sd"]);
    expect(tree[0]!.name).toBe("a");
    expect(tree[0]!.children[0]!.name).toBe("b");
    expect(tree[0]!.children[0]!.children[0]!.name).toBe("c");
    expect(tree[0]!.children[0]!.children[0]!.children[0]!.path).toBe("a/b/c/deep.sd");
  });
});

describe("flattenVisibleRows", () => {
  const tree = buildFileTree([
    "main.sd",
    "chapters/intro.sd",
    "chapters/sub/deep.sd",
  ]);

  it("shows only top-level rows when nothing is expanded", () => {
    const rows = flattenVisibleRows(tree, new Set());
    expect(rows.map((r) => r.path)).toEqual(["chapters", "main.sd"]);
    const chaptersRow = rows.find((r) => r.path === "chapters")!;
    expect(chaptersRow).toMatchObject({ depth: 0, isDirectory: true, hasChildren: true, expanded: false });
  });

  it("reveals children of an expanded folder at depth+1", () => {
    const rows = flattenVisibleRows(tree, new Set(["chapters"]));
    expect(rows.map((r) => r.path)).toEqual([
      "chapters",
      "chapters/sub",
      "chapters/intro.sd",
      "main.sd",
    ]);
    expect(rows.find((r) => r.path === "chapters")!.expanded).toBe(true);
    expect(rows.find((r) => r.path === "chapters/sub")!).toMatchObject({
      depth: 1,
      isDirectory: true,
      hasChildren: true,
      expanded: false,
    });
    expect(rows.find((r) => r.path === "chapters/intro.sd")!.depth).toBe(1);
  });

  it("expands nested folders only when each ancestor is expanded", () => {
    const rows = flattenVisibleRows(tree, new Set(["chapters", "chapters/sub"]));
    expect(rows.map((r) => r.path)).toEqual([
      "chapters",
      "chapters/sub",
      "chapters/sub/deep.sd",
      "chapters/intro.sd",
      "main.sd",
    ]);
    expect(rows.find((r) => r.path === "chapters/sub/deep.sd")!.depth).toBe(2);
  });
});

describe("filterPaths", () => {
  const paths = ["main.sd", "chapters/intro.sd", "chapters/ending.sd", "art/forest.png"];

  it("returns all paths for an empty query", () => {
    expect(filterPaths(paths, "  ")).toEqual(paths);
  });

  it("matches a filename substring case-insensitively", () => {
    expect(filterPaths(paths, "INTRO")).toEqual(["chapters/intro.sd"]);
  });

  it("matches a folder name, keeping everything beneath it once rebuilt", () => {
    const filtered = filterPaths(paths, "chapters");
    expect(filtered).toEqual(["chapters/intro.sd", "chapters/ending.sd"]);
    const tree = buildFileTree(filtered);
    // The ancestor folder survives because the tree is rebuilt from matches.
    expect(tree.map((n) => n.name)).toEqual(["chapters"]);
    expect(tree[0]!.children.map((n) => n.name)).toEqual(["ending.sd", "intro.sd"]);
  });
});

describe("computeFolderMoves", () => {
  const paths = [
    "main.sd",
    "chapters/intro.sd",
    "chapters/sub/deep.sd",
    "art/forest.png",
  ];

  it("rewrites every path under the moved folder, leaving others untouched", () => {
    expect(computeFolderMoves(paths, "chapters", "archive")).toEqual([
      { from: "chapters/intro.sd", to: "archive/intro.sd" },
      { from: "chapters/sub/deep.sd", to: "archive/sub/deep.sd" },
    ]);
  });

  it("supports nesting a folder under another (deeper destination)", () => {
    expect(computeFolderMoves(paths, "chapters", "archive/old")).toEqual([
      { from: "chapters/intro.sd", to: "archive/old/intro.sd" },
      { from: "chapters/sub/deep.sd", to: "archive/old/sub/deep.sd" },
    ]);
  });

  it("tolerates trailing slashes on either argument", () => {
    expect(computeFolderMoves(paths, "art/", "media/")).toEqual([
      { from: "art/forest.png", to: "media/forest.png" },
    ]);
  });

  it("returns [] when nothing lives under the folder", () => {
    expect(computeFolderMoves(paths, "nonexistent", "x")).toEqual([]);
    // A prefix that matches a filename but not a folder boundary must NOT match.
    expect(computeFolderMoves(["chapters.sd"], "chapters", "x")).toEqual([]);
  });
});

describe("FOLDER_SENTINEL", () => {
  it("materializes an empty folder and is hidden from the tree", () => {
    const tree = buildFileTree([`emptydir/${FOLDER_SENTINEL}`, "main.sd"]);
    const empty = tree.find((n) => n.name === "emptydir")!;
    expect(empty.isDirectory).toBe(true);
    expect(empty.children).toEqual([]);
  });
});
