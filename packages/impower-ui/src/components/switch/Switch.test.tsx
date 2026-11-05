import { render, type ComponentChild } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import Switch, { switchVariants } from "./Switch";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLInputElement>('input[role="switch"]')!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("Switch", () => {
  it("is a native checkbox with the switch role and a matching aria-checked", async () => {
    const control = await mount(<Switch aria-label="Line numbers" defaultChecked />);
    expect(control.type).toBe("checkbox");
    expect(control.getAttribute("role")).toBe("switch");
    expect(control.checked).toBe(true);
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("toggles itself when uncontrolled and reports each change", async () => {
    const onCheckedChange = vi.fn();
    const control = await mount(<Switch aria-label="Wrap" onCheckedChange={onCheckedChange} />);
    await act(async () => control.click());
    expect(control.checked).toBe(true);
    expect(control.getAttribute("aria-checked")).toBe("true");
    await act(async () => control.click());
    expect(control.checked).toBe(false);
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(onCheckedChange.mock.calls).toEqual([[true], [false]]);
  });

  it("follows its checked prop when controlled, and stays put when the owner refuses", async () => {
    const onCheckedChange = vi.fn();
    const control = await mount(<Switch aria-label="Fixed" checked={false} onCheckedChange={onCheckedChange} />);
    await act(async () => control.click());
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(control.checked).toBe(false);
    expect(control.getAttribute("aria-checked")).toBe("false");
  });

  it("moves with an owner that accepts the change", async () => {
    function Owner() {
      const [on, setOn] = useState(false);
      return <Switch aria-label="Owned" checked={on} onCheckedChange={setOn} />;
    }
    const control = await mount(<Owner />);
    await act(async () => control.click());
    expect(control.checked).toBe(true);
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("ignores clicks while disabled and dims to 40%", async () => {
    const onCheckedChange = vi.fn();
    const control = await mount(<Switch aria-label="Off" disabled onCheckedChange={onCheckedChange} />);
    await act(async () => control.click());
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(control.disabled).toBe(true);
    expect(switchVariants()).toContain("disabled:opacity-40");
  });

  it("takes keyboard focus in the tab order and forwards its ref", async () => {
    const ref: { current: HTMLInputElement | null } = { current: null };
    const control = await mount(<Switch aria-label="Focus" ref={ref} />);
    expect(ref.current).toBe(control);
    expect(control.tabIndex).toBe(0);
    control.focus();
    expect(document.activeElement).toBe(control);
  });

  it("draws the #991 treatment: wash hover, accent fill, inset focus when on, gated motion and a 44px slop", () => {
    const classes = switchVariants();
    expect(classes).toContain("control-wash");
    expect(classes).toContain("checked:bg-accent");
    expect(classes).toContain("checked:focus-inset");
    expect(classes).toMatch(/(^|\s)motion-safe:transition-/);
    expect(classes).not.toMatch(/(^|\s)transition-/);
    expect(classes).toContain("h-6 w-10");
    expect(classes).toContain("after:-inset-x-0.5 after:-inset-y-2.5");
    expect(classes).toContain("forced-colors:appearance-auto");
  });
});

describe("Switch and native form reset", () => {
  it("returns to its default and keeps aria-checked in step, controlled at the owner's value", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <form>
          <Switch aria-label="Free" defaultChecked />
          <Switch aria-label="Owned" checked onCheckedChange={() => {}} />
        </form>,
        host!,
      ),
    );
    const [free, owned] = Array.from(host.querySelectorAll<HTMLInputElement>('input[role="switch"]'));
    await act(async () => free!.click());
    expect(free!.getAttribute("aria-checked")).toBe("false");
    await act(async () => {
      host!.querySelector("form")!.reset();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(free!.checked).toBe(true);
    expect(free!.getAttribute("aria-checked")).toBe("true");
    expect(owned!.checked).toBe(true);
  });
});
