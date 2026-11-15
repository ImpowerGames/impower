import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it } from "vitest";
import { edgeTreatment } from "../../../packages/impower-ui/test/fadeEdge";

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
