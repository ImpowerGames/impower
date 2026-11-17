import { afterAll, describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { closeViews, exportRows, screenRows } from "./helpers/screenplayParity";

afterAll(closeViews);

const rowsOf = (source: string) =>
  new ScreenplayParser()
    .parse(source)
    .map((token) => ({ tag: token.tag, text: token.text, styled: token.styled }))
    .filter((row) => row.text);

const styledOf = (source: string, needle: string) => {
  const parser = new ScreenplayParser();
  const row = parser.parse(source).find((token) => token.text?.includes(needle));
  return row?.styled;
};

describe("a {...} piece at the start of a line", () => {
  it("prints as source in an action line", () => {
    const rows = rowsOf(`{name} trusts you a little more...\n`);
    const row = rows.find((r) => r.text?.includes("trusts you"));
    expect(row?.text).toBe("{name} trusts you a little more...\n");
  });

  it("prints as source in dialogue", () => {
    const rows = rowsOf(`HERO:\n  {name} trusts you.\n`);
    const row = rows.find((r) => r.text?.includes("trusts you."));
    expect(row?.text).toBe("{name} trusts you.");
  });

  it("styles a leading piece the way it styles the same piece mid-line", () => {
    const leading = styledOf(`{name} after.\n`, "after.");
    const midLine = styledOf(`Before {name} after.\n`, "after.");
    expect(midLine).toContain("Before ");
    expect(leading).toBe(midLine?.slice(midLine.indexOf("Before ") + "Before ".length));
  });

  it("shows the piece on the Screenplay page in action and dialogue", () => {
    const source = `{name} trusts you a little more...\n\nGUARD:\n  {name} trusts you.\n`;
    const screen = screenRows("default", source);
    expect(screen).toEqual(expect.arrayContaining(["{name} trusts you a little more...", "{name} trusts you."]));
    expect(screen.filter((row) => row.trim())).toEqual(exportRows("default", source).filter((row) => row.trim()));
  });
});
