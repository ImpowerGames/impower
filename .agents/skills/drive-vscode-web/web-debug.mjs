import { command } from "./desktop.mjs";

// The inline debug adapter also runs in the served workbench. Keep this UI
// path separate from desktop DAP checks and from unsupported web breakpoints.
export async function debugWorkbench(page, { expression, result, screenshot }) {
  const report = { breakpointBinding: "unverified: served source URI mapping", failed: [] };
  try {
    await command(page, "Sparkdown: Preview Game", "sparkdown.previewGame");
    await page.locator("iframe.webview").waitFor({ timeout: 60000 });
    // The panel is mounted before the extension has received its ready event.
    // Wait for actual story text before dispatching the debugger command.
    await page.frameLocator("iframe.webview").frameLocator("#active-frame").locator("#game span").first().waitFor({ timeout: 60000 });
    // Opening at line one need not produce a selection-change event. Select
    // a script position just as an author does before using Run & Debug.
    await page.locator(".monaco-editor .view-line").first().click();
    await page.keyboard.press("ArrowRight");
    const run = page.frameLocator("iframe.webview").frameLocator("#active-frame").locator("#play-button");
    if (await run.isVisible()) {
      await run.hover();
      await run.click();
      await run.waitFor({ state: "hidden", timeout: 30000 });
    }
    await page.locator(".debug-toolbar").waitFor({ timeout: 60000 });
    if (await page.locator(".debug-toolbar .codicon-debug-continue").isVisible()) {
      await page.locator(".debug-toolbar .codicon-debug-continue").click();
    }
    await page.locator(".debug-toolbar .codicon-debug-pause").waitFor({ timeout: 30000 });
    await command(page, "Debug: Pause", "workbench.action.debug.pause");
    await command(page, "View: Run and Debug", "workbench.view.debug");
    const stack = page.locator(".debug-call-stack .monaco-list-row");
    await stack.first().waitFor({ timeout: 30000 });
    report.stack = await stack.allTextContents();
    const scopes = page.locator(".debug-variables .monaco-list-row");
    await scopes.first().waitFor({ timeout: 30000 });
    const vars = scopes.filter({ hasText: /^Vars$/ });
    await vars.locator(".monaco-tl-twistie").click();
    await page.waitForFunction(() => document.querySelectorAll(".debug-variables .monaco-list-row").length > 4);
    report.variables = await scopes.allTextContents();
    await command(page, "View: Debug Console", "workbench.debug.action.toggleRepl");
    const input = page.locator(".repl-input-wrapper .view-lines");
    await input.click();
    await page.keyboard.type(expression);
    await page.keyboard.press("Enter");
    const evaluation = page.locator(".repl .evaluation-result").last();
    await evaluation.waitFor({ timeout: 30000 });
    report.evaluation = (await evaluation.innerText()).trim();
    if (report.evaluation !== result) throw new Error(`Debug Console returned ${report.evaluation}, expected ${result}`);
    await command(page, "Debug: Step Over", "workbench.action.debug.stepOver");
    await page.locator(".debug-toolbar .codicon-debug-continue").waitFor({ timeout: 30000 });
    await page.waitForFunction(previous => {
      const frames = [...document.querySelectorAll(".debug-call-stack .monaco-list-row")].map(el => el.textContent);
      return frames.length > 0 && JSON.stringify(frames) !== JSON.stringify(previous);
    }, report.stack, { timeout: 30000 });
    report.stepped = await stack.allTextContents();
    if (screenshot) await page.screenshot({ path: screenshot });
    await command(page, "Debug: Continue", "workbench.action.debug.continue");
    // Sparkdown pauses again at author interactions. Continue is successful
    // when execution runs or reaches a different stopped frame.
    await page.waitForFunction(previous => {
      if (document.querySelector(".debug-toolbar .codicon-debug-pause")) return true;
      const frames = [...document.querySelectorAll(".debug-call-stack .monaco-list-row")].map(el => el.textContent);
      return frames.length > 0 && JSON.stringify(frames) !== JSON.stringify(previous);
    }, report.stepped, { timeout: 30000 });
    report.afterContinue = await stack.allTextContents();
    report.continued = true;
  } catch (error) {
    report.failed.push(String(error.message ?? error));
  }
  return report;
}
