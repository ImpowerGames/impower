import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auditScan, focusState, motionRecorder, tokenPairs } from "./audit-page.mjs";
import { parseViewport } from "./viewport.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

export const AUDIT_THEMES = [
  { id: "charcoal", name: "Charcoal", bar: true },
  { id: "chalk", name: "Chalk", bar: true },
  { id: "ink", name: "Ink" },
  { id: "paper", name: "Sepia" },
  { id: "graphite", name: "Graphite", surfaces: "unified", syntax: "softened" },
  { id: "warm", name: "Warm Folio", surfaces: "unified", syntax: "softened" },
  { id: "midnight", name: "Midnight" },
  { id: "dusk", name: "Dusk" },
];

export const AUDIT_ROUTES = ["write", "scripts", "collection", "share", "project"];

export const ROUTE_NAMES = { write: "Story", scripts: "Scripts", collection: "Assets", share: "Share", project: "Settings" };

export const AUDIT_PARTS = ["contrast", "axe", "targets", "keyboard", "escape", "shortcuts", "motion", "forced", "copy", "structure"];

export const TOKEN_PAIRS = [
  ["--ink", "--bg"], ["--ink", "--panel"], ["--ink", "--paper"], ["--ink", "--workspace"], ["--ink", "--elevated"], ["--ink", "--tint"], ["--ink", "--selection"],
  ["--muted", "--bg"], ["--muted", "--panel"], ["--muted", "--paper"], ["--muted", "--workspace"], ["--muted", "--elevated"], ["--muted", "--tint"], ["--muted", "--preview-mat"],
  ["--accent", "--bg"], ["--accent", "--panel"], ["--accent", "--workspace"], ["--accent", "--tint"], ["--accent-ink", "--accent"],
  ["--error", "--panel"], ["--error", "--workspace"], ["--warning", "--panel"], ["--warning", "--workspace"], ["--warning", "--tint"], ["--warning", "--elevated"], ["--warning", "--preview-mat"], ["--success", "--panel"], ["--success", "--workspace"],
  ["--bg", "--ink"],
];

export const SURFACES = [
  { step: "app-menu", route: "write", selector: '[role="menu"], [role="dialog"]' },
  { step: "add-menu", route: "write", selector: '[role="dialog"][aria-label="Add to script"]' },
  { step: "preview-settings", route: "write", selector: '[role="menu"]' },
  { step: "problems", route: "write", selector: '[role="dialog"]' },
  { step: "file-menu", route: "scripts", selector: '[role="menu"]' },
  { step: "asset-inspector", route: "collection", selector: 'section[aria-label="Asset details"]' },
];

export const BANNED_WORDS = [
  { word: "URL", test: /\bURLs?\b/ },
  { word: "cache", test: /\bcach(?:e|es|ed|ing)\b/i },
  { word: "Logic", test: /\bLogic\b/ },
  { word: "Untitled Game", test: /\bUntitled Game\b/i },
];

export const AUDIT_USAGE = [
  "audit options:",
  "  --out <dir>             where the JSON report, the screenshots and the reduced-motion recordings go (required)",
  "  --doc <file>            rewrite the generated part of this markdown file (between its audit:begin and audit:end markers)",
  "  --parts <a,b,...>       run only these checks: " + AUDIT_PARTS.join(", ") + " (default: all)",
  "  --themes <a,b,...>      theme ids for the contrast pass (default: all eight; Automatic resolves to Charcoal or Chalk)",
  "  --routes <a,b,...>      routes to visit: " + AUDIT_ROUTES.join(", ") + " (default: all)",
  "  --commit <sha>          the commit the audit names (default: the checkout's HEAD)",
  "  --headed                run a visible browser instead of headless",
  "  --device android        run only the touch-target and on-screen keyboard checks, on the emulator at its own width,",
  "                          into <out>/audit-device.json; a later run with the same --out includes that file",
];

const list = (text, name, allowed) => {
  const values = String(text).split(",").map((v) => v.trim()).filter(Boolean);
  if (!values.length) throw new Error(`${name} needs at least one value`);
  const bad = allowed ? values.filter((v) => !allowed.includes(v)) : [];
  if (bad.length) throw new Error(`${name} takes ${allowed.join(", ")}; got ${bad.join(", ")}`);
  return values;
};

export function parseAuditArgs(args) {
  const out = { parts: [...AUDIT_PARTS], themes: AUDIT_THEMES.map((t) => t.id), routes: [...AUDIT_ROUTES], headed: false };
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    const value = () => {
      const v = args[++i];
      if (v == null || v === "" || v.startsWith("--")) throw new Error(`${name} needs a value`);
      return v;
    };
    switch (name) {
      case "--out": out.out = value(); break;
      case "--doc": out.doc = value(); break;
      case "--parts": out.parts = list(value(), name, AUDIT_PARTS); break;
      case "--themes": out.themes = list(value(), name, AUDIT_THEMES.map((t) => t.id)); break;
      case "--routes": out.routes = list(value(), name, AUDIT_ROUTES); break;
      case "--commit": out.commit = value(); break;
      case "--headed": out.headed = true; break;
      default: throw new Error(`unknown audit argument ${name}`);
    }
  }
  if (!out.out) throw new Error("audit needs --out <dir>");
  return out;
}

