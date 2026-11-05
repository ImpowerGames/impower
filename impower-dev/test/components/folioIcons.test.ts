import * as kit from "@impower/impower-ui/components";
import { iconMasks } from "@impower/impower-ui/icon-masks";
import * as icons from "@impower/impower-ui/icons";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PROTOTYPE_GLYPHS = [
  "account", "ambience", "arrow", "art", "back", "book", "brackets", "branch",
  "bug", "character", "check", "chevron", "chevron-down", "chevron-left",
  "choose", "clear", "clock", "close", "cloud", "cog", "computer", "copy",
  "dedent", "device", "dialogue", "down", "download", "duplicate", "ellipsis",
  "error", "expand", "face", "file", "folder", "follow", "font", "format",
  "grid", "help", "image", "indent", "info", "insert", "interface", "keyboard",
  "layers", "link", "list", "loop", "menu", "minus", "more", "music", "next",
  "open", "other", "pause", "pencil", "people", "pin", "pipette", "place",
  "play", "plus", "previous", "ratio", "redo", "refresh", "replace",
  "replace-all", "restart", "resume", "root", "save", "scene", "screenplay",
  "search", "select", "settings", "share", "shrink", "size", "sort",
  "sort-reverse", "sound", "spark", "step-into", "step-out", "stop", "story",
  "target", "text", "trash", "undo", "up", "upload", "uses", "variants",
  "video", "visual", "volume", "warning",
];

const MODULE_VARIANTS = [
  "copy-rounded", "download-tray", "expand-inset", "info-stem",
  "more-vertical", "pause-fill", "pause-outline", "pencil-plain",
  "play-outline", "replace-swap", "sound-speaker", "text-lines",
];

const DRAWN_FOR_THE_EDITOR = [
  "fast-forward", "filter", "folder-plus", "follow-off", "match-case",
  "regex", "rewind", "sign-out", "whole-word",
];

const componentFor = (name: string) =>
  `${name.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("")}Icon`;

const generated = new Set<unknown>(Object.values(icons));

const src = resolve(__dirname, "../../src");
const kitSrc = resolve(__dirname, "../../../packages/impower-ui/src/components");
const sources = (dir: string, extension: RegExp): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name), extension)
      : extension.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );

const importedFromKit = sources(src, /\.tsx?$/).flatMap((file) =>
  Array.from(
    readFileSync(file, "utf8").matchAll(
      /import\s*(type\s*)?\{([^}]*)\}\s*from\s*"@impower\/impower-ui\/(components|icons)"/g,
    ),
  ).flatMap((match) =>
    match[2]!
      .split(",")
      .map((spec) => spec.trim())
      .filter(Boolean)
      .map((spec) => ({
        file: relative(src, file).replaceAll("\\", "/"),
        entry: match[3]!,
        typeOnly: Boolean(match[1]) || spec.startsWith("type "),
        name: spec.replace(/^type\s+/, "").split(/\s+as\s+/)[0]!,
      })),
  ),
);

const resolves = ({ entry, name }: { entry: string; name: string }) =>
  entry === "icons" ? name in icons : kit[name as keyof typeof kit] !== undefined;

const values = importedFromKit.filter(({ typeOnly }) => !typeOnly);

describe("the Folio icon set", () => {
  it("holds exactly the prototype's glyphs, the modules' differing drawings and the glyphs drawn for the editor", () => {
    expect(Object.keys(iconMasks).sort()).toEqual(
      [...PROTOTYPE_GLYPHS, ...MODULE_VARIANTS, ...DRAWN_FOR_THE_EDITOR].sort(),
    );
  });

  it("generates one <Name>Icon component and one mask for every glyph", () => {
    expect(Object.keys(icons).filter((name) => name !== "IconComponent").sort()).toEqual(
      Object.keys(iconMasks).map(componentFor).sort(),
    );
    for (const mask of Object.values(iconMasks)) {
      expect(mask).toMatch(/^url\('data:image\/svg\+xml,%3Csvg%20/);
      expect(decodeURIComponent(mask)).toContain('stroke-width="1.7"');
    }
  });

  it("resolves every value the editor imports from impower-ui, so no removed icon name is left behind", () => {
    expect(values.length).toBeGreaterThan(50);
    expect(values.filter((spec) => !resolves(spec))).toEqual([]);
  });

  it("finds every icon the editor imports in the generated set", () => {
    const iconImports = values.filter(({ name }) => generated.has(kit[name as keyof typeof kit]) || /Icon$/.test(name));
    expect(iconImports.length).toBeGreaterThan(50);
    expect(iconImports.filter(({ name }) => !generated.has(kit[name as keyof typeof kit]))).toEqual([]);
  });

  it("keeps the old names only as aliases of Folio components, for the shell files #995 rewrites", () => {
    const aliases = values.filter(({ name }) => generated.has(kit[name as keyof typeof kit]) && !(name in icons));
    expect([...new Set(aliases.map(({ file }) => file.split("/").slice(0, -1).join("/")))].sort()).toEqual([
      "modules/spark-editor/components/account",
      "modules/spark-editor/components/header-menu-button",
      "modules/spark-editor/components/header-navigation",
      "modules/spark-editor/components/header-sync-conflict-toolbar",
      "modules/spark-editor/components/header-sync-toolbar",
      "modules/spark-editor/components/main-window",
    ]);
  });

  it("leaves every icon at the set's own stroke: no editor or kit source sets a stroke width", () => {
    const overrides = [...sources(src, /\.(tsx?|css)$/), ...sources(kitSrc, /\.(tsx?|css)$/)]
      .filter((file) => !/\.generated\./.test(file))
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .flatMap((line, i) => (/stroke-width|strokeWidth/.test(line) ? [`${relative(resolve(src, "../.."), file).replaceAll("\\", "/")}:${i + 1}`] : [])),
      );
    expect(overrides).toEqual([]);
  });
});
