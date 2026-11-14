import { execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRepos, ticketsRepo } from "../../repos.mjs";
import { ghClient as dependencyClient } from "../references/record-blockers.mjs";

export const TEMPLATE_FILES = Object.freeze({
  decision: fileURLToPath(new URL("../../templates/issues/maintainer_decision.md", import.meta.url)),
  task: fileURLToPath(new URL("../../templates/issues/maintainer_task.md", import.meta.url)),
});
const HEADING_COUNT = { decision: 5, task: 5 };
const LETTERS = "ABCDE";
export const ALWAYS_WAITS = Object.freeze({
  "deletes-work": "it deletes or overwrites work that cannot be restored",
  "leaves-repository": "it publishes, sends or spends something outside the repository",
  "waives-check": "it waives a failed check",
});
export const WAIT_MINUTES = Object.freeze({ min: 30, max: 1440, unstated: 120 });
const PICTURE_TYPES = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const DATA_MARK = "maintainer-request";
const DATA_LINE = /^<!-- maintainer-request (\{.*\}) -->$/m;
const FILED_AS = "Filed by an agent through your GitHub account, so GitHub shows you as the author of this request; an agent wrote it.";
const KEYS = {
  decision: ["kind", "question", "tickets", "askedBy", "owner", "parked", "meanwhile", "shortVersion", "background", "showsOnScreen", "options", "comparison", "recommendation", "fallback", "waits", "alwaysWaits"],
  task: ["kind", "action", "tickets", "askedBy", "owner", "why", "steps", "expect", "details", "parked"],
  option: ["name", "pictures", "example", "pros", "cons", "undo"],
  picture: ["file", "alt", "width"],
  recommendation: ["option", "reason"],
  fallback: ["option", "waitMinutes"],
};

export class RequestRefused extends Error {
  constructor(reasons) {
    super(`The request is refused:\n${reasons.map((reason) => `- ${reason}`).join("\n")}`);
    this.reasons = reasons;
  }
}

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const filled = (value) => typeof value === "string" && value.trim() !== "";
const oneLine = (value) => filled(value) && !/[\r\n]/.test(value);
const moreThanOneSentence = (text) => /[.!?]["'\u201d\u2019)\]]*\s+\S/.test(text.trim());
const asSentence = (text) => (/[.!?]["'\u201d\u2019)\]]*$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
const escapeAttribute = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function unknownKeys(value, allowed, where, refuse) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) refuse(`${where} has an unknown field "${key}"; the fields are ${allowed.join(", ")}`);
}

function checkText(value, where, refuse, { line = false } = {}) {
  if (!filled(value)) return false;
  if (line && /[\r\n]/.test(value)) refuse(`${where} must be one line`);
  if (/<img\b|!\[/i.test(value)) refuse(`${where} holds picture markup; give each picture as a picture block instead, so the tool can upload it and put it in place`);
  if (/<!--|-->/.test(value)) refuse(`${where} holds an HTML comment marker, which would hide text or break the request's data line`);
  return true;
}

export function pictureWidth(file) {
  const handle = openSync(file, "r");
  const head = Buffer.alloc(64 * 1024);
  let size;
  try {
    size = readSync(handle, head, 0, head.length, 0);
  } finally {
    closeSync(handle);
  }
  const bytes = head.subarray(0, size);
  if (size >= 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.toString("latin1", 12, 16) === "IHDR") return bytes.readUInt32BE(16);
  if (size >= 10 && bytes.toString("latin1", 0, 3) === "GIF") return bytes.readUInt16LE(6);
  if (size >= 30 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    const chunk = bytes.toString("latin1", 12, 16);
    if (chunk === "VP8X") return 1 + bytes.readUIntLE(24, 3);
    if (chunk === "VP8L") return 1 + (bytes.readUInt16LE(21) & 0x3fff);
    if (chunk === "VP8 ") return bytes.readUInt16LE(26) & 0x3fff;
  }
  if (size >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < size) {
      if (bytes[at] !== 0xff) break;
      const marker = bytes[at + 1];
      const length = bytes.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return bytes.readUInt16BE(at + 7);
      at += 2 + length;
    }
  }
  throw new Error(`${file}: not a PNG, JPEG, GIF or WebP picture whose width can be read`);
}

export function folderPictures(folder) {
  return (file) => {
    const full = path.resolve(folder, file);
    if (!existsSync(full) || !statSync(full).isFile()) return { error: `is not a file in the pictures folder ${folder}` };
    try {
      return { path: full, width: pictureWidth(full) };
    } catch (error) {
      return { error: error.message };
    }
  };
}

function checkPicture(picture, where, refuse, lookup) {
  if (!isObject(picture)) {
    refuse(`${where} must be a picture block: { "file", "alt", "width" }`);
    return null;
  }
  unknownKeys(picture, KEYS.picture, where, refuse);
  let ok = true;
  if (!oneLine(picture.file) || path.isAbsolute(picture.file) || picture.file.split(/[\\/]/).includes("..") || /^[a-z]+:/i.test(picture.file)) {
    refuse(`${where} needs "file", a path inside the pictures folder`);
    ok = false;
  } else if (!PICTURE_TYPES.includes(path.extname(picture.file).toLowerCase())) {
    refuse(`${where} file ${picture.file} is not a picture (${PICTURE_TYPES.join(", ")})`);
    ok = false;
  }
  if (!checkText(picture.alt, `${where} alt`, refuse, { line: true })) {
    refuse(`${where} needs "alt", one line describing the picture for someone who cannot see it`);
    ok = false;
  }
  if (picture.width !== undefined && (!Number.isSafeInteger(picture.width) || picture.width < 100 || picture.width > 1000)) {
    refuse(`${where} width must be a whole number of pixels from 100 to 1000`);
    ok = false;
  }
  if (!ok) return null;
  const found = lookup(picture.file);
  if (found.error) {
    refuse(`${where} file ${picture.file} ${found.error}`);
    return null;
  }
  return { ...picture, path: found.path, pixels: found.width };
}

function checkContent(value, where, refuse, lookup, { required }) {
  if (value === undefined) {
    if (required) refuse(`${where} is missing`);
    return [];
  }
  const blocks = Array.isArray(value) ? value : [value];
  if (!blocks.length) {
    if (required) refuse(`${where} is missing`);
    return [];
  }
  const out = [];
  blocks.forEach((block, index) => {
    const at = blocks.length > 1 ? `${where} block ${index + 1}` : where;
    if (typeof block === "string") {
      if (checkText(block, at, refuse)) out.push(block.trim());
      else refuse(`${at} is empty`);
    } else {
      const picture = checkPicture(block, at, refuse, lookup);
      if (picture) out.push(picture);
    }
  });
  return out;
}

function checkTickets(value, refuse, { required }) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || !value.length || value.some((n) => !Number.isSafeInteger(n) || n < 1)) {
    refuse('"tickets" must list the number of every ticket the request holds up');
    return [];
  }
  if (new Set(value).size !== value.length) refuse('"tickets" names a ticket twice');
  return [...new Set(value)];
}

