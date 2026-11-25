import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { privateLaunch } from "./measure.mjs";
import { PACING_DEFAULTS, playLines, readFixture } from "./pacing-run.mjs";
import { QUIET_LIMIT_PERCENT, formatReport, repeatability } from "./pacing-analysis.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");

export const PACING_FIXTURE = path.join(root, ".agents", "skills", "drive-vscode-web", "fixtures", "pacing");

export const PACING_USAGE = [
  "pacing [options]: play lines in the web editor's preview and report frame pacing for each",
  "  --project <dir> --line <n>  play a real project from line n of its main.sd instead of the fixture",
  "  --beats <n>            how many lines to play after the first with --project (default 10)",
  "  --runs <n>             play this many times, each in a new browser, and compare the talking lines (default 1)",
  "  --rest <ms>            idle time before each click and after each line finishes typing (default 1500)",
  `  --quiet-limit <pct>    CPU load at or over which a run is marked not quiet (default ${QUIET_LIMIT_PERCENT})`,
  "  --out <dir>            evidence directory (default: a new temporary directory)",
  "  --keep-trace           keep each line's trace file",
  "  --headless             run headless; the default is a visible browser, whose frames reach a real display",
];

export function parsePacingArgs(args) {
  const out = { beats: PACING_DEFAULTS.beats, runs: 1, restMs: PACING_DEFAULTS.restMs, quietLimit: QUIET_LIMIT_PERCENT, keepTrace: false, headed: true };
  const value = (i, name) => {
    const v = args[i + 1];
    if (v == null || v === "" || v.startsWith("--")) throw new Error(`${name} needs a value`);
    return v;
  };
  const integer = (text, name, min) => {
    const n = Number(text);
    if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be an integer of at least ${min}`);
    return n;
  };
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    switch (name) {
      case "--project":
        out.project = path.resolve(value(i++, name));
        break;
      case "--line":
        out.line = integer(value(i++, name), name, 1);
        break;
      case "--beats":
        out.beats = integer(value(i++, name), name, 1);
        break;
      case "--runs":
        out.runs = integer(value(i++, name), name, 1);
        break;
      case "--rest":
        out.restMs = integer(value(i++, name), name, 0);
        break;
      case "--quiet-limit":
        out.quietLimit = integer(value(i++, name), name, 1);
        break;
      case "--out":
        out.out = path.resolve(value(i++, name));
        break;
      case "--keep-trace":
        out.keepTrace = true;
        break;
      case "--headless":
        out.headed = false;
        break;
      default:
        throw new Error(`unknown pacing argument ${name}`);
    }
  }
  if (out.project && out.line == null) throw new Error("--project needs --line <n>");
  if (!out.project && out.line != null) throw new Error("--line needs --project; the fixture starts at its own line");
  return out;
}

function playerFrame(page) {
  return page.frames().find((f) => f !== page.mainFrame() && /\/__player\//.test(f.url()));
}

export function gameStateWatch() {
  if (window.__pacingState) return;
  window.__pacingState = { finished: null };
  window.__editorProtocol.subscribe((message) => {
    if (message?.method === "preview/didChangeGameState") window.__pacingState.finished = message.params?.shownBeatFinished === true;
  });
}

export function webglRenderer(w) {
  try {
    const gl = w.document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  } catch {
    return null;
  }
}

async function runOnce(options, plan, evidence, deps) {
  fs.mkdirSync(evidence, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-pacing-"));
  const run = { evidence, failed: [] };
  let pageConsole = [];
  try {
    await deps.withEditor(
      async ({ page, url, consoleLines }) => {
        pageConsole = consoleLines;
        await deps.openEditorPage(page, url);
        await deps.waitForApp(page);
        const seed = await deps.seedProject(page, plan.project, { expectMainSd: true });
        if (seed.reason) throw new Error(`seed failed: ${seed.reason}`);
        await deps.reloadEditorPage(page);
        await deps.waitForApp(page);
        await deps.switchScreen(page, "logic", { followedByMain: true }).catch(() => {});
        await deps.switchScreen(page, "main").catch(() => {});
        await deps.scriptEditorPresent(page, 60_000);
        await deps.settleEditor(page, 120_000);
        const mount = await deps.waitForGame(page);
        if (!mount.mounted) throw new Error(`the game never mounted; try \`down\` then \`up\`${mount.error ? ` (${mount.error})` : ""}`);
        const program = await deps.waitForProgram(page, 180_000);
        if (!program.loaded) throw new Error("the player loaded no program within 180 s");
        const frame = playerFrame(page);
        if (!frame) throw new Error("no same-origin player frame; the pacing command needs `up` without --cross-origin");
        await page.evaluate(gameStateWatch);
        const scrub = await deps.clickLine(page, plan.line);
        if (!scrub.clicked || scrub.position?.line !== plan.line - 1) throw new Error(`the preview did not move to line ${plan.line}: ${JSON.stringify(scrub)}`);
        await page.waitForTimeout(2000);
        await page.locator('[aria-label="Play From Here"]').click();
        const inGame = (fn, arg) => frame.evaluate(({ source, arg }) => (0, eval)(`(${source})`)(window, arg), { source: fn.toString(), arg: arg ?? null });
        const firstBy = Date.now() + 120_000;
        for (;;) {
          const fired = await inGame((w) => w.performance.getEntriesByType("mark").some((m) => m.name.startsWith("beat fired "))).catch(() => false);
          const finished = await page.evaluate(() => window.__pacingState?.finished === true);
          if (fired && finished) break;
          if (Date.now() > firstBy) throw new Error("the first line never played after Play From Here");
          await page.waitForTimeout(200);
        }
        const cdp = await page.context().newCDPSession(page);
        const on = (name, handler) => {
          cdp.on(name, handler);
          return () => cdp.off(name, handler);
        };
        const send = (method, params) => cdp.send(method, params);
        const system = await send("SystemInfo.getInfo", {}).catch(() => null);
        run.graphics = system?.gpu?.auxAttributes?.glRenderer ?? (await inGame(webglRenderer));
        run.browser = await page.evaluate(() => navigator.userAgent);
        run.headed = options.headed;
        const surface = {
          inGame,
          clickGame: () => frame.locator("#game").click({ timeout: 10_000 }),
          beatFinished: () => page.evaluate(() => window.__pacingState?.finished === true),
          sendBrowser: send,
          onBrowser: on,
          sendGame: send,
          onGame: on,
          screenshot: (file) => page.screenshot({ path: file }),
        };
        Object.assign(run, await playLines(surface, { ...options, out: evidence, fixture: plan.fixture, log: deps.log }));
        await cdp.detach().catch(() => {});
      },
      { headless: !options.headed, launch: privateLaunch(deps, path.join(scratch, "profile")) },
    );
  } catch (error) {
    run.failed.push(String(error?.stack ?? error));
  } finally {
    run.consoleErrors = pageConsole.filter((l) => /error/i.test(l)).slice(-10);
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
  return run;
}

