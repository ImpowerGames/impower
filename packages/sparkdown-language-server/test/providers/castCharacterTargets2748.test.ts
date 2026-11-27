import { describe, expect, it } from "vitest";
import { compileProject, complete } from "./completionHarness";

const URI = "file:///proj/main.sd";

const HEADER = `define mia as character with
  name = "MIA"
end

define nobody as character with
  name = "NOBODY"
end

layout main {
  stage {
    cast {
      actor {
        portrait { image }
      }
    }
  }
}
`;

const ASSETS = [{ name: "mia@happy", ext: "png", type: "image" as const }];

const messageOf = (d: { message: string | { value: string } }) =>
  typeof d.message === "string" ? d.message : d.message.value;

describe("hide and animate take a character's name in the editor (#2748)", () => {
  it("warns when a name after hide or animate is both a layer and a character", () => {
    const source = `${HEADER}
layout extra {
  mia { image }
}

scene start
  [[hide mia]]
  [[animate mia with shake]]
  Gone.
end
`;
    const program = compileProject(source, ASSETS);
    const lines = source.split("\n");
    const found = (program.diagnostics?.[URI] ?? []).map((d) => ({
      message: messageOf(d as never),
      line: lines[d.range.start.line]!.trim(),
    }));
    const warning = "`mia` names a layer and a character. `hide` and `animate` use the layer.";
    expect(found).toEqual([
      { message: warning, line: "[[hide mia]]" },
      { message: warning, line: "[[animate mia with shake]]" },
    ]);
  }, 30000);

  it("offers characters with pictures after hide and animate, beside the layers", () => {
    const program = compileProject(`${HEADER}
scene start
  Hello.
end
`, ASSETS);
    for (const control of ["hide", "animate"]) {
      const at = complete(`${HEADER}
scene start
  [[${control} @0]]
end
`, { program });
      expect(at.detail("mia"), control).toBe("character");
      expect(at.detail("portrait"), control).toBe("layer");
      expect(at.labels, control).not.toContain("nobody");
    }
    const shown = complete(`${HEADER}
scene start
  [[show @0]]
end
`, { program });
    expect(shown.labels).not.toContain("mia");
  }, 30000);
});
