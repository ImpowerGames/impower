import assert from "node:assert/strict";
import { test } from "node:test";
import { openEditorPage, waitForEditor, withEditor } from "../../../.agents/skills/drive-web-editor/driver.mjs";

const openMainFromScripts = async (page) => {
  await page.evaluate(() => {
    location.hash = "#scripts";
  });
  const row = page.locator('button[aria-label^="Open script Main"]').first();
  await row.waitFor({ state: "visible", timeout: 10_000 });
  await row.click();
  await page.waitForFunction(() => location.hash === "#write" && !!document.querySelector(".sparkdown-script-editor-root .cm-editor"), null, { timeout: 15_000 });
  await page.waitForTimeout(1_000);
  return page.evaluate(() => ({
    hash: location.hash,
    editor: !!document.querySelector(".sparkdown-script-editor-root .cm-editor"),
    selection: getSelection()?.type,
  }));
};

const withCrashWatch = async (page, run) => {
  let crashed = false;
  page.on("crash", () => {
    crashed = true;
  });
  try {
    return await run();
  } catch (error) {
    assert.equal(crashed, false, "the editor tab crashed");
    throw error;
  } finally {
    assert.equal(crashed, false, "the editor tab crashed");
  }
};

test("opening Main from the Scripts page after clicking the project name keeps the tab alive", { timeout: 240_000 }, async () => {
  await withEditor(async ({ page, url }) => {
    await openEditorPage(page, url);
    await waitForEditor(page);
    const opened = await withCrashWatch(page, async () => {
      await page.click('input[aria-label="Project name"]');
      await page.keyboard.press("Enter");
      return openMainFromScripts(page);
    });
    assert.deepEqual(opened, { hash: "#write", editor: true, selection: "None" });
  });
});

test("opening Main from the Scripts page while text on it is selected keeps the tab alive", { timeout: 240_000 }, async () => {
  await withEditor(async ({ page, url }) => {
    await openEditorPage(page, url);
    await waitForEditor(page);
    const opened = await withCrashWatch(page, async () => {
      await page.evaluate(() => {
        location.hash = "#scripts";
      });
      await page.locator('button[aria-label^="Open script Main"]').first().waitFor({ state: "visible", timeout: 10_000 });
      const selected = await page.evaluate(() => {
        const heading = [...document.querySelectorAll("h1, h2")].find((element) => element.offsetParent && element.textContent.trim());
        const range = document.createRange();
        range.selectNodeContents(heading);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        return getSelection().type;
      });
      assert.equal(selected, "Range");
      return openMainFromScripts(page);
    });
    assert.deepEqual(opened, { hash: "#write", editor: true, selection: "None" });
  });
});