function tableColumns(markdown) {
  let widest = 0;
  for (const line of markdown.split(/\r?\n/)) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|\s*$/, "").split(/(?<!\\)\|/);
    widest = Math.max(widest, cells.length);
  }
  return widest;
}

function checkDecision(request, refuse, lookup) {
  unknownKeys(request, KEYS.decision, "The request", refuse);
  const tickets = checkTickets(request.tickets, refuse, { required: true });
  if (!filled(request.question)) refuse("The question is missing");
  else if (moreThanOneSentence(request.question) || /[\r\n]/.test(request.question)) refuse("The question is more than one sentence; ask one thing, in one sentence");
  else checkText(request.question, "The question", refuse, { line: true });
  for (const [key, what] of [["askedBy", "who asked"], ["owner", "the run or session that owns the request"], ["parked", "what is parked until the answer"], ["meanwhile", "what carries on meanwhile"]]) {
    if (!checkText(request[key], `"${key}"`, refuse, { line: true })) refuse(`"${key}", ${what}, is missing`);
  }
  if (!checkText(request.shortVersion, '"shortVersion"', refuse)) refuse('"shortVersion", one paragraph a reader with no context can follow, is missing');
  const background = checkContent(request.background, '"background"', refuse, lookup, { required: false });
  if (typeof request.showsOnScreen !== "boolean") refuse('"showsOnScreen" must be true or false: does the difference between the options show on screen?');
  if (!checkText(request.comparison, '"comparison"', refuse)) refuse('"comparison", a side-by-side list or table, is missing');
  else if (tableColumns(request.comparison) > 4) refuse(`"comparison" is a table of ${tableColumns(request.comparison)} columns; use at most four, since a wider table scrolls sideways on a phone, or write a list`);

  const options = [];
  if (!Array.isArray(request.options) || request.options.length < 2 || request.options.length > 5) {
    refuse(`A decision needs two to five options, not ${Array.isArray(request.options) ? request.options.length : "none"}`);
  }
  (Array.isArray(request.options) ? request.options.slice(0, 5) : []).forEach((option, index) => {
    const letter = LETTERS[index];
    const where = `Option ${letter}`;
    if (!isObject(option)) {
      refuse(`${where} must be an object`);
      return;
    }
    unknownKeys(option, KEYS.option, where, refuse);
    if (!checkText(option.name, `${where} name`, refuse, { line: true })) refuse(`${where} has no name`);
    const pictures = [];
    if (option.pictures !== undefined) {
      if (!Array.isArray(option.pictures) || !option.pictures.length) refuse(`${where} "pictures" must be a non-empty list of picture blocks`);
      else option.pictures.forEach((picture, at) => {
        const checked = checkPicture(picture, `${where} picture ${at + 1}`, refuse, lookup);
        if (checked) pictures.push(checked);
      });
    }
    const example = option.example === undefined ? undefined : checkText(option.example, `${where} example`, refuse) ? option.example.trim() : refuse(`${where} example is empty`);
    if (option.pictures === undefined && option.example === undefined) refuse(`${where} has no picture and no example`);
    if (request.showsOnScreen === true && option.pictures === undefined) refuse(`${where} has no picture, but the request says the difference shows on screen`);
    for (const [key, label] of [["pros", "Pros"], ["cons", "Cons"], ["undo", "undo cost"]]) {
      if (!checkText(option[key], `${where} ${key}`, refuse)) refuse(`${where} has no ${label}`);
    }
    options.push({ letter, name: option.name?.trim(), pictures, example, pros: option.pros?.trim(), cons: option.cons?.trim(), undo: option.undo?.trim() });
  });
  const firsts = options.filter((option) => option.pictures.length).map((option) => ({ letter: option.letter, picture: option.pictures[0] }));
  if (new Set(firsts.map((first) => first.picture.pixels)).size > 1) refuse(`The options' first pictures differ in width (${firsts.map((first) => `${first.letter} ${first.picture.pixels}px`).join(", ")}); capture them at the same width`);
  else if (new Set(firsts.map((first) => first.picture.width ?? null)).size > 1) refuse(`The options' first pictures are shown at different widths (${firsts.map((first) => `${first.letter} ${first.picture.width ?? "unset"}`).join(", ")}); give them the same "width"`);

  const letters = options.map((option) => option.letter);
  let recommended = null;
  if (!isObject(request.recommendation)) refuse("There is no recommendation: give the option you recommend and the reason");
  else {
    unknownKeys(request.recommendation, KEYS.recommendation, "The recommendation", refuse);
    if (!letters.includes(request.recommendation.option)) refuse(`The recommendation names no option; use one of ${letters.join(", ")}`);
    else recommended = request.recommendation.option;
    if (!checkText(request.recommendation.reason, "The recommendation's reason", refuse)) refuse("The recommendation has no reason");
  }

  let fallback = null;
  let waits = null;
  if (request.alwaysWaits !== undefined && !Object.hasOwn(ALWAYS_WAITS, request.alwaysWaits)) refuse(`"alwaysWaits" must be one of ${Object.keys(ALWAYS_WAITS).join(", ")}`);
  const alwaysWaits = Object.hasOwn(ALWAYS_WAITS, request.alwaysWaits ?? "") ? request.alwaysWaits : null;
  if (request.fallback !== undefined && request.waits !== undefined) refuse('Name a fallback or a reason the request waits, not both');
  if (request.fallback !== undefined) {
    if (alwaysWaits) refuse(`The request names a fallback, but ${ALWAYS_WAITS[alwaysWaits]}, one of the three kinds of choice that always wait; give "waits" instead`);
    if (!isObject(request.fallback)) refuse('"fallback" must be { "option", "waitMinutes" }');
    else {
      unknownKeys(request.fallback, KEYS.fallback, "The fallback", refuse);
      const minutes = request.fallback.waitMinutes ?? WAIT_MINUTES.unstated;
      if (!letters.includes(request.fallback.option)) refuse(`The fallback names no option; use one of ${letters.join(", ")}`);
      if (!Number.isSafeInteger(minutes) || minutes < WAIT_MINUTES.min || minutes > WAIT_MINUTES.max) refuse(`The fallback's wait must be ${WAIT_MINUTES.min} minutes to 24 hours (${WAIT_MINUTES.max} minutes), not ${request.fallback.waitMinutes}`);
      fallback = { option: request.fallback.option, waitMinutes: minutes };
    }
  } else if (request.waits !== undefined) {
    if (checkText(request.waits, '"waits"', refuse, { line: true })) waits = request.waits.trim();
    else refuse('"waits", the reason the request waits, is empty');
  } else if (alwaysWaits) {
    waits = `${ALWAYS_WAITS[alwaysWaits].replace(/^it /, "the choice ")}, so it never goes ahead without you`;
  } else {
    refuse('The request names neither a fallback ("fallback": an option and a wait of 30 minutes to 24 hours) nor a reason it waits ("waits")');
  }
  return {
    kind: "decision",
    question: request.question?.trim(),
    tickets,
    askedBy: request.askedBy?.trim(),
    owner: request.owner?.trim(),
    parked: request.parked?.trim(),
    meanwhile: request.meanwhile?.trim(),
    shortVersion: request.shortVersion?.trim(),
    background,
    options,
    comparison: request.comparison?.trim(),
    recommended,
    reason: request.recommendation?.reason?.trim(),
    fallback,
    waits,
    alwaysWaits,
  };
}

