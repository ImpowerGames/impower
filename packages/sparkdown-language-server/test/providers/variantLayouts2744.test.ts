import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../src/utils/providers/getHover";
import { compileProject } from "./completionHarness";

const URI = "file:///proj/main.sd";

const SCENE = `
define bunny as character with
  name = "BUNNY"
end

scene start
  BUNNY [left]: Hi.
end
`;

const DUEL = `layout duel in textbox {
  stream {
    dialogue #variant=left { text }
    dialogue #variant=right { text }
  }
}
`;

const PHONE = `layout phone {
  thread {
    stream {
      dialogue.bubble.incoming #variant=receive { text }
      dialogue.bubble.outgoing #variant=send { text }
    }
  }
}
`;

const warningsIn = (script: string) => {
  const program = compileProject(script);
  return (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.code === "variant-layouts")
    .map((d) => {
      const { start, end } = d.range;
      const line = script.split("\n")[start.line]!;
      return {
        marked: line.slice(start.character, end.character),
        message: typeof d.message === "string" ? d.message : d.message.value,
      };
    });
};

const hoverAt = async (text: string, needle: string) => {
  const program = compileProject(text);
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  const document = documents.get(URI)!;
  const hover = await getHover(
    document,
    documents.tree(URI),
    documents.annotations(URI),
    program,
    undefined,
    document.positionAt(text.indexOf(needle) + 2),
  );
  return hover
    ? {
        value: (hover.contents as { value: string }).value,
        marked: document.getText(hover.range),
      }
    : null;
};

describe("two layouts that limit one kind to one variant (I-2744)", { timeout: 60000 }, () => {
  it("warns on each of the author's props, naming both layouts", () => {
    const message =
      "`left` dialogue lines could open `simultaneous` or `duel`. Limit only one layout's elements to a variant.";
    expect(warningsIn(`${DUEL}${SCENE}`)).toEqual([
      { marked: "#variant=left", message },
      {
        marked: "#variant=right",
        message: message.replaceAll("left", "right"),
      },
    ]);
  });

  it("warns in a component that two layouts use, where the element is written", () => {
    expect(
      warningsIn(`component incoming {
  dialogue #variant=receive { text }
}

layout phone {
  incoming
}

layout radio {
  incoming
}
${SCENE}`),
    ).toEqual([
      {
        marked: "#variant=receive",
        message:
          "`receive` dialogue lines could open `phone` or `radio`. Limit only one layout's elements to a variant.",
      },
    ]);
  });

  it("warns in a screen's body when two of its layouts would share the element", () => {
    expect(
      warningsIn(`screen inbox {
  dialogue #variant=receive { text }
  slot
}

layout phone in inbox {
  decoration
}

layout radio in inbox {
  dial
}
${SCENE}`),
    ).toEqual([
      {
        marked: "#variant=receive",
        message:
          "`receive` dialogue lines could open `phone` or `radio`. Limit only one layout's elements to a variant.",
      },
    ]);
  });

  it("does not warn for a component only one layout uses", () => {
    expect(
      warningsIn(`component incoming {
  dialogue #variant=receive { text }
}

layout phone {
  incoming
}
${SCENE}`),
    ).toEqual([]);
  });

  it("does not warn for variants no other layout limits", () => {
    expect(warningsIn(`${PHONE}${SCENE}`)).toEqual([]);
  });

  it("does not warn for elements in main, which never opens by itself", () => {
    expect(
      warningsIn(`layout main {
  box {
    character_name #variant=left #clear { text }
    dialogue #variant=left #clear { text }
  }
}
${SCENE}`),
    ).toEqual([]);
  });

  it("does not warn for two layouts that limit only their names to the same variant", () => {
    expect(
      warningsIn(`layout names {
  character_name #variant=left { text }
}
${SCENE}`),
    ).toEqual([]);
  });
});

describe("hover on #variant= in a layout (I-2744)", { timeout: 60000 }, () => {
  it("says which lines the element takes and that its layout opens for them", async () => {
    const hover = await hoverAt(`${PHONE}${SCENE}`, "#variant=receive");
    expect(hover?.marked).toBe("#variant=receive");
    expect(hover?.value).toContain("limits this element to lines labelled `receive`");
    expect(hover?.value).toContain("`phone` opens by itself for `receive` dialogue lines");
  });

  it("does not claim a layout opens when only its names are limited", async () => {
    const hover = await hoverAt(
      `layout names {
  character_name #variant=left { text }
}
${SCENE}`,
      "#variant=left",
    );
    expect(hover?.value).toContain("limits this element to lines labelled `left`");
    expect(hover?.value).not.toContain("opens by itself");
  });
});
