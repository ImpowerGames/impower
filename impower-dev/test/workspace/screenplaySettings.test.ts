import { signal } from "@preact/signals";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ScreenplayParser from "../../../packages/sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayHtmlData } from "../../../packages/sparkdown-screenplay/src/utils/generateScreenplayHtmlData";
import extensionManifest from "../../../vscode-sparkdown/package.json";
import {
  screenplayConfig,
  screenplaySummary,
  SCREENPLAY_SETTING_KEYS,
} from "../../src/modules/spark-editor/workspace/settings/screenplaySettings";
import {
  extensionDefaults,
  projectSettingsFromJson,
  projectSettingsJson,
} from "../../src/modules/spark-editor/workspace/settings/settingsJson";
import {
  PROJECT_SETTINGS_SCHEMA,
  resolveSettings,
  type ProjectSettings,
} from "../../src/modules/spark-editor/workspace/settings/settingsSchema";
import workspaceSettings, {
  WorkspaceSettings,
} from "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings";

const posted: { method: string; params: { config: unknown } }[] = [];

beforeAll(() => {
  (globalThis as { Worker?: unknown }).Worker = class {
    onerror: unknown;
    addEventListener() {}
    postMessage(message: { method: string; params: { config: unknown } }) {
      posted.push(message);
    }
  };
});

const defaults = (): ProjectSettings => resolveSettings(PROJECT_SETTINGS_SCHEMA, {});