export function luminance({ r, g, b }) {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function contrastFailures(rows, { script = false } = {}) {
  return rows.filter((row) => row.ratio < row.needs && !row.unresolved && (script || !row.script));
}

export function bannedWords(strings) {
  const hits = [];
  for (const s of strings) for (const { word, test } of BANNED_WORDS) if (test.test(s.text)) hits.push({ word, ...s });
  return hits;
}

export function glossaryStrings(markdown) {
  const out = new Set();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const first = line.split("|")[1] ?? "";
    for (const m of first.matchAll(/`([^`]+)`/g)) {
      const value = m[1].trim();
      if (/[A-Za-z]/.test(value) && !/[{}<>$]/.test(value)) out.add(value);
    }
  }
  return out;
}

const PROPER = /^(?:I|OK|Sparkdown|Spark|Engine|Google|Drive|Charcoal|Chalk|Ink|Sepia|Graphite|Warm|Folio|Midnight|Dusk|Main|Story|Scripts|Assets|Share|Settings|Images|Audio|Video|Text|Fonts|Other|Outline|Problems|Choice|Menu|Windows|Mac|Android|iPhone|NVDA|Ctrl|Alt|Shift|Enter|Escape|Esc|Tab|Space|Backspace|Delete|Home|End|PageUp|PageDown|F\d+|Cmd|Option|Up|Down|Left|Right|ID|PNG|SVG|JPG|JPEG|GIF|MP3|OGG|WAV|MP4|WebM|TTF|OTF|WOFF2?|ZIP|HTML|CSS|JSON|GitHub|itch\.io|Unicode|Courier|Prime|Sans|Georgia|Open)$/;

export const FIXTURE_WORDS = /\b(?:Mara|HARBOR|BOAT|TIDE|harbor|pier|boat\.sd|Gulls|MARA)\b/;

export function titleCaseWords(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const flagged = [];
  for (let i = 1; i < tokens.length; i++) {
    const previous = tokens[i - 1];
    const word = tokens[i].replace(/^[“"'‘(\[]+|[”"'’)\].,:;!?…]+$/g, "");
    if (/[.:!?·…]["”’)]?$/.test(previous) || previous === "·" || /^[(“"‘]/.test(tokens[i])) continue;
    if (previous === "VS" && word === "Code") continue;
    if (/\+/.test(word) || !/^[A-Z][a-z]/.test(word) || PROPER.test(word)) continue;
    flagged.push(word);
  }
  return flagged;
}

export function copyFindings(strings, glossary) {
  const lower = new Map([...glossary].map((g) => [g.toLowerCase(), g]));
  strings = strings.filter((s) => !FIXTURE_WORDS.test(s.text));
  const banned = bannedWords(strings);
  const caseMismatch = [];
  const titleCase = [];
  for (const s of strings) {
    if (glossary.has(s.text)) continue;
    const wanted = lower.get(s.text.toLowerCase());
    if (wanted && wanted.slice(1) !== s.text.slice(1)) {
      caseMismatch.push({ ...s, wanted });
      continue;
    }
    if (s.role || s.source !== "text") {
      let masked = s.text;
      for (const g of glossary) if (g.length >= 5 && /[A-Z].*\s+[A-Z]/.test(g) && masked.includes(g)) masked = masked.split(g).join(g.toLowerCase());
      const words = titleCaseWords(masked);
      if (words.length) titleCase.push({ ...s, words });
    }
  }
  const seen = new Set(strings.map((s) => s.text));
  const found = [...glossary].filter((g) => seen.has(g)).length;
  return { banned, caseMismatch, titleCase, glossary: { strings: glossary.size, seenAsWritten: found } };
}

export const FIXTURE = {
  "main.sd": [
    "store gold = 10",
    "",
    "scene start",
    "  -> HARBOR",
    "end",
    "",
    "scene HARBOR",
    "  [[show backdrop harbor]]",
    "  $: EXT. HARBOR - DAWN",
    "",
    "  Gulls circle over the quiet water.",
    "",
    "  MARA:",
    "    We leave at first light, or not at all.",
    "",
    "  choose",
    "    What does Mara do?",
    "    * [Ready the boat.]",
    "      -> BOAT",
    "    * [Wait for the tide.]",
    "      -> TIDE",
    "  end",
    "end",
    "",
  ].join("\n"),
  "scripts/boat.sd": [
    "scene BOAT",
    "  MARA:",
    "    Untie the lines. We go now.",
    "  -> END",
    "end",
    "",
    "scene TIDE",
    "  The water rises slowly against the pier.",
    "  -> END",
    "end",
    "",
  ].join("\n"),
  "Assets/Images/harbor.png": () => solidPng(320, 180, [59, 110, 143]),
  "Assets/Images/pier.png": () => solidPng(320, 180, [201, 177, 138]),
};

export function solidPng(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export const SHORTCUT_CARET = { line: 14, col: 9 };

const SYMBOL_CARET = { line: 4, col: 8 };
const BODY_LINE = { line: 11, col: 1 };

export const SHORTCUT_SETUPS = {
  undo: { steps: [{ type: "x" }] },
  redo: { steps: [{ type: "x" }, { press: "Control+z" }] },
  undoSelection: { steps: [{ press: "ArrowRight" }, { press: "ArrowRight" }] },
  redoSelection: { steps: [{ press: "ArrowRight" }, { press: "Control+u" }] },
  format: { caret: BODY_LINE, steps: [{ type: "     " }] },
  reindent: { caret: BODY_LINE, steps: [{ type: "     " }, { press: "Control+a" }] },
  problems: { steps: [{ click: 'button[aria-expanded="true"][aria-label$=" problems"]' }] },
  rename: { caret: SYMBOL_CARET },
  definition: { caret: SYMBOL_CARET },
  references: { caret: SYMBOL_CARET },
  selectMatches: { steps: [{ press: "Control+d" }] },
  matchingBracket: { caret: { line: 8, col: 3 } },
};

export function writeFixture(dir) {
  for (const [rel, content] of Object.entries(FIXTURE)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === "function" ? content() : content);
  }
  return dir;
}

export function playwrightCombo(keys) {
  const map = { Mod: "Control", Ctrl: "Control", Up: "ArrowUp", Down: "ArrowDown", Left: "ArrowLeft", Right: "ArrowRight" };
  return keys.split("+").map((k, i, all) => (i === all.length - 1 && k === "" ? "+" : map[k] ?? k)).filter((k, i, all) => k !== "" || i === all.length - 1).join("+");
}

export async function editorShortcutRows() {
  const table = await import(pathToFileURL(path.join(REPO, "packages/codemirror-vscode-lsp-client/src/shortcutTable.ts")).href);
  return table.EDITOR_SHORTCUT_ROWS.map((row) => ({ id: row.id, name: row.name, keys: table.platformKeys(row.keys, "win") })).filter((row) => row.keys);
}

const started = Date.now();
const progress = (text) => process.stderr.write(`audit +${Math.round((Date.now() - started) / 1000)}s ${text}\n`);

const fmt = (n) => (n == null ? "–" : n.toFixed(2));
const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function renderMarkdown(report) {
  const lines = [];
  const push = (...l) => lines.push(...l);
  push(`Generated by \`node .agents/skills/drive-web-editor/driver.mjs audit\` on ${report.date} (UTC) at commit \`${report.commit}\`, in headless Chromium ${report.browser ?? ""}.`.replace(/ ,/, ","), "");
  if (report.tokens) {
    push("### Token pairs", "", "WCAG 2 contrast of each theme's semantic colour pairs, alpha composited over the surface. Text pairs need 4.5:1.", "");
    const themes = report.tokens.themes;
    push(`| Text | On | ${themes.map((t) => t.name).join(" | ")} |`, `|---|---|${themes.map(() => "---|").join("")}`);
    TOKEN_PAIRS.forEach(([fg, bg], i) => {
      push(`| \`${fg}\` | \`${bg}\` | ${themes.map((t) => { const v = report.tokens.values[t.id]?.[i]; return v == null ? "–" : v < 4.5 ? `**${fmt(v)}**` : fmt(v); }).join(" | ")} |`);
    });
    push("");
  }
  if (report.contrast) {
    push("### Rendered contrast", "", "Every visible text, icon and form-control boundary on each route and opened surface, measured from computed styles. Text needs 4.5:1 (3:1 at 24px, or 18.66px bold), icons and control boundaries 3:1. Disabled controls and the script's own syntax colours are counted apart.", "");
    push("| Theme | Viewport | Checked | Failures | Script-colour failures | Not measured |", "|---|---|---|---|---|---|");
    for (const row of report.contrast.summary) push(`| ${row.theme} | ${row.viewport} | ${row.checked} | ${row.failures} | ${row.scriptFailures} | ${row.unresolved} |`);
    push("");
    const failing = report.contrast.failures;
    if (failing.length) {
      push("Failures, one row per element and colour pair:", "", "| Theme | Viewport | Surface | Kind | Element | Sample | Colours | Ratio | Needs |", "|---|---|---|---|---|---|---|---|---|");
      for (const f of failing.slice(0, 400)) push(`| ${f.theme} | ${f.viewport} | ${cell(f.surface)} | ${f.kind} | ${cell(f.where)} | ${cell(f.sample)} | \`${f.fg}\` on \`${f.bg}\` | ${fmt(f.ratio)} | ${f.needs} |`);
      if (failing.length > 400) push(`| … | | | | ${failing.length - 400} more rows in the JSON report | | | | |`);
      push("");
    }
    if (report.contrast.unmeasured?.length) {
      push("Not measured in Charcoal and Chalk, because no boundary is drawn or the backdrop is an image:", "", "| Viewport | Surface | Element | Sample | Reason |", "|---|---|---|---|---|");
      for (const u of report.contrast.unmeasured) push(`| ${u.viewport} | ${cell(u.surface)} | ${cell(u.where)} | ${cell(u.sample)} | ${cell(u.reason)} |`);
      push("");
    }
  }
  if (report.axe) {
    push("### axe-core", "", `axe-core ${report.axe.version}, WCAG 2.0 and 2.1 A and AA rules, on every route and surface in Charcoal and Chalk.`, "");
    push("| Theme | Viewport | Surface | Rule | Impact | Nodes | First element |", "|---|---|---|---|---|---|---|");
    for (const v of report.axe.violations) push(`| ${v.theme} | ${v.viewport} | ${cell(v.surface)} | \`${v.id}\` | ${v.impact} | ${v.nodes} | \`${cell((v.html?.[0] ?? v.targets?.[0] ?? "").replace(/\s+class="[^"]*"/g, "").replace(/`/g, "'").slice(0, 120))}\` |`);
    if (!report.axe.violations.length) push("| all | all | all | none | | 0 | |");
    push("");
  }
  if (report.targets) {
    const device = report.device;
    const summary = [...report.targets.summary, ...(device?.targets.summary ?? [])];
    const failures = [...report.targets.failures, ...(device?.targets.failures ?? [])];
    push("### Touch targets", "", `Every visible control under a coarse pointer, measured by hit testing outward from its centre: the hit area counts the points where a tap lands on the control or on its label, up to ${report.targets.min}px each way. ${report.targets.viewports}${device ? `; and the Android emulator at its own width of ${device.width}px (${device.device}), run on ${device.date} at commit \`${device.commit}\` with \`audit --device android\`` : "; the Android emulator was not run"}.`, "");
    push("| Viewport | Surface | Controls | Under 44×44 |", "|---|---|---|---|");
    for (const row of summary) push(`| ${row.viewport} | ${cell(row.surface)} | ${row.controls} | ${row.failures} |`);
    push("");
    if (failures.length) {
      push("| Viewport | Surface | Control | Name | Box | Hit area |", "|---|---|---|---|---|---|");
      for (const f of failures) push(`| ${f.viewport} | ${cell(f.surface)} | ${cell(f.where)} | ${cell(f.name)} | ${f.box} | ${f.hit} |`);
      push("");
    }
  }
  if (report.device?.covered?.length) {
    push("### On-screen keyboard", "", `Each text field tapped on the Android emulator, then the field's bottom edge compared with the bottom of the visual viewport once the keyboard is up.`, "");
    push("| Field | Route | Keyboard up | Field bottom | Visible bottom | Covered |", "|---|---|---|---|---|---|");
    for (const c of report.device.covered) push(`| ${c.field} | ${ROUTE_NAMES[c.route] ?? c.route} | ${c.covered == null ? "–" : c.keyboardShown ? "yes" : "no"} | ${c.fieldBottom ?? "–"} | ${c.visibleBottom ?? "–"} | ${c.covered == null ? cell(c.note) : c.covered ? "**yes**" : "no"} |`);
    push("");
  }
  if (report.keyboard) {
    push("### Keyboard order", "", "Tab from the page start until the order repeats, on the desktop layout in Charcoal. Each stop: role, accessible name, whether the focus edge is visible (a computed style of the control, its pseudo-elements or its two nearest ancestors differs between focused and blurred). Inside the script, Escape then Tab leaves the editor.", "");
    for (const route of report.keyboard.routes) {
      push(`#### ${route.name}`, "", `${route.stops.length} stops${route.cycled ? "" : ", stopped at the limit before the order repeated"}; ${route.invisible} without a visible focus edge; ${route.custom} focusable without a role.`, "");
      push(route.stops.map((s, i) => `${i + 1}. ${s.role}${s.name ? ` “${cell(s.name)}”` : ""}${s.caret ? " — focus shown by the caret" : ""}${s.visible === false ? " — **no visible focus**" : ""}${s.custom ? " — **no role**" : ""}`).join("\n"), "");
    }
  }
  if (report.escape) {
    push("### Escape and focus return", "", "| Viewport | Surface | Opened | Closed by Escape | Focus returned to |", "|---|---|---|---|---|");
    for (const e of report.escape) {
      if (e.panel) push(`| ${e.viewport} | ${e.step} | yes | a panel in the page, not an overlay | – |`);
      else push(`| ${e.viewport} | ${e.step} | ${e.opened ? "yes" : `no: ${cell(e.reason)}`} | ${e.opened ? (e.closed ? "yes" : "**no**") : "–"} | ${e.opened ? (e.returned ? `the opener (${cell(e.opener)})` : `**${cell(e.active ?? "nothing")}**${e.opener ? ` (opener: ${cell(e.opener)})` : " (no opener found)"}`) : "–"} |`);
    }
    push("");
  }
  if (report.shortcuts) {
    push("### Editor shortcuts", "", `Each editor row of the keymap table pressed in the script with the caret on line ${SHORTCUT_CARET.line}, Windows bindings. An effect is a change to the text, the selection, the carets, a fold, an open panel, tooltip or dialog, the route or the focus. A row with no effect here may need a context the fixture does not give (a running game, a second match, a call).`, "");
    push("| Shortcut | Keys | Effect |", "|---|---|---|");
    for (const s of report.shortcuts) push(`| ${cell(s.name)} | \`${s.keys}\` | ${s.effects.length ? s.effects.join(", ") : "**none seen**"} |`);
    push("");
  }
  if (report.motion) {
    push("### Reduced motion", "", "With `prefers-reduced-motion: reduce` emulated, every CSS transition and animation that started, every Web Animations call and every View Transition while visiting each route and opening each surface. Progress bars are allowed; the game runs in its own frame and is not counted.", "");
    push("| Viewport | Kind | Name | Element | Duration | Route |", "|---|---|---|---|---|---|");
    for (const m of report.motion.moving) push(`| ${m.viewport} | ${m.kind} | ${cell(m.name)} | ${cell(m.target)} | ${m.ms == null ? "?" : `${m.ms}ms`} | ${cell(m.route)} |`);
    if (!report.motion.moving.length) push("| all | none | | | | |");
    push("", `Recordings: ${report.motion.videos.join(", ") || "none"} (kept out of the repository).`, "");
  }
  if (report.forced) {
    push("### Forced colors", "", "With `forced-colors: active` emulated on the desktop layout, the first stops of each route's Tab order and a screenshot of each route and surface, inspected by eye.", "");
    push("| Route | Stops checked | Without a visible focus edge |", "|---|---|---|");
    for (const r of report.forced.routes) push(`| ${r.name} | ${r.checked} | ${r.invisible.length ? r.invisible.map(cell).join("; ") : "0"} |`);
    push("");
  }
  if (report.structure) {
    push("### Landmarks, live regions and lists", "", "| Viewport | Route | banner | navigation | main | complementary | Live regions | Lists |", "|---|---|---|---|---|---|---|---|");
    for (const s of report.structure) push(`| ${s.viewport} | ${s.name} | ${s.landmarks.banner} | ${s.landmarks.navigation} | ${s.landmarks.main} | ${s.landmarks.complementary} | ${cell(s.liveRegions.map((l) => `${l.role}${l.label ? ` “${l.label}”` : ""}`).join("; ")) || "none"} | ${cell(s.lists.map((l) => `${l.role}${l.label ? ` “${l.label}”` : ""} (${l.items})`).join("; ")) || "none"} |`);
    push("");
  }
  if (report.copy) {
    const c = report.copy;
    push("### Copy", "", `${c.strings} distinct strings read from every route and surface (text, aria-label, title, placeholder, alt). ${c.glossary.seenAsWritten} of the glossary's ${c.glossary.strings} strings appeared as written; the rest belong to surfaces the audit does not open.`, "");
    push("| Check | String | Where |", "|---|---|---|");
    for (const b of c.banned) push(`| Old word “${b.word}” | ${cell(b.text)} | ${cell(b.where)} |`);
    for (const m of c.caseMismatch) push(`| Glossary has “${cell(m.wanted)}” | ${cell(m.text)} | ${cell(m.where)} |`);
    for (const t of c.titleCase) push(`| Not sentence case (${t.words.join(", ")}) | ${cell(t.text)} | ${cell(t.where)} |`);
    if (!c.banned.length && !c.caseMismatch.length && !c.titleCase.length) push("| all | none | |");
    push("");
  }
  return lines.join("\n");
}

