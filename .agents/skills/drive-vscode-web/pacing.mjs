import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnDetached } from "../../../scripts/detached-launch.mjs";
import { checkBuild, liveDeps, parseFlags } from "./driver.mjs";
import { connectCDP } from "./cdp.mjs";
import { command, ensurePreviewVisible, freePort, pollUntil, previewRead, stopDesktop } from "./desktop.mjs";
import { processStartedMs } from "../drive-web-editor/driver.mjs";
import { PACING_DEFAULTS, playLines, readFixture } from "../drive-web-editor/pacing-run.mjs";
import { QUIET_LIMIT_PERCENT, formatReport, repeatability } from "../drive-web-editor/pacing-analysis.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

export const PACING_FIXTURE = path.join(here, "fixtures", "pacing");

export const PACING_USAGE = [
  "pacing --code <executable> [options]: play lines in VS Code's Game Preview and report frame pacing for each",
  "  --project <folder> --line <n>  play a real project from line n of --file instead of the fixture",
  "  --file <name>          the script --line counts in (default main.sd)",
  "  --beats <n>            how many lines to play after the first with --project (default 10)",
  "  --runs <n>             launch and play this many times and compare the talking lines (default 1)",
  "  --rest <ms>            idle time before each click and after each line finishes typing (default 1500)",
  `  --quiet-limit <pct>    CPU load at or over which a run is marked not quiet (default ${QUIET_LIMIT_PERCENT})`,
  "  --out <dir>            evidence directory (default: a new temporary directory)",
  "  --keep-trace           keep each line's trace file",
  "  --timeout <seconds>    each setup wait (default 240)",
];

