import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getCompletions } from "../../utils/providers/getCompletions";

// A `~filter` candidate list leaves out the filters the directive has already
// applied (#478). The filters of an asset command are not siblings of one
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

const program = {
  context: {
    image: {
      bunny_bruh: { $type: "image", $name: "bunny_bruh" },
      raffles: { $type: "image", $name: "raffles" },
    },
    audio: { bark: { $type: "audio", $name: "bark" } },
    filter: {
      phone: { $type: "filter", $name: "phone", includes: ["phone"] },
      look_down: {
        $type: "filter",
        $name: "look_down",
        includes: ["look-down"],
      },
      look_up: { $type: "filter", $name: "look_up", includes: ["look-up"] },
      coat: { $type: "filter", $name: "coat", includes: ["coat"] },
    },
  },
} as any;

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

describe("provider · filter completion exclusion (#478)", () => {
  test("a filter already in the directive is not offered again", () => {
    const labels = labelsAt(`[[bunny_bruh~phone~|]]\n`);
    expect(labels, "the list is not empty").not.toHaveLength(0);
    expect(labels, "phone is already applied on this line").not.toContain(
      "phone",
    );
    expect(labels, "the others are still offered").toContain("look_down");
    expect(labels).toContain("coat");
  });

  test("every filter already in a longer chain is left out", () => {
    const labels = labelsAt(`[[bunny_bruh~phone~look_down~|]]\n`);
    expect(labels).not.toContain("phone");
    expect(labels).not.toContain("look_down");
    expect(labels).toContain("look_up");
    expect(labels).toContain("coat");
  });

  test("the partial name under the cursor is still offered", () => {
    // The author is part-way through typing `look_down`; treating that token
    // as an applied filter would hide the very name being completed.
    const labels = labelsAt(`[[bunny_bruh~phone~look_d|]]\n`);
    expect(labels, "the name being typed must stay in the list").toContain(
      "look_down",
    );
    expect(labels).not.toContain("phone");
  });

  test("a fully-typed filter being replaced is still offered", () => {
    const labels = labelsAt(`[[bunny_bruh~phone~look_up|]]\n`);
    expect(labels).toContain("look_up");
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

  test("an audio directive excludes its own applied filters too", () => {
    const labels = labelsAt(`((bark~phone~|))\n`);
    expect(labels).not.toHaveLength(0);
    expect(labels).not.toContain("phone");
    expect(labels).toContain("look_down");
  });

  test("a directive with no asset name yet still excludes", () => {
    const labels = labelsAt(`[[~phone~|]]\n`);
    expect(labels).not.toContain("phone");
    expect(labels).toContain("look_down");
  });
});
