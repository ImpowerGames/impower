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

describe("TextField's controlled contract", () => {
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

  it("puts the owner's value back when the owner refuses an edit, and commits the owner's value", async () => {
    const onCommit = vi.fn();
    const input = await mount(<TextField aria-label="Folder" value="Music" onValueChange={() => {}} onCommit={onCommit} />);
    await type(input, "Score");
    await settle();
    expect(input.value).toBe("Music");
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledWith("Music");
  });

  it("shows the owner's normalized value even when normalizing leaves its state unchanged", async () => {
    function Owner() {
      const [name, setName] = useState("MUSIC");
      return <TextField aria-label="Folder" value={name} onValueChange={(next) => setName(next.toUpperCase())} />;
    }
    const input = await mount(<Owner />);
    await type(input, "music");
    await settle();
    expect(input.value).toBe("MUSIC");
  });

  it("keeps an accepted edit as typed", async () => {
    function Owner() {
      const [name, setName] = useState("Music");
      return <TextField aria-label="Folder" value={name} onValueChange={setName} />;
    }
    const input = await mount(<Owner />);
    await type(input, "Musics");
    await settle();
    expect(input.value).toBe("Musics");
  });

  it("returns to its default on a native form reset, controlled at the owner's value", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <form>
          <TextField aria-label="Free" defaultValue="Music" />
          <TextField aria-label="Owned" value="Sounds" onValueChange={() => {}} />
        </form>,
        host!,
      ),
    );
    const [free, owned] = Array.from(host.querySelectorAll("input"));
    free!.value = "Edited";
    await act(async () => host!.querySelector("form")!.reset());
    expect(free!.value).toBe("Music");
    expect(owned!.value).toBe("Sounds");
  });
});

describe("TextField's commit before the restore runs", () => {
  it("commits the owner's value even when change follows the refused edit in the same task", async () => {
    const onCommit = vi.fn();
    const input = await mount(<TextField aria-label="Folder" value="Music" onValueChange={() => {}} onCommit={onCommit} />);
    await act(async () => {
      input.value = "Score";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onCommit.mock.calls).toEqual([["Music"]]);
  });
});
