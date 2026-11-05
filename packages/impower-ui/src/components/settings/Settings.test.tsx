import { render, type ComponentChild } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { announcement } from "../../hooks/useAnnouncer";
import LiveRegion from "../live-region/LiveRegion";
import {
  ChoiceRow,
  SelectRow,
  SettingsGroup,
  SettingsList,
  SettingsPlaceholder,
  SettingsSection,
  SwitchRow,
  TextRow,
  settingsRowVariants,
} from "./Settings";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host;
};

const region = () => document.querySelector('[role="status"][aria-live="polite"]')!.textContent;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  announcement.value = "";
});

describe("Settings row kit", () => {
  it("labels a section by its focusable heading and keeps its line under it", async () => {
    await mount(<SettingsSection id="save-settings" title="Save & sync" detail="Where the project is kept." />);
    const section = host!.querySelector("section")!;
    const heading = host!.querySelector("h3")!;
    expect(section.getAttribute("aria-labelledby")).toBe("save-settings-title");
    expect(heading.id).toBe("save-settings-title");
    expect(heading.tabIndex).toBe(-1);
    expect(host!.querySelector("header p")!.textContent).toBe("Where the project is kept.");
  });

  it("shows Reset to defaults only while a row differs, and its click restores the rows", async () => {
    function Owner() {
      const [on, setOn] = useState(true);
      return (
        <SettingsSection id="editor" title="Script editor" changed={!on} onReset={() => setOn(true)}>
          <SettingsList>
            <SwitchRow id="numbers" name="Line numbers" setting="lineNumbers" checked={on} onCheckedChange={setOn} />
          </SettingsList>
        </SettingsSection>
      );
    }
    await mount(<Owner />);
    const reset = () => host!.querySelector<HTMLButtonElement>("[data-reset-all]");
    const control = () => host!.querySelector<HTMLInputElement>('input[role="switch"]')!;
    expect(reset()).toBeNull();
    await act(async () => control().click());
    expect(control().checked).toBe(false);
    expect(reset()!.textContent).toBe("Reset to defaults");
    await act(async () => reset()!.click());
    expect(control().checked).toBe(true);
    expect(reset()).toBeNull();
  });

  it("names each row's setting in data-reset", async () => {
    await mount(
      <SettingsList>
        <SwitchRow id="a" name="A" setting="lineNumbers" checked onCheckedChange={() => {}} />
      </SettingsList>,
    );
    expect(host!.querySelector("[data-setting-row]")!.getAttribute("data-reset")).toBe("lineNumbers");
  });

  it("announces a switch as on and off", async () => {
    const onCheckedChange = vi.fn();
    await mount(
      <>
        <LiveRegion />
        <SwitchRow id="numbers" name="Line numbers" checked={false} onCheckedChange={onCheckedChange} />
      </>,
    );
    await act(async () => host!.querySelector<HTMLInputElement>('input[role="switch"]')!.click());
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(region()).toBe("Line numbers on.");
  });

  it("makes the whole switch row its label, names the control by the row and swaps an on/off detail", async () => {
    function Owner() {
      const [on, setOn] = useState(false);
      return (
        <SwitchRow
          id="wrap"
          name="Wrap lines"
          detail={{ on: "Long lines wrap.", off: "Long lines scroll." }}
          checked={on}
          onCheckedChange={setOn}
        />
      );
    }
    await mount(<Owner />);
    const label = host!.querySelector("label")!;
    const control = host!.querySelector<HTMLInputElement>('input[role="switch"]')!;
    expect(label.htmlFor).toBe(control.id);
    expect(control.getAttribute("aria-labelledby")).toBe("wrap-name");
    expect(control.getAttribute("aria-describedby")).toBe("wrap-detail");
    expect(host!.querySelector("#wrap-detail")!.textContent).toBe("Long lines scroll.");
    await act(async () => host!.querySelector<HTMLElement>("#wrap-name")!.click());
    expect(control.checked).toBe(true);
    expect(host!.querySelector("#wrap-detail")!.textContent).toBe("Long lines wrap.");
  });

  it("announces a select's chosen label", async () => {
    function Owner() {
      const [side, setSide] = useState("none");
      return (
        <SelectRow
          id="scene-numbers"
          name="Scene numbers"
          options={[
            { value: "none", label: "None" },
            { value: "left", label: "Left" },
          ]}
          value={side}
          onValueChange={setSide}
        />
      );
    }
    await mount(
      <>
        <LiveRegion />
        <Owner />
      </>,
    );
    const select = host!.querySelector("select")!;
    await act(async () => {
      select.value = "left";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select.value).toBe("left");
    expect(region()).toBe("Scene numbers: Left.");
  });

  it("describes a choice row by its chosen option and announces the change", async () => {
    function Owner() {
      const [page, setPage] = useState("paper");
      return (
        <ChoiceRow
          id="page"
          name="Page"
          group="page"
          options={[
            { value: "paper", label: "Paper", detail: "On a sheet." },
            { value: "plain", label: "Plain", detail: "On the surface." },
          ]}
          value={page}
          onValueChange={setPage}
        />
      );
    }
    await mount(
      <>
        <LiveRegion />
        <Owner />
      </>,
    );
    expect(host!.querySelector("label[for]")).toBeNull();
    expect(host!.querySelector("#page-detail")!.textContent).toBe("On a sheet.");
    await act(async () => host!.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!.click());
    expect(host!.querySelector("#page-detail")!.textContent).toBe("On the surface.");
    expect(region()).toBe("Page: Plain.");
  });

  it("updates a text row on each edit and announces the committed value", async () => {
    const onValueChange = vi.fn();
    function Owner() {
      const [more, setMore] = useState("(MORE)");
      return (
        <TextRow
          id="more"
          name="MORE"
          value={more}
          font="mono"
          width="short"
          onValueChange={(next) => {
            onValueChange(next);
            setMore(next);
          }}
        />
      );
    }
    await mount(
      <>
        <LiveRegion />
        <Owner />
      </>,
    );
    const input = host!.querySelector<HTMLInputElement>("input:not([type=checkbox])")!;
    expect(input.maxLength).toBe(40);
    await act(async () => {
      input.value = "(CONT)";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledWith("(CONT)");
    expect(region()).toBe("MORE: (CONT).");
  });

  it("indents a sub row and dims its copy while its parent turns it off", async () => {
    await mount(
      <SwitchRow id="hidden" name="Hidden headings" indent="sub" disabled checked={false} onCheckedChange={() => {}} />,
    );
    const row = host!.querySelector<HTMLElement>("[data-setting-row]")!;
    expect(row.className).toContain("pl-10");
    expect(row.className).toContain("cursor-default");
    expect(host!.querySelector<HTMLInputElement>('input[role="switch"]')!.disabled).toBe(true);
    expect(host!.querySelector("#hidden-name")!.parentElement!.className).toContain("opacity-55");
    expect(settingsRowVariants({ indent: "none" })).toContain("min-h-[52px]");
  });

  it("gives a group its legend and note", async () => {
    await mount(
      <SettingsGroup legend="Pages" note="What prints.">
        <SettingsList />
      </SettingsGroup>,
    );
    expect(host!.querySelector("fieldset > legend")!.textContent).toBe("Pages");
    expect(host!.querySelector("fieldset > p")!.textContent).toBe("What prints.");
  });

  it("renders a placeholder section with its title, line and the later-change note", async () => {
    await mount(<SettingsPlaceholder id="file-types" title="File types" detail="Which files are which." />);
    expect(host!.querySelector("h3")!.textContent).toBe("File types");
    expect(host!.querySelector("header p")!.textContent).toBe("Which files are which.");
    expect(host!.querySelector("[data-settings-placeholder]")!.textContent).toBe("Coming in a later change");
    expect(host!.querySelector("[data-reset-all]")).toBeNull();
  });
});

describe("Settings layout variants", () => {
  it("compiles the phone and compact variants from the root's data-layout, and the narrow-page container query", async () => {
    const { compile, optimize } = await import("@tailwindcss/node");
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const compiler = await compile(readFileSync(resolve("src/style.css"), "utf8"), {
      base: resolve("src"),
      onDependency: () => {},
    });
    const css = optimize(compiler.build(["phone:gap-3", "compact:gap-9", "@max-[560px]/page:flex-wrap"]), {
      minify: false,
    }).code;
    expect(css).toContain('phone\\:gap-3:where([data-layout="phone"], [data-layout="phone"] *)');
    expect(css).toContain('compact\\:gap-9:where([data-layout="compact"], [data-layout="compact"] *)');
    expect(css).toContain("@container page not (min-width: 560px)");
    expect(settingsRowVariants({ indent: "sub" })).toContain("phone:pl-[30px]");
    expect(settingsRowVariants({ wrap: true })).toContain("@max-[560px]/page:flex-wrap");
  });
});
