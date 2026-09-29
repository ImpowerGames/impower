// Structured editor data is the only reviewer-authored input executed here.
// The coordinator selects every executable, flag, path and session identity.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const editorRequestBytes = 128 * 1024;
const name = /^[a-z][a-z0-9-]{0,63}$/;
const object = value => value && typeof value === "object" && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const text = (value, max) => typeof value === "string" && value.length <= max && !value.includes("\u0000");
const position = value => Number.isInteger(value) && value > 0 && value <= 100000;
const member = (value, values) => values.includes(value);
const panels = ["find", "goto"];
const targets = ["page", "editor", "find", "goto", "hover", "completion"];
const presses = ["Escape", "Enter", "Tab", "Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Control+Home", "Control+End", "Control+a", "Control+z", "Control+Shift+z", "Shift+ArrowLeft", "Shift+ArrowRight", "Shift+ArrowUp", "Shift+ArrowDown"];

export function validateEditorRequest(value) {
  if (!keys(value, ["requestId", "command", "script", "steps", "line"]) || !name.test(value.requestId ?? "") || !member(value.command, ["ui", "verify"])) throw new Error("Editor request needs requestId and command ui or verify; no paths or extra fields");
  if (value.script !== undefined && !text(value.script, 65536)) throw new Error("Editor script must be text up to 65536 characters without NUL");
  if (value.command === "verify") {
    if (value.steps !== undefined || (value.line !== undefined && !position(value.line))) throw new Error("verify accepts only script and a positive line");
    return value;
  }
  if (value.line !== undefined || !Array.isArray(value.steps) || value.steps.length > 30) throw new Error("ui needs 0..30 steps and no line field");
  for (const step of value.steps) {
    let valid = false;
    if (object(step)) switch (step.action) {
      case "open": case "close": valid = keys(step, ["action", "value"]) && member(step.value, panels); break;
      case "screen": valid = keys(step, ["action", "value"]) && member(step.value, ["logic", "assets", "share", "main", "scripts", "files", "urls", "game", "screenplay"]); break;
      case "click": valid = keys(step, ["action", "value"]) && member(step.value, ["next", "prev", "select", "replace", "replaceAll", "close", "submit"]); break;
      case "toggle": valid = keys(step, ["action", "value"]) && member(step.value, ["case", "re", "word"]); break;
      case "press": valid = keys(step, ["action", "value"]) && member(step.value, presses); break;
      case "type": valid = keys(step, ["action", "field", "text"]) && member(step.field, ["search", "replace", "line"]) && text(step.text, 4096); break;
      case "hover": valid = keys(step, ["action", "line", "column"]) && position(step.line) && position(step.column); break;
      case "complete": valid = keys(step, ["action", "line", "column", "text"]) && position(step.line) && position(step.column) && text(step.text, 4096) && step.text.length > 0; break;
      case "shot": valid = keys(step, ["action", "target"]) && member(step.target, targets); break;
    }
    if (!valid) throw new Error("Unknown or invalid editor step; only bounded built-in UI actions are delegated");
  }
  if (value.steps.filter(step => step.action === "shot").length > 4) throw new Error("At most four surface screenshots per request");
  // Text becomes argv. JSON escaping conservatively accounts for quotes and
  // backslashes; leave the rest of Windows' 32767-character limit for paths.
  if (JSON.stringify(value.steps).length > 16384) throw new Error("Editor step payload exceeds 16384 serialized characters; split it into smaller requests");
  return value;
}

export const executionPassed = result => result.exit === 0 && !result.signal && !result.timedOut && !result.launchError && !result.stopError;

export function createEditorSession(command, root, directory, run) {
  const session = `review-${randomUUID()}`;
  const environment = { IMPOWER_DRIVER_SESSION: session };
  // This cache is coordinator configuration, never a reviewer request field.
  if (process.env.PLAYWRIGHT_BROWSERS_PATH !== undefined) environment.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const sessionDirectory = fs.mkdtempSync(path.join(directory, `editor-${command.id}-`));
  fs.writeFileSync(path.join(sessionDirectory, "session.json"), JSON.stringify({ root, session, driver: command.args[0] }), { flag: "wx" });
  let started = false;
  const invoke = async (id, args, dir) => run({ id, args: [command.args[0], ...args], timeoutSeconds: command.timeoutSeconds, environment }, root, dir);
  return {
    async run(request) {
      // Validate before creating files, starting servers or invoking the driver.
      validateEditorRequest(request);
      const requestDirectory = fs.mkdtempSync(path.join(sessionDirectory, "request-"));
      fs.writeFileSync(path.join(requestDirectory, "request.json"), JSON.stringify(request, null, 2), { flag: "wx" });
      if (!started) {
        started = true; // Even a failed startup must be drained through down.
        const result = await invoke("up", ["up"], sessionDirectory);
        if (!executionPassed(result)) throw new Error(`Editor startup failed; inspect ${result.log ?? sessionDirectory}`);
      }
      const args = [request.command], screenshots = [];
      if (request.script !== undefined) {
        const script = path.join(requestDirectory, "main.sd");
        fs.writeFileSync(script, request.script, { flag: "wx" });
        args.push("--sd", script);
      }
      const shot = target => {
        const file = path.join(requestDirectory, `image-${screenshots.length}.png`);
        screenshots.push(file);
        return target === "page" ? ["--shot", file] : ["--shot-of", target, file];
      };
      if (request.command === "verify") {
        if (request.line !== undefined) args.push("--line", String(request.line));
      } else for (const step of request.steps) {
        if (step.action === "type") args.push("--type", `${step.field}=${step.text}`);
        else if (step.action === "hover") args.push("--hover", `${step.line}:${step.column}`);
        else if (step.action === "complete") args.push("--complete", `${step.line}:${step.column}=${step.text}`);
        else if (step.action === "shot") args.push(...shot(step.target));
        else args.push(`--${step.action}`, step.value);
      }
      args.push(...shot("page"));
      const result = await invoke("attempt", args, requestDirectory);
      // A failed UI attempt still has useful screenshots and a transcript.
      const images = screenshots.filter(file => fs.existsSync(file));
      return { ...result, requestId: request.requestId, session, images };
    },
    async close() {
      if (!started) return;
      started = false;
      const result = await invoke("down", ["down"], sessionDirectory);
      if (!executionPassed(result)) throw new Error(`Editor shutdown unverified; preserve ${sessionDirectory} and inspect ${result.log ?? "driver state"}`);
    },
  };
}

// Only coordinator-generated files are returned, never a path from a request.
export function editorImages(files = []) {
  return files.map((file, index) => {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error("Invalid or oversized editor screenshot");
    const bytes = fs.readFileSync(file);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Editor screenshot is not PNG");
    return { name: `image-${index}.png`, base64: bytes.toString("base64") };
  });
}
