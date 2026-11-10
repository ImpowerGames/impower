import { describe, expect, it } from "vitest";
import {
  canMoveFolder,
  canWriteLayoutMarker,
  computeFolderMoves,
  computeLayoutMigration,
  computeLayoutMigrationBatches,
  foldersWithoutFiles,
  isProjectMetadata,
  LAYOUT_MARKER,
  layoutSubtreeFor,
  needsFolderMigration,
  planFolderMigration,
} from "../../src/modules/spark-editor/utils/fileTree";
import { isInProject } from "@impower/sparkdown/src/compiler/utils/projectMembership";

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
    expect(computeFolderMoves(["chapters.sd"], "chapters", "x")).toEqual([]);
  });
});

describe("planFolderMigration", () => {
  it("removes each zero-byte .folder file and keeps its folder as a directory", () => {
    expect(
      planFolderMigration(
        [
          { path: "main.sd", size: 10 },
          { path: "assets/empty/.folder", size: 0 },
          { path: "scripts/a/b/.folder", size: 0 },
        ],
        ["assets", "assets/empty", "scripts", "scripts/a", "scripts/a/b"],
      ),
    ).toEqual({
      legacyFiles: ["assets/empty/.folder", "scripts/a/b/.folder"],
      folders: ["assets", "assets/empty", "scripts", "scripts/a", "scripts/a/b"],
      staleFolders: [],
    });
  });

  it("removes a zero-byte .folder that sits beside other files, since the old editor never removed it when files arrived", () => {
    expect(
      planFolderMigration(
        [
          { path: "assets/art/.folder", size: 0 },
          { path: "assets/art/bg.png", size: 4 },
        ],
        ["assets", "assets/art"],
      ).legacyFiles,
    ).toEqual(["assets/art/.folder"]);
  });

  it("keeps a .folder file with content, which the user made", () => {
    const plan = planFolderMigration(
      [
        { path: "assets/notes/.folder", size: 12 },
        { path: ".folder", size: 3 },
      ],
      ["assets", "assets/notes"],
    );
    expect(plan.legacyFiles).toEqual([]);
    expect(plan.staleFolders).toEqual([]);
  });

  it("marks directories that held neither a file nor a .folder as stale, since the old editor never showed them", () => {
    expect(
      planFolderMigration(
        [
          { path: "assets/kept/.folder", size: 0 },
          { path: "assets/art/bg.png", size: 4 },
        ],
        [
          "assets",
          "assets/art",
          "assets/kept",
          "assets/kept/leftover",
          "chapters",
          "chapters/old",
        ],
      ).staleFolders,
    ).toEqual(["assets/kept/leftover", "chapters", "chapters/old"]);
  });
});

describe("canMoveFolder", () => {
  it("refuses a destination that is the folder itself, inside it, or a folder that contains it, and allows any other", () => {
    expect(canMoveFolder("assets/a", "assets/a")).toBe(false);
    expect(canMoveFolder("assets/a", "assets/a/")).toBe(false);
    expect(canMoveFolder("assets/a", "assets/a/inner")).toBe(false);
    expect(canMoveFolder("assets/a/a", "assets/a")).toBe(false);
    expect(canMoveFolder("assets/a/inner", "assets")).toBe(false);
    expect(canMoveFolder("assets/a", "assets/ab")).toBe(true);
    expect(canMoveFolder("assets/ab", "assets/a")).toBe(true);
    expect(canMoveFolder("assets/a", "assets/b")).toBe(true);
    expect(canMoveFolder("assets/a/inner", "assets/inner")).toBe(true);
  });
});

