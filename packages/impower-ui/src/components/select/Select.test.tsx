import { render, type ComponentChild } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import Select, { selectVariants, type SelectOption } from "./Select";

const OPTIONS: readonly SelectOption[] = [
  { value: "usletter", label: "US Letter" },
  { value: "a4", label: "A4" },
];

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector("select")!;
};

const choose = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("Select", () => {
  it("renders a native select with one option per choice", async () => {
    const select = await mount(<Select aria-label="Paper" options={OPTIONS} defaultValue="a4" />);
    expect(select.multiple).toBe(false);
    expect(Array.from(select.options).map((option) => [option.value, option.text])).toEqual([
      ["usletter", "US Letter"],
      ["a4", "A4"],
    ]);
    expect(select.value).toBe("a4");
  });

  it("changes itself when uncontrolled and reports the value", async () => {
    const onValueChange = vi.fn();
    const select = await mount(<Select aria-label="Paper" options={OPTIONS} onValueChange={onValueChange} />);
    await choose(select, "a4");
    expect(select.value).toBe("a4");
    expect(onValueChange).toHaveBeenCalledWith("a4");
  });

  it("holds its value prop when controlled and the owner refuses", async () => {
    const onValueChange = vi.fn();
    const select = await mount(<Select aria-label="Paper" options={OPTIONS} value="usletter" onValueChange={onValueChange} />);
    await choose(select, "a4");
    expect(onValueChange).toHaveBeenCalledWith("a4");
    expect(select.value).toBe("usletter");
  });

  it("moves with an owner that accepts", async () => {
    function Owner() {
      const [paper, setPaper] = useState("usletter");
      return <Select aria-label="Paper" options={OPTIONS} value={paper} onValueChange={setPaper} />;
    }
    const select = await mount(<Owner />);
    await choose(select, "a4");
    expect(select.value).toBe("a4");
  });

  it("is disabled as a whole and dims to 40%", async () => {
    const select = await mount(<Select aria-label="Paper" options={OPTIONS} disabled />);
    expect(select.disabled).toBe(true);
    expect(selectVariants()).toContain("disabled:opacity-40");
  });

  it("is focusable from the keyboard, forwards its ref and hides its chevron from assistive tech", async () => {
    const ref: { current: HTMLSelectElement | null } = { current: null };
    const select = await mount(<Select aria-label="Paper" options={OPTIONS} ref={ref} />);
    expect(ref.current).toBe(select);
    select.focus();
    expect(document.activeElement).toBe(select);
    expect(host!.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("puts the page's class on its wrapper and draws the control radius, wash and gated motion", async () => {
    await mount(<Select aria-label="Paper" options={OPTIONS} class="ml-auto" />);
    expect(host!.firstElementChild!.className).toContain("ml-auto");
    const classes = selectVariants();
    expect(classes).toContain("rounded-control");
    expect(classes).toContain("control-wash");
    expect(classes).toMatch(/(^|\s)motion-safe:transition-/);
    expect(classes).not.toMatch(/(^|\s)transition-/);
  });
});

describe("Select and native form reset", () => {
  it("returns an uncontrolled select to its defaultValue and a controlled one to the owner's value", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <form>
          <Select aria-label="Free" options={OPTIONS} defaultValue="a4" />
          <Select aria-label="Owned" options={OPTIONS} value="a4" onValueChange={() => {}} />
        </form>,
        host!,
      ),
    );
    const [free, owned] = Array.from(host.querySelectorAll("select"));
    expect(free!.value).toBe("a4");
    free!.value = "usletter";
    await act(async () => host!.querySelector("form")!.reset());
    expect(free!.value).toBe("a4");
    expect(owned!.value).toBe("a4");
  });
});
