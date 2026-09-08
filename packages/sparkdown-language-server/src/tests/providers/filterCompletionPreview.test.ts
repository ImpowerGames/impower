import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getCompletions } from "../../utils/providers/getCompletions";
import { resolveCompletion } from "../../utils/providers/resolveCompletion";

// A `~filter` candidate inside an asset directive previews as the directive's
// image with the filters already typed plus the candidate applied (#474). The
// discriminating case is the CANDIDATE's own contribution: a preview built
// from the sibling filters alone renders a different picture, so every
// assertion below turns on a node that only the candidate's filter keeps.

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

/**
 * `filterSVG` deletes a node whose id carries the filterable tag unless one of
 * the active filters' `includes` names it, so each `filter …` group below is
 * kept by exactly one filter and dropped by every other. `default body` is
 * never filterable and is the positive control: it survives every combination,
 * so its absence means the preview failed for some reason other than filtering.
 */
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg">' +
  '<g id="default body"></g>' +
  '<g id="filter phone"></g>' +
  '<g id="filter look-down"></g>' +
  '<g id="filter look-up"></g>' +
  "</svg>";

const buildProgram = () =>
  ({
    context: {
      image: {
        bunny_bruh: {
          $type: "image",
          $name: "bunny_bruh",
          src: "/assets/bunny_bruh.svg",
          data: SVG,
        },
      },
      audio: {
        bark: { $type: "audio", $name: "bark", src: "/assets/bark.mp3" },
      },
      filter: {
        phone: { $type: "filter", $name: "phone", includes: ["phone"] },
        look_down: {
          $type: "filter",
          $name: "look_down",
          includes: ["look-down"],
        },
        look_up: { $type: "filter", $name: "look_up", includes: ["look-up"] },
      },
    },
  }) as any;

const completionsAt = (source: string, program: any) => {
  const { text, position } = positionAt(source);
  const { documents, scriptAnnotations } = setup(text);
  return getCompletions(
    documents.get(URI),
    documents.tree(URI),
    scriptAnnotations,
    program,
    undefined,
    position,
    undefined,
  );
};

const itemNamed = (items: any[] | null | undefined, label: string) =>
  (items ?? []).find((i) => i.label === label);

const previewSrc = (item: any) => {
  const value = item?.documentation?.value as string | undefined;
  return /<img src="([^"]*)"/.exec(value ?? "")?.[1];
};

describe("provider · filter completion preview (#474)", () => {
  test("a filter candidate previews the image with the sibling filters plus itself", async () => {
    const program = buildProgram();
    const items = completionsAt(`[[bunny_bruh~phone~look_d|]]\n`, program);
    const item = itemNamed(items, "look_down");
    expect(item, "look_down should be offered as a filter candidate").toBeTruthy();
    expect(
      item.data,
      "a filter candidate must carry the payload that triggers completionItem/resolve",
    ).toBeTruthy();

    const resolved = await resolveCompletion(item, program);
    const src = previewSrc(resolved);
    expect(src, "resolving the candidate must produce a preview image").toBeTruthy();
    // The candidate's own filter is what keeps `look-down`.
    expect(src).toContain("look-down");
    // The sibling filter already in the directive is applied too.
    expect(src).toContain("phone");
    // No filter names `look-up`, so it is filtered out.
    expect(src).not.toContain("look-up");
    // Positive control: a non-filterable node survives regardless.
    expect(src).toContain("body");
  });

  test("the candidate's filter alone is applied when the directive has no sibling filters", async () => {
    const program = buildProgram();
    const items = completionsAt(`[[bunny_bruh~look_u|]]\n`, program);
    const item = itemNamed(items, "look_up");
    expect(item?.data).toBeTruthy();

    const resolved = await resolveCompletion(item, program);
    const src = previewSrc(resolved);
    expect(src).toBeTruthy();
    expect(src).toContain("look-up");
    expect(src).not.toContain("look-down");
    expect(src).not.toContain("phone");
    expect(src).toContain("body");
  });

  test("a candidate offered right after the `~` previews the sibling filters", async () => {
    const program = buildProgram();
    const items = completionsAt(`[[bunny_bruh~phone~|]]\n`, program);
    const item = itemNamed(items, "look_down");
    expect(item?.data).toBeTruthy();

    const resolved = await resolveCompletion(item, program);
    const src = previewSrc(resolved);
    expect(src).toBeTruthy();
    expect(src).toContain("look-down");
    expect(src).toContain("phone");
    expect(src).not.toContain("look-up");
  });

  test("resolving a candidate does not leak a synthetic struct into the program", async () => {
    const program = buildProgram();
    const items = completionsAt(`[[bunny_bruh~phone~look_d|]]\n`, program);
    const item = itemNamed(items, "look_down");
    await resolveCompletion(item, program);
    expect(
      program.context["filtered_image"],
      "a candidate the author may never accept must not be declared in the program",
    ).toBeUndefined();
  });

  test("a directive with no asset name yet offers filters without a preview", async () => {
    const program = buildProgram();
    const items = completionsAt(`[[~look_d|]]\n`, program);
    const item = itemNamed(items, "look_down");
    expect(item, "filters are still offered").toBeTruthy();
    const resolved = await resolveCompletion(item, program);
    expect(resolved.documentation).toBeUndefined();
  });

  test("a filter on an audio directive gets no image preview", async () => {
    const program = buildProgram();
    const items = completionsAt(`((bark~look_d|))\n`, program);
    const item = itemNamed(items, "look_down");
    expect(item, "filters are still offered on an audio directive").toBeTruthy();
    const resolved = await resolveCompletion(item, program);
    expect(resolved.documentation).toBeUndefined();
  });
});
