import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

const SCREEN = `layout main with
  stage {
    backdrop {
      image
    }
    portrait {
      mask.shadow_1
      image
    }
  }
  textbox {
    character_info {
      character_name {
        text
      }
      character_parenthetical {
        text
      }
    }
    dialogue {
      stroke
      text
    }
    continue_indicator
  }
end
`;

describe("reactive mount (Phase 3 I1)", () => {
  test("AST-driven static mount matches the static constructLayout stream", async () => {
    const staticH = createHarness(SCREEN, 0, { staticFallback: true });
    const reactiveH = createHarness(SCREEN);
    await Promise.all([staticH.ready, reactiveH.ready]);
    const withoutFillStyle = (ops: any[]) =>
      ops.map((op) =>
        op?.method === "ui/create" && op?.params?.name === "loading_fill"
          ? { ...op, params: { ...op.params, style: undefined } }
          : op,
      );
    expect(withoutFillStyle(reactiveH.snapshotFiltered("ui/"))).toEqual(
      withoutFillStyle(staticH.snapshotFiltered("ui/")),
    );
  });

  test("the builtin `loading` screen is mounted from the prelude AST", async () => {
    const reactiveH = createHarness(SCREEN, 0, { reactive: true });
    await reactiveH.ready;
    const created = reactiveH
      .snapshotFiltered("ui/create")
      .map((m: any) => m.params?.name);
    expect(created).toContain("loading");
    expect(created).toContain("loading_bar");
    expect(created).toContain("loading_fill");
    expect(created).toContain("main");
    expect(created).toContain("mask shadow_1");
  });
});
