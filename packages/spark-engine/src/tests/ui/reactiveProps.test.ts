import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const evalGlobal = (h: UIHarness, name: string): unknown =>
  (h.game.story as any).variablesState.$(name);

const createsNamed = (h: UIHarness, tag: string): any[] =>
  h
    .snapshotFiltered("ui/create")
    .filter((m: any) => String(m.params?.name ?? "").split(" ")[0] === tag);

describe("inline props on generic elements", () => {
  test("static #prop becomes an inline style on the create message", async () => {
    const h = createHarness(
      `layout main with
  row #gap=20 #background-color=darkred {
    text "A"
  }
end
`,
      0,
      { reactive: true } as any,
    );
    await h.ready;
    const row = createsNamed(h, "row").find((m) => m.params?.style);
    expect(row).toBeTruthy();
    expect(row.params.style).toMatchObject({
      gap: "20",
      "background-color": "darkred",
    });
  });

  test("a dotted class and inline props coexist on the same element", async () => {
    const h = createHarness(
      `layout main with
  column.panel #gap=16 #background-color=navy {
    text.title "Hi"
  }
end
`,
      0,
      { reactive: true } as any,
    );
    await h.ready;
    const panel = createsNamed(h, "column").find(
      (m) => String(m.params?.name) === "column panel",
    );
    expect(panel).toBeTruthy();
    expect(panel.params.style).toMatchObject({
      gap: "16",
      "background-color": "navy",
    });
    const title = createsNamed(h, "text").find(
      (m) => String(m.params?.name) === "text title",
    );
    expect(title).toBeTruthy();
  });

  test("a reactive #prop re-applies via ui/update when its dep changes", async () => {
    const h = createHarness(
      `store bg = "blue"
function setbg()
  bg = "green"
end
layout main with
  box #background-color={bg} {
    text "C"
  }
  button "x" @click=setbg
end
`,
      0,
      { reactive: true } as any,
    );
    await h.ready;
    const box = createsNamed(h, "box").find((m) => m.params?.style);
    expect(box).toBeTruthy();
    expect(box.params.style).toMatchObject({ "background-color": "blue" });

    const obs = h.observedElementIds();
    expect(obs[0]).toBeTruthy();
    h.emitEvent("click", obs[0]!, {});
    expect(evalGlobal(h, "bg")).toBe("green");

    const styleUpdates = h
      .snapshotFiltered("ui/update")
      .filter((m: any) => m.params?.style?.["background-color"] === "green");
    expect(styleUpdates.length).toBeGreaterThan(0);
  });
});
