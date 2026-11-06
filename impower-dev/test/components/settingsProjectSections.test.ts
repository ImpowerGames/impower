import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  files: {} as Record<string, { uri: string; type: string; src: string }>,
  edits: [] as number[],
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      getFiles: async () => fake.files,
      getRelativePath: (projectId: string, uri: string) => uri.slice(`file:///${projectId}/`.length),
    },
    window: {
      editMainAt: async (line: number) => {
        fake.edits.push(line);
      },
    },
  },
}));

const { LiveRegion } = await import("@impower/impower-ui/components");
const { default: MetadataSection } = await import("../../src/modules/spark-editor/components/settings/MetadataSection");
const { default: AddMenuSection } = await import("../../src/modules/spark-editor/components/settings/AddMenuSection");
const { default: FileTypesSection } = await import("../../src/modules/spark-editor/components/settings/FileTypesSection");
const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: workspaceSettings } = await import("../../src/modules/spark-editor/workspace/settings/WorkspaceSettings");
const { PROJECT_SETTINGS_SCHEMA } = await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");
const { extensionDefaults, projectSettingsJson } = await import(
  "../../src/modules/spark-editor/workspace/settings/settingsJson"
);
const { default: extensionManifest } = await import("../../../vscode-sparkdown/package.json");
const { SparkdownCompiler } = await import("@impower/sparkdown/src/compiler/classes/SparkdownCompiler");
const { fileCategory, isImagePath } = await import("../../src/modules/spark-editor/utils/fileIcon");
const { isScriptPath } = await import("../../src/modules/spark-editor/utils/scriptFiles");

const PROJECT = "proj";

let host: HTMLDivElement | undefined;

const mount = async (...nodes: ReturnType<typeof h>[]) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h("div", null, h(LiveRegion, null), ...nodes), host!));
  await settle();
  return host;
};

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

const file = (path: string, type: string) => {
  const uri = `file:///${PROJECT}/${path}`;
  fake.files[uri] = { uri, type, src: `blob:${path}` };
};

const input = (id: string) => host!.querySelector<HTMLInputElement>(`#${id}-control`)!;
const detail = (id: string) => host!.querySelector(`#${id}-detail`)!.textContent;
const region = () => host!.querySelector('[role="status"]')!.textContent?.trim();

const type = async (id: string, value: string) => {
  const field = input(id);
  await act(async () => {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
};

const commit = async (id: string) => {
  await act(async () => {
    input(id).dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
};

const PROJECT_KEYS = [
  "addFolderBackdrop",
  "addFolderPortrait",
  "addFolderMusic",
  "addFolderSound",
  "scriptFiles",
  "imageFiles",
  "audioFiles",
  "fontFiles",
] as const;

beforeEach(() => {
  localStorage.clear();
  fake.files = {};
  fake.edits = [];
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: PROJECT } };
  workspace.storyFrontMatter.value = {};
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  workspaceSettings.resetProjectSettings(PROJECT_KEYS);
  workspaceSettings.resetPreferences(["portraitCrop"]);
});

describe("Project metadata", () => {
  const frontMatterOf = (text: string) => {
    const uri = "inmemory:///main.sd";
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
    });
    return compiler.compile({ textDocument: { uri } }).program.frontMatter ?? {};
  };

  const facts = () =>
    [...host!.querySelectorAll("dl [data-fact-row]")].map((row) => [
      row.querySelector("dt")!.textContent,
      row.querySelector("dd")!.textContent,
    ]);

  it("shows the title and author the compiler read from main's front matter", async () => {
    workspace.storyFrontMatter.value = frontMatterOf(
      ["---", "title:", "  _The Long Road_", "  Home", 'author: "Ada Lovelace"', "---", "", "Hello."].join("\n") + "\n",
    );
    await mount(h(MetadataSection, { id: "story-details", title: "Project metadata" }));
    expect(facts()).toEqual([
      ["Title", "The Long Road\nHome"],
      ["Author", "Ada Lovelace"],
    ]);
  });

  it("reads Title and Author in any case, as the screenplay title page does", async () => {
    workspace.storyFrontMatter.value = frontMatterOf(["---", "Title: River Story", "AUTHOR: Ada", "---", ""].join("\n") + "\n");
    await mount(h(MetadataSection, { id: "story-details", title: "Project metadata" }));
    expect(facts()).toEqual([
      ["Title", "River Story"],
      ["Author", "Ada"],
    ]);
  });

  it("shows Untitled story and Not set without a front matter block, and follows the next compile", async () => {
    workspace.storyFrontMatter.value = frontMatterOf("Hello.\n");
    await mount(h(MetadataSection, { id: "story-details", title: "Project metadata" }));
    expect(facts()).toEqual([
      ["Title", "Untitled story"],
      ["Author", "Not set"],
    ]);
    await act(async () => {
      workspace.storyFrontMatter.value = frontMatterOf(["---", "title: Renamed", "---", ""].join("\n") + "\n");
    });
    expect(facts()[0]).toEqual(["Title", "Renamed"]);
  });

  it("opens main at its first line from Edit in Main", async () => {
    await mount(h(MetadataSection, { id: "story-details", title: "Project metadata" }));
    await act(async () => host!.querySelector<HTMLButtonElement>("[data-edit-main]")!.click());
    await settle();
    expect(fake.edits).toEqual([0]);
  });
});