export const DOC_BEGIN = "<!-- audit:begin -->";
export const DOC_END = "<!-- audit:end -->";

export function replaceGenerated(doc, generated) {
  const at = doc.indexOf(DOC_BEGIN);
  const end = doc.indexOf(DOC_END);
  if (at < 0 || end < at) throw new Error(`the document has no ${DOC_BEGIN} … ${DOC_END} block to rewrite`);
  return `${doc.slice(0, at + DOC_BEGIN.length)}\n${generated.trimEnd()}\n${doc.slice(end)}`;
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    const root = document.documentElement;
    root.dataset.theme = t.id;
    if (t.surfaces) root.dataset.surfaces = t.surfaces;
    else delete root.dataset.surfaces;
    if (t.syntax) root.dataset.syntax = t.syntax;
    else delete root.dataset.syntax;
  }, theme);
  await page.waitForTimeout(150);
}

async function goRoute(page, route, deps) {
  progress(`go to #${route}`);
  const bounded = (what, promise, ms = 45_000) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not finish within ${ms / 1000} s on the way to #${route}`)), ms))]);
  if (route === "write") {
    const shown = await bounded("opening Main", deps.switchScreen(page, "main"));
    progress(`opened Main: ${shown.active ? "yes" : shown.reason}`);
    if (!shown.active) await page.evaluate(() => { location.hash = "#write"; });
  } else {
    await page.evaluate((r) => { location.hash = `#${r}`; }, route);
  }
  await bounded("waiting for the page to settle", deps.waitForDomQuiet(page, { quiet: 600, timeout: 10_000 }), 20_000);
  await bounded("waiting for view transitions", deps.settleViewTransitions(page), 10_000).catch(() => {});
  return page.evaluate(() => location.hash);
}