function checkTask(request, refuse, lookup, { tag }) {
  unknownKeys(request, KEYS.task, "The request", refuse);
  const tickets = checkTickets(request.tickets, refuse, { required: !tag });
  if (!filled(request.action)) refuse('The task has no action: say what to do in "action"');
  else checkText(request.action, "The action", refuse, { line: true });
  if (!checkText(request.why, '"why"', refuse)) refuse('The task has no reason only the maintainer can do it ("why")');
  const steps = [];
  if (!Array.isArray(request.steps) || !request.steps.length) refuse('The task has no steps ("steps", a list)');
  else request.steps.forEach((step, index) => {
    if (checkText(step, `Step ${index + 1}`, refuse)) steps.push(step.trim());
    else refuse(`Step ${index + 1} is empty`);
  });
  for (const [key, what] of [["askedBy", "who asked"], ["owner", "the run or session that owns the request"]]) {
    if (!checkText(request[key], `"${key}"`, refuse, { line: true })) refuse(`"${key}", ${what}, is missing`);
  }
  let parked = null;
  if (request.parked !== undefined) {
    if (checkText(request.parked, '"parked"', refuse, { line: true })) parked = request.parked.trim();
    else refuse('"parked" is empty');
  }
  return {
    kind: "task",
    action: request.action?.trim(),
    tickets,
    askedBy: request.askedBy?.trim(),
    owner: request.owner?.trim(),
    why: request.why?.trim(),
    steps,
    expect: checkContent(request.expect, '"expect"', refuse, lookup, { required: false }),
    details: checkContent(request.details, '"details"', refuse, lookup, { required: false }),
    parked,
  };
}

