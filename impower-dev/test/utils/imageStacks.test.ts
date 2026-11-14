import { describe, expect, it } from "vitest";
import { imageStacks } from "../../src/modules/spark-editor/utils/imageStacks";
import { ALTERNATE, AS_IS, testerGroups } from "../../src/modules/spark-editor/utils/imageVariants";

const TWELVE = [
  "Assets/Images/Portraits/imani.png",
  "Assets/Images/Portraits/imani@night.png",
  "Assets/Images/Portraits/imani~face.happy.png",
  "Assets/Images/Portraits/imani~face.sad.png",
  "Assets/Images/Portraits/imani@night~face.sad.png",
  "Assets/Images/Portraits/imani@night~mouth.open.closed.png",
  "Assets/Images/Portraits/bunny.png",
  "Assets/Images/Portraits/logo.final.png",
  "Assets/Images/Portraits/kai@young.png",
  "Assets/Images/Portraits/kai@old.png",
  "Assets/Images/Portraits/Extras/imani~face.happy.png",
  "Assets/Images/Backdrops/subway.png",
];

describe("the image stack rule", () => {
  const stacks = imageStacks(TWELVE);
  const named = (folder: string, name: string) =>
    stacks.find((stack) => stack.folder === folder && stack.name === name)!;

  it("rolls pictures whose names hold @ or ~ into one thing per folder, and leaves the rest as they are", () => {
    expect(stacks.map((stack) => `${stack.folder}|${stack.name}`).sort()).toEqual([
      "Assets/Images/Backdrops|subway",
      "Assets/Images/Portraits/Extras|imani",
      "Assets/Images/Portraits|bunny",
      "Assets/Images/Portraits|imani",
      "Assets/Images/Portraits|kai",
      "Assets/Images/Portraits|logo",
    ]);
    expect(named("Assets/Images/Portraits", "imani").paths).toHaveLength(6);
  });

  it("names the untagged picture first and sets each layer on the picture named before its first ~", () => {
    const imani = named("Assets/Images/Portraits", "imani");
    expect(imani.pictures.map((picture) => [picture.alternate, picture.path, picture.layers])).toEqual([
      [
        null,
        "Assets/Images/Portraits/imani.png",
        ["Assets/Images/Portraits/imani~face.happy.png", "Assets/Images/Portraits/imani~face.sad.png"],
      ],
      [
        "night",
        "Assets/Images/Portraits/imani@night.png",
        [
          "Assets/Images/Portraits/imani@night~face.sad.png",
          "Assets/Images/Portraits/imani@night~mouth.open.closed.png",
        ],
      ],
    ]);
    expect(imani.pictures[0]!.groups).toEqual([{ name: "face", options: ["happy", "sad"], switch: false }]);
    expect(imani.pictures[1]!.groups).toEqual([
      { name: "face", options: ["sad"], switch: false },
      { name: "mouth", options: ["closed", "open"], switch: false },
    ]);
  });

  it("counts the looks the Variants tester offers, As is included where a group has no default", () => {
    expect(named("Assets/Images/Portraits", "imani").variantCount).toBe(3 + 2 * 3);
    expect(named("Assets/Images/Portraits", "kai").variantCount).toBe(2);
    expect(named("Assets/Images/Portraits/Extras", "imani").variantCount).toBe(2);
    expect(named("Assets/Images/Portraits", "bunny").variantCount).toBe(1);
  });

  it("covers a thing with its plain alternate, or its first alternate, or that picture's first layer", () => {
    expect(named("Assets/Images/Portraits", "imani").cover).toBe("Assets/Images/Portraits/imani.png");
    expect(named("Assets/Images/Portraits", "kai").cover).toBe("Assets/Images/Portraits/kai@old.png");
    expect(named("Assets/Images/Portraits/Extras", "imani").cover).toBe(
      "Assets/Images/Portraits/Extras/imani~face.happy.png",
    );
  });

  it("names a thing as the compiler does, cut at the first dot", () => {
    const logo = named("Assets/Images/Portraits", "logo");
    expect(logo.paths).toEqual(["Assets/Images/Portraits/logo.final.png"]);
    expect(logo.cover).toBe("Assets/Images/Portraits/logo.final.png");
    expect(imageStacks(["A/x.y@b.png", "A/x.y.png"]).map((stack) => [stack.name, stack.paths.length])).toEqual([
      ["x", 2],
    ]);
  });

  it("keeps a picture with no layers and no alternates as one variant", () => {
    const [only] = imageStacks(["Assets/Images/bunny.png"]);
    expect(only).toMatchObject({ name: "bunny", variantCount: 1, cover: "Assets/Images/bunny.png" });
    expect(only!.pictures).toEqual([
      { alternate: null, name: "bunny", path: "Assets/Images/bunny.png", layers: [], groups: [], variants: 1 },
    ]);
  });

  it("counts every combination the tester offers for each alternate", () => {
    const [imani] = imageStacks(
      [
        "imani.png",
        "imani~face.happy.png",
        "imani~face.sad.png",
        "imani~mouth.closed~default.png",
        "imani~mouth.open.png",
        "imani@night.png",
        "imani@night~face.happy.png",
      ].map((file) => `Assets/Images/Portraits/${file}`),
    );
    expect(imani!.pictures.map((picture) => [picture.alternate, picture.variants])).toEqual([
      [null, 3 * 2],
      ["night", 2],
    ]);
    expect(imani!.variantCount).toBe(8);
    for (const picture of imani!.pictures) {
      const tester = testerGroups(imani!, { [ALTERNATE]: picture.alternate ?? AS_IS }).filter(
        (group) => group.key !== ALTERNATE,
      );
      expect(tester.reduce((count, group) => count * group.options.length, 1)).toBe(picture.variants);
    }
  });

  it("keeps an alternate named plain apart from the untagged picture", () => {
    const [imani] = imageStacks(["A/imani.png", "A/imani@plain.png"]);
    expect(imani!.pictures.map((picture) => [picture.alternate, picture.path])).toEqual([
      [null, "A/imani.png"],
      ["plain", "A/imani@plain.png"],
    ]);
    expect(imani!.variantCount).toBe(2);
  });
});

