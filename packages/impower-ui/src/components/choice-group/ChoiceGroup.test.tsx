import { render, type ComponentChild } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChoiceGroup, { choiceOptionVariants, type ChoiceOption } from "./ChoiceGroup";

const OPTIONS: readonly ChoiceOption[] = [
  { value: "paper", label: "Paper" },
  { value: "plain", label: "Plain" },
  { value: "none", label: "None" },
];

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
};

const checked = () =>
  Array.from(host!.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    .filter((radio) => radio.checked)
    .map((radio) => radio.value);

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("ChoiceGroup", () => {
  it("is a radiogroup of native radios sharing one name, each with its visible label", async () => {
    const radios = await mount(<ChoiceGroup name="page" aria-label="Page" options={OPTIONS} defaultValue="plain" />);
    expect(host!.querySelector('[role="radiogroup"]')!.getAttribute("aria-label")).toBe("Page");
    expect(radios.map((radio) => radio.name)).toEqual(["page", "page", "page"]);
    expect(radios.map((radio) => radio.closest("label")!.textContent)).toEqual(["Paper", "Plain", "None"]);
    expect(checked()).toEqual(["plain"]);
  });

  it("changes itself when uncontrolled and reports the chosen value", async () => {
    const onValueChange = vi.fn();
    const radios = await mount(<ChoiceGroup name="page" aria-label="Page" options={OPTIONS} defaultValue="paper" onValueChange={onValueChange} />);
    await act(async () => radios[2]!.click());
    expect(checked()).toEqual(["none"]);
    expect(onValueChange).toHaveBeenCalledWith("none");
  });

  it("holds its value when controlled and the owner refuses", async () => {
    const onValueChange = vi.fn();
    const radios = await mount(<ChoiceGroup name="page" aria-label="Page" options={OPTIONS} value="paper" onValueChange={onValueChange} />);
    await act(async () => radios[1]!.click());
    expect(onValueChange).toHaveBeenCalledWith("plain");
    expect(checked()).toEqual(["paper"]);
  });

  it("moves with an owner that accepts", async () => {
    function Owner() {
      const [page, setPage] = useState("paper");
      return <ChoiceGroup name="page" aria-label="Page" options={OPTIONS} value={page} onValueChange={setPage} />;
    }
    const radios = await mount(<Owner />);
    await act(async () => radios[1]!.click());
    expect(checked()).toEqual(["plain"]);
  });

  it("disables every radio when the group is disabled", async () => {
    const onValueChange = vi.fn();
    const radios = await mount(<ChoiceGroup name="page" aria-label="Page" options={OPTIONS} value="paper" disabled onValueChange={onValueChange} />);
    expect(radios.every((radio) => radio.disabled)).toBe(true);
    await act(async () => radios[1]!.click());
    expect(onValueChange).not.toHaveBeenCalled();
    expect(host!.querySelector('[role="radiogroup"]')!.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps the radios focusable for the browser's arrow-key roving, and draws focus on the visible option", async () => {
    const radios = await mount(<ChoiceGroup name="page" aria-label="Page" options={OPTIONS} defaultValue="paper" />);
    radios[0]!.focus();
    expect(document.activeElement).toBe(radios[0]);
    expect(radios[0]!.className).toContain("peer");
    const classes = choiceOptionVariants();
    expect(classes).toContain("peer-focus-visible:outline-accent");
    expect(classes).toContain("peer-checked:bg-elevated");
    expect(classes).toContain("control-overlay");
    expect(classes).toMatch(/(^|\s)motion-safe:transition-/);
    expect(classes).not.toMatch(/(^|\s)transition-/);
  });
});

describe("ChoiceGroup tiles", () => {
  const TILES: readonly ChoiceOption[] = [
    { value: "charcoal", label: "Charcoal", detail: "Neutral grey", media: <span data-media="charcoal" /> },
    { value: "chalk", label: "Chalk", detail: "Neutral white", media: <span data-media="chalk" /> },
  ];

  it("draws each option as a tile of its media, its name with a check and its detail, over native radios", async () => {
    const radios = await mount(<ChoiceGroup variant="tiles" name="theme" aria-label="Theme" options={TILES} value="chalk" onValueChange={() => {}} />);
    expect(radios.map((radio) => radio.name)).toEqual(["theme", "theme"]);
    const tiles = radios.map((radio) => radio.closest("label")!);
    expect(tiles.map((tile) => tile.querySelector("[data-media]")!.getAttribute("data-media"))).toEqual(["charcoal", "chalk"]);
    expect(tiles.map((tile) => tile.querySelector("small")!.textContent)).toEqual(["Neutral grey", "Neutral white"]);
    expect(tiles.every((tile) => tile.querySelector("svg")!.getAttribute("class")!.includes("group-has-[:checked]/choice:visible"))).toBe(true);
    expect(checked()).toEqual(["chalk"]);
  });

  it("chooses a tile with a click and reports it", async () => {
    const onValueChange = vi.fn();
    const radios = await mount(<ChoiceGroup variant="tiles" name="theme" aria-label="Theme" options={TILES} defaultValue="charcoal" onValueChange={onValueChange} />);
    await act(async () => radios[1]!.closest("label")!.querySelector("small")!.click());
    expect(onValueChange).toHaveBeenCalledWith("chalk");
    expect(checked()).toEqual(["chalk"]);
  });

  it("marks the chosen tile with the accent edge and keeps the segmented size off it", () => {
    const tile = choiceOptionVariants({ variant: "tiles" });
    expect(tile).toContain("peer-checked:border-accent");
    expect(tile).not.toContain("min-h-[30px]");
    expect(choiceOptionVariants({ variant: "segmented" })).toContain("min-h-[30px]");
  });
});

describe("ChoiceGroup and native form reset", () => {
  it("returns to its default, controlled at the owner's value", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <form>
          <ChoiceGroup name="free" aria-label="Free" options={OPTIONS} defaultValue="plain" />
          <ChoiceGroup name="owned" aria-label="Owned" options={OPTIONS} value="none" onValueChange={() => {}} />
        </form>,
        host!,
      ),
    );
    const radio = (name: string, value: string) =>
      host!.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!;
    radio("free", "paper").checked = true;
    await act(async () => host!.querySelector("form")!.reset());
    expect(radio("free", "plain").checked).toBe(true);
    expect(radio("owned", "none").checked).toBe(true);
  });
});