describe("Add menu", () => {
  const mountAddMenu = () => mount(h(AddMenuSection, { id: "add-folder-preferences", title: "Add menu" }));

  beforeEach(() => {
    file("assets/Backdrops/beach.png", "image");
    file("assets/Images/backdrops/night.jpg", "image");
    file("assets/Images/Places/harbor.png", "image");
    file("assets/Music/theme.ogg", "audio");
  });

  it("counts each picker's files through the pickers' matcher", async () => {
    await mountAddMenu();
    expect(detail("add-folder-backdrop")).toBe("Contains 2 backdrop files");
    expect(detail("add-folder-portrait")).toBe("Contains nothing yet");
    expect(detail("add-folder-music")).toBe("Contains 1 music file");
    expect(detail("add-folder-sound")).toBe("Contains nothing yet");
    expect(input("add-folder-backdrop").value).toBe("Backdrops");
  });

  it("keeps a name while it is typed, saves it on commit and counts the renamed folder", async () => {
    await mountAddMenu();
    await type("add-folder-backdrop", "Pla");
    expect(input("add-folder-backdrop").value).toBe("Pla");
    expect(workspaceSettings.projectSettings.value.addFolderBackdrop).toBe("Backdrops");
    await type("add-folder-backdrop", "Places");
    await commit("add-folder-backdrop");
    expect(workspaceSettings.projectSettings.value.addFolderBackdrop).toBe("Places");
    expect(detail("add-folder-backdrop")).toBe("Contains 1 backdrop file");
    expect(region()).toBe("Backdrop: Places.");
    expect(host!.querySelector("[data-reset-all]")).not.toBeNull();
  });

  it("refuses a name with a slash or an empty name with the reason, keeping the previous name", async () => {
    await mountAddMenu();
    await type("add-folder-backdrop", "Images/Places");
    await commit("add-folder-backdrop");
    expect(workspaceSettings.projectSettings.value.addFolderBackdrop).toBe("Backdrops");
    expect(input("add-folder-backdrop").value).toBe("Backdrops");
    expect(input("add-folder-backdrop").getAttribute("aria-invalid")).toBe("true");
    expect(detail("add-folder-backdrop")).toBe("A folder name can't contain a slash, so Backdrops is kept.");
    expect(region()).toBe("Backdrop: A folder name can't contain a slash, so Backdrops is kept.");

    await type("add-folder-backdrop", "");
    expect(input("add-folder-backdrop").getAttribute("aria-invalid")).toBeNull();
    await commit("add-folder-backdrop");
    expect(detail("add-folder-backdrop")).toBe("A folder name can't be empty, so Backdrops is kept.");
    expect(workspaceSettings.projectSettings.value.addFolderBackdrop).toBe("Backdrops");
  });

  it("drops a refusal once the name it kept changes, as on Reset to defaults", async () => {
    await mountAddMenu();
    await type("add-folder-backdrop", "Places");
    await commit("add-folder-backdrop");
    await type("add-folder-backdrop", "Images/Places");
    await commit("add-folder-backdrop");
    expect(detail("add-folder-backdrop")).toBe("A folder name can't contain a slash, so Places is kept.");
    await act(async () => host!.querySelector<HTMLButtonElement>("[data-reset-all]")!.click());
    await settle();
    expect(input("add-folder-backdrop").value).toBe("Backdrops");
    expect(input("add-folder-backdrop").getAttribute("aria-invalid")).toBeNull();
    expect(detail("add-folder-backdrop")).toBe("Contains 2 backdrop files");
  });

  it("follows the files as they change", async () => {
    await mountAddMenu();
    file("assets/Sounds/door.wav", "audio");
    const { sendProtocolMessage } = await import("@impower/spark-editor-protocol/src/protocols/MessageProtocol");
    const { DidChangeWatchedFilesMessage } = await import(
      "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage"
    );
    await act(async () => {
      sendProtocolMessage(
        DidChangeWatchedFilesMessage.type.notification({
          changes: [{ uri: `file:///${PROJECT}/assets/Sounds/door.wav`, type: 1 }],
        }),
      );
    });
    await settle();
    expect(detail("add-folder-sound")).toBe("Contains 1 sound file");
  });

  it("sets the portrait thumbnails' visible area as a preference, shown on the project's own portrait", async () => {
    await mountAddMenu();
    const thumbnails = () => [...host!.querySelectorAll("[data-portrait-examples] [data-portrait-thumbnail]")];
    expect(thumbnails().map((t) => t.querySelector("img"))).toEqual([null, null]);
    expect(host!.querySelector("[data-portrait-examples-hint]")!.textContent).toBe(
      "The examples use a portrait from your Portraits folder.",
    );
    const slider = input("portrait-crop");
    expect([slider.type, slider.min, slider.max, slider.step, slider.value]).toEqual(["range", "25", "100", "5", "50"]);
    expect(slider.getAttribute("aria-valuetext")).toBe("Top 50%");
    await act(async () => {
      slider.value = "100";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(workspaceSettings.preferences.value.portraitCrop).toBe(100);
    expect(host!.querySelector("output")!.textContent).toBe("Whole image");
    expect(thumbnails()[1]!.getAttribute("data-visible-percent")).toBe("100");

    await act(async () => render(null, host!));
    file("assets/Portraits/imani.png", "image");
    await act(async () =>
      render(h("div", null, h(LiveRegion, null), h(AddMenuSection, { id: "add-folder-preferences", title: "Add menu" })), host!),
    );
    await settle();
    expect(thumbnails().map((t) => t.querySelector("img")?.getAttribute("src"))).toEqual([
      "blob:assets/Portraits/imani.png",
      "blob:assets/Portraits/imani.png",
    ]);
    expect(host!.querySelector("[data-portrait-examples-hint]")).toBeNull();
  });
});

describe("File types", () => {
  const defaults = extensionDefaults(extensionManifest);

  it("shows each type's endings, keeps them as typed and saves the pattern as they change", async () => {
    await mount(h(FileTypesSection, { id: "file-types", title: "File types" }));
    expect(input("file-type-images").value).toBe("png, apng, jpeg, jpg, gif, bmp, svg, webp");
    expect(input("file-type-scripts").value).toBe("sd, luau");
    await type("file-type-images", "png, apng, jpeg, jpg, gif, bmp, svg, webp, AVIF, ");
    expect(input("file-type-images").value).toBe("png, apng, jpeg, jpg, gif, bmp, svg, webp, AVIF, ");
    const pattern = "*.{png,apng,jpeg,jpg,gif,bmp,svg,webp,avif}";
    expect(workspaceSettings.projectSettings.value.imageFiles).toBe(pattern);
    expect(workspaceSettings.configuration.value).toMatchObject({ imageFiles: pattern });
    await commit("file-type-images");
    expect(input("file-type-images").value).toBe("png, apng, jpeg, jpg, gif, bmp, svg, webp, avif");
    expect(JSON.parse(projectSettingsJson(workspaceSettings.projectSettings.value, defaults)!)).toEqual({
      "sparkdown.imageFiles": pattern,
    });
  });

  it("makes the editor list and open files of an added ending as their type", async () => {
    await mount(h(FileTypesSection, { id: "file-types", title: "File types" }));
    expect(fileCategory("assets/lighthouse.avif")).toBe("other");
    expect(isScriptPath("scripts/chapter.story")).toBe(false);
    await type("file-type-images", "png, avif");
    await type("file-type-scripts", "sd, luau, story");
    expect(fileCategory("assets/lighthouse.avif")).toBe("image");
    expect(isImagePath("assets/lighthouse.avif")).toBe(true);
    expect(isScriptPath("scripts/chapter.story")).toBe(true);
    await act(async () => host!.querySelector<HTMLButtonElement>("[data-reset-all]")!.click());
    await settle();
    expect(fileCategory("assets/lighthouse.avif")).toBe("other");
    expect(isScriptPath("scripts/chapter.story")).toBe(false);
  });

  it("falls back to the default endings when none are left", async () => {
    await mount(h(FileTypesSection, { id: "file-types", title: "File types" }));
    await type("file-type-fonts", " , ");
    expect(workspaceSettings.projectSettings.value.fontFiles).toBe(PROJECT_SETTINGS_SCHEMA.fontFiles.default);
    await commit("file-type-fonts");
    expect(input("file-type-fonts").value).toBe("ttf, woff, woff2, otf");
    expect(projectSettingsJson(workspaceSettings.projectSettings.value, defaults)).toBeUndefined();
  });

  it("writes each of the four keys to settings.json only when it differs from the default", async () => {
    await mount(h(FileTypesSection, { id: "file-types", title: "File types" }));
    for (const [id, typed] of [
      ["scripts", "sd"],
      ["audio", "ogg"],
      ["fonts", "ttf"],
    ] as const) {
      await type(`file-type-${id}`, typed);
      await commit(`file-type-${id}`);
    }
    expect(JSON.parse(projectSettingsJson(workspaceSettings.projectSettings.value, defaults)!)).toEqual({
      "sparkdown.scriptFiles": "*.{sd}",
      "sparkdown.audioFiles": "*.{ogg}",
      "sparkdown.fontFiles": "*.{ttf}",
    });
    await act(async () => host!.querySelector<HTMLButtonElement>("[data-reset-all]")!.click());
    await settle();
    expect(projectSettingsJson(workspaceSettings.projectSettings.value, defaults)).toBeUndefined();
    expect(input("file-type-scripts").value).toBe("sd, luau");
  });
});