beforeEach(() => {
  localStorage.clear();
  posted.length = 0;
  vi.stubGlobal("fetch", async () => ({ arrayBuffer: async () => new ArrayBuffer(1) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  workspaceSettings.resetProjectSettings(SCREENPLAY_SETTING_KEYS);
});

describe("the screenplay settings", () => {
  it("default to the extension's values", () => {
    const manifest = extensionDefaults(extensionManifest);
    const settings = defaults();
    expect(Object.fromEntries(SCREENPLAY_SETTING_KEYS.map((key) => [key, settings[key]]))).toEqual({
      screenplayTitlePage: true,
      screenplayHeadingsBold: true,
      screenplaySceneNumbers: "none",
      screenplaySceneNames: false,
      screenplayBranchNames: false,
      screenplayKnotNames: false,
      screenplayPaperSize: "usletter",
      screenplayPageNumbers: true,
      screenplaySplitDialogue: true,
      screenplayMore: "(MORE)",
      screenplayContd: "(CONT'D)",
      screenplayBookmarks: true,
      screenplayHiddenBookmarks: true,
    });
    for (const key of SCREENPLAY_SETTING_KEYS) {
      for (const path of PROJECT_SETTINGS_SCHEMA[key].configurationKeys ?? []) {
        expect(manifest[`sparkdown.${path}`], path).toBe(settings[key]);
      }
    }
  });

  it("are normalised on read: wrong types and unknown choices fall back, text is cut at 40 characters", () => {
    const long = "X".repeat(60);
    const settings = resolveSettings(PROJECT_SETTINGS_SCHEMA, {
      screenplayTitlePage: "no",
      screenplaySceneNumbers: "top",
      screenplayPaperSize: "legal",
      screenplayBookmarks: 0,
      screenplayMore: long,
      screenplayContd: "",
    });
    expect(settings.screenplayTitlePage).toBe(true);
    expect(settings.screenplaySceneNumbers).toBe("none");
    expect(settings.screenplayPaperSize).toBe("usletter");
    expect(settings.screenplayBookmarks).toBe(true);
    expect(settings.screenplayMore).toBe("X".repeat(40));
    expect(settings.screenplayContd).toBe("");
  });

  it("cut stored and imported text at 40 characters", () => {
    const store = new WorkspaceSettings(signal("p"), localStorage);
    store.setProjectSetting("screenplayContd", "C".repeat(41));
    expect(store.projectSettings.value.screenplayContd).toBe("C".repeat(40));
    store.replaceProjectSettings(
      "p",
      projectSettingsFromJson(
        JSON.stringify({ "sparkdown.screenplay.pdf.composition.printDialogueMORE": "M".repeat(50) }),
      ),
    );
    expect(store.projectSettings.value.screenplayMore).toBe("M".repeat(40));
    store.dispose();
  });

  it("no longer carry the section-numbers flag nothing prints", () => {
    expect(Object.keys(PROJECT_SETTINGS_SCHEMA)).not.toContain("screenplaySectionNumbers");
    expect(Object.keys(extensionDefaults(extensionManifest))).not.toContain(
      "sparkdown.screenplay.numbering.printSectionNumbers",
    );
  });
});

describe("the screenplay summary", () => {
  it("names the paper, the title page and the heading numbers", () => {
    expect(screenplaySummary(defaults())).toBe("US Letter · Title page · No scene numbers");
    expect(
      screenplaySummary({
        ...defaults(),
        screenplayPaperSize: "a4",
        screenplayTitlePage: false,
        screenplaySceneNumbers: "right",
      }),
    ).toBe("A4 · No title page · Scene numbers on the right");
    expect(screenplaySummary({ ...defaults(), screenplaySceneNumbers: "left" })).toContain("Scene numbers on the left");
    expect(screenplaySummary({ ...defaults(), screenplaySceneNumbers: "both" })).toContain("Scene numbers on both sides");
  });
});

describe("the print configuration", () => {
  it("is built from every screenplay setting", () => {
    const base = screenplayConfig(defaults());
    expect(base).toEqual({
      screenplay_print_title_page: true,
      screenplay_print_headings_bold: true,
      screenplay_print_scene_numbers: "none",
      screenplay_print_scene_identifiers: false,
      screenplay_print_branch_identifiers: false,
      screenplay_print_knot_identifiers: false,
      screenplay_print_stitch_identifiers: false,
      screenplay_print_paper_size: "usletter",
      screenplay_print_page_numbers: true,
      screenplay_print_dialogue_split_across_pages: true,
      screenplay_print_dialogue_more: "(MORE)",
      screenplay_print_dialogue_contd: "(CONT'D)",
      screenplay_print_bookmarks: true,
      screenplay_print_bookmarks_for_invisible_headings: true,
    });
    const changes: [keyof ProjectSettings, unknown, Record<string, unknown>][] = [
      ["screenplayTitlePage", false, { screenplay_print_title_page: false }],
      ["screenplayHeadingsBold", false, { screenplay_print_headings_bold: false }],
      ["screenplaySceneNumbers", "right", { screenplay_print_scene_numbers: "right" }],
      ["screenplaySceneNames", true, { screenplay_print_scene_identifiers: true }],
      ["screenplayBranchNames", true, { screenplay_print_branch_identifiers: true }],
      [
        "screenplayKnotNames",
        true,
        { screenplay_print_knot_identifiers: true, screenplay_print_stitch_identifiers: true },
      ],
      ["screenplayPaperSize", "a4", { screenplay_print_paper_size: "a4" }],
      ["screenplayPageNumbers", false, { screenplay_print_page_numbers: false }],
      ["screenplaySplitDialogue", false, { screenplay_print_dialogue_split_across_pages: false }],
      ["screenplayMore", "(more)", { screenplay_print_dialogue_more: "(more)" }],
      ["screenplayContd", "(cont)", { screenplay_print_dialogue_contd: "(cont)" }],
      ["screenplayBookmarks", false, { screenplay_print_bookmarks: false }],
      ["screenplayHiddenBookmarks", false, { screenplay_print_bookmarks_for_invisible_headings: false }],
    ];
    expect(changes.map(([key]) => key).sort()).toEqual([...SCREENPLAY_SETTING_KEYS].sort());
    for (const [key, value, expected] of changes) {
      expect(screenplayConfig({ ...defaults(), [key]: value }), key).toEqual({ ...base, ...expected });
    }
  });

  it("is what exportPDF and exportHTML send, following the project's settings at export time", async () => {
    const { default: WorkspacePrint } = await import("../../src/modules/spark-editor/workspace/WorkspacePrint");
    const print = new WorkspacePrint();
    void print.exportPDF(["Hello"]);
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.method).toBe("workspace/exportPDF");
    expect(posted[0]!.params.config).toEqual(screenplayConfig(defaults()));

    workspaceSettings.setProjectSetting("screenplaySceneNumbers", "right");
    workspaceSettings.setProjectSetting("screenplayPaperSize", "a4");
    workspaceSettings.setProjectSetting("screenplayHeadingsBold", false);
    void print.exportPDF(["Hello"]);
    void print.exportHTML(["Hello"]);
    await vi.waitFor(() => expect(posted).toHaveLength(3));
    const changed = {
      ...screenplayConfig(defaults()),
      screenplay_print_scene_numbers: "right",
      screenplay_print_paper_size: "a4",
      screenplay_print_headings_bold: false,
    };
    expect(posted[1]!.params.config).toEqual(changed);
    expect(posted[2]!.method).toBe("workspace/exportHTML");
    expect(posted[2]!.params.config).toEqual(changed);

    workspaceSettings.resetProjectSettings(SCREENPLAY_SETTING_KEYS);
    void print.exportPDF(["Hello"]);
    await vi.waitFor(() => expect(posted).toHaveLength(4));
    expect(posted[3]!.params.config).toEqual(screenplayConfig(defaults()));
  });
});

describe("the HTML export", () => {
  const SCRIPT = [
    "scene PrivateScene",
    "",
    "  The room is quiet.",
    "",
    "  branch PrivateBranch",
    "",
    "    Someone waits by the window.",
    "",
    "  end",
    "end",
    "",
  ].join("\n");

  const html = (changes: Partial<ProjectSettings>) =>
    generateScreenplayHtmlData(
      new ScreenplayParser().parseAll([SCRIPT]),
      screenplayConfig({ ...defaults(), ...changes }),
    );

  it("prints scene and branch names only when their settings are on", () => {
    const hidden = html({});
    expect(hidden).toContain("The room is quiet.");
    expect(hidden).not.toContain("PrivateScene");
    expect(hidden).not.toContain("PrivateBranch");

    const scenes = html({ screenplaySceneNames: true });
    expect(scenes).toContain(">PrivateScene<");
    expect(scenes).not.toContain("PrivateBranch");

    const branches = html({ screenplayBranchNames: true });
    expect(branches).not.toContain("PrivateScene");
    expect(branches).toContain(">PrivateBranch<");
  });

  it("prints headings bold only when Bold headings is on", () => {
    const script = ["scene start", "", "  $: INT. HOUSE - DAY", "", "  It is quiet.", "", "end", ""].join("\n");
    const render = (bold: boolean) =>
      generateScreenplayHtmlData(
        new ScreenplayParser().parseAll([script]),
        screenplayConfig({ ...defaults(), screenplayHeadingsBold: bold }),
      );
    expect(render(true)).toContain('<p class="heading"><b>INT. HOUSE - DAY</b></p>');
    expect(render(false)).toContain('<p class="heading">INT. HOUSE - DAY</p>');
  });
});

describe("the screenplay export keys", () => {
  const manifest = extensionDefaults(extensionManifest);

  it("write exactly the changed keys under the extension's names, and nothing for a default project", () => {
    expect(projectSettingsJson(defaults(), manifest)).toBeUndefined();
    const json = projectSettingsJson(
      { ...defaults(), screenplaySceneNumbers: "right", screenplayPaperSize: "a4" },
      manifest,
    );
    expect(JSON.parse(json!)).toEqual({
      "sparkdown.screenplay.numbering.printSceneNumbers": "right",
      "sparkdown.screenplay.pdf.printPaperSize": "a4",
    });
    expect(projectSettingsFromJson(json!)).toEqual({
      screenplaySceneNumbers: "right",
      screenplayPaperSize: "a4",
    });
  });

  it("write knot names as both the knot and stitch keys and never write branch names", () => {
    const json = projectSettingsJson(
      { ...defaults(), screenplayKnotNames: true, screenplayBranchNames: true },
      manifest,
    );
    expect(JSON.parse(json!)).toEqual({
      "sparkdown.screenplay.markup.printKnotIdentifiers": true,
      "sparkdown.screenplay.markup.printStitchIdentifiers": true,
    });
  });
});
