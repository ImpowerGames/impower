import { EditorView } from "@codemirror/view";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { default: AppearanceSection } = await import(
  "../../src/modules/spark-editor/components/settings/AppearanceSection"
);
const { default: ScriptEditorSection, SCRIPT_EDITOR_PREFERENCES } = await import(
  "../../src/modules/spark-editor/components/settings/ScriptEditorSection"
);
const { default: PreviewSection, PREVIEW_PREFERENCES } = await import(
  "../../src/modules/spark-editor/components/settings/PreviewSection"
);
const { SETTINGS_SCOPES } = await import("../../src/modules/spark-editor/components/settings/sections");
const { createPlayerPreferenceSync } = await import(
  "../../src/modules/spark-editor/components/preview-game/playerPreferences"
);
const { PREFERENCES_SCHEMA } = await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");
const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);

type PreferenceKey = keyof typeof PREFERENCES_SCHEMA;

const ALL_KEYS = Object.keys(PREFERENCES_SCHEMA) as PreferenceKey[];

const sectionInfo = (id: string) => SETTINGS_SCOPES.flatMap((scope) => [...scope.sections]).find((section) => section.id === id)!;

let host: HTMLDivElement | undefined;

const mount = async (node: ReturnType<typeof h>) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h("div", { class: "@container/page" }, node), host!));
  return host;
};

const click = (element: Element) => act(async () => (element as HTMLElement).click());

const radio = (name: string, value: string) =>
  host!.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!;

const switchOf = (id: string) => host!.querySelector<HTMLInputElement>(`#${id}-control`)!;

const choose = (select: HTMLSelectElement, value: string) =>
  act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

const sampleView = () => EditorView.findFromDOM(host!.querySelector<HTMLElement>("[data-script-sample] .cm-editor")!)!;

beforeEach(() => {
  localStorage.clear();
  workspaceSettings.resetPreferences(ALL_KEYS);
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  workspaceSettings.resetPreferences(ALL_KEYS);
});

describe("the Appearance section", () => {
  const mountAppearance = () => mount(h(AppearanceSection, { section: sectionInfo("theme-preferences") }));
  const note = () => host!.querySelector("[data-theme-note]")?.textContent ?? "";
  const customRows = () => host!.querySelector<HTMLFieldSetElement>("#theme-surfaces-name")!.closest("fieldset")!;

  it("offers the nine themes as tiles, each with its own swatch, name and detail line", async () => {
    await mountAppearance();
    const tiles = [...host!.querySelectorAll<HTMLInputElement>('input[name="editor-theme"]')].map((input) => input.closest("label")!);
    expect(tiles.map((tile) => tile.querySelector("small")!.textContent)).toEqual([
      "Charcoal or Chalk, following your device",
      "Neutral grey · peach accents",
      "Neutral white · terracotta accents",
      "Warm charcoal · peach accents",
      "Warm cream · terracotta accents",
      "Neutral charcoal · clay accents",
      "Soft brown · peach accents",
      "Original Spark Engine colors",
      "Quieter navy · original syntax",
    ]);
    expect(tiles.map((tile) => tile.querySelector("[data-theme-swatch]")!.getAttribute("data-theme"))).toEqual([
      "charcoal",
      "charcoal",
      "chalk",
      "ink",
      "paper",
      "graphite",
      "warm",
      "midnight",
      "dusk",
    ]);
    expect(radio("editor-theme", "automatic").checked).toBe(true);
  });

  it("writes the chosen theme, which the editor's appearance follows, and describes each choice under the grid", async () => {
    await mountAppearance();
    const device = workspaceSettings.theme.value === "chalk" ? "Chalk" : "Charcoal";
    expect(note()).toBe(`Follows your device’s light or dark setting. Right now that is ${device}.`);
    await click(radio("editor-theme", "chalk"));
    expect(workspaceSettings.preferences.value.theme).toBe("chalk");
    expect(workspaceSettings.appearance.value.theme).toBe("chalk");
    expect(note()).toBe("The default light theme. Sepia’s syntax colors and accent on neutral white.");
    await click(radio("editor-theme", "charcoal"));
    expect(note()).toBe("The default dark theme. Ink’s syntax colors and accent on neutral charcoal.");
    await click(radio("editor-theme", "graphite"));
    expect(host!.querySelector("[data-theme-note]")).toBeNull();
  });

  it("shows Surfaces and Syntax colors for Graphite and Warm Folio only, and writes them", async () => {
    await mountAppearance();
    expect(customRows().hidden).toBe(true);
    await click(radio("editor-theme", "graphite"));
    expect(customRows().hidden).toBe(false);
    await click(radio("editor-surfaces", "layered"));
    await click(radio("syntax-palette", "original"));
    expect(workspaceSettings.appearance.value).toEqual({ theme: "graphite", surfaces: "layered", syntax: "original" });
    await click(radio("editor-theme", "warm"));
    expect(customRows().hidden).toBe(false);
    await click(radio("editor-theme", "charcoal"));
    expect(customRows().hidden).toBe(true);
  });
});