const OPENERS = {
  "app-menu": "openAppMenu",
  "add-menu": "openAddMenu",
  "preview-settings": "openPreviewSettings",
  problems: "openProblems",
  "file-menu": "openFileMenu",
  "asset-inspector": "openAssetInspector",
};

async function openSurface(page, surface, deps) {
  await page.evaluate(() => {
    window.__auditFocusTrail = [];
    if (!window.__auditFocusListener) {
      window.__auditFocusListener = (event) => window.__auditFocusTrail?.push(event.target);
      document.addEventListener("focusin", window.__auditFocusListener, true);
    }
  });
  try {
    const result = await deps[OPENERS[surface.step]](page);
    await deps.waitForDomQuiet(page, { quiet: 400, timeout: 5_000 });
    return result;
  } catch (error) {
    return { step: surface.step, ran: false, reason: String(error.message || error).split("\n")[0] };
  }
}

async function escapeSurface(page, surface, viewport) {
  const opener = await page.evaluate((selector) => {
    const open = [...document.querySelectorAll(selector)].filter((s) => s.checkVisibility());
    const expanded = [...document.querySelectorAll('[aria-expanded="true"]')];
    const controls = (el) => (el.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id));
    const focusedFirst = (window.__auditFocusTrail ?? []).find((e) => e instanceof Element && e.isConnected && !open.some((s) => s.contains(e)));
    const el = expanded.find((e) => controls(e).some((c) => c && open.some((s) => s === c || s.contains(c) || c.contains(s)))) ?? expanded.find((e) => e.hasAttribute("aria-haspopup")) ?? focusedFirst;
    if (!el) return null;
    el.setAttribute("data-audit-opener", "");
    return el.getAttribute("aria-label") || el.innerText.trim().slice(0, 40) || el.localName;
  }, surface.selector);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const after = await page.evaluate((selector) => {
    const open = [...document.querySelectorAll(selector)].some((el) => el.checkVisibility());
    const active = document.activeElement;
    const returned = !!active?.closest("[data-audit-opener]");
    const label = active && active !== document.body ? active.getAttribute("aria-label") || active.innerText?.trim().slice(0, 40) || active.localName : "the page";
    document.querySelector("[data-audit-opener]")?.removeAttribute("data-audit-opener");
    return { open, returned, active: label };
  }, surface.selector);
  return { viewport, step: surface.step, opened: true, opener, closed: !after.open, returned: after.returned, active: after.returned ? null : after.active };
}

