import { render, type ComponentChild } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import TextField, { textFieldVariants } from "./TextField";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector("input")!;
};

const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("TextField", () => {
  it("renders a native text input without autocomplete", async () => {
    const input = await mount(<TextField aria-label="Folder" defaultValue="Music" />);
    expect(input.type).toBe("text");
    expect(input.value).toBe("Music");
    expect(input.getAttribute("autocomplete")).toBe("off");
  });

  it("reports every edit when uncontrolled, and still calls the page's own input handler", async () => {
    const onValueChange = vi.fn();
    const onInput = vi.fn();
    const input = await mount(<TextField aria-label="Folder" onValueChange={onValueChange} onInput={onInput} />);
    await type(input, "Sounds");
    expect(input.value).toBe("Sounds");
    expect(onValueChange).toHaveBeenCalledWith("Sounds");
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it("shows its value prop when controlled", async () => {
    function Owner() {
      const [name, setName] = useState("Music");
      return (
        <>
          <TextField aria-label="Folder" value={name} onValueChange={setName} />
          <output>{name}</output>
        </>
      );
    }
    const input = await mount(<Owner />);
    await type(input, "Score");
    expect(input.value).toBe("Score");
    expect(host!.querySelector("output")!.textContent).toBe("Score");
  });

  it("commits on the native change event, not on each edit", async () => {
    const onCommit = vi.fn();
    const input = await mount(<TextField aria-label="Folder" onCommit={onCommit} />);
    await type(input, "Score");
    expect(onCommit).not.toHaveBeenCalled();
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledWith("Score");
  });

  it("is disabled, focusable when enabled, and forwards its ref", async () => {
    const ref: { current: HTMLInputElement | null } = { current: null };
    const input = await mount(<TextField aria-label="Folder" ref={ref} />);
    expect(ref.current).toBe(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    await act(async () => render(<TextField aria-label="Folder" disabled />, host!));
    expect(host!.querySelector("input")!.disabled).toBe(true);
    expect(textFieldVariants()).toContain("disabled:opacity-40");
  });

  it("sizes by width and font variants, letting the page's class win", async () => {
    expect(textFieldVariants({ width: "wide" })).toContain("w-[300px]");
    expect(textFieldVariants({ width: "short", font: "mono" })).toContain("font-mono");
    const input = await mount(<TextField aria-label="Folder" class="w-32" />);
    expect(input.className.split(/\s+/)).toContain("w-32");
    expect(input.className.split(/\s+/)).not.toContain("w-[180px]");
  });
});
