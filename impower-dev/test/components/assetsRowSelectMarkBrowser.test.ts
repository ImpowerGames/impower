// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

const PICTURE = "Assets/Images/Cast/picture_000.png";
const FOLDER = "Assets/Images/Cast/Crew";
const ICON = "Assets/Text/notes.txt";

const LISTS = [
  { tab: null, paths: [PICTURE, FOLDER] },
  { tab: "Text", paths: [ICON] },
] as const;

let browser: Browser;
let script: string;
let css: string;

beforeAll(async () => {
  script = await bundlePage("test/components/assetsTileSizesPage.tsx", "test/components/assetsTileSizesWorkspace.ts");
  css = await stylesFor(script);
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const open = async (touch: boolean, tab: string | null, first: string) => {
  const page = await openPage(browser, script, css, { width: touch ? 430 : 1440, touch, theme: "charcoal" });
  await page.evaluate(() =>
    window.assetsPage.mount({
      pictures: 2,
      extraFiles: ["Assets/Text/notes.txt", "Assets/Text/tides.txt"],
      lists: {
        assetsLayouts: { "Assets/Images/Cast": "rows" },
        assetsFolders: { image: "Assets/Images/Cast", text: "Assets/Text" },
      },
    }),
  );
  await page.locator(`[data-asset-path="${PICTURE}"]`).waitFor();
  if (tab) {
    await page.getByRole("tab", { name: tab }).click();
  }
  await page.locator(`[data-asset-path="${first}"]`).waitFor();
  await page.mouse.move(0, 0);
  await frames(page);
  return page;
};

type Leading = { visible: boolean; mark: boolean; offset: number };

const leadingOf = (page: Page, path: string) =>
  page.evaluate((path): Leading => {
    const body = document.querySelector<HTMLElement>(`[data-asset-path="${CSS.escape(path)}"]`)!;
    const row = body.closest<HTMLElement>('[class*="group/row"]')!;
    const lead = body.firstElementChild as HTMLElement;
    const circle = row.querySelector<HTMLElement>("label > span")!;
    const centre = (r: DOMRect) => [r.left + r.width / 2, r.top + r.height / 2] as const;
    const [ax, ay] = centre(lead.getBoundingClientRect());
    const [bx, by] = centre(circle.getBoundingClientRect());
    return {
      visible: getComputedStyle(lead).visibility !== "hidden",
      mark: getComputedStyle(circle.parentElement!).opacity !== "0",
      offset: Math.round(Math.max(Math.abs(ax - bx), Math.abs(ay - by))),
    };
  }, path);

const hidden: Leading = { visible: false, mark: true, offset: 0 };

const nameOf = (path: string) => path.split("/").pop()!.replace(/\.[^.]+$/, "");

describe("Assets list rows under the select circle", () => {
  for (const touch of [false, true]) {
    const input = touch ? "touch" : "a mouse";

    if (!touch) {
      it(`with ${input}, hide a hovered row's leading box under a circle centred in it`, async () => {
        for (const { tab, paths } of LISTS) {
          const page = await open(touch, tab, paths[0]);
          for (const path of paths) {
            await page.locator(`[data-asset-path="${path}"]`).hover();
            await frames(page);
            expect({ path, ...(await leadingOf(page, path)) }).toEqual({ path, ...hidden });
          }
          await page.context().close();
        }
      });
    }

    it(`with ${input}, hide the leading box under a circle centred in it while the checkbox has keyboard focus`, async () => {
      for (const { tab, paths } of LISTS) {
        const page = await open(touch, tab, paths[0]);
        await page.keyboard.press("Shift");
        for (const path of paths) {
          await page.locator(`input[aria-label="Select ${nameOf(path)}"]`).focus();
          await frames(page);
          expect({ path, ...(await leadingOf(page, path)) }).toEqual({ path, ...hidden });
        }
        await page.context().close();
      }
    });

    it(`with ${input}, hide every row's leading box under a circle centred in it while a selection is active`, async () => {
      for (const { tab, paths } of LISTS) {
        const page = await open(touch, tab, paths[0]);
        await page.locator(`input[aria-label="Select ${nameOf(paths[0])}"]`).evaluate((box: HTMLInputElement) => box.click());
        await page.mouse.move(0, 0);
        await frames(page);
        for (const path of paths) {
          expect({ path, ...(await leadingOf(page, path)) }).toEqual({ path, ...hidden });
        }
        await page.context().close();
      }
    });
  }
});
