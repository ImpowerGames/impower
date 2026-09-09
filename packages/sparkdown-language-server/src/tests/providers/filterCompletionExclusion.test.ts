import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getCompletions } from "../../utils/providers/getCompletions";

// A attribute candidate list leaves out the attributes the directive has already
// applied (#478). The attributes of an asset command are not siblings of one
// another in the tree — each sits inside its own `AssetCommandFilter` — so a
// sibling walk finds none of them and excludes nothing.

const URI = "file:///complete.sd";

const setup = (source: string) => {
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  documents.set({
    textDocument: {
      uri: URI,
      text: source,
      version: 1,
      languageId: "sparkdown",
    },
  });
  const scriptAnnotations = new Map([[URI, documents.annotations(URI)]]);
  return { documents, scriptAnnotations };
};

const positionAt = (source: string, marker = "|") => {
  const idx = source.indexOf(marker);
  const text = source.replace(marker, "");
  const before = source.slice(0, idx);
  const line = before.split("\n").length - 1;
  const character = idx - (before.lastIndexOf("\n") + 1);
  return { text, position: { line, character } };
};

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
const labelsAt = (source: string) => {
  const { text, position } = positionAt(source);
  const { documents, scriptAnnotations } = setup(text);
  const items = getCompletions(
    documents.get(URI),
    documents.tree(URI),
    scriptAnnotations,
    program,
    undefined,
    position,
    undefined,
  );
  return (items ?? []).map((i) => String(i.label));
};

describe("provider · attribute completion exclusion (#478)", () => {
  test("an attribute already in the directive is not offered again", () => {
    const labels = labelsAt(`[[bunny_bruh~phone~|]]\n`);
    expect(labels, "the list is not empty").not.toHaveLength(0);
    expect(labels, "phone is already applied on this line").not.toContain(
      "phone",
    );
    expect(labels, "the others are still offered").toContain("look.down");
    expect(labels).toContain("coat");
  });

  test("every attribute already in a longer chain is left out", () => {
    const labels = labelsAt(`[[bunny_bruh~phone~look.down~|]]\n`);
    expect(labels).not.toContain("phone");
    expect(labels).not.toContain("look.down");
    expect(labels).toContain("look.up");
    expect(labels).toContain("coat");
  });

  test("the partial name under the cursor is still offered", () => {
    // The author is part-way through typing `look.down`; treating that token
    // as an applied attribute would hide the very name being completed.
    const labels = labelsAt(`[[bunny_bruh~phone~look.d|]]\n`);
    expect(labels, "the name being typed must stay in the list").toContain(
      "look.down",
    );
    expect(labels).not.toContain("phone");
  });

  test("a fully-typed attribute being replaced is still offered", () => {
    const labels = labelsAt(`[[bunny_bruh~phone~look.up|]]\n`);
    expect(labels).toContain("look.up");
    expect(labels).not.toContain("phone");
  });

  test("a `+`-joined command excludes per asset, not per line", () => {
    // `phone` belongs to the first asset and must not be excluded from the
    // second one's list; `coat` belongs to the second and must be.
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