async function closeEverything(page) {
  for (let i = 0; i < 3; i++) {
    const open = await page.evaluate(() => !!document.querySelector('[role="menu"], [role="dialog"][data-state="open"], section[aria-label="Asset details"]'));
    if (!open) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
}

async function runAxe(page, source) {
  await page.addScriptTag({ content: source }).catch(() => {});
  return page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"], iframes: false });
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 8).map((n) => n.target.join(" ")), html: v.nodes.slice(0, 8).map((n) => n.html.slice(0, 240)) }));
  });
}

async function landmarks(page) {
  const count = async (role) => page.getByRole(role).count();
  return { banner: await count("banner"), navigation: await count("navigation"), main: await count("main"), complementary: await count("complementary") };
}

async function tabOrder(page, { limit, deps }) {
  await closeEverything(page);
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    const start = document.createElement("span");
    start.tabIndex = -1;
    document.body.prepend(start);
    start.focus({ preventScroll: true });
    start.remove();
  });
  const stops = [];
  let first = null;
  let cycled = false;
  for (let i = 0; i < limit; i++) {
    const before = stops.at(-1);
    if (before?.inEditor) await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const state = await Promise.race([
      page.evaluate(focusState),
      new Promise((resolve) => setTimeout(() => resolve({ key: `timeout:${i}`, role: "unknown", name: "the page did not answer within 5 s", timedOut: true }), 5_000)),
    ]).catch((error) => ({ key: `error:${i}`, role: "unknown", name: String(error.message).split("\n")[0] }));
    if (i % 20 === 0) progress(`tab ${i}: ${state.role} ${state.name ?? ""}`);
    if (state.timedOut) {
      stops.push(state);
      break;
    }
    if (state.body) continue;
    if (first && state.key === first && stops.length > 1) {
      cycled = true;
      break;
    }
    first ??= state.key;
    if (before && before.key === state.key) continue;
    stops.push(state);
    if (stops.filter((s) => s.key === state.key).length > 2) {
      cycled = true;
      break;
    }
  }
  progress(`tab order ended after ${stops.length} stops`);
  await deps.reloadEditorPage(page);
  await deps.waitForApp(page);
  return { stops, cycled };
}