export function validateRequest(request, { pictures, tag = false } = {}) {
  const reasons = [];
  const refuse = (reason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const lookup = pictures ?? (() => ({ error: "cannot be read: no pictures folder was given" }));
  if (!isObject(request)) throw new RequestRefused(["The request file must hold one JSON object"]);
  let checked = null;
  if (request.kind === "decision" && !tag) checked = checkDecision(request, refuse, lookup);
  else if (request.kind === "task") checked = checkTask(request, refuse, lookup, { tag });
  else refuse(tag ? 'Only a task can be tagged onto an existing ticket: "kind" must be "task"' : '"kind" must be "decision" or "task"');
  if (reasons.length) throw new RequestRefused(reasons);
  return checked;
}

export function readTemplate(kind, file = TEMPLATE_FILES[kind]) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/<!--[\s\S]*?-->/g, "");
  const headings = body.split("\n").filter((line) => line.startsWith("## ")).map((line) => line.slice(3).trim());
  const answer = body.split("\n").filter((line) => line.startsWith("**")).at(-1);
  if (headings.length !== HEADING_COUNT[kind]) throw new Error(`${file}: expected ${HEADING_COUNT[kind]} section headings, found ${headings.length}`);
  if (!answer) throw new Error(`${file}: no answer instructions (a line starting with **) after the headings`);
  return { headings, answer };
}

function zoned(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: parts.weekday, date: new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(date) };
}

export function describeTime(at, now, timeZone) {
  const when = zoned(at, timeZone);
  const today = zoned(now, timeZone);
  const tomorrow = zoned(new Date(now.getTime() + 24 * 3600 * 1000), timeZone);
  if (when.day === today.day) return `${when.time} today`;
  if (when.day === tomorrow.day) return `${when.time} tomorrow`;
  return `${when.time} on ${when.weekday} ${when.date}`;
}

const picturePlaceholder = (picture) => `<img src="./${picture.file.replace(/\\/g, "/").replace(/^\.\//, "")}"${picture.width ? ` width="${picture.width}"` : ""} alt="${escapeAttribute(picture.alt.trim())}">`;
const renderContent = (blocks) => blocks.map((block) => (typeof block === "string" ? block : picturePlaceholder(block))).join("\n\n");
const ticketList = (tickets) => tickets.map((n) => `#${n}`).join(", ");

export function requestTitle(checked) {
  return `${checked.kind === "decision" ? checked.question : checked.action} (${ticketList(checked.tickets)})`;
}

export function dataLine(data) {
  return `<!-- ${DATA_MARK} ${JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")} -->`;
}

export function readDataLine(body) {
  const match = DATA_LINE.exec((body ?? "").replace(/\r\n/g, "\n"));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function decisionBody(checked, { now, timeZone, template }) {
  const [shortHeading, backgroundHeading, optionsHeading, sideHeading, whyHeading] = template.headings;
  const name = (letter) => `${letter} · ${checked.options.find((option) => option.letter === letter).name}`;
  const data = { kind: "decision", options: checked.options.map((option) => option.letter), recommended: checked.recommended };
  const lines = [];
  if (checked.fallback) {
    const at = new Date(now.getTime() + checked.fallback.waitMinutes * 60 * 1000);
    data.fallback = { option: checked.fallback.option, at: at.toISOString() };
    const undo = checked.options.find((option) => option.letter === checked.fallback.option).undo;
    lines.push("> [!IMPORTANT]", `> **If you don't answer by ${describeTime(at, now, timeZone)}, I'll go ahead with ${name(checked.fallback.option)},** and move this to "decided without you". Undoing it later: ${asSentence(undo)}`);
  } else {
    data.waits = checked.waits;
    if (checked.alwaysWaits) data.alwaysWaits = checked.alwaysWaits;
    lines.push("> [!IMPORTANT]", `> **This one waits for you,** however long it takes: ${asSentence(checked.waits)}`);
  }
  data.blocks = checked.tickets;
  data.owner = checked.owner;
  lines.push("", `- **Recommended:** ${name(checked.recommended)}`, `- **Parked until you answer:** ${checked.parked}`, `- **Carrying on meanwhile:** ${checked.meanwhile}`, `- **Asked by:** ${checked.askedBy}`);
  lines.push("", `## ${shortHeading}`, "", checked.shortVersion);
  if (checked.background.length) lines.push("", `## ${backgroundHeading}`, "", renderContent(checked.background));
  lines.push("", `## ${optionsHeading}`);
  for (const option of checked.options) {
    lines.push("", `### ${option.letter} · ${option.name}${option.letter === checked.recommended ? " (recommended)" : ""}`);
    for (const picture of option.pictures) lines.push("", picturePlaceholder(picture));
    if (option.example) lines.push("", `**Example:** ${option.example}`);
    lines.push("", `- **Pros:** ${option.pros}`, `- **Cons:** ${option.cons}`, `- **To undo later:** ${option.undo}`);
  }
  lines.push("", `## ${sideHeading}`, "", checked.comparison);
  lines.push("", `## ${whyHeading.replace("<letter>", checked.recommended)}`, "", checked.reason);
  lines.push("", "---", "", template.answer.replace(/<letter>/g, checked.recommended), "", `_${FILED_AS}_`, "", dataLine(data), "");
  return { body: lines.join("\n"), data };
}

function taskBody(checked, { template, tag }) {
  const [doHeading, whyHeading, stepsHeading, expectHeading, holdsHeading] = template.headings;
  const data = { kind: "task", ...(tag ? { tagged: true } : {}), blocks: checked.tickets, owner: checked.owner };
  const parked = checked.parked ?? (checked.tickets.length ? ticketList(checked.tickets) : "Nothing beyond this ticket.");
  const lines = [`## ${doHeading}`, "", asSentence(checked.action)];
  if (checked.details.length) lines.push("", renderContent(checked.details));
  lines.push("", `## ${whyHeading}`, "", checked.why);
  lines.push("", `## ${stepsHeading}`, "", ...checked.steps.map((step, index) => `${index + 1}. ${step}`));
  lines.push("", `## ${expectHeading}`, "", checked.expect.length ? renderContent(checked.expect) : "Nothing to check beyond the steps.");
  lines.push("", `## ${holdsHeading}`, "", `- **Parked until it's done:** ${parked}`, `- **Asked by:** ${checked.askedBy}`);
  lines.push("", "---", "", template.answer, "", `_${FILED_AS}_`, "", dataLine(data), "");
  return { body: lines.join("\n"), data };
}

export function buildRequest(checked, { now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, templates = {}, tag = false } = {}) {
  const template = templates[checked.kind] ?? readTemplate(checked.kind);
  const built = checked.kind === "decision" ? decisionBody(checked, { now, timeZone, template }) : taskBody(checked, { template, tag });
  return { title: requestTitle(checked), ...built, pictures: picturesOf(checked) };
}

function picturesOf(checked) {
  const blocks = checked.kind === "decision" ? [...checked.background, ...checked.options.flatMap((option) => option.pictures)] : [...checked.details, ...checked.expect];
  return blocks.filter((block) => typeof block !== "string");
}

const IMAGE_REFERENCE = /<img\b[^>]*?\bsrc="([^"]*)"[^>]*>|!\[[^\]]*\]\(([^)\s]+)[^)]*\)/gi;

