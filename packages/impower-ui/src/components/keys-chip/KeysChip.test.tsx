import { render, type ComponentChild } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { hitArea } from "../../../test/hitArea";
import KeysChip, { keysChipVariants } from "./KeysChip";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("KeysChip", () => {
  it("draws one kbd per part of the combo inside a button", async () => {
    await mount(<KeysChip keys={["Ctrl", "Shift", "Z"]} aria-label="Redo shortcut" />);
    const button = host!.querySelector("button")!;
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Redo shortcut");
    expect(button.dataset["keysChip"]).toBe("keys");
    expect(Array.from(button.querySelectorAll("kbd")).map((kbd) => kbd.textContent)).toEqual(["Ctrl", "Shift", "Z"]);
  });

  it("reads None without keys and its prompt while recording", async () => {
    function Owner() {
      const [recording, setRecording] = useState(false);
      return <KeysChip keys={[]} recording={recording} onClick={() => setRecording(true)} />;
    }
    await mount(<Owner />);
    const button = host!.querySelector("button")!;
    expect(button.textContent).toBe("None");
    expect(button.dataset["keysChip"]).toBe("none");
    await act(async () => button.click());
    expect(button.textContent).toBe("Press keys…");
    expect(button.dataset["keysChip"]).toBe("recording");
    expect(button.querySelector("kbd")).toBeNull();
  });

  it("hands key presses to its owner and forwards its ref", async () => {
    const pressed: string[] = [];
    let ref: HTMLButtonElement | null = null;
    await mount(
      <KeysChip
        ref={(element: HTMLButtonElement | null) => {
          ref = element;
        }}
        keys={["F2"]}
        onKeyDown={(event) => pressed.push(event.key)}
      />,
    );
    const button = host!.querySelector("button")!;
    expect(ref).toBe(button);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "F5", bubbles: true }));
    expect(pressed).toEqual(["F5"]);
  });

  it("styles each state through its variants and keeps a 44px target", async () => {
    expect(keysChipVariants({ state: "recording" })).toContain("border-accent");
    expect(keysChipVariants({ state: "none" })).toContain("text-muted");
    expect(keysChipVariants({ state: "keys" })).toContain("text-ink");
    await mount(<KeysChip keys={["F2"]} />);
    const area = await hitArea(host!.querySelector("button")!);
    expect(area.height).toBeGreaterThanOrEqual(44);
  });
});
