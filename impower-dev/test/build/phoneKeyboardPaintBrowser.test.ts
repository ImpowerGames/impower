// @vitest-environment node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DOCUMENT_CSS = fs.readFileSync(
  fileURLToPath(new URL("../../src/public/document.css", import.meta.url)),
  "utf-8",
);

const SCREEN_HEIGHT = 700;
const KEYBOARD_HEIGHT = 300;
const VISIBLE_HEIGHT = SCREEN_HEIGHT - KEYBOARD_HEIGHT;
const TOOLBAR_HEIGHT = 52;

const page = (htmlClass: string, shell: string) => `<!doctype html>
<html class="${htmlClass}"><head><style>${DOCUMENT_CSS}</style><style>
[data-phone-shell] { display: flex; flex-direction: column; height: 100%; }
.screen-cell { flex: 1; min-height: 0; }
#screen-panel { display: flex; height: 100%; min-height: 0; }
.sparkdown-script-editor-root { display: flex; flex: 1; min-height: 0; }
.cm-editor { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; }
.cm-scroller { flex: 1; min-height: 0; overflow: auto; background: white; }
.cm-panels { box-sizing: border-box; position: sticky; left: 0; right: 0; }
.cm-panels-bottom { height: ${TOOLBAR_HEIGHT}px; flex: none; background: gray; }
</style></head>
<body style="${htmlClass ? `height: ${VISIBLE_HEIGHT}px; --keyboard-height: ${KEYBOARD_HEIGHT}px` : ""}"><div id="app"><div data-phone-shell ${shell}>
  <div style="height:54px;flex:none"></div>
  <div class="screen-cell">
    <div id="screen-panel">
      <div class="sparkdown-script-editor-root"><div class="cm-editor">
        <div class="cm-scroller"><div class="cm-content" style="height:3000px"></div></div>
        <div class="cm-panels cm-panels-bottom" style="bottom: 0"><div class="cm-panel cm-keyboard-toolbar"></div></div>
      </div></div>
    </div>
  </div>
</div></div></body></html>`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const measure = async (htmlClass: string, shell: string) => {
  const tab = await browser.newPage({
    viewport: { width: 400, height: SCREEN_HEIGHT },
  });
  try {
    await tab.setContent(page(htmlClass, shell));
    return await tab.evaluate((visible) => {
      const toolbar = document
        .querySelector(".cm-panels-bottom")!
        .getBoundingClientRect();
      const under = (y: number) =>
        document.elementFromPoint(200, y)?.closest(".cm-scroller") != null;
      return {
        toolbarTop: toolbar.top,
        toolbarBottom: toolbar.bottom,
        scriptUnderKeyboard: [visible + 20, visible + 150, 690].map(under),
      };
    }, VISIBLE_HEIGHT);
  } finally {
    await tab.close();
  }
};

describe("the phone script while the keyboard rises", () => {
  it("stays painted where the keyboard has not yet covered it, with the toolbar sitting on the keyboard", async () => {
    const open = await measure("keyboard-open", "data-editing");

    expect(open.toolbarBottom).toBe(VISIBLE_HEIGHT);
    expect(open.toolbarTop).toBe(VISIBLE_HEIGHT - TOOLBAR_HEIGHT);
    expect(open.scriptUnderKeyboard).toEqual([true, true, true]);
  });

  it("keeps the page fitted to the screen when the keyboard is closed", async () => {
    const closed = await measure("", "data-editing");

    expect(closed.toolbarBottom).toBe(SCREEN_HEIGHT);
  });
});
