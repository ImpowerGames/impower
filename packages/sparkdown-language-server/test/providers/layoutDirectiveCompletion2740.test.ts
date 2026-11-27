import { describe, expect, it } from "vitest";
import { compileProject, complete } from "./completionHarness";

const SOURCE = (line: string) => `define BG as image with
  src = "https://example.com/bg.png"
end

screen menu {
  slot
}

layout hud {
  meter { text "HP" }
}

layout pause in menu {
  text "Paused"
}

scene start
  ${line}
end
`;

const labelsAfter = (line: string) => {
  const source = SOURCE(line);
  const at = complete(source, { program: compileProject(source.replace("@1", "")) });
  return { labels: at.labels, detail: at.detail };
};

describe("completion after a layout directive offers what the directive may name (I-2740)", { timeout: 60_000 }, () => {
  it.each(["open", "close", "clear"])("[[%s ]] offers layouts and screens, not picture layers", (verb) => {
    const { labels, detail } = labelsAfter(`[[${verb} @1]]`);
    expect(labels).toEqual(expect.arrayContaining(["hud", "pause", "dialogue", "action", "textbox", "menu"]));
    expect(labels).not.toContain("backdrop");
    expect(labels).not.toContain("portrait");
    expect(detail("hud")).toBe("layout");
    expect(detail("textbox")).toBe("screen");
  });

  it("[[navigate ]] offers screens", () => {
    const { labels } = labelsAfter("[[navigate @1]]");
    expect(labels).toEqual(expect.arrayContaining(["menu", "textbox"]));
    expect(labels).not.toContain("hud");
    expect(labels).not.toContain("backdrop");
  });

  it("[[show ]] still offers picture layers", () => {
    const { labels } = labelsAfter("[[show @1]]");
    expect(labels).toEqual(expect.arrayContaining(["backdrop", "portrait"]));
    expect(labels).not.toContain("hud");
  });
});