describe("isProjectMetadata and needsFolderMigration", () => {
  it("treats only the project's own metadata files as project metadata", () => {
    expect(isProjectMetadata(".name")).toBe(true);
    expect(isProjectMetadata(".layout")).toBe(true);
    expect(isProjectMetadata(".folders")).toBe(true);
    expect(isProjectMetadata(".zipSynced")).toBe(true);
    expect(isProjectMetadata(".backedUpAt")).toBe(true);
    expect(isProjectMetadata(".createdAt")).toBe(true);
    expect(isProjectMetadata(".deletedAt")).toBe(true);
    expect(isProjectMetadata(".remindedAt")).toBe(true);
    expect(isProjectMetadata(".folder")).toBe(false);
    expect(isProjectMetadata(".constructor")).toBe(false);
    expect(isProjectMetadata("assets/.name")).toBe(false);
    expect(isProjectMetadata("assets/.folder")).toBe(false);
    expect(isProjectMetadata("assets/notes/.hidden")).toBe(false);
    expect(isProjectMetadata("main.sd")).toBe(false);
  });

  it("migrates folders until the .folders marker exists, whatever the layout marker says", () => {
    expect(needsFolderMigration(["main.sd", ".layout"])).toBe(true);
    expect(needsFolderMigration(["main.sd", ".folders"])).toBe(false);
    expect(needsFolderMigration(["main.sd", ".folders/x"])).toBe(false);
  });
});

describe("foldersWithoutFiles", () => {
  it("returns the directories no file sits under, minus those kept", () => {
    expect(
      foldersWithoutFiles(
        ["a/x.png", "b/c/"],
        ["a", "a/empty", "b", "b/c", "d", "e"],
        ["e"],
      ),
    ).toEqual(["a/empty", "d"]);
  });
});

