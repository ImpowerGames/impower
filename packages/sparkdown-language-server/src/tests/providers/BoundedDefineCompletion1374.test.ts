import "@impower/sparkdown/src/inkjs/engine/Container";
import { expect, test } from "vitest";
import { complete } from "./completionHarness";

// Same-line forms isolate root identity from multiline-body layout.
const vocabulary = { layers: [], folders: {}, diagnostics: [], groups: {
  face: { options: ["happy", "sad"], switch: false },
} };
const program = { context: {
  image: { mia: { $type: "image", $name: "mia", attribute_vocabulary: vocabulary } },
  filtered_image: { party: { $type: "filtered_image", $name: "party", image: { $name: "mia" }, attributes: [] } },
} } as any;

test.each(["", "& "])("filtered-image attribute completion retains its define context: %s", prefix => {
  const source = `${prefix}define party as filtered_image with attributes = { "sa@1d" } end\n`;
  const result = complete(source, { program });
  const sad = result.items.find(item => item.label === "face.sad");
  expect(sad).toBeDefined();
  expect(sad?.data.filtered).toEqual({ image: "mia", attributes: ["face.sad"] });
});

test.each(["", "& "])("audio define does not offer image attributes: %s", prefix => {
  const source = `${prefix}define party as audio with attributes = { "sa@1d" } end\n`;
  expect(complete(source, { program }).labels).not.toContain("face.sad");
});
