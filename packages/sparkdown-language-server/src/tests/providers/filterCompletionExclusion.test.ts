import { describe, expect, test } from "vitest";
import { labelsAt as completionLabelsAt } from "./completionHarness";

const vocabulary = { version: 1, layers: [], folders: {}, diagnostics: [], groups: {
  phone: { options: ["on", "off"], switch: true },
  look: { options: ["down", "up"], switch: false },
  coat: { options: ["on", "off"], switch: true },
} };
const program = { context: {
  image: {
    bunny_bruh: { $type: "image", $name: "bunny_bruh", attribute_vocabulary: vocabulary },
    raffles: { $type: "image", $name: "raffles", attribute_vocabulary: vocabulary },
  },
  audio: { bark: { $type: "audio", $name: "bark" } },
} } as any;
const labelsAt = (source: string) =>
  completionLabelsAt(source.replace("|", "@0"), { program });

describe("provider · attribute completion exclusion (#478)", () => {
  test("an attribute already in the directive is not offered again", () => {
    const labels = labelsAt(`[[bunny_bruh~phone~|]]\n`);
    expect(labels, "the list is not empty").not.toHaveLength(0);
    expect(labels, "phone is already applied on this line").not.toContain(
      "phone",
    );
    expect(labels, "the others are still offered").toContain("look");
    expect(labels).toContain("down");
    expect(labels).toContain("coat");
  });

  test("every group already set in a longer chain is left out", () => {
    const labels = labelsAt(`[[bunny_bruh~phone~look.down~|]]\n`);
    expect(labels).not.toContain("phone");
    expect(labels).not.toContain("look");
    expect(labels).not.toContain("down");
    expect(labels).not.toContain("up");
    expect(labels).toContain("coat");
    expect(labelsAt(`[[bunny_bruh~phone~look.down~look.|]]\n`), "after its dot, only the group's other options").toEqual(["up"]);
  });

  test("the partial name under the cursor is still offered", () => {
    const labels = labelsAt(`[[bunny_bruh~phone~look.d|]]\n`);
    expect(labels, "the name being typed must stay in the list").toContain(
      "down",
    );
    expect(labels).not.toContain("phone");
  });

  test("a fully-typed attribute being replaced is still offered", () => {
    const labels = labelsAt(`[[bunny_bruh~phone~look.up|]]\n`);
    expect(labels).toContain("up");
    expect(labels).not.toContain("phone");
  });

  test("a `+`-joined command excludes per asset, not per line", () => {
    const labels = labelsAt(`[[bunny_bruh~phone + raffles~coat~|]]\n`);
    expect(labels, "applied to this asset").not.toContain("coat");
    expect(labels, "applied to the other asset, not this one").toContain(
      "phone",
    );
  });

  test("an audio directive has no image attributes", () => {
    const labels = labelsAt(`((bark~phone~|))\n`);
    expect(labels).toHaveLength(0);
    expect(labels).not.toContain("phone");
  });

  test("a directive with no asset name has no image vocabulary", () => {
    const labels = labelsAt(`[[~phone~|]]\n`);
    expect(labels).toEqual([]);
  });
});
