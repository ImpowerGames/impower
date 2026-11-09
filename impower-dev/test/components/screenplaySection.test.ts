import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const window_ = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: {
      setPreviewMode: (mode: string) => window_.calls.push(`mode:${mode}`),
      expandPreviewPane: () => window_.calls.push("expand"),
    },
  },
}));

const { default: ScreenplaySection } = await import(
  "../../src/modules/spark-editor/components/settings/ScreenplaySection"
);
const { SCREENPLAY_SETTING_KEYS } = await import(
  "../../src/modules/spark-editor/workspace/settings/screenplaySettings"
);
const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);

let host: HTMLDivElement | undefined;

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(
      h(ScreenplaySection, {
        section: {
          id: "screenplay-settings",
          label: "Screenplay",
          title: "Screenplay",
          detail: "How your story looks when previewing or exporting it as a screenplay.",
        },
      }),
      host!,
    ),
  );
};

const control = (key: string) =>
  host!.querySelector<HTMLInputElement | HTMLSelectElement>(`#screenplay-settings-${key}-control`)!;

const click = (key: string) => act(async () => (control(key) as HTMLInputElement).click());

const choose = (key: string, value: string) =>
  act(async () => {
    const select = control(key) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

beforeEach(() => {
  localStorage.clear();
  window_.calls.length = 0;
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  workspaceSettings.resetProjectSettings(SCREENPLAY_SETTING_KEYS);
});

describe("the Screenplay section", () => {
  it("draws both groups' rows in the prototype's order with the extension's defaults", async () => {
    await mount();
    expect([...host!.querySelectorAll("fieldset legend")].map((el) => el.textContent)).toEqual([
      "Printed when previewing or exporting",
      "Printed when exporting to PDF",
    ]);
    expect([...host!.querySelectorAll("[data-setting-row]")].map((row) => row.getAttribute("data-reset"))).toEqual([
      "screenplayTitlePage",
      "screenplayHeadingsBold",
      "screenplaySceneNumbers",
      "screenplaySceneNames",
      "screenplayBranchNames",
      "screenplayFunctionNames",
      "screenplayPaperSize",
      "screenplayPageNumbers",
      "screenplaySplitDialogue",
      "screenplayMore",
      "screenplayContd",
      "screenplayBookmarks",
      "screenplayHiddenBookmarks",
    ]);
    expect((control("screenplaySceneNumbers") as HTMLSelectElement).value).toBe("none");
    expect([...(control("screenplaySceneNumbers") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      "None",
      "Left margin",
      "Right margin",
      "Both margins",
    ]);
    expect((control("screenplayPaperSize") as HTMLSelectElement).value).toBe("usletter");
    expect((control("screenplayMore") as HTMLInputElement).value).toBe("(MORE)");
    expect((control("screenplayMore") as HTMLInputElement).placeholder).toBe("(MORE)");
    expect((control("screenplayContd") as HTMLInputElement).maxLength).toBe(40);
    expect(host!.querySelector("#screenplay-settings-screenplayPageNumbers-detail")!.textContent).toBe(
      "Print the current page number in the top right corner of each page.",
    );
    expect(host!.querySelector("[data-reset-all]")).toBeNull();
  });

  it("writes each row to the project settings", async () => {
    await mount();
    await click("screenplayTitlePage");
    await choose("screenplaySceneNumbers", "right");
    await choose("screenplayPaperSize", "a4");
    await act(async () => {
      const input = control("screenplayMore") as HTMLInputElement;
      input.value = "(more)";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const settings = workspaceSettings.projectSettings.value;
    expect(settings.screenplayTitlePage).toBe(false);
    expect(settings.screenplaySceneNumbers).toBe("right");
    expect(settings.screenplayPaperSize).toBe("a4");
    expect(settings.screenplayMore).toBe("(more)");
  });

  it("disables the MORE and CONT'D rows while splitting is off, and hidden bookmarks while bookmarks are off", async () => {
    await mount();
    const disabled = () =>
      ["screenplayMore", "screenplayContd", "screenplayHiddenBookmarks"].map((key) => control(key).disabled);
    expect(disabled()).toEqual([false, false, false]);
    await click("screenplaySplitDialogue");
    expect(disabled()).toEqual([true, true, false]);
    await click("screenplayBookmarks");
    expect(disabled()).toEqual([true, true, true]);
    await click("screenplaySplitDialogue");
    expect(disabled()).toEqual([false, false, true]);
    for (const key of ["screenplayMore", "screenplayContd", "screenplayHiddenBookmarks"]) {
      expect(host!.querySelector(`[data-reset="${key}"]`)!.className).toContain("pl-10");
    }
  });

  it("resets every row to its default", async () => {
    await mount();
    await click("screenplayBookmarks");
    await choose("screenplaySceneNumbers", "both");
    const reset = host!.querySelector<HTMLButtonElement>("[data-reset-all]")!;
    expect(reset.textContent).toBe("Reset to defaults");
    await act(async () => reset.click());
    expect((control("screenplayBookmarks") as HTMLInputElement).checked).toBe(true);
    expect((control("screenplaySceneNumbers") as HTMLSelectElement).value).toBe("none");
    expect(control("screenplayHiddenBookmarks").disabled).toBe(false);
    expect(host!.querySelector("[data-reset-all]")).toBeNull();
  });

  it("draws Function names off by default, writes and stores it, and resets it", async () => {
    await mount();
    const row = host!.querySelector('[data-reset="screenplayFunctionNames"]')!;
    expect(row.textContent).toContain("Function names");
    expect(row.textContent).toContain("Print function names where they are declared.");
    expect((control("screenplayFunctionNames") as HTMLInputElement).checked).toBe(false);
    await click("screenplayFunctionNames");
    expect(workspaceSettings.projectSettings.value.screenplayFunctionNames).toBe(true);
    const stored = Object.keys(localStorage).map((key) => localStorage.getItem(key)!);
    expect(stored.some((value) => value.includes('"screenplayFunctionNames":true'))).toBe(true);
    await act(async () => host!.querySelector<HTMLButtonElement>("[data-reset-all]")!.click());
    expect((control("screenplayFunctionNames") as HTMLInputElement).checked).toBe(false);
    expect(workspaceSettings.projectSettings.value.screenplayFunctionNames).toBe(false);
  });

  it("switches the preview to Screenplay mode from Show preview", async () => {
    await mount();
    const show = [...host!.querySelectorAll("button")].find((button) => button.textContent === "Show preview")!;
    await act(async () => show.click());
    await vi.waitFor(() => expect(window_.calls[0]).toBe("mode:screenplay"));
  });
});
