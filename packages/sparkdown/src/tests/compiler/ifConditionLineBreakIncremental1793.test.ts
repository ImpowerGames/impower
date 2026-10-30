import { describe, expect, it } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

const URI = "inmemory:///missing-then.sd";
const MISSING_THEN = "Expected 'then' when parsing if statement, got <eof>";

function openValidations(text: string) {
  const registry = new SparkdownDocumentRegistry(["validations"]);
  registry.add({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  return registry;
}

function validations(registry: SparkdownDocumentRegistry): string[] {
  const found: string[] = [];
  const iter = registry.annotations(URI)!.validations.iter(0);
  while (iter.value) {
    found.push(`${iter.from}-${iter.to} ${iter.value.type.message ?? ""}`);
    iter.next();
  }
  return found;
}

function position(text: string, offset: number) {
  const prefix = text.slice(0, offset).split("\n");
  return { line: prefix.length - 1, character: prefix.at(-1)!.length };
}

describe("an if condition's missing-then error at its line break", () => {
  it("stays when an edit's validation window begins on the line after it", () => {
    let text = [
      "scene scene_12",
      "= INT. ROOM 12 - DAY",
      ":",
      "  Action describing room 12 in some detail here.",
      "hero:",
      "  Line one of dialogue in scene 12.",
      "  Second line with {trust} and read-count {scene_13} here.",
      "if trus",
      "t > 2 then",
      "  hero: I trust you in scene 12.",
      "e->lse",
      "  hero: Not yet in scene 12.",
      "end",
      "& trust = bonus(trust)",
      "-> scene_1",
      "end",
      "",
    ].join("\n");
    const lineBreak = text.indexOf("if trus") + "if trus".length;
    const missingThen = `${lineBreak}-${lineBreak + 1} ${MISSING_THEN}`;
    const registry = openValidations(text);
    expect(validations(registry)).toContain(missingThen);

    let version = 2;
    const replace = (from: number, to: number, insert: string) => {
      registry.update({
        textDocument: { uri: URI, version: version++ },
        contentChanges: [{ range: { start: position(text, from), end: position(text, to) }, text: insert }],
      });
      text = text.slice(0, from) + insert + text.slice(to);
      expect(validations(registry), JSON.stringify(insert)).toEqual(validations(openValidations(text)));
    };

    const mark = text.indexOf("& trust");
    replace(mark + 1, mark + 1, " ");
    const value = text.indexOf("= bonus(tr");
    replace(value, value + "= bonus(tr".length, " += 1");
    expect(validations(registry)).toContain(missingThen);
  });
});