async function shortcutPass(page, deps) {
  const rows = await editorShortcutRows();
  const snapshot = async () => {
    const editor = await deps.protocolRequest(page, "editor/read").catch(() => null);
    const dom = await page.evaluate(() => ({
      hash: location.hash,
      overlays: [...document.querySelectorAll('[role="dialog"], [role="menu"], [role="tooltip"], .cm-panel, .cm-tooltip, [role="listbox"], [role="region"][aria-label], aside[aria-label], section[aria-label]')].filter((el) => el.checkVisibility()).map((el) => el.getAttribute("aria-label") || el.className || el.getAttribute("role")).join("|"),
      carets: document.querySelectorAll(".cm-cursor").length,
      folds: document.querySelectorAll(".cm-foldPlaceholder").length,
      selections: document.querySelectorAll(".cm-selectionBackground").length,
      active: document.activeElement ? `${document.activeElement.localName}.${document.activeElement.className}` : "",
      expanded: [...document.querySelectorAll("[aria-expanded]")].filter((el) => !el.closest('.cm-editor, aside, nav, [aria-label^="Scene outline"]')).map((el) => `${el.getAttribute("aria-label") ?? ""}=${el.getAttribute("aria-expanded")}`).join("|"),
      problemsPanel: !!document.querySelector("#problems-panel")?.checkVisibility(),
    }));
    return { text: editor?.textDocument.text, selection: JSON.stringify(editor?.selection ?? null), ...dom };
  };
  const out = [];
  const original = (await deps.protocolRequest(page, "editor/read").catch(() => null))?.textDocument.text;
  for (const row of rows) {
    progress(`shortcut ${row.id} ${row.keys}`);
    await closeEverything(page);
    const setup = SHORTCUT_SETUPS[row.id] ?? {};
    await deps.placeCaret(page, setup.caret ?? SHORTCUT_CARET).catch(() => {});
    for (const step of setup.steps ?? []) {
      if (step.type != null) await page.keyboard.type(step.type);
      else if (step.click) {
        await page.locator(step.click).first().click({ timeout: 3_000 }).catch(() => {});
        await deps.placeCaret(page, setup.caret ?? SHORTCUT_CARET).catch(() => {});
      } else await page.keyboard.press(step.press);
      await page.waitForTimeout(150);
    }
    const before = await snapshot();
    let error = null;
    try {
      await page.keyboard.press(playwrightCombo(row.keys));
      await deps.waitForDomQuiet(page, { quiet: 300, timeout: 4_000 });
    } catch (e) {
      error = String(e.message || e).split("\n")[0];
    }
    await page.waitForTimeout(300);
    const after = await snapshot();
    const effects = [];
    if (row.id === "tabFocus") {
      await page.keyboard.press("Tab");
      const left = await page.evaluate(() => !document.activeElement?.closest(".cm-editor"));
      if (left) effects.push("Tab then left the editor");
      await deps.placeCaret(page, SHORTCUT_CARET).catch(() => {});
    }
    if (after.expanded !== before.expanded || after.problemsPanel !== before.problemsPanel) effects.push("expanded a panel");
    if (after.text !== before.text) effects.push("text");
    if (after.selection !== before.selection) effects.push("selection");
    if (after.carets !== before.carets) effects.push("carets");
    if (after.folds !== before.folds) effects.push("folds");
    if (after.selections !== before.selections && !effects.includes("selection")) effects.push("selection");
    if (after.overlays !== before.overlays) effects.push(`opened ${after.overlays.split("|").filter((o) => !before.overlays.split("|").includes(o)).join(", ") || "a surface"}`);
    if (after.hash !== before.hash) effects.push(`route ${after.hash}`);
    if (after.active !== before.active) effects.push("focus");
    if (error) effects.push(`error: ${error}`);
    out.push({ id: row.id, name: row.name, keys: row.keys, effects });
    if (row.id === "tabFocus") {
      await deps.placeCaret(page, SHORTCUT_CARET).catch(() => {});
      await page.keyboard.press(playwrightCombo(row.keys));
    }
    await closeEverything(page);
    for (let i = 0; i < 10; i++) {
      const now = await deps.protocolRequest(page, "editor/read").catch(() => null);
      if (!now || now.textDocument.text === original) break;
      await deps.pressInEditor(page, "Control+z").catch(() => {});
    }
    if (after.hash !== before.hash) await goRoute(page, "write", deps);
  }
  return out;
}

export const KEYBOARD_FIELDS = [
  { route: "scripts", name: "Search scripts", selector: 'input[aria-label="Search scripts"]' },
  { route: "collection", name: "Search assets", selector: 'input[aria-label="Search assets"]' },
  { route: "write", name: "Script name", selector: "input[data-script-name]" },
  { route: "write", name: "Project name", selector: 'input[aria-label="Project name"]' },
];

async function devicePass({ deps, record, fixtureDir, outDir, report }) {
  const result = { date: report.date, commit: report.commit, device: null, width: null, targets: { summary: [], failures: [] }, covered: [] };
  await deps.withEditor(async ({ page, device }) => {
    result.device = device ? `${device.model} ${device.serial}, Chrome ${device.chrome}` : null;
    await deps.openEditorPage(page, record.url);
    await deps.waitForApp(page);
    const seed = await deps.seedProject(page, fixtureDir, { expectMainSd: true });
    if (seed.reason) throw new Error(`seed failed: ${seed.reason}`);
    await deps.reloadEditorPage(page);
    await deps.waitForApp(page);
    result.width = await page.evaluate(() => innerWidth);
    const viewport = `emulator ${result.width}`;
    const scan = async (surface) => {
      const found = await page.evaluate(auditScan, { parts: ["targets"], coarse: true, minTarget: 44 });
      const failures = found.targets.filter((t) => !t.ok);
      result.targets.summary.push({ viewport, surface, controls: found.targets.length, failures: failures.length });
      for (const f of failures) result.targets.failures.push({ viewport, surface, ...f });
    };
    for (const route of report.routes) {
      progress(`${viewport} ${ROUTE_NAMES[route]}`);
      await goRoute(page, route, deps);
      await scan(ROUTE_NAMES[route]);
      for (const s of SURFACES.filter((x) => x.route === route && ["app-menu", "add-menu", "file-menu", "asset-inspector"].includes(x.step))) {
        await closeEverything(page);
        await goRoute(page, route, deps);
        const opened = await openSurface(page, s, deps);
        if (opened?.ran) await scan(`${ROUTE_NAMES[route]}: ${s.step}`);
        await closeEverything(page);
      }
    }
    for (const field of KEYBOARD_FIELDS) {
      progress(`${viewport} keyboard over ${field.name}`);
      await goRoute(page, field.route, deps);
      const input = page.locator(field.selector).first();
      if (!(await input.isVisible().catch(() => false))) {
        result.covered.push({ field: field.name, route: field.route, covered: null, note: "not on screen" });
        continue;
      }
      await input.tap().catch(() => input.click());
      await page.waitForTimeout(2000);
      const measured = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        const r = el.getBoundingClientRect();
        const vv = window.visualViewport;
        const visibleBottom = vv ? vv.offsetTop + vv.height : innerHeight;
        return { focused: document.activeElement === el, fieldBottom: Math.round(r.bottom), visibleBottom: Math.round(visibleBottom), layoutHeight: innerHeight };
      }, field.selector);
      await page.screenshot({ path: path.join(outDir, `keyboard-${field.name.toLowerCase().replace(/\s+/g, "-")}.png`) }).catch(() => {});
      result.covered.push({ field: field.name, route: field.route, ...measured, keyboardShown: measured.visibleBottom < measured.layoutHeight - 100 || measured.layoutHeight < 600, covered: measured.fieldBottom > measured.visibleBottom });
      await deps.reloadEditorPage(page);
      await deps.waitForApp(page);
    }
  });
  return result;
}

