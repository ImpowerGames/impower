import { describe, expect, test } from "vitest";
import { BeginReconcileMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/BeginReconcileMessage";
import { CreateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/CreateElementMessage";
import { SetThemeMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/SetThemeMessage";
import { uiBuiltinDefinitions } from "../../../../spark-engine/src/game/modules/ui/uiBuiltinDefinitions";
import UIManager from "../../app/managers/UIManager";
import {
  createDOMHarness,
  createStubApp,
  installJSDOM,
} from "./domTestHarness";

const breakpoints = uiBuiltinDefinitions().config.ui.breakpoints;

const styles = (overlay: HTMLElement) =>
  [...overlay.querySelectorAll("style")]
    .map((e) => e.textContent ?? "")
    .join("\n");

const defined = `define rebeccapurple as color with\n  value = "#00ff00"\nend\n`;
const core =
  "style sample { color = rebeccapurple }\nlayout main { box.sample }";

describe("a theme variable an author declares is part of the theme", () => {
  test("a layout element's own theme custom properties resolve its bare words", async () => {
    const h = createDOMHarness(
      `layout main {
  box.sample #--theme-size-gutter=20px #--theme-color-brand="#ff0000" #--theme-filter-dim="brightness(0.5)" #padding=gutter #color=brand #filter=dim
}
`,
      0,
    );
    await h.ready;
    const box = h.overlay.querySelector(".sample") as HTMLElement;
    expect(box.style.getPropertyValue("--theme-size-gutter")).toBe("20px");
    const style = box.getAttribute("style") ?? "";
    expect(style).toContain("padding: var(--theme-size-gutter)");
    expect(style).toContain("color: var(--theme-color-brand)");
    expect(style).toContain("filter: var(--theme-filter-dim)");
  });

  test("a word the author never declares stays native", async () => {
    const h = createDOMHarness(
      `layout main {
  box.sample #--theme-color-brand="#ff0000" #filter=dim
}
`,
      0,
    );
    await h.ready;
    const box = h.overlay.querySelector(".sample") as HTMLElement;
    expect(box.getAttribute("style") ?? "").toContain("filter: dim");
  });
});

describe("a theme change re-resolves the elements the player reuses", () => {
  test("a reload that removes the token restores the native word", async () => {
    const h = createDOMHarness(defined + core, 0);
    await h.ready;
    expect(styles(h.overlay)).toContain(
      "color: var(--theme-color-rebeccapurple);",
    );
    await h.rerender(core, 0, { connectOnly: true });
    expect(styles(h.overlay)).toContain("color: rebeccapurple;");
    expect(styles(h.overlay)).not.toContain("var(--theme-color-rebeccapurple)");
  });

  test("a reload that adds the token resolves the reused stylesheet", async () => {
    const h = createDOMHarness(core, 0);
    await h.ready;
    expect(styles(h.overlay)).toContain("color: rebeccapurple;");
    await h.rerender(defined + core, 0, { connectOnly: true });
    expect(styles(h.overlay)).toContain(
      "color: var(--theme-color-rebeccapurple);",
    );
  });

  test.each([
    ["inline style", { type: "div", style: { color: "rebeccapurple" } }],
    [
      "stylesheet",
      {
        type: "style",
        content: { styles: { card: { color: "rebeccapurple" } } },
      },
    ],
    [
      "keyframes",
      {
        type: "style",
        content: {
          animations: {
            pulse: { keyframes: [{ color: "rebeccapurple" }], timing: {} },
          },
        },
      },
    ],
  ])(
    "a new manager over the retained DOM re-resolves a reused %s",
    async (_kind, element) => {
      const env = installJSDOM();
      const app = createStubApp(env.overlay, () => {});
      const params = {
        parent: null,
        element: "reused",
        name: "reused",
        breakpoints,
        ...element,
      } as any;
      const read = (el: HTMLElement) =>
        `${el.getAttribute("style") ?? ""}${el.textContent ?? ""}`;
      let ui = new UIManager(app);
      try {
        await ui.onReceiveRequest(
          SetThemeMessage.type.request({ breakpoints, variables: [] }),
        );
        await ui.onReceiveRequest(CreateElementMessage.type.request(params));
        const el = env.overlay.firstElementChild as HTMLElement;
        expect(read(el)).toContain("rebeccapurple");
        expect(read(el)).not.toContain("var(--theme-color-rebeccapurple)");
        ui.onDispose();
        ui = new UIManager(app);
        ui.onReceiveNotification(BeginReconcileMessage.type.notification({}));
        await ui.onReceiveRequest(
          SetThemeMessage.type.request({
            breakpoints,
            variables: ["--theme-color-rebeccapurple"],
          }),
        );
        await ui.onReceiveRequest(CreateElementMessage.type.request(params));
        ui.sweepReconcile();
        expect(env.overlay.firstElementChild).toBe(el);
        expect(read(el)).toContain("var(--theme-color-rebeccapurple)");
      } finally {
        ui.onDispose();
        env.restore();
      }
    },
  );
});
