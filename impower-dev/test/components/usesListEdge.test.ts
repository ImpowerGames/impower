import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it } from "vitest";
import { edgeTreatment } from "../../../packages/impower-ui/test/fadeEdge";
import { visibleTextInName } from "../../../packages/impower-ui/test/visibleTextInName";

const { default: UsesList } =
  await import("../../src/modules/spark-editor/components/find-references-rename/UsesList");

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

it("fades a long script title at its edge instead of cutting it to an ellipsis, beside its count", async () => {
  const uri = "file:///p/scripts/act1/a-very-long-script-name-that-runs-off.sd";
  const range = { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } };
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(h(UsesList, { groups: [{ uri, uses: [{ uri, range, lineText: "IMANI: hello" }] }], onOpen: () => {} }), host!),
  );
  const heading = host.querySelector("h3")!;
  const [title, count] = Array.from(heading.children);
  expect(await edgeTreatment([title!, count!])).toEqual([
    { text: title!.textContent, masked: true, ellipsis: false },
    { text: "(1)", masked: false, ellipsis: false },
  ]);
});

it("names each use in a list of lines with the script, line and text it shows, in that order", async () => {
  const uri = "file:///p/main.sd";
  const range = { start: { line: 7, character: 6 }, end: { line: 7, character: 12 } };
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(
      h(UsesList, { layout: "lines", groups: [{ uri, uses: [{ uri, range, lineText: "  show harbor" }] }], onOpen: () => {} }),
      host!,
    ),
  );
  const use = host.querySelector("button")!;
  expect(use.getAttribute("aria-label")).toMatch(/^Open main/);
  expect(visibleTextInName(use)).toMatchObject({ contained: true });
});
