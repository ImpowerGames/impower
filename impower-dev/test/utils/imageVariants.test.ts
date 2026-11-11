import { describe, expect, it } from "vitest";
import { imageStacks } from "../../src/modules/spark-editor/utils/imageStacks";
import {
  ALTERNATE,
  AS_IS,
  defaultForm,
  fileRows,
  filesSummary,
  isChanged,
  referenceOf,
  testerGroups,
  variantOf,
  type VariantSelection,
} from "../../src/modules/spark-editor/utils/imageVariants";

const AT_SIGN_REFERENCE_2109 = "[[mia@night:sad]]";

const P = "Assets/Images/Portraits";
const IMANI = [
  `${P}/imani.png`,
  `${P}/imani~face.happy.png`,
  `${P}/imani~face.sad.png`,
  `${P}/imani~mouth.open~default.png`,
  `${P}/imani~mouth.closed.png`,
  `${P}/imani@night.png`,
  `${P}/imani@night~face.happy.png`,
];
const MIA_FOLDER = [
  `${P}/mia/90_body.png`,
  `${P}/mia/30_face.neutral~default.png`,
  `${P}/mia/30_face.happy.png`,
  `${P}/mia/10_hat.on.png`,
];
const one = (paths: readonly string[]) => imageStacks(paths)[0]!;

const summary = (paths: readonly string[], selection: VariantSelection = {}) =>
  testerGroups(one(paths), selection).map((group) => [group.key, group.options, group.default]);

describe("the tester's groups", () => {
  it("offers an Alternate group first, then the chosen picture's own groups with their resting option", () => {
    expect(summary(IMANI)).toEqual([
      [ALTERNATE, [AS_IS, "night"], AS_IS],
      ["face", [AS_IS, "happy", "sad"], AS_IS],
      ["mouth", ["closed", "open"], "open"],
    ]);
  });

  it("switches to the groups of the alternate chosen and leaves out a group with nothing to choose", () => {
    expect(summary(IMANI, { [ALTERNATE]: "night" })).toEqual([
      [ALTERNATE, [AS_IS, "night"], AS_IS],
      ["face", [AS_IS, "happy"], AS_IS],
    ]);
    expect(summary([`${P}/kai.png`, `${P}/kai~face.happy~default.png`])).toEqual([]);
  });

  it("rests a switch off unless its on layer is the default", () => {
    expect(summary(MIA_FOLDER)).toEqual([
      ["face", ["happy", "neutral"], "neutral"],
      ["hat", ["on", "off"], "off"],
    ]);
  });

  it("shows a folder stack and its file-named twin with the same groups", () => {
    const folder = ["Assets/Images/imani/01_base.png", "Assets/Images/imani/02_face.happy~default.png", "Assets/Images/imani/02_face.sad.png"];
    const named = ["Assets/Images/imani.png", "Assets/Images/imani~face.happy~default.png", "Assets/Images/imani~face.sad.png"];
    expect(summary(folder)).toEqual(summary(named));
  });

  it("tells when a choice differs from the resting variant", () => {
    expect(isChanged(one(IMANI), {})).toBe(false);
    expect(isChanged(one(IMANI), { mouth: "open" })).toBe(false);
    expect(isChanged(one(IMANI), { face: "happy" })).toBe(true);
    expect(isChanged(one(IMANI), { [ALTERNATE]: "night" })).toBe(true);
  });
});

