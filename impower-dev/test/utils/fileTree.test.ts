import { describe, expect, it } from "vitest";
import {
  breadcrumbSegments,
  buildFileTree,
  childrenRows,
  computeFolderMoves,
  computeLayoutMigration,
  computeStickyRows,
  descendantPaths,
  filterPaths,
  flattenVisibleRows,
  FOLDER_SENTINEL,
  resolveScopePath,
  rewriteMainIncludesForMigration,
  subtreeChildren,
} from "../../src/modules/spark-editor/utils/fileTree";

describe("buildFileTree", () => {
  it("keeps flat files at the top level, grouped by extension then name", () => {
    const tree = buildFileTree(["main.sd", "zebra.png", "apple.sd"]);
    // `.png` sorts before `.sd`; within `.sd`, apple before main.
    expect(tree.map((n) => n.name)).toEqual(["zebra.png", "apple.sd", "main.sd"]);
    expect(tree.every((n) => !n.isDirectory)).toBe(true);
  });

  it("groups files by extension first, then alphabetically within an extension", () => {
    const tree = buildFileTree([
      "song.mp3",
      "hero.png",
      "main.sd",
      "alpha.png",
      "intro.sd",
      "beat.mp3",
    ]);
    // ext order: mp3 < png < sd; alpha within each.
    expect(tree.map((n) => n.name)).toEqual([
      "beat.mp3",
      "song.mp3",
      "alpha.png",
      "hero.png",
      "intro.sd",
      "main.sd",
    ]);
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

describe("childrenRows (dive mode)", () => {
  const tree = buildFileTree([
    "main.sd",
    "chapters/intro.sd",
    "chapters/act1/scene1.sd",
    "chapters/act1/scene2.sd",
    "art/hero.png",
  ]);

  it("returns the top-level children at depth 0 for the root scope", () => {
    const rows = childrenRows(tree, "");
    // folders (art, chapters) before the file (main.sd); all depth 0.
    expect(rows.map((r) => r.name)).toEqual(["art", "chapters", "main.sd"]);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
    expect(rows.every((r) => r.expanded === false)).toBe(true);
  });

  it("returns only the direct children of a nested scope (no descendants)", () => {
    const rows = childrenRows(tree, "chapters");
    expect(rows.map((r) => r.name)).toEqual(["act1", "intro.sd"]);
    const act1 = rows.find((r) => r.name === "act1")!;
    expect(act1.isDirectory).toBe(true);
    expect(act1.hasChildren).toBe(true);
  });

  it("returns [] for a scope that does not resolve to a folder", () => {
    expect(childrenRows(tree, "chapters/nope")).toEqual([]);
    expect(childrenRows(tree, "main.sd")).toEqual([]); // a file, not a folder
  });
});

describe("breadcrumbSegments", () => {
  it("is empty at the root", () => {
    expect(breadcrumbSegments("")).toEqual([]);
  });

  it("returns cumulative { name, path } from shallowest to deepest", () => {
    expect(breadcrumbSegments("chapters/act1/scene")).toEqual([
      { name: "chapters", path: "chapters" },
      { name: "act1", path: "chapters/act1" },
      { name: "scene", path: "chapters/act1/scene" },
    ]);
  });
});

describe("resolveScopePath", () => {
  const tree = buildFileTree([
    "chapters/act1/scene1.sd",
    "chapters/intro.sd",
  ]);

  it("returns the scope unchanged when it still resolves", () => {
    expect(resolveScopePath(tree, "chapters/act1")).toBe("chapters/act1");
  });

  it("falls back to the deepest surviving ancestor", () => {
    // act1 deleted -> scope recovers to `chapters`.
    expect(resolveScopePath(tree, "chapters/gone/deeper")).toBe("chapters");
    // whole branch gone -> root.
    expect(resolveScopePath(tree, "nope/at/all")).toBe("");
  });

  it("returns root for the root scope", () => {
    expect(resolveScopePath(tree, "")).toBe("");
  });
});

describe("buildFileTree compareFiles (sort)", () => {
  it("sorts file siblings by the comparator; folders stay first by name", () => {
    const tree = buildFileTree(
      ["zebra.png", "apple.png", "beta/x.sd", "alpha/y.sd"],
      // name DESCENDING comparator for files
      { compareFiles: (a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0) },
    );
    // folders (alpha, beta) always first by name asc; then files name-desc.
    expect(tree.map((n) => n.name)).toEqual([
      "alpha",
      "beta",
      "zebra.png",
      "apple.png",
    ]);
  });
});

describe("flattenVisibleRows expandAll", () => {
  it("emits every descendant when expandAll is set, ignoring `expanded`", () => {
    const tree = buildFileTree(["a/b/c.sd", "a/d.sd"]);
    const rows = flattenVisibleRows(tree, new Set(), true);
    // folders first within each level: a, a/b (folder), a/b/c.sd, a/d.sd.
    expect(rows.map((r) => r.path)).toEqual(["a", "a/b", "a/b/c.sd", "a/d.sd"]);
  });

  it("still honors the expanded set when expandAll is false", () => {
    const tree = buildFileTree(["a/b/c.sd"]);
    expect(flattenVisibleRows(tree, new Set()).map((r) => r.path)).toEqual(["a"]);
  });
});

describe("descendantPaths (folder-select cascade)", () => {
  const tree = buildFileTree(["a/b/c.sd", "a/b/d.png", "a/e.sd", "f.sd"]);

  it("returns every descendant (files + subfolders), excluding the folder itself", () => {
    expect(descendantPaths(tree, "a").sort()).toEqual(
      ["a/b", "a/b/c.sd", "a/b/d.png", "a/e.sd"].sort(),
    );
    expect(descendantPaths(tree, "a/b").sort()).toEqual(
      ["a/b/c.sd", "a/b/d.png"].sort(),
    );
  });

  it("returns [] for a leaf file, the root, or an unknown path", () => {
    expect(descendantPaths(tree, "f.sd")).toEqual([]);
    expect(descendantPaths(tree, "")).toEqual([]);
    expect(descendantPaths(tree, "nope")).toEqual([]);
  });
});

describe("computeStickyRows (sticky scroll)", () => {
  const H = 52;
  // a(d0,i0), a/f1(d1,i1)..a/f5(d1,i5), b.sd(d0,i6)
  const rows = flattenVisibleRows(
    buildFileTree(["a/f1.sd", "a/f2.sd", "a/f3.sd", "a/f4.sd", "a/f5.sd", "b.sd"]),
    new Set(["a"]),
  );

  it("pins the ancestor folder once scrolled into its contents", () => {
    const sticky = computeStickyRows(rows, 2 * H, H);
    expect(sticky.map((s) => s.path)).toEqual(["a"]);
    expect(sticky[0]!.depth).toBe(0);
    expect(sticky[0]!.index).toBe(0);
  });

  it("is empty at the very top", () => {
    expect(computeStickyRows(rows, 0, H)).toEqual([]);
  });

  it("clears once scrolled past the folder's contents", () => {
    expect(computeStickyRows(rows, 6 * H, H)).toEqual([]);
  });

  it("pins nested ancestors shallow → deep", () => {
    const nested = flattenVisibleRows(
      buildFileTree(["a/b/c/f.sd"]),
      new Set(["a", "a/b", "a/b/c"]),
    );
    expect(computeStickyRows(nested, 3 * H, H).map((s) => s.path)).toEqual([
      "a",
      "a/b",
      "a/b/c",
    ]);
  });

  it("pins an open folder as soon as its own row scrolls off the top", () => {
    // a(d0,i0), a/sub(d1,i1), a/sub/f1(d2,i2), a/sub/f2(d2,i3)
    const r = flattenVisibleRows(
      buildFileTree(["a/sub/f1.sd", "a/sub/f2.sd"]),
      new Set(["a", "a/sub"]),
    );
    // 1px past a/sub's OWN row → it pins under `a`, not only once a child is up.
    expect(computeStickyRows(r, 1 * H + 1, H).map((s) => s.path)).toEqual([
      "a",
      "a/sub",
    ]);
  });

  it("does not pin an open folder while its row is still fully at the top", () => {
    const r = flattenVisibleRows(
      buildFileTree(["a/sub/f1.sd"]),
      new Set(["a", "a/sub"]),
    );
    expect(computeStickyRows(r, 1 * H, H).map((s) => s.path)).toEqual(["a"]);
  });
});

describe("subtreeChildren", () => {
  const tree = buildFileTree([
    "scripts/intro.sd",
    "scripts/chapters/act1.sd",
    "assets/hero.png",
    "main.sd",
  ]);

  it("returns the whole forest for an empty prefix", () => {
    expect(subtreeChildren(tree, "").map((n) => n.name).sort()).toEqual([
      "assets",
      "main.sd",
      "scripts",
    ]);
  });

  it("returns the CONTENTS of a subtree, not the wrapper folder", () => {
    // Rooting at `scripts/` shows intro.sd + the chapters folder, full paths kept.
    const kids = subtreeChildren(tree, "scripts");
    expect(kids.map((n) => n.path).sort()).toEqual([
      "scripts/chapters",
      "scripts/intro.sd",
    ]);
  });

  it("returns [] for a prefix that doesn't resolve to a folder (empty panel)", () => {
    expect(subtreeChildren(tree, "assets/missing")).toEqual([]);
    expect(subtreeChildren(buildFileTree(["main.sd"]), "scripts")).toEqual([]);
  });
});

describe("computeLayoutMigration", () => {
  const subtreeFor = (p: string) =>
    p.endsWith(".sd")
      ? "scripts"
      : p.endsWith(".url")
        ? "assets/urls"
        : "assets";

  it("moves scripts/assets/urls under their subtree, preserving substructure", () => {
    expect(
      computeLayoutMigration(
        [
          "intro.sd",
          "chapters/act1.sd",
          "hero.png",
          "art/bg.png",
          "song.url",
        ],
        subtreeFor,
      ),
    ).toEqual([
      { from: "intro.sd", to: "scripts/intro.sd" },
      { from: "chapters/act1.sd", to: "scripts/chapters/act1.sd" },
      { from: "hero.png", to: "assets/hero.png" },
      { from: "art/bg.png", to: "assets/art/bg.png" },
      { from: "song.url", to: "assets/urls/song.url" },
    ]);
  });

  it("leaves main.sd at the root", () => {
    expect(computeLayoutMigration(["main.sd"], subtreeFor)).toEqual([]);
  });

  it("leaves dotfiles (metadata + .folder sentinels) alone", () => {
    expect(
      computeLayoutMigration(
        [".name", ".zipSynced", "empty/.folder"],
        subtreeFor,
      ),
    ).toEqual([]);
  });

  it("is idempotent — already-migrated files are skipped", () => {
    expect(
      computeLayoutMigration(
        [
          "scripts/intro.sd",
          "assets/hero.png",
          "assets/urls/song.url",
          "main.sd",
        ],
        subtreeFor,
      ),
    ).toEqual([]);
  });

  it("re-homes a .url misfiled under assets/ or top-level urls/ into assets/urls/", () => {
    expect(
      computeLayoutMigration(
        [
          "assets/song.url",
          "assets/sfx/click.url",
          "urls/legacy.url",
          "assets/hero.png",
        ],
        subtreeFor,
      ),
    ).toEqual([
      { from: "assets/song.url", to: "assets/urls/song.url" },
      { from: "assets/sfx/click.url", to: "assets/urls/sfx/click.url" },
      { from: "urls/legacy.url", to: "assets/urls/legacy.url" },
    ]);
  });
});

describe("rewriteMainIncludesForMigration", () => {
  it("prepends scripts/ to bare relative include paths", () => {
    const src = "include intro.sd\ninclude chapters/act1.sd\n";
    expect(rewriteMainIncludesForMigration(src)).toBe(
      "include scripts/intro.sd\ninclude scripts/chapters/act1.sd\n",
    );
  });

  it("preserves leading indentation and trailing whitespace", () => {
    expect(rewriteMainIncludesForMigration("  include intro.sd  ")).toBe(
      "  include scripts/intro.sd  ",
    );
  });

  it("leaves already-rooted, dotted, and schemed paths alone (idempotent)", () => {
    const src =
      "include scripts/intro.sd\ninclude ./local.sd\ninclude ../up.sd\ninclude https://x/y.sd";
    expect(rewriteMainIncludesForMigration(src)).toBe(src);
  });

  it("does not touch non-include lines or the word inside another token", () => {
    const src = "title: My Include\nmyinclude foo.sd\n# include heading\n";
    expect(rewriteMainIncludesForMigration(src)).toBe(src);
  });

  it("returns a main.sd with no includes unchanged", () => {
    const src = "= start\nThe quick brown fox.\n-> END\n";
    expect(rewriteMainIncludesForMigration(src)).toBe(src);
  });
});