export async function pacing(args, deps) {
  let options;
  try {
    options = parsePacingArgs(args);
  } catch (error) {
    return deps.die([error.message, "", ...PACING_USAGE].join("\n"));
  }
  const fixture = options.project ? null : readFixture(PACING_FIXTURE);
  if (!options.project && !fixture) return deps.die(`The pacing fixture is missing: ${PACING_FIXTURE}`);
  const plan = {
    project: options.project ?? path.join(PACING_FIXTURE, "project"),
    line: options.project ? options.line : fixture.start,
    fixture,
  };
  const out = options.out ?? fs.mkdtempSync(path.join(os.tmpdir(), "impower-pacing-"));
  if (fs.existsSync(path.join(out, "report.json"))) return deps.die(`Evidence directory already used: ${out}`);
  fs.mkdirSync(out, { recursive: true });
  let commit = null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short=10", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  } catch {}
  const report = {
    surface: "web editor preview",
    project: options.project ?? "fixture",
    file: "main.sd",
    startLine: plan.line,
    commit,
    machine: { platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? null, cores: os.cpus().length },
    runs: [],
  };
  for (let i = 1; i <= options.runs; i++) {
    deps.log(`pacing: run ${i} of ${options.runs}`);
    report.runs.push(await runOnce(options, plan, path.join(out, `run-${i}`), deps));
  }
  const first = report.runs.find((r) => r.environment) ?? {};
  report.environment = { gameView: first.environment?.gameView ?? null, devicePixelRatio: first.environment?.devicePixelRatio ?? null, refreshHz: first.environment?.refreshHz ?? null, graphics: first.graphics ?? null, cpu: report.machine.cpu, browser: first.browser ?? null, headed: options.headed };
  report.repeatability = repeatability(report.runs);
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  deps.log(formatReport(report));
  deps.log(`report: ${path.join(out, "report.json")}`);
  if (report.runs.some((r) => r.failed.length)) process.exitCode = 1;
  return report;
}
