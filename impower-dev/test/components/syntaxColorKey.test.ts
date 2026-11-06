import { EditorView } from "@codemirror/view";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { default: ScriptEditorSection } =
  await import("../../src/modules/spark-editor/components/settings/ScriptEditorSection");
const { SETTINGS_SCOPES } =
  await import("../../src/modules/spark-editor/components/settings/sections");
const { SCRIPT_SAMPLES } =
  await import("../../src/modules/spark-editor/components/settings/scriptSamples");
const { SYNTAX_KEY_ORDER } =
  await import("../../src/modules/spark-editor/components/settings/syntaxColorKey");
const { HIGHLIGHT_SYNTAX_VARIABLES, ROLE_VARIABLES, TEXT_SYNTAX_VARIABLE } =
  await import("@impower/sparkdown-document-views/src/modules/script-sample/scriptSampleSyntaxVariables");
const { PREFERENCES_SCHEMA } =
  await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");
const { default: workspaceSettings } =
  await import("../../src/modules/spark-editor/workspace/settings/WorkspaceSettings");

const section = SETTINGS_SCOPES.flatMap((scope) => [...scope.sections]).find(
  (candidate) => candidate.id === "editor-preferences",
)!;

let host: HTMLDivElement | undefined;

const mountEditor = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(
      h(
        "div",
        { class: "@container/page" },
        h(ScriptEditorSection, { section }),
      ),
      host!,
    ),
  );
};

const chooseSample = (value: string) =>
  act(async () => {
    const select = host!.querySelector<HTMLSelectElement>("#theme-sample")!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

const keyDetails = () =>
  Array.from(
    host!.querySelectorAll<HTMLDetailsElement>("details[data-disclosure]"),
  ).find(
    (details) =>
      details.querySelector("summary")?.textContent === "Syntax color key",
  )!;

const keyRows = () =>
  Array.from(
    keyDetails().querySelectorAll<HTMLElement>("[data-syntax-variable]"),
  ).map((row) => ({
    variable: row.dataset["syntaxVariable"]!,
    label: row.textContent!,
    color: row.style.color,
  }));

const VARIABLE_COLOR = /^var\((--syntax-[a-z-]+)\)$/;

const renderedVariables = () => {
  const view = EditorView.findFromDOM(
    host!.querySelector<HTMLElement>("[data-script-sample] .cm-editor")!,
  )!;
  const variables = new Set<string>();
  const walker = document.createTreeWalker(
    view.contentDOM,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!/\S/.test(node.textContent ?? "")) {
      continue;
    }
    const color = getComputedStyle(node.parentElement!).color;
    const variable = VARIABLE_COLOR.exec(color)?.[1];
    expect(
      variable,
      `color of ${JSON.stringify(node.textContent)} is ${color}`,
    ).toBeDefined();
    variables.add(variable!);
  }
  const complete =
    view.viewport.from === 0 && view.viewport.to === view.state.doc.length;
  return { variables, complete };
};

beforeEach(() => {
  localStorage.clear();
  workspaceSettings.resetPreferences(
    Object.keys(PREFERENCES_SCHEMA) as (keyof typeof PREFERENCES_SCHEMA)[],
  );
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("the Syntax color key", () => {
  it("is a collapsed disclosure under the sample whose opening leaves the sample alone", async () => {
    await mountEditor();
    const details = keyDetails();
    expect(details.open).toBe(false);
    expect(details.closest("[data-script-sample]")).toBeNull();
    const sample = host!.querySelector("[data-script-sample]")!;
    expect(
      details.compareDocumentPosition(sample) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    const before = sample.innerHTML;
    await act(async () => details.querySelector("summary")!.click());
    expect(details.open).toBe(true);
    expect(sample.innerHTML).toBe(before);
  });

  it("orders and labels every variable the editor's highlighting can paint", () => {
    const paintable = [
      ...new Set([
        TEXT_SYNTAX_VARIABLE,
        ...HIGHLIGHT_SYNTAX_VARIABLES,
        ...ROLE_VARIABLES,
      ]),
    ].sort();
    expect([...SYNTAX_KEY_ORDER].sort()).toEqual(paintable);
  });

  for (const tinted of [false, true]) {
    it.each(SCRIPT_SAMPLES.map((sample) => [sample.value] as const))(
      `has one row per variable the %s sample renders, with tinted dialogue ${tinted ? "on" : "off"}`,
      async (value) => {
        workspaceSettings.setPreference("tintedDialogue", tinted);
        await mountEditor();
        await chooseSample(value);
        const rows = keyRows();
        const variables = rows.map((row) => row.variable);
        const rendered = renderedVariables();
        expect(rendered.complete || value === "showcase").toBe(true);
        if (rendered.complete) {
          expect([...variables].sort()).toEqual([...rendered.variables].sort());
        } else {
          expect(variables).toEqual(
            expect.arrayContaining([...rendered.variables]),
          );
        }
        expect(rows.map((row) => row.variable)).toEqual(
          SYNTAX_KEY_ORDER.filter((variable) =>
            rows.some((row) => row.variable === variable),
          ),
        );
        for (const row of rows) {
          expect(row.color).toBe(`var(${row.variable})`);
          expect(row.label).not.toBe("");
        }
      },
    );
  }

  it("names rows by the prototype's roles where they match", async () => {
    await mountEditor();
    const labels = Object.fromEntries(
      keyRows().map((row) => [row.variable, row.label]),
    );
    expect(labels["--syntax-speaker"]).toBe("Speaker");
    expect(labels["--syntax-comment"]).toBe("Comment");
    expect(labels["--syntax-text"]).toBe("Text");
  });
});