describe("the Script editor section", () => {
  const mountEditor = () => mount(h(ScriptEditorSection, { section: sectionInfo("editor-preferences") }));

  const SWITCHES: [string, PreferenceKey][] = [
    ["script-boldDeclarationNames", "boldDeclarationNames"],
    ["script-boldSpeakerNames", "boldSpeakerNames"],
    ["script-boldContainerNames", "boldContainerNames"],
    ["script-tintedDialogue", "tintedDialogue"],
    ["script-italicComments", "italicComments"],
    ["script-emphasizeMarkup", "emphasizeMarkup"],
    ["script-highlightMatchingSymbols", "highlightMatchingSymbols"],
    ["script-hoverPreviews", "hoverPreviews"],
    ["script-suggestAutocompletions", "suggestAutocompletions"],
    ["script-autoRenameFiles", "autoRenameFiles"],
    ["script-autoCloseBrackets", "autoCloseBrackets"],
  ];

  it("writes every switch to its preference, which the editor's appearance or configuration carries", async () => {
    await mountEditor();
    for (const [id, key] of SWITCHES) {
      const before = workspaceSettings.preferences.value[key];
      await click(switchOf(id));
      expect(workspaceSettings.preferences.value[key], key).toBe(!before);
    }
    const appearance = workspaceSettings.scriptAppearance.value as unknown as Record<string, unknown>;
    for (const [, key] of SWITCHES.filter(([, key]) => key !== "autoRenameFiles")) {
      expect(appearance[key], key).toBe(workspaceSettings.preferences.value[key]);
    }
    expect((workspaceSettings.configuration.value as { editor?: { autoRenameFiles?: boolean } }).editor?.autoRenameFiles).toBe(false);
  });

  it("writes the indentation guides choice", async () => {
    await mountEditor();
    await choose(host!.querySelector<HTMLSelectElement>("#script-indentGuides-control")!, "all");
    expect(workspaceSettings.scriptAppearance.value.indentGuides).toBe("all");
  });

  it("restyles the read-only sample as Bold speaker names changes, and swaps the sample text", async () => {
    await mountEditor();
    const view = sampleView();
    expect(view.dom.classList.contains("cm-bold-speakers")).toBe(false);
    await click(switchOf("script-boldSpeakerNames"));
    expect(view.dom.classList.contains("cm-bold-speakers")).toBe(true);
    expect(view.state.doc.toString()).toContain("scene the_rumour");
    await choose(host!.querySelector<HTMLSelectElement>("#theme-sample")!, "choices");
    expect(view.state.doc.toString()).toContain("What should Imani bring?");
    await choose(host!.querySelector<HTMLSelectElement>("#theme-sample")!, "showcase");
    expect(view.state.doc.toString()).toContain("The Lantern Keeper");
  });

  it("resets every row to its default, and the editor's appearance follows", async () => {
    await mountEditor();
    const defaults = { ...workspaceSettings.scriptAppearance.value };
    for (const [id] of SWITCHES) {
      await click(switchOf(id));
    }
    await choose(host!.querySelector<HTMLSelectElement>("#script-indentGuides-control")!, "off");
    expect(workspaceSettings.scriptAppearance.value).not.toEqual(defaults);
    await click(host!.querySelector("[data-reset-all]")!);
    expect(workspaceSettings.scriptAppearance.value).toEqual(defaults);
    for (const key of SCRIPT_EDITOR_PREFERENCES) {
      expect(workspaceSettings.preferences.value[key], key).toBe(PREFERENCES_SCHEMA[key].default);
    }
    expect(host!.querySelector("[data-reset-all]")).toBeNull();
    expect(switchOf("script-boldSpeakerNames").checked).toBe(false);
  });
});

describe("the Preview section", () => {
  const mountPreview = () => mount(h(PreviewSection, { section: sectionInfo("preview-preferences") }));

  it("writes the screenplay paper and every switch, and resets them", async () => {
    await mountPreview();
    await click(radio("screenplay-page", "theme"));
    for (const key of PREVIEW_PREFERENCES.filter((key) => key !== "screenplayPaper")) {
      await click(switchOf(`preview-${key}`));
    }
    for (const key of PREVIEW_PREFERENCES) {
      expect(workspaceSettings.preferences.value[key], key).not.toBe(PREFERENCES_SCHEMA[key].default);
    }
    await click(host!.querySelector("[data-reset-all]")!);
    for (const key of PREVIEW_PREFERENCES) {
      expect(workspaceSettings.preferences.value[key], key).toBe(PREFERENCES_SCHEMA[key].default);
    }
  });

  it("sends Show idle animations to the player as it changes", async () => {
    const posted: { method?: string; params?: { enabled?: boolean } }[] = [];
    const sync = createPlayerPreferenceSync((message) => posted.push(message as never));
    await mountPreview();
    await click(switchOf("preview-previewIdleAnimations"));
    await click(switchOf("preview-previewIdleAnimations"));
    sync.dispose();
    expect(
      posted.filter((message) => message.method === "game/setAnimatePortraits").map((message) => message.params?.enabled),
    ).toEqual([false, true]);
  });
});