describe("computeLayoutMigration", () => {
  const subtreeFor = layoutSubtreeFor;

  it("files a .luau script under scripts/ and leaves one already there in place", () => {
    expect(
      computeLayoutMigration(
        [
          "util.luau",
          "lib/math.luau",
          "assets/stray.luau",
          "scripts/ready.luau",
          "main.luau",
        ],
        subtreeFor,
      ),
    ).toEqual([
      { from: "util.luau", to: "scripts/util.luau" },
      { from: "lib/math.luau", to: "scripts/lib/math.luau" },
      { from: "assets/stray.luau", to: "scripts/stray.luau" },
      { from: "main.luau", to: "scripts/main.luau" },
    ]);
  });

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

  it("leaves dotfiles (project metadata and any other dotfile) alone", () => {
    expect(
      computeLayoutMigration(
        [".name", ".zipSynced", "notes/.folder"],
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

  const applyMoves = (
    paths: string[],
    moves: { from: string; to: string }[],
  ): string[] => {
    const renamed = new Map(moves.map((m) => [m.from, m.to]));
    return paths.map((p) => renamed.get(p) ?? p);
  };

  const projectOf = (paths: string[], path: string): string => {
    const has = (uri: string) => paths.includes(uri);
    const roots = paths
      .filter((p) => p === "main.sd" || p.endsWith("/main.sd"))
      .map((p) => p.slice(0, p.length - "main.sd".length))
      .filter((root) => isInProject(root, path, "main.sd", has))
      .sort((a, b) => b.length - a.length);
    return roots[0] ?? "";
  };

  it("keeps a sub-project's scripts and assets in one folder so they share its project", () => {
    const paths = [
      "main.sd",
      "forest.svg",
      "other/main.sd",
      "other/lib.luau",
      "other/assets/forest.svg",
      "other/song.url",
    ];
    const migrated = applyMoves(paths, computeLayoutMigration(paths, subtreeFor));
    expect(migrated).toEqual([
      "main.sd",
      "assets/forest.svg",
      "scripts/other/main.sd",
      "scripts/other/lib.luau",
      "scripts/other/assets/forest.svg",
      "scripts/other/song.url",
    ]);
    expect(projectOf(migrated, "scripts/other/assets/forest.svg")).toBe(
      "scripts/other/",
    );
    expect(projectOf(migrated, "scripts/other/lib.luau")).toBe(
      "scripts/other/",
    );
    expect(projectOf(migrated, "assets/forest.svg")).toBe("");
    expect(computeLayoutMigration(migrated, subtreeFor)).toEqual([]);
  });

  it("repairs a sub-project an earlier migration split between scripts/ and assets/", () => {
    const paths = [
      "main.sd",
      "assets/forest.svg",
      "scripts/other/main.sd",
      "scripts/other/lib.luau",
      "assets/other/assets/forest.svg",
      "assets/urls/other/song.url",
      "assets/elsewhere/hero.png",
    ];
    const moves = computeLayoutMigration(paths, subtreeFor);
    expect(moves).toEqual([
      {
        from: "assets/other/assets/forest.svg",
        to: "scripts/other/assets/forest.svg",
      },
      { from: "assets/urls/other/song.url", to: "scripts/other/song.url" },
    ]);
    expect(
      computeLayoutMigration(applyMoves(paths, moves), subtreeFor),
    ).toEqual([]);
    expect(
      computeLayoutMigration(
        [...applyMoves(paths, moves), LAYOUT_MARKER],
        subtreeFor,
      ),
    ).toEqual([]);
  });

  it("repairs only before the layout marker exists, so a root asset placed under assets/<sub>/ later stays in the root project", () => {
    const paths = [
      "main.sd",
      LAYOUT_MARKER,
      "scripts/other/main.sd",
      "assets/other/root.png",
      "assets/urls/other/song.url",
    ];
    expect(computeLayoutMigration(paths, subtreeFor)).toEqual([]);
    expect(projectOf(paths, "assets/other/root.png")).toBe("");
  });

  it("never moves a file onto a folder or under a file of the same name", () => {
    expect(
      computeLayoutMigration(
        [
          "main.sd",
          "scripts/other/main.sd",
          "assets/other/tree.png",
          "hero.png",
          "art/bg.png",
          "assets/art",
        ],
        subtreeFor,
        ["scripts/other/tree.png", "assets/hero.png"],
      ),
    ).toEqual([]);
  });

  it("sees an empty folder the file listing cannot, and holds a move onto it", () => {
    const paths = ["main.sd", "hero.png", "chapters/intro.sd"];
    expect(computeLayoutMigration(paths, subtreeFor)).toEqual([
      { from: "hero.png", to: "assets/hero.png" },
      { from: "chapters/intro.sd", to: "scripts/chapters/intro.sd" },
    ]);
    expect(
      computeLayoutMigration(paths, subtreeFor, ["assets/hero.png"]),
    ).toEqual([
      { from: "chapters/intro.sd", to: "scripts/chapters/intro.sd" },
    ]);
  });

  it("keeps a sub-project whole when its folder under scripts/ is already taken", () => {
    const paths = [
      "main.sd",
      "other/main.sd",
      "other/tree.png",
      "scripts/other/main.sd",
      "scripts/other/notes.sd",
    ];
    expect(computeLayoutMigration(paths, subtreeFor)).toEqual([]);
    expect(projectOf(paths, "other/tree.png")).toBe("other/");
  });

  it("keeps a sub-project rooted at a category folder together with its assets", () => {
    expect(
      computeLayoutMigration(
        ["main.sd", "scripts/main.sd", "scripts/forest.svg"],
        subtreeFor,
      ),
    ).toEqual([]);
    expect(
      computeLayoutMigration(
        ["main.sd", "assets/main.sd", "assets/forest.svg", "scripts/intro.sd"],
        subtreeFor,
      ),
    ).toEqual([]);
  });

  it("reaches its final layout in one load when a file blocking a sub-project's folder moves out", () => {
    const paths = [
      "main.sd",
      "other/main.sd",
      "other/tree.png",
      "scripts/other/stray.png",
    ];
    const batches = computeLayoutMigrationBatches(paths, subtreeFor);
    const migrated = batches.reduce(applyMoves, paths);
    expect(migrated).toEqual([
      "main.sd",
      "scripts/other/main.sd",
      "scripts/other/tree.png",
      "assets/other/stray.png",
    ]);
    expect(projectOf(migrated, "assets/other/stray.png")).toBe("");
    expect(
      computeLayoutMigrationBatches([...migrated, LAYOUT_MARKER], subtreeFor),
    ).toEqual([]);
  });

  it("repairs only assets/<sub>/ paths whose scripts/<sub>/main.sd exists at load", () => {
    const paths = [
      "main.sd",
      "assets/forest.svg",
      "assets/art/bg.png",
      "assets/urls/song.url",
      "assets/lonely/tree.png",
      "assets/other/tree.png",
      "other/main.sd",
      "scripts/kept/main.sd",
      "assets/keptsake/x.png",
    ];
    const batches = computeLayoutMigrationBatches(paths, subtreeFor);
    expect(batches).toEqual([
      [{ from: "other/main.sd", to: "scripts/other/main.sd" }],
    ]);
    const migrated = batches.reduce(applyMoves, paths);
    expect(projectOf(migrated, "assets/other/tree.png")).toBe("");
    expect(projectOf(migrated, "assets/keptsake/x.png")).toBe("");
  });

  it("files a non-.url asset under nested urls/ folders in one move, so a second load moves nothing", () => {
    const paths = [
      "main.sd",
      "other/main.sd",
      "other/assets/forest.svg",
      "assets/urls/urls/urls/urls/urls/forest.svg",
    ];
    expect(computeLayoutMigration(paths, subtreeFor)).toContainEqual({
      from: "assets/urls/urls/urls/urls/urls/forest.svg",
      to: "assets/forest.svg",
    });
    const migrated = computeLayoutMigrationBatches(paths, subtreeFor).reduce(
      applyMoves,
      paths,
    );
    expect(
      computeLayoutMigrationBatches([...migrated, LAYOUT_MARKER], subtreeFor),
    ).toEqual([]);
  });

  const loadTwiceWithPersistentFolders = (initial: string[]) => {
    let files = [...initial];
    const folders = new Set<string>();
    const lost: string[] = [];
    const remember = () =>
      files.forEach((p) => {
        const parts = p.split("/");
        for (let i = 1; i < parts.length; i++) {
          folders.add(parts.slice(0, i).join("/"));
        }
      });
    const load = () => {
      remember();
      const batches = computeLayoutMigrationBatches(
        files,
        subtreeFor,
        foldersWithoutFiles(files, [...folders]),
      );
      for (const batch of batches) {
        for (const { from, to } of batch) {
          if (folders.has(to) || files.includes(to)) lost.push(from);
        }
        files = applyMoves(files, batch).filter((p) => !lost.includes(p));
        remember();
      }
      if (canWriteLayoutMarker(files)) {
        if (folders.has(LAYOUT_MARKER)) lost.push(LAYOUT_MARKER);
        files = [...files, LAYOUT_MARKER];
      }
      return batches;
    };
    load();
    const second = load();
    return { files, lost, second };
  };

  it.each([
    [["main.sd", "hero.png", "assets/hero.png/intro.sd"]],
    [["main.sd", "other/main.sd", "other/x", "scripts/other/x/y.png"]],
    [["main.sd", "other/main.sd", "other/tree.png", "scripts/other/stray.png"]],
    [["main.sd", "forest.svg", "other/main.sd", "other/assets/forest.svg"]],
    [["main.sd", "scripts/other/main.sd", "assets/other/assets/forest.svg"]],
    [["main.sd", "other/main.sd", "other/assets/forest.svg", ".layout/notes.txt"]],
    [
      [
        "main.sd",
        "other",
        "assets/forest.svg",
        "scripts/other/main.sd",
        "assets/other/assets/forest.svg",
      ],
    ],
  ])(
    "never moves a file onto a folder emptied earlier, on this load or the next: %j",
    (paths) => {
      const { files, lost, second } = loadTwiceWithPersistentFolders(paths);
      expect(lost).toEqual([]);
      expect(files.filter((p) => p !== LAYOUT_MARKER)).toHaveLength(
        paths.length,
      );
      expect(second).toEqual([]);
    },
  );

  it("leaves a folder at the layout marker's path in place and does not write the marker over it", () => {
    const paths = [
      "main.sd",
      "other/main.sd",
      "other/assets/forest.svg",
      ".layout/notes.txt",
    ];
    const batches = computeLayoutMigrationBatches(paths, subtreeFor);
    expect(batches.flat().map((m) => m.from)).not.toContain(
      ".layout/notes.txt",
    );
    expect(canWriteLayoutMarker(batches.reduce(applyMoves, paths))).toBe(false);
    expect(canWriteLayoutMarker(paths.filter((p) => !p.startsWith(".")))).toBe(
      true,
    );
  });

  it("never files a later batch onto a folder an earlier batch emptied", () => {
    const paths = ["main.sd", "hero.png", "assets/hero.png/intro.sd"];
    const batches = computeLayoutMigrationBatches(paths, subtreeFor);
    expect(batches).toEqual([
      [{ from: "assets/hero.png/intro.sd", to: "scripts/hero.png/intro.sd" }],
    ]);
    expect(batches.reduce(applyMoves, paths)).toContain("hero.png");
  });

  it("moves nothing in a project that carries the layout marker, however its files are placed", () => {
    expect(
      computeLayoutMigrationBatches(
        [
          "main.sd",
          LAYOUT_MARKER,
          "hero.png",
          "intro.sd",
          "scripts/stray.png",
          "other/main.sd",
          "other/tree.png",
          "assets/urls/urls/forest.svg",
        ],
        subtreeFor,
      ),
    ).toEqual([]);
  });

  it("repairs a split sub-project in one load while a root file named like its assets folder stays", () => {
    const paths = [
      "main.sd",
      "other",
      "assets/forest.svg",
      "scripts/other/main.sd",
      "assets/other/assets/forest.svg",
    ];
    const batches = computeLayoutMigrationBatches(paths, subtreeFor);
    expect(batches).toEqual([
      [
        {
          from: "assets/other/assets/forest.svg",
          to: "scripts/other/assets/forest.svg",
        },
      ],
    ]);
    const migrated = batches.reduce(applyMoves, paths);
    expect(migrated).toContain("other");
    expect(projectOf(migrated, "scripts/other/assets/forest.svg")).toBe(
      "scripts/other/",
    );
  });

  it("does not file a root-project script into a sub-project's folder", () => {
    const paths = ["main.sd", "scripts/other/main.sd", "other/x.sd"];
    expect(computeLayoutMigrationBatches(paths, subtreeFor)).toEqual([]);
    expect(projectOf(paths, "other/x.sd")).toBe("");
  });

  it("keeps a nested sub-project inside its outermost sub-project's folder", () => {
    const paths = [
      "main.sd",
      "outer/main.sd",
      "outer/inner/main.sd",
      "outer/inner/tree.png",
    ];
    const migrated = applyMoves(paths, computeLayoutMigration(paths, subtreeFor));
    expect(migrated).toEqual([
      "main.sd",
      "scripts/outer/main.sd",
      "scripts/outer/inner/main.sd",
      "scripts/outer/inner/tree.png",
    ]);
    expect(projectOf(migrated, "scripts/outer/inner/tree.png")).toBe(
      "scripts/outer/inner/",
    );
    expect(computeLayoutMigration(migrated, subtreeFor)).toEqual([]);
  });

  it("leaves a file in place rather than overwrite another at its destination", () => {
    expect(
      computeLayoutMigration(
        [
          "main.sd",
          "scripts/other/main.sd",
          "scripts/other/tree.png",
          "assets/other/tree.png",
          "hero.png",
          "assets/hero.png",
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