export function parsePacingArgs(args) {
  const { opts, error } = parseFlags(args, {
    "--code": "value",
    "--project": "value",
    "--line": "value",
    "--file": "value",
    "--beats": "value",
    "--runs": "value",
    "--rest": "value",
    "--quiet-limit": "value",
    "--out": "value",
    "--keep-trace": "flag",
    "--timeout": "value",
  });
  if (error) throw new Error(error);
  if (!opts["--code"]) throw new Error("pacing needs --code <VS Code executable>");
  const integer = (name, fallback, min) => {
    if (opts[name] == null) return fallback;
    const n = Number(opts[name]);
    if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be an integer of at least ${min}`);
    return n;
  };
  const project = opts["--project"] ? path.resolve(opts["--project"]) : null;
  if (project && opts["--line"] == null) throw new Error("--project needs --line <n>");
  if (!project && opts["--line"] != null) throw new Error("--line needs --project; the fixture starts at its own line");
  return {
    code: path.resolve(opts["--code"]),
    project,
    line: integer("--line", null, 1),
    file: opts["--file"] ?? "main.sd",
    beats: integer("--beats", PACING_DEFAULTS.beats, 1),
    runs: integer("--runs", 1, 1),
    restMs: integer("--rest", PACING_DEFAULTS.restMs, 0),
    quietLimit: integer("--quiet-limit", QUIET_LIMIT_PERCENT, 1),
    out: opts["--out"] ? path.resolve(opts["--out"]) : null,
    keepTrace: !!opts["--keep-trace"],
    timeout: integer("--timeout", 240, 1) * 1000,
  };
}

const SETTINGS = {
  "security.workspace.trust.enabled": false,
  "workbench.startupEditor": "none",
  "workbench.enableExperiments": false,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "extensions.autoUpdate": "off",
  "window.restoreWindows": "none",
  "window.newWindowDimensions": "maximized",
  "files.simpleDialog.enable": true,
  "extensions.ignoreRecommendations": true,
  "debug.saveBeforeStart": "none",
  "chat.disableAIFeatures": true,
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "git.enabled": false,
};

async function runOnce(options, plan, evidence) {
  fs.mkdirSync(evidence, { recursive: true });
  const run = { evidence, failed: [] };
  const profile = path.join(evidence, "profile");
  const extensions = path.join(evidence, "extensions");
  fs.mkdirSync(path.join(profile, "User"), { recursive: true });
  fs.mkdirSync(extensions, { recursive: true });
  fs.cpSync(path.join(here, "desktop-harness"), path.join(extensions, "impower-testing.impower-desktop-driver-1.0.0"), { recursive: true });
  fs.writeFileSync(path.join(profile, "User", "settings.json"), JSON.stringify(SETTINGS, null, 2));
  const scenario = path.join(evidence, "scenario.json");
  fs.writeFileSync(scenario, JSON.stringify({ file: plan.file, line: plan.line, expectedDiagnostics: [], project: plan.project, evidence, mode: "full" }, null, 2));
  let exited = false;
  let wire;
  let browser;
  let owner;
  const wait = (read, why, budget = options.timeout) => pollUntil(read, why, { timeout: budget, exited: () => exited });
  try {
    const port = await freePort();
    const endpoint = `http://127.0.0.1:${port}`;
    const log = fs.openSync(path.join(evidence, "desktop.log"), "a");
    const child = spawnDetached(
      options.code,
      [plan.project, `--extensionDevelopmentPath=${path.join(root, "vscode-sparkdown")}`, "--new-window", "--user-data-dir", profile, "--extensions-dir", extensions, `--remote-debugging-port=${port}`, "--disable-updates", "--disable-workspace-trust", "--disable-extension", "github.copilot", "--disable-extension", "github.copilot-chat"],
      { cwd: root, env: { ...process.env, IMPOWER_DESKTOP_SCENARIO: scenario }, stdio: ["ignore", log, log] },
    );
    fs.closeSync(log);
    child.once("exit", () => {
      exited = true;
    });
    owner = { pid: child.pid, startedMs: await processStartedMs(child.pid) };
    if (!owner.startedMs) throw new Error("Cannot establish desktop process identity");
    fs.writeFileSync(path.join(evidence, "owner.json"), JSON.stringify(owner));
    await wait(async () => {
      try {
        return (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1500) })).ok;
      } catch {
        return false;
      }
    }, "Desktop debugger endpoint never opened");
    wire = await connectCDP(endpoint);
    const { chromium } = await import("playwright");
    browser = await chromium.connectOverCDP(endpoint);
    for (const context of browser.contexts()) context.setDefaultTimeout(30000);
    const page = await wait(() => browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("workbench")), "No desktop workbench");
    await page.waitForSelector(".monaco-workbench", { timeout: options.timeout });
    for (const label of ["Continue without Signing In", "Get Started"]) {
      const button = page.getByText(label, { exact: true });
      if (await button.isVisible().catch(() => false)) await button.click();
    }
    await command(page, "Impower Driver: Run Scenario", "impower.driver.run");
    run.host = await wait(() => readJson(path.join(evidence, "host-report.json")), "The harness never opened the script and the Game Preview");
    if (run.host.failed?.length) run.failed.push(...run.host.failed);
    run.vscode = run.host.version ?? null;
    const target = await wait(async () => {
      const { targetInfos } = await wire.send("Target.getTargets");
      return targetInfos.find((t) => t.type === "iframe" && t.url.includes("extensionId=impowergames.sparkdown"));
    }, "Game Preview webview never opened");
    const { sessionId } = await wire.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await wire.send("Runtime.enable", {}, sessionId);
    const evaluate = async (expression) => {
      const result = await wire.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId, 120000);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const read = (step) => evaluate(`(${previewRead.toString()})(${JSON.stringify(step ?? null)})`);
    const inGame = (fn, arg) => evaluate(`(${fn.toString()})(document.getElementById("active-frame").contentWindow, ${JSON.stringify(arg ?? null)})`);
    const clickAt = async (step) => {
      const state = await wait(async () => {
        const s = await read(step).catch(() => null);
        return s?.target ? s : null;
      }, `no ${step.selector} in the preview`, 30000);
      const outer = await page.locator("iframe.webview").boundingBox();
      await page.mouse.click(outer.x + state.target.x, outer.y + state.target.y);
    };
    await wait(async () => {
      const state = await read().catch(() => null);
      return state?.visible && !state.playing && state.text ? state : null;
    }, "the preview never showed the starting line");
    await sleep(2000);
    await clickAt({ selector: "#run-button" });
    await wait(async () => (await read().catch(() => null))?.playing, "RUN never entered playback");
    await ensurePreviewVisible(page);
    await wait(async () => {
      const fired = await inGame((w) => w.performance.getEntriesByType("mark").some((m) => m.name.startsWith("beat fired ")));
      const state = await read().catch(() => null);
      return fired && state?.beatFinished ? state : null;
    }, "the first line never played after RUN", Math.max(options.timeout, 120000));
    const system = await wire.send("SystemInfo.getInfo", {}).catch(() => null);
    run.graphics = graphicsName(system);
    const on = (filter) => (name, handler) => wire.on((message) => {
      if (message.method === name && filter(message.sessionId)) handler(message.params);
    });
    const surface = {
      inGame,
      clickGame: () => clickAt({ selector: "#game" }),
      beatFinished: async () => (await read().catch(() => null))?.beatFinished === true,
      sendBrowser: (method, params) => wire.send(method, params, undefined, 120000),
      onBrowser: on((id) => !id),
      sendGame: (method, params) => wire.send(method, params, sessionId, 60000),
      onGame: on((id) => id === sessionId),
      screenshot: async (file) => {
        const box = await page.locator("iframe.webview").boundingBox();
        if (box) await page.screenshot({ path: file, clip: box });
      },
    };
    Object.assign(run, await playLines(surface, { ...options, out: evidence, fixture: plan.fixture, log: (line) => console.log(line) }));
  } catch (error) {
    run.failed.push(String(error?.stack ?? error));
  } finally {
    if (browser) await browser.close().catch(() => {});
    try {
      wire?.close();
    } catch {}
    if (owner?.startedMs) {
      try {
        await stopDesktop(owner);
        run.stopped = true;
      } catch (error) {
        run.failed.push(`Owned desktop shutdown failed: ${error.message}`);
      }
    }
    for (const dir of [profile, extensions]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
      } catch (error) {
        run.leftBehind = [...(run.leftBehind ?? []), `${dir}: ${error.code ?? error.message}`];
      }
    }
  }
  return run;
}

