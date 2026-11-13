import assert from "node:assert/strict";
import { test } from "node:test";
import { launchEditorBrowser, openEditorPage, waitForEditor, withEditor, writeMainSd } from "../../.agents/skills/drive-web-editor/driver.mjs";
import { VIEWPORT_PRESETS } from "../../.agents/skills/drive-web-editor/viewport.mjs";

const SCRIPT = "scene start\n  The lamps come on one by one.\n  done\nend\n";

const display = (name) => ({ viewport: { name, ...VIEWPORT_PRESETS[name] } });

const openGotoLine = async (page, touch) => {
  if (touch) {
    const edit = page.getByRole("button", { name: /^Edit$/ });
    if (await edit.count()) await edit.first().click();
    await page.locator(".sparkdown-script-editor-root .cm-line").nth(1).click();
    await page.getByRole("button", { name: "Go to line" }).first().click();
  } else {
    await page.locator(".sparkdown-script-editor-root .cm-line").nth(1).click();
    await page.keyboard.press("Control+g");
  }
  await page.locator(".cm-panel.cm-gotoLine .cm-textfield").waitFor({ state: "visible", timeout: 10_000 });
};

const measure = (page) =>
  page.evaluate(() => {
    const editor = document.querySelector(".sparkdown-script-editor-root .cm-editor").getBoundingClientRect();
    const field = document.querySelector(".cm-panel.cm-gotoLine .cm-textfield");
    const box = field.getBoundingClientRect();
    const cover = document.elementFromPoint(editor.left + editor.width / 2, editor.top - 1)?.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      coverBottom: cover ? cover.bottom : 0,
      fieldTop: box.top,
      fieldBottom: box.bottom,
      viewportHeight: innerHeight,
      hitIsField: hit === field || field.contains(hit),
      focused: document.activeElement === field,
    };
  });

const scriptFocused = (page) =>
  page.evaluate(() => Boolean(document.activeElement?.closest(".sparkdown-script-editor-root .cm-content")));

const activeLineText = (page) =>
  page.evaluate(() => {
    const node = getSelection()?.anchorNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return element?.closest(".sparkdown-script-editor-root .cm-line")?.textContent ?? null;
  });

for (const name of ["phone", "tablet", "desktop"]) {
  test(`Go to line opens below whatever covers the editor's top edge at ${name} width`, { timeout: 240_000 }, async () => {
    await withEditor(
      async ({ page, url }) => {
        await openEditorPage(page, url);
        await waitForEditor(page);
        await writeMainSd(page, SCRIPT);
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForEditor(page);
        const touch = Boolean(VIEWPORT_PRESETS[name].touch);

        await openGotoLine(page, touch);
        const opened = await measure(page);
        assert.ok(opened.fieldTop >= opened.coverBottom, `field top ${opened.fieldTop} is above the cover's bottom ${opened.coverBottom}`);
        assert.ok(opened.fieldBottom <= opened.viewportHeight, `field bottom ${opened.fieldBottom} is below the viewport`);
        assert.equal(opened.hitIsField, true, "the field's middle is covered by another element");
        assert.equal(opened.focused, true, "the field does not hold focus on opening");

        await page.keyboard.press("Escape");
        await page.locator(".cm-panel.cm-gotoLine").waitFor({ state: "detached", timeout: 5_000 });
        assert.equal(await scriptFocused(page), true, "Escape did not return focus to the script");

        await openGotoLine(page, touch);
        await page.keyboard.type("3");
        await page.keyboard.press("Enter");
        await page.locator(".cm-panel.cm-gotoLine").waitFor({ state: "detached", timeout: 5_000 });
        assert.equal((await activeLineText(page))?.trim(), "done");
        assert.equal(await scriptFocused(page), true, "Enter did not return focus to the script");
      },
      { device: null, launch: ({ headless }) => launchEditorBrowser({ headless, display: display(name) }) },
    );
  });
}