describe("a folder stack", () => {
  const MIA = [
    "Assets/Images/Portraits/mia/90_body.png",
    "Assets/Images/Portraits/mia/30_face.neutral~default.png",
    "Assets/Images/Portraits/mia/30_face.happy.png",
    "Assets/Images/Portraits/mia/10_hat.on.png",
  ];

  it("rolls a folder's numbered files into one thing named after the folder, as the compiler's layered_image", () => {
    const stacks = imageStacks([...MIA, "Assets/Images/Portraits/mia/notes.png"]);
    expect(stacks.map((stack) => [stack.kind, stack.name, stack.folder, stack.paths.length])).toEqual([
      ["folder", "mia", "Assets/Images/Portraits/mia", 4],
      ["files", "notes", "Assets/Images/Portraits/mia", 1],
    ]);
  });

  it("orders its layers bottom first as the engine stacks them and covers it with the bottom layer", () => {
    const [mia] = imageStacks(MIA);
    expect(mia!.pictures).toHaveLength(1);
    expect(mia!.pictures[0]!.alternate).toBeNull();
    expect(mia!.pictures[0]!.layers).toEqual([
      "Assets/Images/Portraits/mia/90_body.png",
      "Assets/Images/Portraits/mia/30_face.happy.png",
      "Assets/Images/Portraits/mia/30_face.neutral~default.png",
      "Assets/Images/Portraits/mia/10_hat.on.png",
    ]);
    expect(mia!.cover).toBe("Assets/Images/Portraits/mia/90_body.png");
  });

  it("reads its groups and defaults from the layer names after the order prefix", () => {
    const [mia] = imageStacks(MIA);
    expect(mia!.pictures[0]!.groups).toEqual([
      { name: "face", options: ["neutral", "happy"], switch: false, default: "neutral" },
      { name: "hat", options: ["on", "off"], switch: true },
    ]);
    expect(mia!.variantCount).toBe(4);
  });

  it("gives the same tester as the file-named form of the same picture", () => {
    const [folder] = imageStacks(["Assets/Images/imani/01_base.png", "Assets/Images/imani/02_face.happy~default.png"]);
    const [named] = imageStacks(["Assets/Images/imani.png", "Assets/Images/imani~face.happy~default.png"]);
    expect(folder!.name).toBe(named!.name);
    expect(folder!.pictures[0]!.groups).toEqual(named!.pictures[0]!.groups);
    expect(folder!.variantCount).toBe(named!.variantCount);
  });

  it("records each member's alternate, layer name and order", () => {
    const [mia] = imageStacks(MIA);
    expect(mia!.members).toContainEqual({
      path: "Assets/Images/Portraits/mia/30_face.neutral~default.png",
      alternate: null,
      layer: "face.neutral~default",
      order: 30,
    });
    const [imani] = imageStacks(["A/imani.png", "A/imani@night.png", "A/imani@night~face.sad~default.png"]);
    expect(imani!.members).toEqual([
      { path: "A/imani.png", alternate: null },
      { path: "A/imani@night.png", alternate: "night" },
      { path: "A/imani@night~face.sad~default.png", alternate: "night", layer: "face.sad~default" },
    ]);
  });

  it("leaves numbered files outside an assets folder, or directly in it, as they are", () => {
    expect(imageStacks(["Images/mia/10_hat.on.png"]).map((stack) => stack.kind)).toEqual(["files"]);
    expect(imageStacks(["Assets/10_hat.on.png"]).map((stack) => stack.kind)).toEqual(["files"]);
  });

  it("lists a group's default option first and the rest by name, whatever the file order", () => {
    const [imani] = imageStacks([
      "Assets/Images/Portraits/imani~face.angry.png",
      "Assets/Images/Portraits/imani~face.happy~default.png",
      "Assets/Images/Portraits/imani~face.sad.png",
    ]);
    const picture = imani!.pictures[0]!;
    expect(picture.groups).toEqual([
      { name: "face", options: ["happy", "angry", "sad"], switch: false, default: "happy" },
    ]);
    expect(testerGroups(imani!, {}).map((group) => group.options)).toEqual([["happy", "angry", "sad"]]);
    expect(picture.variants).toBe(3);
  });

  it("keeps As is first in a group with no default and lists the options by name", () => {
    const [kai] = imageStacks(["Assets/Images/kai~face.sad.angry.png"]);
    expect(testerGroups(kai!, {}).map((group) => group.options)).toEqual([[AS_IS, "angry", "sad"]]);
  });
});