export function graphicsName(system) {
  const gpu = system?.gpu;
  if (!gpu) return null;
  const active = gpu.devices?.find((d) => d.active) ?? gpu.devices?.[0];
  return gpu.auxAttributes?.glRenderer || (active ? `${active.vendorString} ${active.deviceString}`.trim() : null);
}

export function headCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short=10", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  } catch {
    return null;
  }
}

export async function pacing(args) {
  let options;
  try {
    options = parsePacingArgs(args);
  } catch (error) {
    console.error([error.message, "", ...PACING_USAGE].join("\n"));
    return 2;
  }
  if (!["win32", "linux"].includes(process.platform)) throw new Error("The desktop pacing check needs Windows or Linux process ownership support");
  checkBuild({ ...liveDeps, surface: "desktop", die: (message) => { throw new Error(message); } });
  const fixture = options.project ? null : readFixture(PACING_FIXTURE);
  if (!options.project && !fixture) throw new Error(`The pacing fixture is missing: ${PACING_FIXTURE}`);
  const plan = {
    project: options.project ?? path.join(PACING_FIXTURE, "project"),
    file: options.project ? options.file : (fixture.script ?? "main.sd"),
    line: options.project ? options.line : fixture.start,
    fixture,
  };
  const out = options.out ?? fs.mkdtempSync(path.join(os.tmpdir(), "impower-pacing-"));
  if (fs.existsSync(path.join(out, "report.json"))) throw new Error(`Evidence directory already used: ${out}`);
  fs.mkdirSync(out, { recursive: true });
  const report = {
    surface: "VS Code Game Preview",
    project: options.project ?? "fixture",
    file: plan.file,
    startLine: plan.line,
    commit: headCommit(),
    machine: { platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? null, cores: os.cpus().length },
    runs: [],
  };
  for (let i = 1; i <= options.runs; i++) {
    console.log(`pacing: run ${i} of ${options.runs}`);
    report.runs.push(await runOnce(options, plan, path.join(out, `run-${i}`)));
  }
  const first = report.runs.find((r) => r.environment) ?? {};
  report.environment = { gameView: first.environment?.gameView ?? null, devicePixelRatio: first.environment?.devicePixelRatio ?? null, refreshHz: first.environment?.refreshHz ?? null, graphics: first.graphics ?? null, cpu: report.machine.cpu, vscode: first.vscode ?? null };
  report.repeatability = repeatability(report.runs);
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(formatReport(report));
  console.log(`report: ${path.join(out, "report.json")}`);
  return report.runs.some((r) => r.failed.length) ? 1 : 0;
}
