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