export function imageReferences(body) {
  return [...body.matchAll(IMAGE_REFERENCE)].map((match) => ({ src: match[1] ?? match[2], index: match.index, text: match[0] }));
}

export function checkPlacedBody(body, placed) {
  const text = (body ?? "").replace(/\r\n/g, "\n");
  const problems = [];
  const references = imageReferences(text);
  for (const reference of references) if (!/^https:\/\//.test(reference.src)) problems.push(`a picture still has the relative path ${reference.src}, so its upload did not land`);
  const dataAt = text.search(DATA_LINE);
  if (dataAt === -1) problems.push("the hidden data line is missing");
  for (const reference of references) {
    if (/^https:\/\//.test(reference.src) && !placed.includes(reference.src)) problems.push(`a picture the request did not place was appended: ${reference.src}`);
    else if (dataAt !== -1 && reference.index > dataAt) problems.push(`a picture was appended after the data line: ${reference.src}`);
  }
  const missing = placed.filter((url) => !references.some((reference) => reference.src === url));
  for (const url of missing) problems.push(`the placed picture ${url} is not in the body`);
  return problems;
}

export function stagingBody(body) {
  const pictures = [];
  const staged = body.replace(/<img src="(\.\/[^"]+)"[^>]*>/g, (_, src) => {
    if (pictures.some((picture) => picture.src === src)) return "";
    const token = `picture-${pictures.length + 1}`;
    pictures.push({ token, src });
    return `![${token}](${src})`;
  });
  return { staged, pictures };
}