describe("the reference the tester writes", () => {
  const ref = (paths: readonly string[], selection: VariantSelection, form: "portrait" | "backdrop" = "portrait") =>
    referenceOf(variantOf(one(paths), selection), form);

  it("names the picture alone at rest and adds only the choices that differ", () => {
    expect(ref(IMANI, {})).toBe("[[imani]]");
    expect(ref(IMANI, { mouth: "open" })).toBe("[[imani]]");
    expect(ref(IMANI, { face: "happy" })).toBe("[[imani:happy]]");
    expect(ref(IMANI, { face: "sad", mouth: "closed" })).toBe("[[imani:sad:closed]]");
  });

  it("writes group.option when the option alone could mean another group", () => {
    const paths = ["A/kai.png", "A/kai~eyes.open.png", "A/kai~mouth.open.png"];
    expect(ref(paths, { eyes: "open" })).toBe("[[kai:eyes.open]]");
  });

  it("turns a switch on by its name and off by name.off", () => {
    expect(ref(MIA_FOLDER, { hat: "on" })).toBe("[[mia:hat]]");
    expect(ref([`A/bo/10_hat.on~default.png`, `A/bo/90_body.png`].map((p) => `Assets/${p}`), { hat: "off" })).toBe(
      "[[bo:hat.off]]",
    );
  });

  it("writes an alternate as #2109 settled the form", () => {
    const faced = ["Assets/Images/mia.png", "Assets/Images/mia@night.png", "Assets/Images/mia@night~face.sad.png"];
    expect(ref(faced, { [ALTERNATE]: "night", face: "sad" })).toBe(AT_SIGN_REFERENCE_2109);
  });

  it("writes the backdrop form when shown as a backdrop", () => {
    expect(ref(IMANI, { face: "happy" }, "backdrop")).toBe("[[show backdrop imani:happy]]");
    expect(ref(MIA_FOLDER, { face: "happy" }, "backdrop")).toBe("[[show backdrop mia:happy]]");
  });

  it("names a folder stack by its folder", () => {
    expect(variantOf(one(MIA_FOLDER), { face: "happy", hat: "on" })).toEqual({ image: "mia", attributes: ["happy", "hat"] });
  });
});

describe("Show as", () => {
  it("follows the Add-menu folder, then what the scripts do, then the shape", () => {
    expect(defaultForm({ kinds: ["portrait"], lines: ["[[show backdrop x]]"] })).toBe("portrait");
    expect(defaultForm({ kinds: [], lines: ["  [[show backdrop x]]", "[[x:happy]]", "[[show backdrop x]]"] })).toBe("backdrop");
    expect(defaultForm({ kinds: [], lines: ["[[x:happy]]"] })).toBe("portrait");
    expect(defaultForm({ kinds: [], lines: [], pixels: { width: 400, height: 900 } })).toBe("portrait");
    expect(defaultForm({ kinds: [], lines: [], pixels: { width: 1600, height: 900 } })).toBe("backdrop");
  });
});

describe("the Files rows", () => {
  const sizes = (paths: readonly string[]) => Object.fromEntries(paths.map((path, index) => [path, (index + 1) * 1024]));

  it("gives every member its role", () => {
    const paths = [...IMANI, `${P}/imani@night~face.happy~mouth.open~default.png`];
    const roles = Object.fromEntries(fileRows(one(paths), sizes(paths)).map((row) => [row.name, row.role]));
    expect(roles).toEqual({
      "imani.png": "Alternate · plain",
      "imani@night.png": "Alternate · night",
      "imani@night~face.happy.png": "Layer · face.happy · on night",
      "imani@night~face.happy~mouth.open~default.png": "Layer · face.happy · mouth.open · default · on night",
      "imani~face.happy.png": "Layer · face.happy",
      "imani~face.sad.png": "Layer · face.sad",
      "imani~mouth.closed.png": "Layer · mouth.closed",
      "imani~mouth.open~default.png": "Layer · mouth.open · default",
    });
  });

  it("names the base of a single picture and the order number of a folder stack's layers", () => {
    const single = ["A/kai.png", "A/kai~glow.png"];
    expect(fileRows(one(single), {}).map((row) => row.role)).toEqual(["Base", "Layer · always shown"]);
    const paths = [...MIA_FOLDER, `${P}/mia/2_face.happy.png`, `${P}/mia/11_face.sad.png`];
    expect(fileRows(one(paths), {}).map((row) => [row.name, row.role])).toEqual([
      ["2_face.happy.png", "Layer 2 · face.happy"],
      ["10_hat.on.png", "Layer 10 · hat.on"],
      ["11_face.sad.png", "Layer 11 · face.sad"],
      ["30_face.happy.png", "Layer 30 · face.happy"],
      ["30_face.neutral~default.png", "Layer 30 · face.neutral · default"],
      ["90_body.png", "Base"],
    ]);
  });

  it("sums the files", () => {
    const rows = fileRows(one(IMANI), sizes(IMANI));
    expect(filesSummary(rows)).toBe("7 files · 28 kB");
  });
});
