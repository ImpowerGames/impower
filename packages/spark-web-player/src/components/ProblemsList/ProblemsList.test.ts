import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProblemsList, { type Problem } from "./ProblemsList";

const problems: Problem[] = [
  { severity: "error", message: "Unknown scene", path: "main.sd", line: 12 },
  { severity: "warning", message: "Unused variable", path: "scenes/intro.sd", line: 3 },
  { severity: "info", message: "Long line", path: "main.sd", line: 40 },
];

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

it("groups problems by script under the script's name and path", () => {
  act(() => {
    render(h(ProblemsList, { problems }), container);
  });
  const groups = [...container.querySelectorAll(".swp-problems-script")].map((group) => ({
    name: group.querySelector(".swp-problems-name")!.textContent,
    path: group.querySelector(".swp-problems-path")!.textContent,
    entries: [...group.querySelectorAll<HTMLElement>(".swp-console-entry")].map((entry) => [
      entry.getAttribute("data-severity"),
      entry.querySelector(".swp-console-message")!.textContent,
      entry.querySelector(".swp-console-jump")!.textContent,
    ]),
  }));
  expect(groups).toEqual([
    {
      name: "main",
      path: "main.sd",
      entries: [
        ["error", "Unknown scene", "main.sd:12"],
        ["info", "Long line", "main.sd:40"],
      ],
    },
    {
      name: "intro",
      path: "scenes/intro.sd",
      entries: [["warning", "Unused variable", "scenes/intro.sd:3"]],
    },
  ]);
});

it("emits a jump to the problem's line and shows an empty state", () => {
  const onJump = vi.fn();
  act(() => {
    render(h(ProblemsList, { problems, onJump }), container);
  });
  container.querySelectorAll<HTMLButtonElement>(".swp-console-jump")[1]!.click();
  expect(onJump).toHaveBeenCalledWith({ path: "main.sd", line: 40 });
  act(() => {
    render(h(ProblemsList, { problems: [] }), container);
  });
  expect(container.textContent).toBe("No problems");
});