export async function audit(args, deps) {
  let options;
  try {
    options = parseAuditArgs(args);
  } catch (error) {
    return deps.die([error.message, "", ...AUDIT_USAGE].join("\n"));
  }
  const outDir = path.resolve(options.out);
  fs.mkdirSync(outDir, { recursive: true });
  const has = (part) => options.parts.includes(part);
  const themes = AUDIT_THEMES.filter((t) => options.themes.includes(t.id));
  const barThemes = themes.filter((t) => t.bar);
  const record = deps.readState();
  if (!record?.url) deps.die("no editor URL — run `node .agents/skills/drive-web-editor/driver.mjs up` first");
  const commit = options.commit ?? deps.headCommit();
  const report = { date: new Date().toISOString().slice(0, 10), commit, url: record.url, routes: options.routes };
  const require = createRequire(path.join(REPO, "package.json"));
  let axeSource = null;
  if (has("axe")) {
    const axePath = require.resolve("axe-core/axe.min.js");
    axeSource = fs.readFileSync(axePath, "utf8");
    report.axe = { version: JSON.parse(fs.readFileSync(path.join(path.dirname(axePath), "package.json"), "utf8")).version, violations: [] };
  }
  const contrastRows = [];
  const contrastSummary = new Map();
  const unmeasured = new Map();
  const targetSummary = [];
  const targetFailures = [];
  const strings = new Map();
  const escape = [];
  const structure = [];
  const fixtureDir = writeFixture(fs.mkdtempSync(path.join(outDir, "fixture-")));

  const scanContrast = async (page, viewport, surface, themeList) => {
    for (const theme of themeList) {
      await setTheme(page, theme);
      const scan = await page.evaluate(auditScan, { parts: ["contrast"], coarse: false, minTarget: 44 });
      const key = `${theme.name}|${viewport}`;
      const sum = contrastSummary.get(key) ?? { theme: theme.name, viewport, checked: 0, failures: 0, scriptFailures: 0, unresolved: 0 };
      sum.checked += scan.contrast.length;
      for (const row of scan.contrast) {
        if (row.unresolved) {
          sum.unresolved++;
          if (theme.bar) unmeasured.set(`${viewport}|${row.where}|${row.unresolved}`, { viewport, surface, where: row.where, sample: row.sample, reason: row.unresolved });
        }
        else if (row.ratio < row.needs) {
          if (row.script) sum.scriptFailures++;
          else sum.failures++;
          contrastRows.push({ theme: theme.name, viewport, surface, ...row });
        }
      }
      contrastSummary.set(key, sum);
      if (has("axe") && theme.bar) {
        const violations = await runAxe(page, axeSource).catch((error) => [{ id: "axe-error", impact: String(error.message).slice(0, 80), nodes: 0 }]);
        for (const v of violations) report.axe.violations.push({ theme: theme.name, viewport, surface, ...v });
      }
    }
    await setTheme(page, AUDIT_THEMES[0]);
  };
  const scanOthers = async (page, viewport, surface, coarse) => {
    const scan = await page.evaluate(auditScan, { parts: ["targets", "copy", "structure"], coarse, minTarget: 44 });
    for (const s of scan.strings) if (!strings.has(s.text)) strings.set(s.text, { ...s, surface });
    if (coarse && has("targets")) {
      const failures = scan.targets.filter((t) => !t.ok);
      targetSummary.push({ viewport, surface, controls: scan.targets.length, failures: failures.length });
      for (const f of failures) targetFailures.push({ viewport, surface, ...f });
    }
    return scan;
  };
  const shoot = async (page, name) => {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file }).catch(() => {});
    return file;
  };

  const session = async ({ viewport, extra = {} }, fn) => {
    const display = { viewport: parseViewport(viewport), colorScheme: null, theme: "charcoal" };
    const ctx = await deps.launchEditorBrowser({ headless: !options.headed, display, extra });
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await deps.grantDurableStorage(ctx, page).catch(() => {});
      await deps.openEditorPage(page, record.url);
      await deps.waitForApp(page);
      return await fn(page, ctx);
    } finally {
      await ctx.close();
    }
  };

  if (deps.device) {
    const result = await devicePass({ deps, record, fixtureDir, outDir, report });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.writeFileSync(path.join(outDir, "audit-device.json"), JSON.stringify(result, null, 2));
    deps.log(JSON.stringify({ out: outDir, device: result.device, width: result.width, targetFailures: result.targets.failures.length, covered: result.covered.filter((c) => c.covered).map((c) => c.field) }, null, 2));
    return result;
  }

  const viewports = [
    { name: "desktop", viewport: "desktop", coarse: false },
    { name: "phone 360", viewport: "phone", coarse: true },
  ];
  const needsMain = ["contrast", "axe", "targets", "keyboard", "escape", "shortcuts", "copy", "structure"].some(has);
  let seeded = false;
  if (needsMain) {
    for (const vp of viewports) {
      await session(vp, async (page) => {
        if (!seeded) {
          const seed = await deps.seedProject(page, fixtureDir, { expectMainSd: true });
          if (seed.reason) throw new Error(`seed failed: ${seed.reason}`);
          await deps.reloadEditorPage(page);
          await deps.waitForApp(page);
          seeded = true;
          report.fixture = Object.keys(FIXTURE);
          if (has("contrast")) {
            report.tokens = { themes: themes.map((t) => ({ id: t.id, name: t.name })), values: await page.evaluate(tokenPairs, { themes, pairs: TOKEN_PAIRS }) };
          }
        }
        report.browser ??= await page.evaluate(() => navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? "");
        const keyboard = [];
        for (const route of options.routes) {
          const surface = ROUTE_NAMES[route];
          progress(`${vp.name} ${surface}`);
          await goRoute(page, route, deps);
          if (route === "write") await deps.scriptEditorPresent(page, 60_000).then(() => deps.settleEditor(page, 60_000)).catch(() => {});
          await shoot(page, `${route}-${vp.viewport}-charcoal`);
          if (has("contrast") || has("axe")) await scanContrast(page, vp.name, surface, has("contrast") ? themes : barThemes);
          const scan = await scanOthers(page, vp.name, surface, vp.coarse);
          if (has("structure")) structure.push({ viewport: vp.name, name: surface, landmarks: await landmarks(page), liveRegions: scan.liveRegions, lists: scan.lists });
          if (has("keyboard") && !vp.coarse) {
            progress(`${vp.name} ${surface} tab order`);
            const order = await tabOrder(page, { limit: 160, deps });
            keyboard.push({ route, name: surface, ...order, invisible: order.stops.filter((s) => s.visible === false).length, custom: order.stops.filter((s) => s.custom).length });
            await goRoute(page, route, deps);
          }
          const surfaces = ["contrast", "axe", "targets", "escape", "copy"].some(has) ? SURFACES.filter((x) => x.route === route) : [];
          for (const s of surfaces) {
            progress(`${vp.name} ${surface} ${s.step}`);
            await closeEverything(page);
            await goRoute(page, route, deps);
            const opened = await openSurface(page, s, deps);
            if (!opened?.ran) {
              escape.push({ viewport: vp.name, step: s.step, opened: false, reason: opened?.reason ?? "did not open" });
              continue;
            }
            const name = `${surface}: ${s.step}`;
            await shoot(page, `${s.step}-${vp.viewport}-charcoal`);
            if (has("contrast") || has("axe")) await scanContrast(page, vp.name, name, barThemes);
            await scanOthers(page, vp.name, name, vp.coarse);
            if (has("escape")) {
              const overlay = await page.evaluate((selector) => [...document.querySelectorAll(selector)].some((el) => el.checkVisibility()), s.selector);
              escape.push(overlay ? await escapeSurface(page, s, vp.name) : { viewport: vp.name, step: s.step, opened: true, panel: true });
            }
            await closeEverything(page);
          }
        }
        if (keyboard.length) report.keyboard = { routes: keyboard };
        if (has("shortcuts") && !vp.coarse && options.routes.includes("write")) {
          await goRoute(page, "write", deps);
          await deps.scriptEditorPresent(page, 60_000);
          report.shortcuts = await shortcutPass(page, deps);
        }
      });
    }
  }
  if (has("contrast")) report.contrast = { summary: [...contrastSummary.values()], failures: contrastRows, unmeasured: [...unmeasured.values()] };
  if (has("targets")) report.targets = { min: 44, viewports: "Chromium's phone preset at 360×780 with touch", summary: targetSummary, failures: targetFailures };
  if (has("escape")) report.escape = escape;
  if (has("structure")) report.structure = structure;
  if (has("copy")) {
    const glossary = glossaryStrings(fs.readFileSync(path.join(REPO, "impower-dev/docs/design/glossary.md"), "utf8"));
    report.copy = { strings: strings.size, ...copyFindings([...strings.values()], glossary) };
  }

  if (has("motion")) {
    const moving = [];
    const videos = [];
    for (const vp of viewports) {
      progress(`${vp.name} reduced motion`);
      const videoDir = path.join(outDir, `reduced-motion-${vp.viewport}`);
      await session({ ...vp, extra: { reducedMotion: "reduce", recordVideo: { dir: videoDir, size: parseViewport(vp.viewport) } } }, async (page, ctx) => {
        await ctx.addInitScript(motionRecorder);
        await deps.reloadEditorPage(page);
        await deps.waitForApp(page);
        await page.evaluate(() => window.__auditMotion?.splice(0));
        for (const route of options.routes) {
          await goRoute(page, route, deps);
          await page.waitForTimeout(500);
          for (const s of SURFACES.filter((x) => x.route === route)) {
            await closeEverything(page);
            const opened = await openSurface(page, s, deps);
            if (opened?.ran) {
              await page.waitForTimeout(400);
              await closeEverything(page);
              await page.waitForTimeout(400);
            }
          }
        }
        const log = await page.evaluate(() => window.__auditMotion ?? []);
        for (const m of log) if (!m.progress && (m.ms == null || m.ms > 10)) moving.push({ viewport: vp.name, ...m });
      });
      if (fs.existsSync(videoDir)) for (const f of fs.readdirSync(videoDir)) videos.push(path.join(videoDir, f));
    }
    const unique = new Map();
    for (const m of moving) unique.set(`${m.viewport}|${m.kind}|${m.name}|${m.target}|${m.route}`, m);
    report.motion = { moving: [...unique.values()], videos };
  }

  if (has("forced")) {
    const routes = [];
    await session({ viewport: "desktop", extra: { forcedColors: "active" } }, async (page) => {
      for (const route of options.routes) {
        progress(`forced colors ${ROUTE_NAMES[route]}`);
        await goRoute(page, route, deps);
        if (route === "write") await deps.scriptEditorPresent(page, 60_000).catch(() => {});
        await shoot(page, `forced-${route}`);
        const order = await tabOrder(page, { limit: 40, deps });
        routes.push({ route, name: ROUTE_NAMES[route], checked: order.stops.length, invisible: order.stops.filter((s) => s.visible === false).map((s) => `${s.role} “${s.name}”`) });
        for (const s of SURFACES.filter((x) => x.route === route)) {
          await closeEverything(page);
          await goRoute(page, route, deps);
          const opened = await openSurface(page, s, deps);
          if (opened?.ran) await shoot(page, `forced-${s.step}`);
          await closeEverything(page);
        }
      }
    });
    report.forced = { routes };
  }

  fs.rmSync(fixtureDir, { recursive: true, force: true });
  const deviceFile = path.join(outDir, "audit-device.json");
  if (fs.existsSync(deviceFile)) report.device = JSON.parse(fs.readFileSync(deviceFile, "utf8"));
  const json = path.join(outDir, "audit.json");
  fs.writeFileSync(json, JSON.stringify(report, null, 2));
  const markdown = renderMarkdown(report);
  fs.writeFileSync(path.join(outDir, "audit.md"), markdown);
  if (options.doc) {
    const doc = path.resolve(options.doc);
    fs.writeFileSync(doc, replaceGenerated(fs.readFileSync(doc, "utf8"), markdown));
  }
  deps.log(JSON.stringify({
    out: outDir,
    commit,
    contrastFailures: report.contrast?.failures.length,
    axeViolations: report.axe?.violations.length,
    targetFailures: report.targets?.failures.length,
    keyboard: report.keyboard?.routes.map((r) => ({ route: r.route, stops: r.stops.length, invisible: r.invisible, custom: r.custom, cycled: r.cycled })),
    escape: report.escape?.filter((e) => e.opened && !e.panel && (!e.closed || !e.returned)).map((e) => `${e.viewport} ${e.step}`),
    shortcutsWithoutEffect: report.shortcuts?.filter((s) => !s.effects.length).map((s) => s.id),
    motion: report.motion?.moving.length,
    copy: report.copy && { banned: report.copy.banned.length, caseMismatch: report.copy.caseMismatch.length, titleCase: report.copy.titleCase.length },
  }, null, 2));
  return report;
}
