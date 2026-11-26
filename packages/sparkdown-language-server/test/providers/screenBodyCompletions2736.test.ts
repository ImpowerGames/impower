import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getHover } from "../../src/utils/providers/getHover";
import { compileProject, labelsAt } from "./completionHarness";

const PROJECT = `layout home {
  home_page { text "Home" }
}

component card {
  body { slot }
}

scene start
end
`;

const program = compileProject(PROJECT);

describe("completion in a screen's body", () => {
  test.each([
    "screen menu {\n  @0\n}\n",
    "screen menu {\n  sl@0\n}\n",
    "screen menu {\n  panel {\n    he@0\n  }\n}\n",
    'screen menu {\n  panel {\n    header { text "x" }\n    @0\n  }\n}\n',
  ])("offers slot, components and elements: %j", (body) => {
    const labels = labelsAt(`${PROJECT}\n${body}`, { program });
    expect(labels).toContain("slot");
    expect(labels).toContain("card");
    expect(labels).toContain("home_page");
    expect(labels).toContain("text");
  });

  test("offers nothing in a property value", () => {
    const labels = labelsAt(`${PROJECT}\nscreen menu {\n  panel #gap=@0\n}\n`, {
      program,
    });
    expect(labels).not.toContain("slot");
  });
}, 120000);

const hoverAt = async (text: string, index: number) => {
  const uri = "file:///screen-hover.sd";
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  const hover = await getHover(
    document,
    documents.tree(uri),
    documents.annotations(uri),
    undefined,
    undefined,
    document.positionAt(index),
  );
  return hover
    ? {
        value: (hover.contents as { value: string }).value,
        marked: document.getText(hover.range),
      }
    : null;
};

describe("hover on screen", () => {
  test("describes the screen's own elements and slot", async () => {
    const text = "screen menu {\n  panel { slot }\n}\n";
    const hover = await hoverAt(text, 2);
    expect(hover?.marked).toBe("screen");
    expect(hover?.value).toContain("stay on screen while any of its layouts is open");
    expect(hover?.value).toContain("`slot`");
  });
});

describe("write targets in a screen's body", () => {
  test("an element a screen's body holds is offered as a write target", () => {
    const project = `screen menu {
  caption { text }
  slot
}

layout home in menu {
  home_page
}

scene start
end
`;
    const labels = labelsAt(`${project}\nscene other\n  @ca@0: Hello.\nend\n`, {
      program: compileProject(project),
    });
    expect(labels).toContain("caption");
  });

  test("an element a layout holds is offered as a write target", () => {
    const project = `layout home {
  caption { text }
}

scene start
end
`;
    const labels = labelsAt(`${project}\nscene other\n  @ca@0: Hello.\nend\n`, {
      program: compileProject(project),
    });
    expect(labels).toContain("caption");
  });
}, 120000);
