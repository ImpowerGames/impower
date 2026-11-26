import { describe, expect, test } from "vitest";
import { compileProject, labelsAt } from "./completionHarness";

const PROJECT = `layout home {
  home_page { text "Home" }
}

component card {
  body { caption }
}

scene start
end
`;

const program = compileProject(PROJECT);

describe("completion in a compiled project's layout and component bodies", () => {
  test.each(["layout", "component"])(
    "a %s body offers elements and components at the root and inside blocks",
    (keyword) => {
      for (const body of [
        `${keyword} hud {\n  @0\n}\n`,
        `${keyword} hud {\n  te@0\n}\n`,
        `${keyword} hud {\n  row {\n    te@0\n  }\n}\n`,
        `${keyword} hud {\n  row.item { te@0 }\n}\n`,
        `${keyword} hud {\n  row { text "x"; @0 }\n}\n`,
      ]) {
        const labels = labelsAt(`${PROJECT}\n${body}`, { program });
        expect(labels, body).toContain("text");
        expect(labels, body).toContain("home_page");
        expect(labels, body).toContain("caption");
        expect(labels, body).toContain("card");
      }
    },
  );

  test.each(["layout", "component"])("a %s body offers no slot", (keyword) => {
    const labels = labelsAt(`${PROJECT}\n${keyword} hud {\n  sl@0\n}\n`, {
      program,
    });
    expect(labels).toContain("caption");
    expect(labels).not.toContain("slot");
  });

  test("an element's property value offers no elements", () => {
    const labels = labelsAt(`${PROJECT}\nlayout hud {\n  row #gap=@0\n}\n`, {
      program,
    });
    expect(labels).not.toContain("home_page");
  });
}, 120000);
