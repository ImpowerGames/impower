import { describe, expect, test } from "vitest";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";
import { compileUI, createHarness } from "../ui/harness/uiTestHarness";

const SOURCE = `morph base {
  blend = cut
  timing {
    duration = 0.75
    easing = linear
  }
  keyframes {
    from {
      mouth {
        state = closed
        translate = 0 2px
      }
    }
    to {
      mouth {
        state = open
      }
    }
  }
}

morph child as base {
  blend = cut
}

morph grandchild as child {
  timing {
    delay = 0.1
  }
}


scene start
  Hello.
end
`;

const stripEditorMeta = (struct: any): any => {
  if (!struct || typeof struct !== "object" || Array.isArray(struct)) {
    return struct;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(struct)) {
    if (k.startsWith("$") && k !== "$type" && k !== "$name") continue;
    out[k] = v;
  }
  return out;
};

describe("LSP and runtime channels agree on a child morph", () => {
  test.each(["base", "child", "grandchild"])("morph.%s", async (name) => {
    const { program } = compileUI(SOURCE);
    const harness = createHarness(SOURCE);
    await harness.ready;
    const runtime = buildDefinesContext((harness.game as any).story)["morph"]?.[name];
    const lsp = (program.context as any)?.["morph"]?.[name];
    expect(lsp).toBeDefined();
    expect(runtime).toMatchObject(stripEditorMeta(lsp));
  });
});
