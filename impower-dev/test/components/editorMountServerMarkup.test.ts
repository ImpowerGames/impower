import { afterEach, describe, expect, it, vi } from "vitest";

const shown = vi.hoisted(() => ({ revealed: true }));

vi.mock("../../src/modules/spark-editor/main/SparkEditor", async () => {
  const { h } = await import("preact");
  return {
    default: () =>
      h(
        "button",
        {
          "aria-label": "Toggle Preview",
          "aria-pressed": String(shown.revealed),
          "data-state": shown.revealed ? "active" : "inactive",
        },
        shown.revealed ? "EDIT" : "VIEW",
      ),
  };
});

import SparkEditor from "../../src/modules/spark-editor/index";

describe("mounting the editor over its server render", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("replaces the server's default attributes with the saved layout's", async () => {
    if (!("replaceSync" in CSSStyleSheet.prototype)) {
      (CSSStyleSheet.prototype as { replaceSync?: (text: string) => void }).replaceSync = () => {};
    }
    if (!document.adoptedStyleSheets) {
      Object.defineProperty(document, "adoptedStyleSheets", {
        value: [],
        writable: true,
        configurable: true,
      });
    }
    document.body.innerHTML =
      '<div id="root"><button aria-label="Toggle Preview" aria-pressed="false" data-state="inactive">VIEW</button></div>';
    const serverButton = document.querySelector("button");

    await SparkEditor.init();

    const button = document.querySelector("button")!;
    expect(button).toBe(serverButton);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("data-state")).toBe("active");
    expect(button.textContent).toBe("EDIT");
  });
});