export function hostedAddresses(stagedBack, pictures) {
  const problems = [];
  const urls = {};
  for (const { token, src } of pictures) {
    const match = new RegExp(`!\\[${token}\\]\\(([^)\\s]+)\\)`).exec(stagedBack);
    if (!match) problems.push(`the reference for ${src} is gone from the uploaded body`);
    else if (!/^https:\/\//.test(match[1])) problems.push(`${src} was not uploaded: the body still holds its relative path`);
    else urls[src] = match[1];
  }
  return { urls, problems };
}

export function placeAddresses(body, urls) {
  return body.replace(/(<img src=")(\.\/[^"]+)(")/g, (_, open, src, close) => `${open}${Object.hasOwn(urls, src) ? urls[src] : src}${close}`);
}

export function sameQuestion(a, b) {
  const norm = (text) => text.toLowerCase().replace(/\s+/g, " ").replace(/[\s.?!]+$/, "").trim();
  return norm(a) === norm(b);
}

export function questionOf(title) {
  return (title ?? "").replace(/\s*\((?:#\d+(?:,\s*)?)+\)\s*$/, "").trim();
}

export function findDuplicate(checked, openIssues) {
  const question = checked.kind === "decision" ? checked.question : checked.action;
  for (const issue of openIssues) {
    const data = readDataLine(issue.body);
    if (!data || data.kind !== checked.kind || data.tagged) continue;
    if (!(data.blocks ?? []).some((n) => checked.tickets.includes(n))) continue;
    if (sameQuestion(questionOf(issue.title), question)) return issue;
  }
  return null;
}

export function ghTracker(repo = ticketsRepo(), run = (args, options = {}) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...options })) {
  const json = (args) => JSON.parse(run(args) || "null");
  const dependencies = dependencyClient(repo, (args) => run(args));
  return {
    repo,
    open: (label) => json(["api", "-X", "GET", `repos/${repo}/issues`, "-f", "state=open", "-f", `labels=${label}`, "-f", "per_page=100", "--paginate", "--slurp"]).flat().filter((issue) => !issue.pull_request),
    issue: (n) => json(["api", `repos/${repo}/issues/${n}`]),
    parent: (n) => {
      try {
        return json(["api", `repos/${repo}/issues/${n}/parent`])?.number ?? null;
      } catch (error) {
        if (/404|No parent/i.test(`${error.stderr ?? ""}${error.message}`)) return null;
        throw error;
      }
    },
    create: ({ title, bodyFile, labels, assignee, attach, cwd }) => {
      const args = ["issue", "create", "-R", repo, "--title", title, "--body-file", bodyFile, "--type", "Task", "--assignee", assignee];
      for (const label of labels) args.push("--label", label);
      for (const file of attach) args.push("--attach", file);
      let out;
      try {
        out = run(args, { cwd });
      } catch (error) {
        out = `${error.stdout ?? ""}`;
        const number = /\/issues\/(\d+)\s*$/m.exec(out)?.[1];
        if (!number) throw error;
        return { number: Number(number), uploadError: `${error.stderr ?? error.message}`.trim() };
      }
      const number = /\/issues\/(\d+)\s*$/m.exec(out)?.[1];
      if (!number) throw new Error(`gh issue create printed no issue address: ${out}`);
      return { number: Number(number) };
    },
    editBody: (n, bodyFile) => json(["api", "-X", "PATCH", `repos/${repo}/issues/${n}`, "-F", `body=@${bodyFile}`]),
    addLabel: (n, label) => json(["api", "-X", "POST", `repos/${repo}/issues/${n}/labels`, "-f", `labels[]=${label}`]),
    addAssignee: (n, login) => json(["api", "-X", "POST", `repos/${repo}/issues/${n}/assignees`, "-f", `assignees[]=${login}`]),
    comment: ({ number, bodyFile, attach, cwd }) => {
      if (!attach.length) return { id: json(["api", "-X", "POST", `repos/${repo}/issues/${number}/comments`, "-F", `body=@${bodyFile}`]).id };
      let out;
      let uploadError;
      try {
        out = run(["issue", "comment", String(number), "-R", repo, "--body-file", bodyFile, ...attach.flatMap((file) => ["--attach", file])], { cwd });
      } catch (error) {
        out = `${error.stdout ?? ""}`;
        uploadError = `${error.stderr ?? error.message}`.trim();
      }
      const id = /#issuecomment-(\d+)/.exec(out)?.[1];
      if (!id) throw new Error(`gh issue comment printed no comment address: ${out} ${uploadError ?? ""}`);
      return { id: Number(id), uploadError };
    },
    readComment: (id) => json(["api", `repos/${repo}/issues/comments/${id}`]),
    editComment: (id, bodyFile) => json(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${id}`, "-F", `body=@${bodyFile}`]),
    close: (n, reason, bodyFile) => {
      json(["api", "-X", "POST", `repos/${repo}/issues/${n}/comments`, "-F", `body=@${bodyFile}`]);
      return json(["api", "-X", "PATCH", `repos/${repo}/issues/${n}`, "-f", "state=closed", "-f", `state_reason=${reason}`]);
    },
    blockedBy: dependencies.blockedBy,
    addBlockedBy: dependencies.add,
  };
}

function withScratch(work) {
  const dir = mkdtempSync(path.join(tmpdir(), "maintainer-request-"));
  try {
    return work(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function attachments(pictures, folder) {
  const files = [];
  for (const picture of pictures) {
    const relative = `./${path.relative(folder, picture.path).split(path.sep).join("/")}`;
    if (!files.includes(relative)) files.push(relative);
  }
  return files;
}

function placeInto({ built, folder, scratch, post, read, write }) {
  const { staged, pictures } = stagingBody(built.body);
  const stagedFile = path.join(scratch, "staged.md");
  writeFileSync(stagedFile, staged);
  const target = post(stagedFile, attachments(built.pictures, folder));
  const problems = target.uploadError ? [`an upload failed: ${target.uploadError}`] : [];
  let addresses = {};
  if (pictures.length) {
    const hosted = hostedAddresses(read(target).replace(/\r\n/g, "\n"), pictures);
    problems.push(...hosted.problems);
    addresses = hosted.urls;
    if (!hosted.problems.length) {
      const finalFile = path.join(scratch, "final.md");
      writeFileSync(finalFile, placeAddresses(built.body, addresses));
      write(target, finalFile);
    }
  }
  const urls = Object.values(addresses);
  const back = read(target).replace(/\r\n/g, "\n");
  if (!problems.length) {
    problems.push(...checkPlacedBody(back, urls));
    const expected = placeAddresses(built.body, addresses);
    if (!problems.length && back.trimEnd() !== expected.trimEnd()) problems.push("the body read back differs from the body the tool wrote");
  }
  return { target, problems, urls };
}

export function verifyFiled(tracker, number, { label, login }) {
  const issue = tracker.issue(number);
  const problems = [];
  if (issue.type?.name !== "Task") problems.push(`type is ${issue.type?.name ?? "unset"}, not Task`);
  if (!(issue.labels ?? []).some((l) => l.name === label)) problems.push(`label ${label} is missing`);
  if (!(issue.assignees ?? []).some((a) => a.login === login)) problems.push(`${login} is not assigned`);
  if (issue.milestone) problems.push(`it has the milestone ${issue.milestone.title}`);
  const parent = tracker.parent(number);
  if (parent) problems.push(`it has the parent #${parent}`);
  return { issue, problems };
}

function failFiled(tracker, number, problems, scratch) {
  const file = path.join(scratch, "withdraw.md");
  writeFileSync(file, `Withdrawn by the ask-maintainer tool: filing did not finish, so this request is incomplete and nothing waits on it.\n\n${problems.map((problem) => `- ${problem}`).join("\n")}\n`);
  let closed = "";
  try {
    tracker.close(number, "not_planned", file);
    closed = ` #${number} was closed as not planned.`;
  } catch (error) {
    closed = ` Closing #${number} failed too (${error.message.split("\n")[0]}); close it as not planned by hand.`;
  }
  return new Error(`Filing ${tracker.repo}#${number} failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}\n${closed.trim()}`);
}

export function fileRequest(request, { pictures: folder, tracker, repos = readRepos(), now = new Date(), timeZone, templates, dryRun = false }) {
  const checked = validateRequest(request, { pictures: folderPictures(folder) });
  const built = buildRequest(checked, { now, timeZone, templates });
  const label = checked.kind === "decision" ? repos.maintainer.labels.decision : repos.maintainer.labels.task;
  const duplicate = findDuplicate(checked, tracker.open(label));
  if (duplicate) throw new RequestRefused([`An open request already asks this about the same ticket: #${duplicate.number} ${duplicate.title} (${duplicate.html_url})`]);
  if (dryRun) return { dryRun: true, title: built.title, body: built.body, data: built.data };
  return withScratch((scratch) => {
    const placed = placeInto({
      built,
      folder,
      scratch,
      post: (file, attach) => tracker.create({ title: built.title, bodyFile: file, labels: [label], assignee: repos.maintainer.login, attach, cwd: folder }),
      read: (target) => tracker.issue(target.number).body ?? "",
      write: (target, file) => tracker.editBody(target.number, file),
    });
    const number = placed.target.number;
    const problems = [...placed.problems];
    let issue = null;
    if (!problems.length) {
      const filed = verifyFiled(tracker, number, { label, login: repos.maintainer.login });
      problems.push(...filed.problems);
      issue = filed.issue;
    }
    if (problems.length) throw failFiled(tracker, number, problems, scratch);
    const blocked = [];
    for (const ticket of checked.tickets) {
      const before = tracker.blockedBy(ticket).map((blocker) => blocker.number);
      if (!before.includes(number)) tracker.addBlockedBy(ticket, issue.id);
      const after = tracker.blockedBy(ticket).map((blocker) => blocker.number);
      if (!after.includes(number)) problems.push(`#${ticket} is not blocked by #${number} after posting the dependency`);
      else blocked.push(ticket);
    }
    if (problems.length) throw new Error(`Filed ${tracker.repo}#${number} (${issue.html_url}), but linking it failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}\nIt stays open; add the missing blocked_by dependencies with the calls in .agents/skills/references/record-blockers.mjs.`);
    return { number, url: issue.html_url, title: built.title, data: built.data, blocked, pictures: placed.urls.length };
  });
}

export function tagTicket(number, request, { pictures: folder, tracker, repos = readRepos(), templates }) {
  const checked = validateRequest(request, { pictures: folderPictures(folder), tag: true });
  const built = buildRequest(checked, { templates, tag: true });
  const label = repos.maintainer.labels.task;
  const ticket = tracker.issue(number);
  if (ticket.pull_request) throw new RequestRefused([`#${number} is a pull request, not a ticket`]);
  if (ticket.state !== "open") throw new RequestRefused([`#${number} is closed`]);
  if ((ticket.labels ?? []).some((l) => l.name === label)) throw new RequestRefused([`#${number} is already tagged ${label}`]);
  return withScratch((scratch) => {
    const placed = placeInto({
      built,
      folder,
      scratch,
      post: (file, attach) => tracker.comment({ number, bodyFile: file, attach, cwd: folder }),
      read: (target) => tracker.readComment(target.id).body ?? "",
      write: (target, file) => tracker.editComment(target.id, file),
    });
    if (placed.problems.length) throw new Error(`The task comment on #${number} (id ${placed.target.id}) is incomplete; fix or delete it, then tag again:\n${placed.problems.map((problem) => `- ${problem}`).join("\n")}`);
    tracker.addLabel(number, label);
    tracker.addAssignee(number, repos.maintainer.login);
    const after = tracker.issue(number);
    const problems = [];
    if (!(after.labels ?? []).some((l) => l.name === label)) problems.push(`label ${label} is missing`);
    if (!(after.assignees ?? []).some((a) => a.login === repos.maintainer.login)) problems.push(`${repos.maintainer.login} is not assigned`);
    if (problems.length) throw new Error(`Tagging #${number} did not finish:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
    return { number, url: after.html_url, comment: placed.target.id, pictures: placed.urls.length };
  });
}

function age(from, now) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

export function groupRequests({ decisions, tasks, decidedWithoutYou }) {
  const seen = new Set(decidedWithoutYou.map((issue) => issue.number));
  const keep = (list) => list.filter((issue) => !seen.has(issue.number) && seen.add(issue.number));
  const byAge = (a, b) => new Date(a.created_at) - new Date(b.created_at);
  return { decisions: keep(decisions).sort(byAge), tasks: keep(tasks).sort(byAge), decidedWithoutYou: [...decidedWithoutYou].sort(byAge) };
}

export function formatList(groups, { now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) {
  const lines = [];
  const section = (heading, list, detail) => {
    lines.push(`${heading} (${list.length})`);
    if (!list.length) lines.push("  None");
    for (const issue of list) lines.push(`  #${issue.number} ${issue.title}`, `    ${issue.html_url} · open ${age(issue.created_at, now)}${detail(issue)}`);
    lines.push("");
  };
  section("Decisions", groups.decisions, (issue) => {
    const data = readDataLine(issue.body);
    if (data?.fallback?.at) {
      const at = new Date(data.fallback.at);
      return ` · ${at <= now ? "fallback time passed at" : "falls back at"} ${describeTime(at, now, timeZone)} to ${data.fallback.option}`;
    }
    return data?.waits ? " · waits for you" : " · no data line";
  });
  section("Tasks", groups.tasks, () => " · no clock");
  section("Went ahead without you", groups.decidedWithoutYou, (issue) => {
    const data = readDataLine(issue.body);
    return data?.fallback ? ` · went ahead with ${data.fallback.option}` : "";
  });
  return lines.join("\n").trimEnd();
}

export function listRequests(tracker, repos = readRepos()) {
  const { decision, task, decidedWithoutYou } = repos.maintainer.labels;
  return groupRequests({ decisions: tracker.open(decision), tasks: tracker.open(task), decidedWithoutYou: tracker.open(decidedWithoutYou) });
}

const USAGE = `Usage:
  node .agents/skills/ask-maintainer/maintainer-request.mjs file <request.json> [<pictures-folder>] [--dry-run]
  node .agents/skills/ask-maintainer/maintainer-request.mjs tag <ticket> <task.json> [<pictures-folder>]
  node .agents/skills/ask-maintainer/maintainer-request.mjs list [--json]
The pictures folder defaults to the request file's folder.`;

function readRequest(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new RequestRefused([`${file} is not a readable JSON request file: ${error.message}`]);
  }
}

export function main(argv, { tracker = ghTracker(), repos = readRepos(), out = console.log, now = new Date() } = {}) {
  const [command, ...rest] = argv;
  const flags = rest.filter((arg) => arg.startsWith("--"));
  const args = rest.filter((arg) => !arg.startsWith("--"));
  if (command === "file" && args.length >= 1 && args.length <= 2 && flags.every((flag) => flag === "--dry-run")) {
    const file = path.resolve(args[0]);
    const result = fileRequest(readRequest(file), { pictures: path.resolve(args[1] ?? path.dirname(file)), tracker, repos, now, dryRun: flags.includes("--dry-run") });
    if (result.dryRun) {
      out(`Dry run: the request is complete and no open request duplicates it. Title:\n${result.title}\n\n${result.body}`);
      return 0;
    }
    const fallback = result.data.fallback ? `falls back at ${describeTime(new Date(result.data.fallback.at), now, Intl.DateTimeFormat().resolvedOptions().timeZone)} (${result.data.fallback.at}) to ${result.data.fallback.option}` : result.data.waits ? "waits for the maintainer, with no fallback" : "a task, with no clock";
    out(`Filed #${result.number}: ${result.url}\n${fallback}; blocks ${result.blocked.map((n) => `#${n}`).join(", ")}; ${result.pictures} picture(s) hosted and in place.\nFiled through the maintainer's own account until the helper identity exists.`);
    return 0;
  }
  if (command === "tag" && args.length >= 2 && args.length <= 3 && !flags.length && /^#?[1-9]\d*$/.test(args[0])) {
    const file = path.resolve(args[1]);
    const result = tagTicket(Number(args[0].replace(/^#/, "")), readRequest(file), { pictures: path.resolve(args[2] ?? path.dirname(file)), tracker, repos });
    out(`Tagged #${result.number} as a maintainer task: ${result.url} (comment ${result.comment}, ${result.pictures} picture(s)); no issue was created.`);
    return 0;
  }
  if (command === "list" && !args.length && flags.every((flag) => flag === "--json")) {
    const groups = listRequests(tracker, repos);
    if (flags.includes("--json")) {
      const pick = (issue) => ({ number: issue.number, title: issue.title, url: issue.html_url, created: issue.created_at, data: readDataLine(issue.body) });
      out(JSON.stringify({ decisions: groups.decisions.map(pick), tasks: groups.tasks.map(pick), decidedWithoutYou: groups.decidedWithoutYou.map(pick) }, null, 2));
    } else out(formatList(groups, { now }));
    return 0;
  }
  console.error(USAGE);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
