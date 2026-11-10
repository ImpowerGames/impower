import { describe, expect, it } from "vitest";
import { imageStacks } from "../../src/modules/spark-editor/utils/imageStacks";

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
      { name: "mouth", options: ["open", "closed"], switch: false },
    ]);
  });

  it("counts the alternates and layer combinations a thing offers", () => {
    expect(named("Assets/Images/Portraits", "imani").variantCount).toBe(2 + 2);
    expect(named("Assets/Images/Portraits", "kai").variantCount).toBe(2);
    expect(named("Assets/Images/Portraits/Extras", "imani").variantCount).toBe(1);
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

  it("keeps an alternate named plain apart from the untagged picture", () => {
    const [imani] = imageStacks(["A/imani.png", "A/imani@plain.png"]);
    expect(imani!.pictures.map((picture) => [picture.alternate, picture.path])).toEqual([
      [null, "A/imani.png"],
      ["plain", "A/imani@plain.png"],
    ]);
    expect(imani!.variantCount).toBe(2);
  });
});
