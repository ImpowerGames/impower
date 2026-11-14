import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRepos, ticketsRepo } from "../../repos.mjs";
import { ghClient as dependencyClient } from "../references/record-blockers.mjs";
import { findTypedWords } from "./chat-transcript.mjs";
import { TOOL_MARK, actorOf, commentAuthor, resolveIdentity, tokenEnv } from "./github-app.mjs";

export const TEMPLATE_FILES = Object.freeze({
  decision: fileURLToPath(new URL("../../templates/issues/maintainer_decision.md", import.meta.url)),
  task: fileURLToPath(new URL("../../templates/issues/maintainer_task.md", import.meta.url)),
});
const HEADING_COUNT = { decision: 5, task: 5 };
const LETTERS = "ABCDE";
export const WAIT_REASONS = Object.freeze({
  "deletes-work": "it deletes or overwrites work that cannot be restored",
  "leaves-repository": "it publishes, sends or spends something outside the repository",
  "waives-check": "it waives a failed check",
  "confirms-built": "it asks you to confirm something already built",
});
export const WAIT_MINUTES = Object.freeze({ min: 30, max: 1440, unstated: 120 });
const PICTURE_TYPES = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const DATA_MARK = "maintainer-request";
const DATA_LINE = /^<!-- maintainer-request (\{.*\}) -->$/m;
const NOTE_MARK = "maintainer-request-note";
const NOTE_LINE = /^<!-- maintainer-request-note (\{.*\}) -->$/m;
const FILED_AS = "Filed by an agent through your GitHub account, because the tool's GitHub App could not be used on this machine: GitHub shows you as the author and sends you no alert for it.";
const POSTED_AS = "Posted by the ask-maintainer tool through your GitHub account, not by you.";
const AS_MAINTAINER = Object.freeze({ mode: "maintainer", reason: "no App identity was resolved" });
const signature = (identity, line) => (identity.mode === "app" ? [TOOL_MARK, ""] : [`_${line}_`, "", TOOL_MARK, ""]);
export const markComment = (text, identity) => `${text.trimEnd()}\n\n${signature(identity, POSTED_AS).join("\n").trimEnd()}\n`;
const KEYS = {
  decision: ["kind", "question", "tickets", "askedBy", "owner", "parked", "meanwhile", "shortVersion", "background", "showsOnScreen", "options", "comparison", "recommendation", "fallback", "waits"],
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
  } else if (!/^[A-Za-z0-9._\/\\-]+$/.test(picture.file)) {
    refuse(`${where} file ${picture.file} must be named with letters, digits, ".", "_", "-" and "/" only, so its upload can be matched to its place; rename it`);
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

export function tableColumns(markdown) {
  let widest = 0;
  for (const line of markdown.split(/\r?\n/)) {
    let rest = line;
    for (;;) {
      const row = rest.trim();
      if (row.includes("|") && /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/.test(row)) widest = Math.max(widest, row.replace(/^\|/, "").replace(/\|$/, "").split("|").length);
      const next = rest.replace(/^\s*(?:>|[-*+](?=\s)|\d{1,9}[.)](?=\s))/, "");
      if (next === rest) break;
      rest = next;
    }
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
  if (request.waits !== undefined) {
    if (Object.hasOwn(WAIT_REASONS, request.waits)) waits = request.waits;
    else refuse(`"waits" must name one of the four reasons a request waits: ${Object.entries(WAIT_REASONS).map(([key, why]) => `${key} (${why.replace(/^it /, "")})`).join(", ")}`);
  }
  if (request.fallback !== undefined) {
    if (waits) refuse(`The request names a fallback, but it waits because ${WAIT_REASONS[waits]}, one of the four reasons a request never falls back; drop "fallback"`);
    else if (request.waits !== undefined) refuse('Name a fallback or a reason the request waits, not both');
    if (!isObject(request.fallback)) refuse('"fallback" must be { "option", "waitMinutes" }');
    else {
      unknownKeys(request.fallback, KEYS.fallback, "The fallback", refuse);
      const minutes = request.fallback.waitMinutes ?? WAIT_MINUTES.unstated;
      if (!letters.includes(request.fallback.option)) refuse(`The fallback names no option; use one of ${letters.join(", ")}`);
      if (!Number.isSafeInteger(minutes) || minutes < WAIT_MINUTES.min || minutes > WAIT_MINUTES.max) refuse(`The fallback's wait must be ${WAIT_MINUTES.min} minutes to 24 hours (${WAIT_MINUTES.max} minutes), not ${request.fallback.waitMinutes}`);
      fallback = { option: request.fallback.option, waitMinutes: minutes };
    }
  } else if (request.waits === undefined) {
    refuse(`The request names neither a fallback ("fallback": an option and a wait of 30 minutes to 24 hours) nor a reason it waits ("waits": one of ${Object.keys(WAIT_REASONS).join(", ")})`);
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

const hiddenLine = (mark, data) => `<!-- ${mark} ${JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")} -->`;

export function dataLine(data) {
  return hiddenLine(DATA_MARK, data);
}

export function noteLine(note) {
  return hiddenLine(NOTE_MARK, note);
}

export function readNote(body) {
  const match = NOTE_LINE.exec((body ?? "").replace(/\r\n/g, "\n"));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function toolText(text, note, identity = AS_MAINTAINER) {
  return `${text.replace(/(?:\r?\n)+$/, "")}\n\n${signature(identity, POSTED_AS).join("\n").trimEnd()}\n${noteLine(note)}\n`;
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

function decisionBody(checked, { now, timeZone, template, identity, wentAhead }) {
  const [shortHeading, backgroundHeading, optionsHeading, sideHeading, whyHeading] = template.headings;
  const name = (letter) => `${letter} · ${checked.options.find((option) => option.letter === letter).name}`;
  const data = { kind: "decision", options: checked.options.map((option) => option.letter), recommended: checked.recommended };
  const lines = [];
  if (wentAhead) {
    data.fallback = { option: wentAhead.option, at: wentAhead.at };
    lines.push("> [!IMPORTANT]", `> **I went ahead with ${wentAhead.option}${wentAhead.name ? ` · ${wentAhead.name}` : ""} at ${describeTime(new Date(wentAhead.at), now, timeZone)} without you,** and moved this to "decided without you". Close this issue with no comment to keep it, or with a comment to change it.`);
  } else if (checked.fallback) {
    const at = new Date(now.getTime() + checked.fallback.waitMinutes * 60 * 1000);
    data.fallback = { option: checked.fallback.option, at: at.toISOString() };
    const undo = checked.options.find((option) => option.letter === checked.fallback.option).undo;
    lines.push("> [!IMPORTANT]", `> **If you don't answer by ${describeTime(at, now, timeZone)}, I'll go ahead with ${name(checked.fallback.option)},** and move this to "decided without you". Undoing it later: ${asSentence(undo)}`);
  } else {
    data.waits = checked.waits;
    lines.push("> [!IMPORTANT]", `> **This one waits for you,** however long it takes, because ${asSentence(WAIT_REASONS[checked.waits])}`);
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
  lines.push("", "---", "", template.answer.replace(/<letter>/g, checked.recommended), "", ...signature(identity, FILED_AS), dataLine(data), "");
  return { body: lines.join("\n"), data };
}

function taskBody(checked, { template, tag, identity }) {
  const [doHeading, whyHeading, stepsHeading, expectHeading, holdsHeading] = template.headings;
  const data = { kind: "task", ...(tag ? { tagged: true } : {}), blocks: checked.tickets, owner: checked.owner };
  const parked = checked.parked ?? (checked.tickets.length ? ticketList(checked.tickets) : "Nothing beyond this ticket.");
  const lines = [`## ${doHeading}`, "", asSentence(checked.action)];
  if (checked.details.length) lines.push("", renderContent(checked.details));
  lines.push("", `## ${whyHeading}`, "", checked.why);
  lines.push("", `## ${stepsHeading}`, "", ...checked.steps.map((step, index) => `${index + 1}. ${step}`));
  lines.push("", `## ${expectHeading}`, "", checked.expect.length ? renderContent(checked.expect) : "Nothing to check beyond the steps.");
  lines.push("", `## ${holdsHeading}`, "", `- **Parked until it's done:** ${parked}`, `- **Asked by:** ${checked.askedBy}`);
  lines.push("", "---", "", template.answer, "", ...signature(identity, tag ? POSTED_AS : FILED_AS), dataLine(data), "");
  return { body: lines.join("\n"), data };
}

export function buildRequest(checked, { now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, templates = {}, tag = false, identity = AS_MAINTAINER, wentAhead = null } = {}) {
  const template = templates[checked.kind] ?? readTemplate(checked.kind);
  const built = checked.kind === "decision" ? decisionBody(checked, { now, timeZone, template, identity, wentAhead }) : taskBody(checked, { template, tag, identity });
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

export function findDuplicate(checked, openIssues, { before = Infinity } = {}) {
  const question = checked.kind === "decision" ? checked.question : checked.action;
  let earliest = null;
  for (const issue of openIssues) {
    if (issue.number >= before) continue;
    const data = readDataLine(issue.body);
    if (!data || data.kind !== checked.kind || data.tagged) continue;
    if (!(data.blocks ?? []).some((n) => checked.tickets.includes(n))) continue;
    if (sameQuestion(questionOf(issue.title), question) && (!earliest || issue.number < earliest.number)) earliest = issue;
  }
  return earliest;
}

export function ghTracker(repo = ticketsRepo(), runGh = (args, options = {}) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...options }), identity = AS_MAINTAINER) {
  const env = tokenEnv(identity);
  const run = env ? (args, options = {}) => runGh(args, { ...options, env }) : runGh;
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
    comments: (n) => json(["api", `repos/${repo}/issues/${n}/comments`, "--paginate", "--slurp"]).flat(),
    timeline: (n) => json(["api", `repos/${repo}/issues/${n}/timeline`, "--paginate", "--slurp"]).flat(),
    editComment: (id, bodyFile) => json(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${id}`, "-F", `body=@${bodyFile}`]),
    close: (n, reason, bodyFile) => {
      const note = json(["api", "-X", "POST", `repos/${repo}/issues/${n}/comments`, "-F", `body=@${bodyFile}`]);
      try {
        return json(["api", "-X", "PATCH", `repos/${repo}/issues/${n}`, "-f", "state=closed", "-f", `state_reason=${reason}`]);
      } catch (error) {
        try {
          json(["api", "-X", "DELETE", `repos/${repo}/issues/comments/${note.id}`]);
        } catch (cleanup) {
          error.message = `${error.message}\nThe closing comment ${note.id} could not be deleted (${cleanup.message.split("\n")[0]}); delete it by hand, or it reads as the reason for a later close.`;
        }
        throw error;
      }
    },
    removeLabel: (n, label) => json(["api", "-X", "DELETE", `repos/${repo}/issues/${n}/labels/${encodeURIComponent(label)}`]),
    removeAssignee: (n, login) => json(["api", "-X", "DELETE", `repos/${repo}/issues/${n}/assignees`, "-f", `assignees[]=${login}`]),
    deleteComment: (id) => json(["api", "-X", "DELETE", `repos/${repo}/issues/comments/${id}`]),
    blockedBy: dependencies.blockedBy,
    addBlockedBy: dependencies.add,
    removeBlockedBy: (n, id) => json(["api", "-X", "DELETE", `repos/${repo}/issues/${n}/dependencies/blocked_by/${id}`]),
    editTitle: (n, title) => json(["api", "-X", "PATCH", `repos/${repo}/issues/${n}`, "-f", `title=${title}`]),
    reopen: (n) => json(["api", "-X", "PATCH", `repos/${repo}/issues/${n}`, "-f", "state=open"]),
    poll: (n, etag) => {
      const args = ["api", "-i", `repos/${repo}/issues/${n}`];
      if (etag) args.push("-H", `If-None-Match: ${etag}`);
      let out;
      try {
        out = run(args);
      } catch (error) {
        out = `${error.stdout ?? ""}`;
        if (!/^HTTP\/[\d.]+ 304/m.test(out)) throw error;
      }
      const text = out.replace(/\r\n/g, "\n");
      const split = text.indexOf("\n\n");
      const head = split === -1 ? text : text.slice(0, split);
      const status = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(head)?.[1]);
      const tag = /^etag:\s*(.+)$/im.exec(head)?.[1]?.trim() ?? etag;
      if (status === 304) return { status, etag: tag };
      if (status !== 200) throw new Error(`GET issue ${n} answered HTTP ${status || "with no status line"}`);
      return { status, etag: tag, issue: JSON.parse(text.slice(split + 2)) };
    },
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

class FilingProblems extends Error {
  constructor(problems) {
    super(problems.join("; "));
    this.problems = problems;
  }
}

const problemsOf = (error) => (error instanceof FilingProblems ? error.problems : [error.message.split("\n")[0]]);
const bullets = (lines) => lines.map((line) => `- ${line}`).join("\n");

function linkTickets(tracker, tickets, blocker, attempted) {
  const problems = [];
  for (const ticket of tickets) {
    if (!tracker.blockedBy(ticket).some((issue) => issue.number === blocker.number)) {
      attempted.push(ticket);
      tracker.addBlockedBy(ticket, blocker.id);
    }
    if (!tracker.blockedBy(ticket).some((issue) => issue.number === blocker.number)) problems.push(`#${ticket} is not blocked by #${blocker.number} after posting the dependency`);
  }
  if (problems.length) throw new FilingProblems(problems);
}

function undo(steps) {
  const done = [];
  const failed = [];
  for (const [what, step] of steps) {
    try {
      step();
      done.push(what);
    } catch (error) {
      if (/HTTP 404|Not Found|does not exist/i.test(`${error.stderr ?? ""} ${error.message}`)) done.push(`${what} (already absent)`);
      else failed.push(`${what} failed (${error.message.split("\n")[0]}); do it by hand`);
    }
  }
  return { done, failed };
}

function unlinkSteps(tracker, attempted, blocker) {
  return attempted.map((ticket) => [`removed the dependency of #${ticket} on #${blocker.number}`, () => tracker.removeBlockedBy(ticket, blocker.id)]);
}

function withdraw(tracker, { number, id, attempted }, problems, scratch, hint = "Correct the cause and file the request again.", identity = AS_MAINTAINER) {
  const file = path.join(scratch, "withdraw.md");
  writeFileSync(file, toolText(`Withdrawn by the ask-maintainer tool: filing did not finish, so this request is incomplete and nothing waits on it.\n\n${bullets(problems)}`, { kind: "withdrawn", reason: "filing did not finish" }, identity));
  const result = undo([...unlinkSteps(tracker, attempted, { number, id }), [`closed #${number} as not planned`, () => tracker.close(number, "not_planned", file)]]);
  return new Error(`Filing ${tracker.repo}#${number} failed:\n${bullets(problems)}\nRolled back: ${result.done.length ? result.done.join("; ") : "nothing"}.${result.failed.length ? `\n${bullets(result.failed)}` : ""}\n${hint}`);
}

export function fileRequest(request, { pictures: folder, tracker, repos = readRepos(), now = new Date(), timeZone, templates, dryRun = false, identity = AS_MAINTAINER }) {
  const checked = validateRequest(request, { pictures: folderPictures(folder) });
  const built = buildRequest(checked, { now, timeZone, templates, identity });
  const label = checked.kind === "decision" ? repos.maintainer.labels.decision : repos.maintainer.labels.task;
  const duplicate = findDuplicate(checked, tracker.open(label));
  if (duplicate) throw new RequestRefused([`An open request already asks this about the same ticket: #${duplicate.number} ${duplicate.title} (${duplicate.html_url})`]);
  if (dryRun) return { dryRun: true, title: built.title, body: built.body, data: built.data };
  return withScratch((scratch) => {
    const filed = { number: null, id: null, attempted: [] };
    try {
      const placed = placeInto({
        built,
        folder,
        scratch,
        post: (file, attach) => {
          const target = tracker.create({ title: built.title, bodyFile: file, labels: [label], assignee: repos.maintainer.login, attach, cwd: folder });
          filed.number = target.number;
          return target;
        },
        read: (target) => tracker.issue(target.number).body ?? "",
        write: (target, file) => tracker.editBody(target.number, file),
      });
      if (placed.problems.length) throw new FilingProblems(placed.problems);
      const verified = verifyFiled(tracker, filed.number, { label, login: repos.maintainer.login });
      if (verified.problems.length) throw new FilingProblems(verified.problems);
      filed.id = verified.issue.id;
      const earlier = findDuplicate(checked, tracker.open(label), { before: filed.number });
      if (earlier) {
        const duplicate = new FilingProblems([`An open request filed at the same time already asks this about the same ticket: #${earlier.number} ${earlier.title} (${earlier.html_url}); the earliest request stands and this one is withdrawn as its duplicate`]);
        duplicate.hint = `Use #${earlier.number} instead.`;
        throw duplicate;
      }
      linkTickets(tracker, checked.tickets, { number: filed.number, id: filed.id }, filed.attempted);
      return { number: filed.number, url: verified.issue.html_url, title: built.title, data: built.data, blocked: checked.tickets, pictures: placed.urls.length };
    } catch (error) {
      if (filed.number === null) throw error;
      throw withdraw(tracker, filed, problemsOf(error), scratch, error.hint, identity);
    }
  });
}

export function tagTicket(number, request, { pictures: folder, tracker, repos = readRepos(), templates, identity = AS_MAINTAINER }) {
  const checked = validateRequest(request, { pictures: folderPictures(folder), tag: true });
  const built = buildRequest(checked, { templates, tag: true, identity });
  const label = repos.maintainer.labels.task;
  const login = repos.maintainer.login;
  const ticket = tracker.issue(number);
  if (ticket.pull_request) throw new RequestRefused([`#${number} is a pull request, not a ticket`]);
  if (ticket.state !== "open") throw new RequestRefused([`#${number} is closed`]);
  if ((ticket.labels ?? []).some((l) => l.name === label)) throw new RequestRefused([`#${number} is already tagged ${label}`]);
  if (checked.tickets.includes(number)) throw new RequestRefused([`#${number} cannot hold itself up; remove it from "tickets"`]);
  const wasAssigned = (ticket.assignees ?? []).some((a) => a.login === login);
  const standing = tracker.comments(number).find((comment) => readDataLine(comment.body)?.tagged);
  if (standing) throw new RequestRefused([`#${number} already has a maintainer task comment (${standing.id}); if its tag was removed on purpose, delete that comment and tag again`]);
  return withScratch((scratch) => {
    const done = { comment: null, labelled: false, assigned: false, attempted: [] };
    try {
      const placed = placeInto({
        built,
        folder,
        scratch,
        post: (file, attach) => {
          const target = tracker.comment({ number, bodyFile: file, attach, cwd: folder });
          done.comment = target.id;
          return target;
        },
        read: (target) => tracker.readComment(target.id).body ?? "",
        write: (target, file) => tracker.editComment(target.id, file),
      });
      if (placed.problems.length) throw new FilingProblems(placed.problems);
      const earlier = tracker.comments(number).find((comment) => comment.id < done.comment && readDataLine(comment.body)?.tagged);
      if (earlier) throw new FilingProblems([`#${number} was tagged at the same time by comment ${earlier.id}; that tag stands and this one is withdrawn`]);
      done.labelled = true;
      tracker.addLabel(number, label);
      if (!wasAssigned) {
        done.assigned = true;
        tracker.addAssignee(number, login);
      }
      linkTickets(tracker, checked.tickets, { number, id: ticket.id }, done.attempted);
      const after = tracker.issue(number);
      const problems = [];
      if (!(after.labels ?? []).some((l) => l.name === label)) problems.push(`label ${label} is missing`);
      if (!(after.assignees ?? []).some((a) => a.login === login)) problems.push(`${login} is not assigned`);
      if (problems.length) throw new FilingProblems(problems);
      return { number, url: after.html_url, comment: done.comment, blocked: checked.tickets, pictures: placed.urls.length };
    } catch (error) {
      const steps = unlinkSteps(tracker, done.attempted, { number, id: ticket.id });
      if (done.assigned) steps.push([`unassigned ${login}`, () => tracker.removeAssignee(number, login)]);
      if (done.labelled) steps.push([`removed the label ${label}`, () => tracker.removeLabel(number, label)]);
      if (done.comment !== null) steps.push([`deleted the task comment ${done.comment}`, () => tracker.deleteComment(done.comment)]);
      if (!steps.length) throw error;
      const result = undo(steps);
      throw new Error(`Tagging ${tracker.repo}#${number} failed:\n${bullets(problemsOf(error))}\nRolled back: ${result.done.length ? result.done.join("; ") : "nothing"}.${result.failed.length ? `\n${bullets(result.failed)}` : ""}\nCorrect the cause and tag again.`);
    }
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

const lf = (text) => (text ?? "").replace(/\r\n/g, "\n");
const whoOf = (repos) => ({ maintainerLogin: repos.maintainer.login, app: repos.maintainer.app });
export const stamp = (iso) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
export const quote = (text) => lf(text).split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n");
export const unquote = (text) => lf(text).split("\n").map((line) => (line === ">" ? "" : line.replace(/^> /, ""))).join("\n");

function requestData(issue, comments, who) {
  if (issue.pull_request) throw new RequestRefused([`#${issue.number} is a pull request, not a maintainer request`]);
  const own = readDataLine(issue.body);
  if (own && !own.tagged) return { data: own, body: lf(issue.body), floor: null };
  const tag = comments.find((comment) => commentAuthor(comment, who) !== "other" && readDataLine(comment.body)?.tagged);
  if (tag) return { data: readDataLine(tag.body), body: lf(tag.body), floor: tag };
  throw new RequestRefused([`#${issue.number} is not a maintainer request: neither its body nor a task comment holds the request's data line`]);
}

export function readAnswer(issue, timeline, repos = readRepos()) {
  const who = whoOf(repos);
  const items = timeline.map((item, pos) => ({ ...item, pos }));
  const comments = items.filter((item) => item.event === "commented");
  const { data, body, floor: tagged } = requestData(issue, comments, who);
  const notes = comments.filter((comment) => commentAuthor(comment, who) === "tool").map((comment) => ({ comment, note: readNote(comment.body) })).filter((entry) => entry.note);
  const revision = notes.filter((entry) => entry.note.kind === "revised").at(-1)?.comment ?? null;
  const fellBack = data.kind === "decision" ? notes.filter((entry) => entry.note.kind === "fallback").at(-1) ?? null : null;
  const floorPos = (revision ?? tagged)?.pos ?? -1;
  const lastPos = (event) => items.filter((item) => item.event === event).at(-1)?.pos ?? -1;
  const closedPos = issue.state === "closed" ? lastPos("closed") : Infinity;
  const reopenedPos = lastPos("reopened");
  const maintainerWords = comments.filter((comment) => comment.pos > floorPos && comment.pos < closedPos && commentAuthor(comment, who) === "maintainer");
  const words = maintainerWords.map((comment) => ({ id: comment.id, url: comment.html_url, at: comment.created_at, body: lf(comment.body) }));
  const closing = notes.filter((entry) => ["withdrawn", "relayed"].includes(entry.note.kind) && entry.comment.pos > Math.max(floorPos, reopenedPos) && entry.comment.pos < closedPos && !maintainerWords.some((comment) => comment.pos > entry.comment.pos)).at(-1) ?? null;
  const shown = { at: revision?.created_at ?? tagged?.created_at ?? issue.created_at, revised: Boolean(revision), options: data.options?.length ?? 0, pictures: imageReferences(body).length };
  const wentAhead = fellBack ? { option: fellBack.note.option, name: fellBack.note.name ?? null, at: fellBack.comment.created_at, url: fellBack.comment.html_url, owner: fellBack.note.owner ?? null } : null;
  const base = { number: issue.number, url: issue.html_url, title: issue.title, kind: data.kind, tagged: Boolean(data.tagged), question: data.tagged ? issue.title : questionOf(issue.title), tickets: data.blocks ?? [], data, shown, recommended: data.recommended ? { letter: data.recommended, name: optionName(body, data.recommended) } : null, ...(wentAhead && { wentAhead }) };
  if (issue.state !== "closed") {
    if (words.length) return { ...base, state: "question", words };
    return wentAhead ? { ...base, state: "went-ahead", words: [] } : { ...base, state: "waiting", fallback: data.fallback ?? null, words: [] };
  }
  const closeEvent = items[closedPos] ?? null;
  const closed = { at: issue.closed_at, by: closeEvent?.actor?.login ?? issue.closed_by?.login ?? null, reason: issue.state_reason ?? null };
  if (!closeEvent) return { ...base, state: "unclear", closed, why: "the request is closed but its timeline holds no close, so the order of its answer cannot be read", words: [] };
  if (closing?.note.kind === "withdrawn") return { ...base, state: "withdrawn", closed, reason: closing.note.reason ?? null, words: [] };
  if (revision && floorPos > closedPos) return { ...base, state: "unclear", closed, why: "closed before its latest revision, so the close does not answer it", words: [] };
  const relay = closing?.note.kind === "relayed" ? closing : null;
  const closer = actorOf(closeEvent.actor ?? issue.closed_by, who);
  if (closer === "other") return { ...base, state: "unclear", closed, why: `closed by ${closed.by ?? "an account GitHub did not name"}, not by the maintainer`, words };
  if (closer === "tool" && !relay) return { ...base, state: "unclear", closed, why: "closed by the tool with no withdrawal or relayed answer to explain it", words };
  const said = relay ? [{ id: relay.comment.id, url: relay.comment.html_url, at: relay.note.at, body: relay.note.words, relayed: { session: relay.note.session, runner: relay.note.runner, postedAt: relay.comment.created_at } }] : words;
  const notPlanned = closed.reason === "not_planned" || closed.reason === "duplicate";
  if (data.kind === "task") return { ...base, state: notPlanned ? "will-not-do" : "done", closed, words: said };
  if (said.length) return { ...base, state: wentAhead ? "changed" : "answered", closed, words: said };
  if (wentAhead && !notPlanned) return { ...base, state: "kept", closed, words: [] };
  if (notPlanned) return { ...base, state: "unclear", closed, why: "a decision closed as not planned with no comment", words: [] };
  return { ...base, state: "accepted", closed, words: [] };
}

function optionName(body, letter) {
  if (!/^[A-E]$/.test(letter)) return null;
  const heading = new RegExp(`^### ${letter} · (.+?)(?: \\(recommended\\))?$`, "m").exec(body);
  return heading ? heading[1] : null;
}

export function fetchAnswer(number, { tracker, repos = readRepos() }) {
  return readAnswer(tracker.issue(number), tracker.timeline(number), repos);
}

const RUNNERS = { "claude-code": "Claude Code", codex: "Codex" };
const ANSWERED = ["answered", "accepted", "done", "will-not-do", "kept", "changed"];
const OPEN = ["waiting", "question", "went-ahead"];
const optionLabel = (option) => `${option.option}${option.name ? ` · ${option.name}` : ""}`;

export function answerKey(answer) {
  if (!answer.words.length) return `${answer.state}:closed:${answer.closed.at}`;
  const digest = createHash("sha256").update(JSON.stringify(answer.words.map((word) => word.body))).digest("hex").slice(0, 16);
  return `${answer.state}:comments:${answer.words.map((word) => word.id).join(",")}:${digest}`;
}

function wordsLines(answer) {
  return answer.words.flatMap((word) => {
    const lead = word.relayed
      ? `Typed by the maintainer in ${RUNNERS[word.relayed.runner] ?? word.relayed.runner} session ${word.relayed.session} at ${stamp(word.at)}, found word for word in that session's transcript and relayed on the request in [this comment](${word.url}):`
      : `The maintainer's words, from [their comment](${word.url}) at ${stamp(word.at)}:`;
    return ["", lead, "", quote(word.body)];
  });
}

export function recordBody(answer, identity = AS_MAINTAINER) {
  const what = answer.kind === "decision" ? "decision" : "task";
  const by = `at ${stamp(answer.closed.at)}`;
  const fallback = answer.wentAhead ? `the fallback ${optionLabel(answer.wentAhead)}, taken at ${stamp(answer.wentAhead.at)}` : "";
  const outcome = {
    answered: "in the maintainer's words, quoted below.",
    kept: `kept ${fallback}, by closing without comment ${by}.`,
    changed: `changed ${fallback}, in the maintainer's words quoted below; the session undoes the fallback and acts on them.`,
    accepted: `accepted the recommendation by closing without comment ${by}.`,
    done: `done: closed as completed by the maintainer ${by}${answer.words.length ? ", with the words quoted below" : ""}.`,
    "will-not-do": `will not be done: closed as not planned by the maintainer ${by}${answer.words.length ? ", with the words quoted below" : ""}.`,
  }[answer.state];
  const shown = answer.tagged
    ? `the task comment as posted at ${stamp(answer.shown.at)}, with ${answer.shown.pictures} picture(s)`
    : `the request as ${answer.shown.revised ? "last revised" : "filed"} at ${stamp(answer.shown.at)}, with ${answer.kind === "decision" ? `${answer.shown.options} options and ` : ""}${answer.shown.pictures} picture(s); GitHub's edit history keeps that version`;
  const lines = [
    answer.state === "kept" ? `**Kept by the maintainer**, from [#${answer.number}](${answer.url}).` : `**Maintainer ${what} recorded** from [#${answer.number}](${answer.url}).`,
    "",
    `- **${answer.kind === "decision" ? "Question" : "Task"}:** ${answer.question}`,
    `- **Answer:** ${outcome}`,
    `- **What was shown:** ${shown}.`,
  ];
  if (answer.recommended) lines.push(`- **Recommended:** ${answer.recommended.letter}${answer.recommended.name ? ` · ${answer.recommended.name}` : ""}`);
  lines.push(...wordsLines(answer));
  return toolText(lines.join("\n"), { kind: "record", request: answer.number, answer: answerKey(answer) }, identity);
}

function postNote(tracker, number, text, scratch, name, posted = () => {}) {
  const file = path.join(scratch, `${name}.md`);
  writeFileSync(file, text);
  const { id } = tracker.comment({ number, bodyFile: file, attach: [] });
  posted(id);
  const back = tracker.readComment(id);
  if (lf(back.body).trimEnd() !== lf(text).trimEnd()) throw new Error(`comment ${id} on #${number} reads back differently from the text the tool posted`);
  return { id, url: back.html_url };
}

export function recordAnswer(number, { tracker, repos = readRepos(), identity = AS_MAINTAINER }) {
  const answer = fetchAnswer(number, { tracker, repos });
  if (!ANSWERED.includes(answer.state)) {
    const next = { waiting: "wait for the answer", question: "answer the question with revise", "went-ahead": `it went ahead with ${answer.wentAhead ? optionLabel(answer.wentAhead) : "its fallback"} and waits for the maintainer to keep or change it`, withdrawn: "nothing waits on it", unclear: `${answer.why}; reopen it with a question through revise` }[answer.state];
    throw new RequestRefused([`#${number} has no answer to record: it is ${answer.state} (${next})`]);
  }
  const who = whoOf(repos);
  const key = answerKey(answer);
  const mine = (comment, kind) => commentAuthor(comment, who) === "tool" && readNote(comment.body)?.kind === kind && readNote(comment.body)?.request === number && readNote(comment.body)?.answer === key;
  return withScratch((scratch) => {
    const body = recordBody(answer, identity);
    const records = answer.tickets.map((ticket) => {
      const standing = tracker.comments(ticket).find((comment) => mine(comment, "record"));
      if (standing) return { ticket, id: standing.id, url: standing.html_url, reused: true };
      return { ticket, ...postNote(tracker, ticket, body, scratch, `record-${ticket}`), reused: false };
    });
    const confirmed = tracker.comments(number).find((comment) => mine(comment, "recorded"));
    const confirmation = confirmed
      ? { id: confirmed.id, url: confirmed.html_url, reused: true }
      : { ...postNote(tracker, number, toolText(`Recorded by the ask-maintainer tool${records.length ? ` on ${records.map((r) => `#${r.ticket} ([record](${r.url}))`).join(", ")}` : "; no other ticket waits on this request, so there was nothing to record elsewhere"}.`, { kind: "recorded", request: number, answer: key, records: records.map((r) => ({ ticket: r.ticket, comment: r.id })) }, identity), scratch, "recorded"), reused: false };
    return { answer, records, confirmation };
  });
}

function checkNoteText(value, what) {
  const reasons = [];
  if (!filled(value)) reasons.push(`${what} is empty`);
  else checkText(value, what, (reason) => reasons.push(reason));
  if (reasons.length) throw new RequestRefused(reasons);
  return value.trim();
}

const sameTickets = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

export function reviseRequest(number, request, changes, { pictures: folder, tracker, repos = readRepos(), now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, templates, identity = AS_MAINTAINER }) {
  const issue = tracker.issue(number);
  const answer = readAnswer(issue, tracker.timeline(number), repos);
  if (answer.tagged) throw new RequestRefused([`#${number} is a tagged ticket, not a filed request; it has no request body to revise`]);
  if (issue.state === "closed" && answer.state !== "unclear") throw new RequestRefused([`#${number} is closed (${answer.state}); revise reopens only a request whose answer is unclear`]);
  const changed = checkNoteText(changes, "What changed");
  const checked = validateRequest(request, { pictures: folderPictures(folder) });
  const problems = [];
  if (checked.kind !== answer.kind) problems.push(`#${number} is a ${answer.kind} request; a revision cannot make it a ${checked.kind}`);
  if (!sameTickets(checked.tickets, answer.tickets)) problems.push(`#${number} holds up ${ticketList(answer.tickets)}; a revision keeps the same tickets (file a new request for others)`);
  if (problems.length) throw new RequestRefused(problems);
  const built = buildRequest(checked, { now, timeZone, templates, identity, wentAhead: answer.wentAhead ?? null });
  const fallback = built.data.fallback;
  const clock = checked.kind === "task" ? "" : answer.wentAhead ? `\n\nIt has already gone ahead with ${optionLabel(answer.wentAhead)}: close this issue with no comment to keep that, or with a comment to change it.` : fallback ? `\n\nThe clock starts again: if you don't answer by ${describeTime(new Date(fallback.at), now, timeZone)}, I'll go ahead with ${fallback.option}.` : "\n\nIt still waits for you, with no fallback.";
  const note = toolText(`Revised by the ask-maintainer tool${issue.state === "closed" ? ", and reopened because the answer was unclear" : ""}; GitHub's edit history keeps the earlier version.\n\n**What changed:** ${changed}${clock}`, { kind: "revised", ...(fallback && !answer.wentAhead && { fallback: fallback.at }) }, identity);
  return withScratch((scratch) => {
    const done = { reopened: false, body: false, title: false, note: null };
    try {
      const { staged, pictures: staging } = stagingBody(built.body);
      let urls = {};
      if (staging.length) {
        const stagedFile = path.join(scratch, "staged.md");
        writeFileSync(stagedFile, `${staged}\n\n${note}`);
        const posted = tracker.comment({ number, bodyFile: stagedFile, attach: attachments(built.pictures, folder), cwd: folder });
        done.note = posted.id;
        if (posted.uploadError) throw new FilingProblems([`an upload failed: ${posted.uploadError}`]);
        const hosted = hostedAddresses(lf(tracker.readComment(posted.id).body), staging);
        if (hosted.problems.length) throw new FilingProblems(hosted.problems);
        urls = hosted.urls;
      }
      const finalBody = placeAddresses(built.body, urls);
      const bodyFile = path.join(scratch, "body.md");
      writeFileSync(bodyFile, finalBody);
      done.body = true;
      tracker.editBody(number, bodyFile);
      if (built.title !== issue.title) {
        done.title = true;
        tracker.editTitle(number, built.title);
      }
      const back = tracker.issue(number);
      const placed = checkPlacedBody(lf(back.body), Object.values(urls));
      if (!placed.length && lf(back.body).trimEnd() !== finalBody.trimEnd()) placed.push("the body read back differs from the body the tool wrote");
      if (back.title !== built.title) placed.push(`the title reads back as "${back.title}"`);
      if (placed.length) throw new FilingProblems(placed);
      let comment;
      if (done.note !== null) {
        const noteFile = path.join(scratch, "note.md");
        writeFileSync(noteFile, note);
        tracker.editComment(done.note, noteFile);
        const noted = tracker.readComment(done.note);
        if (lf(noted.body).trimEnd() !== lf(note).trimEnd()) throw new FilingProblems([`the revision note ${done.note} reads back differently`]);
        comment = { id: done.note, url: noted.html_url };
      } else {
        comment = postNote(tracker, number, note, scratch, "note", (id) => (done.note = id));
      }
      if (issue.state === "closed") {
        tracker.reopen(number);
        done.reopened = true;
      }
      return { number, url: back.html_url, title: built.title, data: built.data, note: comment, reopened: done.reopened, wentAhead: answer.wentAhead ?? null };
    } catch (error) {
      const steps = [];
      if (done.note !== null) steps.push([`deleted the revision note ${done.note}`, () => tracker.deleteComment(done.note)]);
      if (done.body) {
        const original = path.join(scratch, "original.md");
        writeFileSync(original, issue.body ?? "");
        steps.push(["restored the earlier body", () => tracker.editBody(number, original)]);
      }
      if (done.title) steps.push(["restored the earlier title", () => tracker.editTitle(number, issue.title)]);
      const result = undo(steps);
      throw new Error(`Revising ${tracker.repo}#${number} failed:\n${bullets(problemsOf(error))}\nRolled back: ${result.done.length ? result.done.join("; ") : "nothing"}.${result.failed.length ? `\n${bullets(result.failed)}` : ""}\nCorrect the cause and revise again.`);
    }
  });
}

function writeNote(scratch, text) {
  const file = path.join(scratch, `note-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(file, text);
  return file;
}

export function withdrawRequest(number, reason, { tracker, repos = readRepos(), identity = AS_MAINTAINER }) {
  const answer = fetchAnswer(number, { tracker, repos });
  if (answer.tagged) throw new RequestRefused([`#${number} is a tagged ticket; remove its ${repos.maintainer.labels.task} label instead of closing the ticket`]);
  if (answer.wentAhead) throw new RequestRefused([`#${number} already went ahead with ${optionLabel(answer.wentAhead)}; only the maintainer closes it, keeping or changing that`]);
  if (answer.state !== "waiting" && answer.state !== "question") throw new RequestRefused([`#${number} is already closed (${answer.state})`]);
  const why = checkNoteText(reason, "The reason");
  if (/[\r\n]/.test(why)) throw new RequestRefused(["The reason must be one line"]);
  return withScratch((scratch) => {
    tracker.close(number, "not_planned", writeNote(scratch, toolText(`Withdrawn by the ask-maintainer tool: ${asSentence(why)} Nothing waits on this request any more.`, { kind: "withdrawn", reason: why }, identity)));
    return fetchAnswer(number, { tracker, repos });
  });
}

export function answerFromChat(number, words, transcript, { tracker, repos = readRepos(), notPlanned = false, read, identity = AS_MAINTAINER }) {
  const answer = fetchAnswer(number, { tracker, repos });
  if (!OPEN.includes(answer.state)) throw new RequestRefused([`#${number} is already closed (${answer.state}); there is nothing to answer`]);
  const found = findTypedWords(words, transcript, read ? { read } : {});
  if (!found.ok) throw new RequestRefused([`The words are refused: ${found.reason}`]);
  if (/<!--|-->/.test(found.words)) throw new RequestRefused(["The words hold an HTML comment marker, which would hide them on GitHub"]);
  const text = `Relayed from chat by the ask-maintainer tool: the maintainer typed these words in ${RUNNERS[found.runner]} session ${found.session} at ${stamp(found.at)}, and the tool found them as one unbroken run in a message the maintainer typed in that session's transcript.\n\n${quote(found.words)}`;
  withScratch((scratch) => tracker.close(number, notPlanned ? "not_planned" : "completed", writeNote(scratch, toolText(text, { kind: "relayed", words: found.words, session: found.session, at: found.at, runner: found.runner }, identity))));
  return recordAnswer(number, { tracker, repos, identity });
}

function optionUndo(body, letter) {
  const at = new RegExp(`^### ${letter} · .*$`, "m").exec(body);
  if (!at) return null;
  const rest = body.slice(at.index + at[0].length);
  const section = rest.slice(0, rest.search(/^#{2,3} /m) === -1 ? rest.length : rest.search(/^#{2,3} /m));
  return /^- \*\*To undo later:\*\* (.+)$/m.exec(section)?.[1].trim() ?? null;
}

const duration = (ms) => {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

export function fallbackComment(going) {
  const lines = [
    `**Went ahead without you.** The wait ended at ${stamp(going.fallbackAt)} with no answer and no open question, so ${going.owner} is going ahead with **${optionLabel(going)}**, the option this request named as its fallback, and has moved it to "decided without you".`,
    "",
    `- **What it is doing:** ${going.doing}`,
    `- **To undo later:** ${going.undo ?? "the request states no undo cost for this option."}`,
    `- **Unanswered for:** ${going.unanswered}, since it was ${going.revised ? "last revised" : "filed"} at ${stamp(going.clockFrom)}.`,
    "",
    "**To keep it:** close this issue with no comment. **To change it:** close it with a comment, a letter or your own words, which are recorded word for word, and the fallback is undone. Comment without closing to ask a question.",
  ];
  return lines.join("\n");
}

export function fallbackRecordBody(going) {
  const lines = [
    `**Decided by fallback, not reviewed by the maintainer**, on [#${going.number}](${going.url}).`,
    "",
    `- **Question:** ${going.question}`,
    `- **Went ahead with:** ${optionLabel(going)}, the request's stated fallback, taken by ${going.owner} at ${stamp(going.at)}.`,
    `- **Unanswered for:** ${going.unanswered}, from the request being ${going.revised ? "last revised" : "filed"} at ${stamp(going.clockFrom)} to the fallback, with no answer and no open question.`,
    `- **What the session is doing:** ${going.doing}`,
    `- **To undo later:** ${going.undo ?? "the request states no undo cost for this option."}`,
  ];
  if (going.recommended) lines.push(`- **Recommended:** ${going.recommended}`);
  lines.push(`- **Next:** the request stays open under "decided without you" until the maintainer closes it, with no comment to keep this or with a comment to change it; either adds a second record here.`);
  return lines.join("\n");
}

export function fallbackRequest(number, owner, doing, { tracker, repos = readRepos(), now = new Date(), identity = AS_MAINTAINER }) {
  const issue = tracker.issue(number);
  const answer = readAnswer(issue, tracker.timeline(number), repos);
  const data = answer.data;
  const reasons = [];
  if (answer.kind !== "decision") reasons.push(`#${number} is a task; a task has no fallback and no clock`);
  else if (answer.wentAhead) reasons.push(`#${number} already went ahead with ${optionLabel(answer.wentAhead)} at ${stamp(answer.wentAhead.at)} (${answer.wentAhead.url})`);
  else if (!OPEN.includes(answer.state)) reasons.push(`#${number} is closed (${answer.state}); read and record its answer instead`);
  else if (!data.fallback) reasons.push(`#${number} waits for the maintainer because ${WAIT_REASONS[data.waits] ?? data.waits ?? "it names no fallback"}; a request that waits never falls back`);
  else {
    if (!filled(owner) || owner.trim() !== data.owner) reasons.push(`#${number} belongs to ${data.owner}, not ${filled(owner) ? owner.trim() : "an unnamed owner"}; only the run or session that asked takes its fallback`);
    if (answer.state === "question") reasons.push(`a maintainer question is open on #${number} (${answer.words.at(-1).url}); the clock is stopped until it is answered with revise`);
    else if (now.getTime() < Date.parse(data.fallback.at)) reasons.push(`#${number} falls back at ${stamp(data.fallback.at)}, ${duration(Date.parse(data.fallback.at) - now.getTime() + 59999)} from now; the wait has not passed`);
  }
  if (reasons.length) throw new RequestRefused(reasons);
  const text = checkNoteText(doing, "What the session is doing");
  const body = lf(issue.body);
  const name = optionName(body, data.fallback.option);
  const going = {
    number,
    url: issue.html_url,
    question: answer.question,
    option: data.fallback.option,
    name,
    owner: data.owner,
    doing: text.replace(/\s*\n\s*/g, " "),
    undo: optionUndo(body, data.fallback.option) ? asSentence(optionUndo(body, data.fallback.option)) : null,
    fallbackAt: data.fallback.at,
    clockFrom: answer.shown.at,
    revised: answer.shown.revised,
    unanswered: duration(now.getTime() - Date.parse(answer.shown.at)),
    at: now.toISOString(),
    recommended: answer.recommended ? optionLabel({ option: answer.recommended.letter, name: answer.recommended.name }) : null,
  };
  const label = repos.maintainer.labels.decidedWithoutYou;
  const who = whoOf(repos);
  const attempt = { request: number, option: going.option, fallbackAt: going.fallbackAt };
  const leftBy = (ticket) => tracker.comments(ticket).filter((comment) => commentAuthor(comment, who) === "tool" && readNote(comment.body)?.kind === "fallback-record" && readNote(comment.body)?.request === number);
  const sameAttempt = (comment) => readNote(comment.body).option === attempt.option && readNote(comment.body).fallbackAt === attempt.fallbackAt;
  const labelled = (value) => (value.labels ?? []).some((l) => (typeof l === "string" ? l : l.name) === label);
  return withScratch((scratch) => {
    const done = { note: null, labelled: false, records: [] };
    try {
      const recordText = toolText(fallbackRecordBody(going), { kind: "fallback-record", ...attempt }, identity);
      const records = answer.tickets.map((ticket) => {
        const left = leftBy(ticket);
        for (const stale of left.filter((comment) => !sameAttempt(comment))) tracker.deleteComment(stale.id);
        const found = left.find(sameAttempt);
        if (found) return { ticket, id: found.id, url: found.html_url, reused: true };
        return { ticket, ...postNote(tracker, ticket, recordText, scratch, `fallback-record-${ticket}`, (id) => done.records.push([ticket, id])), reused: false };
      });
      done.labelled = true;
      if (!labelled(issue)) {
        tracker.addLabel(number, label);
      }
      const back = tracker.issue(number);
      const problems = [];
      if (back.state !== "open") problems.push(`#${number} reads back ${back.state}`);
      if (!labelled(back)) problems.push(`label ${label} is missing`);
      if (problems.length) throw new FilingProblems(problems);
      const note = postNote(tracker, number, toolText(fallbackComment(going), { kind: "fallback", option: going.option, name: going.name, owner: going.owner, at: going.at, fallbackAt: going.fallbackAt }, identity), scratch, "fallback", (id) => (done.note = id));
      const after = readAnswer(tracker.issue(number), tracker.timeline(number), repos);
      if (after.state !== "went-ahead" || after.wentAhead?.url !== note.url) throw new FilingProblems([`#${number} changed while going ahead: it now reads ${after.state}${after.words.length ? `, with the maintainer's comment ${after.words.at(-1).url}` : ""}; read it again before acting`]);
      return { number, url: back.html_url, option: going.option, name, note, records, label };
    } catch (error) {
      const steps = done.records.map(([ticket, id]) => [`deleted the fallback record ${id} on #${ticket}`, () => tracker.deleteComment(id)]);
      if (done.labelled) steps.push([`removed the label ${label}`, () => tracker.removeLabel(number, label)]);
      if (done.note !== null) steps.push([`deleted the fallback note ${done.note}`, () => tracker.deleteComment(done.note)]);
      const result = undo(steps);
      throw new Error(`Going ahead on ${tracker.repo}#${number} failed:\n${bullets(problemsOf(error))}\nRolled back: ${result.done.length ? result.done.join("; ") : "nothing"}.${result.failed.length ? `\n${bullets(result.failed)}` : ""}\nCorrect the cause and run fallback again.`);
    }
  });
}

export const WAIT_INTERVAL_SECONDS = 60;
const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export async function waitForRequests(numbers, { tracker, refresh, repos = readRepos(), clock = () => new Date(), sleep = sleepFor, intervalSeconds = WAIT_INTERVAL_SECONDS, warn = (message) => console.error(message) }) {
  if (!numbers.length) throw new RequestRefused(["Name at least one request to wait for"]);
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < WAIT_INTERVAL_SECONDS) throw new RequestRefused([`The interval must be a whole number of seconds, at least ${WAIT_INTERVAL_SECONDS}`]);
  const who = whoOf(repos);
  const interval = intervalSeconds * 1000;
  const maintainerIds = (timeline) => new Set(timeline.filter((item) => item.event === "commented" && commentAuthor(item, who) === "maintainer").map((item) => item.id));
  const result = (entry, why) => {
    const returnedAt = clock();
    const out = { number: entry.number, why, state: entry.answer.state, returnedAt: returnedAt.toISOString(), answer: entry.answer };
    if (why === "closed" && entry.answer.closed?.at) out.secondsSinceClose = Math.round((returnedAt.getTime() - Date.parse(entry.answer.closed.at)) / 1000);
    if (why === "fallback") out.fallbackAt = entry.answer.fallback.at;
    return out;
  };
  const settled = (entry) => !OPEN.includes(entry.answer.state);
  const fallbackAt = (entry) => (entry.answer.state === "waiting" && entry.answer.fallback?.at ? Date.parse(entry.answer.fallback.at) : Infinity);
  const watched = numbers.map((number) => {
    const readAt = clock().getTime();
    const polled = tracker.poll(number, null);
    const timeline = tracker.timeline(number);
    const answer = readAnswer(polled.issue, timeline, repos);
    return { number, etag: polled.etag, readAt, nextRead: clock().getTime() + interval, answer, seen: maintainerIds(timeline), fresh: false };
  });
  for (;;) {
    const closed = watched.find(settled);
    if (closed) return result(closed, "closed");
    const now = clock().getTime();
    const confirmed = watched.filter((entry) => fallbackAt(entry) <= now && entry.readAt >= fallbackAt(entry)).sort((x, y) => fallbackAt(x) - fallbackAt(y))[0];
    if (confirmed) return result(confirmed, "fallback");
    const next = Math.min(...watched.map((entry) => entry.nextRead));
    if (now < next) {
      await sleep(next - now);
      continue;
    }
    if (refresh) {
      try {
        tracker = await refresh();
      } catch (error) {
        warn(`Resolving the tool's GitHub identity failed (${error.message.split("\n")[0]}); reading with the previous one.`);
      }
    }
    for (const entry of watched) {
      const readAt = clock().getTime();
      if (readAt < entry.nextRead) continue;
      let polled;
      try {
        polled = tracker.poll(entry.number, entry.etag);
      } catch (error) {
        entry.nextRead = clock().getTime() + interval;
        warn(`Reading #${entry.number} failed (${error.message.split("\n")[0]}); trying again in ${intervalSeconds} seconds.`);
        continue;
      }
      if (polled.status !== 304) {
        const timeline = tracker.timeline(entry.number);
        entry.etag = polled.etag;
        entry.answer = readAnswer(polled.issue, timeline, repos);
        entry.fresh = [...maintainerIds(timeline)].some((id) => !entry.seen.has(id));
      }
      entry.readAt = readAt;
      entry.nextRead = clock().getTime() + interval;
      if (settled(entry)) return result(entry, "closed");
      if (entry.fresh) return result(entry, "comment");
    }
  }
}

export function formatAnswer(answer) {
  const lines = [`#${answer.number} ${answer.title}`, `  ${answer.url}`];
  const closed = answer.closed ? `closed by ${answer.closed.by ?? "an unnamed account"} at ${stamp(answer.closed.at)} as ${answer.closed.reason ?? "closed"}` : "";
  const state = {
    waiting: `waiting for the maintainer${answer.fallback ? `; falls back to ${answer.fallback.option} at ${answer.fallback.at}` : answer.kind === "decision" ? "; no fallback" : ""}`,
    question: "a question: the maintainer commented without closing; reply with revise",
    answered: `answered in the maintainer's words; ${closed}`,
    "went-ahead": `went ahead without the maintainer with ${answer.wentAhead ? `${optionLabel(answer.wentAhead)} at ${stamp(answer.wentAhead.at)}` : "its fallback"}; waits for them to keep it (close with no comment) or change it (close with a comment)`,
    kept: `the maintainer kept the fallback ${answer.wentAhead ? optionLabel(answer.wentAhead) : ""} by closing without comment; ${closed}`,
    changed: `the maintainer changed the fallback ${answer.wentAhead ? optionLabel(answer.wentAhead) : ""} in their words; undo it and act on them; ${closed}`,
    accepted: `accepted the recommendation (${answer.recommended?.letter ?? "?"}) by closing without comment; ${closed}`,
    done: `done; ${closed}`,
    "will-not-do": `will not be done; ${closed}`,
    unclear: `unclear: ${answer.why}; ${closed}`,
    withdrawn: `withdrawn: ${answer.reason ?? "no reason recorded"}`,
  }[answer.state];
  lines.push(`  state: ${answer.state} (${state})`);
  for (const word of answer.words) lines.push(`  words${word.relayed ? `, relayed from ${RUNNERS[word.relayed.runner] ?? word.relayed.runner} session ${word.relayed.session}` : ""} at ${stamp(word.at)}: ${word.url}`, ...quote(word.body).split("\n").map((line) => `    ${line}`));
  return lines.join("\n");
}

const USAGE = `Usage:
  node .agents/skills/ask-maintainer/maintainer-request.mjs file <request.json> [<pictures-folder>] [--dry-run]
  node .agents/skills/ask-maintainer/maintainer-request.mjs tag <ticket> <task.json> [<pictures-folder>]
  node .agents/skills/ask-maintainer/maintainer-request.mjs list [--json]
  node .agents/skills/ask-maintainer/maintainer-request.mjs identity
  node .agents/skills/ask-maintainer/maintainer-request.mjs read <request> [--json]
  node .agents/skills/ask-maintainer/maintainer-request.mjs record <request>
  node .agents/skills/ask-maintainer/maintainer-request.mjs revise <request> <request.json> <what-changed.md> [<pictures-folder>]
  node .agents/skills/ask-maintainer/maintainer-request.mjs withdraw <request> <reason>
  node .agents/skills/ask-maintainer/maintainer-request.mjs answer-from-chat <request> <words-file> <transcript.jsonl> [--not-planned]
  node .agents/skills/ask-maintainer/maintainer-request.mjs wait <request> [<request> ...] [--interval=<seconds>]
  node .agents/skills/ask-maintainer/maintainer-request.mjs fallback <request> <owner> <what-it-is-doing.md>
The pictures folder defaults to the request file's folder.`;

const ISSUE_NUMBER = /^#?[1-9]\d*$/;
const issueNumber = (arg) => Number(arg.replace(/^#/, ""));

function readText(file, what) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    throw new RequestRefused([`${file} is not a readable ${what} file: ${error.message}`]);
  }
}

function answerCommands(command, args, flags, { tracker, repos, out, now, identity, resolve }) {
  const number = ISSUE_NUMBER.test(args[0] ?? "") ? issueNumber(args[0]) : null;
  if (command === "read" && number && args.length === 1 && flags.every((flag) => flag === "--json")) {
    const answer = fetchAnswer(number, { tracker, repos });
    out(flags.includes("--json") ? JSON.stringify(answer, null, 2) : formatAnswer(answer));
    return 0;
  }
  if (command === "record" && number && args.length === 1 && !flags.length) {
    const { answer, records, confirmation } = recordAnswer(number, { tracker, repos, identity });
    out(`${formatAnswer(answer)}\nRecorded: ${records.length ? records.map((r) => `#${r.ticket} ${r.url}${r.reused ? " (already there)" : ""}`).join("; ") : "no other ticket waits on this request"}.\nConfirmed on #${number}: ${confirmation.url}${confirmation.reused ? " (already there)" : ""}`);
    return 0;
  }
  if (command === "revise" && number && args.length >= 3 && args.length <= 4 && !flags.length) {
    const file = path.resolve(args[1]);
    const result = reviseRequest(number, readRequest(file), readText(path.resolve(args[2]), "what-changed"), { pictures: path.resolve(args[3] ?? path.dirname(file)), tracker, repos, now, identity });
    const clock = result.wentAhead ? `already went ahead with ${result.wentAhead.option} at ${result.wentAhead.at}` : result.data.fallback ? `falls back at ${result.data.fallback.at} to ${result.data.fallback.option}` : result.data.kind === "task" ? "a task, with no clock" : "waits for the maintainer, with no fallback";
    out(`Revised #${number}${result.reopened ? " and reopened it" : ""}: ${result.url}\n${clock}; what changed is posted at ${result.note.url}.`);
    return 0;
  }
  if (command === "withdraw" && number && args.length === 2 && !flags.length) {
    const answer = withdrawRequest(number, args[1], { tracker, repos, identity });
    out(formatAnswer(answer));
    return 0;
  }
  if (command === "answer-from-chat" && number && args.length === 3 && flags.every((flag) => flag === "--not-planned")) {
    const { answer, records, confirmation } = answerFromChat(number, readText(path.resolve(args[1]), "words"), path.resolve(args[2]), { tracker, repos, notPlanned: flags.includes("--not-planned"), identity });
    out(`${formatAnswer(answer)}\nRecorded: ${records.length ? records.map((r) => `#${r.ticket} ${r.url}`).join("; ") : "no other ticket waits on this request"}.\nConfirmed on #${number}: ${confirmation.url}`);
    return 0;
  }
  if (command === "fallback" && number && args.length === 3 && !flags.length) {
    const result = fallbackRequest(number, args[1], readText(path.resolve(args[2]), "what-it-is-doing"), { tracker, repos, now, identity });
    out(`Went ahead on #${number} with ${optionLabel(result)}: ${result.note.url}\nLabelled "${result.label}"; the request stays open for the maintainer to keep or change.\nRecorded: ${result.records.length ? result.records.map((r) => `#${r.ticket} ${r.url}`).join("; ") : "no other ticket waits on this request"}.`);
    return 0;
  }
  const interval = flags.find((flag) => flag.startsWith("--interval="));
  if (command === "wait" && args.length && args.every((arg) => ISSUE_NUMBER.test(arg)) && flags.every((flag) => /^--interval=\d+$/.test(flag)) && flags.length <= 1) {
    const refresh = resolve ? async () => ghTracker(ticketsRepo(repos), undefined, await resolve()) : undefined;
    return waitForRequests([...new Set(args.map(issueNumber))], { tracker, refresh, repos, intervalSeconds: interval ? Number(interval.slice("--interval=".length)) : WAIT_INTERVAL_SECONDS }).then((result) => {
      const why = { closed: "was closed", comment: "has a new maintainer comment", fallback: "reached its fallback time" }[result.why];
    out(`#${result.number} ${why} (returned at ${result.returnedAt}${result.secondsSinceClose === undefined ? "" : `, ${result.secondsSinceClose} seconds after the close`}${result.fallbackAt ? `, fallback time ${result.fallbackAt}` : ""}).\n${formatAnswer(result.answer)}`);
      return 0;
    });
  }
  return null;
}

function readRequest(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new RequestRefused([`${file} is not a readable JSON request file: ${error.message}`]);
  }
}

function filedBy(identity) {
  return identity.mode === "app" ? `as the GitHub App ${identity.login}.` : `through the maintainer's own account, so GitHub sends them no alert: ${identity.reason}.`;
}

export function main(argv, { repos = readRepos(), identity = AS_MAINTAINER, tracker = ghTracker(ticketsRepo(repos), undefined, identity), out = console.log, now = new Date(), resolve } = {}) {
  const [command, ...rest] = argv;
  const flags = rest.filter((arg) => arg.startsWith("--"));
  const args = rest.filter((arg) => !arg.startsWith("--"));
  if (command === "file" && args.length >= 1 && args.length <= 2 && flags.every((flag) => flag === "--dry-run")) {
    const file = path.resolve(args[0]);
    const result = fileRequest(readRequest(file), { pictures: path.resolve(args[1] ?? path.dirname(file)), tracker, repos, now, dryRun: flags.includes("--dry-run"), identity });
    if (result.dryRun) {
      out(`Dry run: the request is complete and no open request duplicates it. Title:\n${result.title}\n\n${result.body}`);
      return 0;
    }
    const fallback = result.data.fallback ? `falls back at ${describeTime(new Date(result.data.fallback.at), now, Intl.DateTimeFormat().resolvedOptions().timeZone)} (${result.data.fallback.at}) to ${result.data.fallback.option}` : result.data.waits ? "waits for the maintainer, with no fallback" : "a task, with no clock";
    out(`Filed #${result.number}: ${result.url}\n${fallback}; blocks ${result.blocked.map((n) => `#${n}`).join(", ")}; ${result.pictures} picture(s) hosted and in place.\nFiled ${filedBy(identity)}`);
    return 0;
  }
  if (command === "tag" && args.length >= 2 && args.length <= 3 && !flags.length && /^#?[1-9]\d*$/.test(args[0])) {
    const file = path.resolve(args[1]);
    const result = tagTicket(Number(args[0].replace(/^#/, "")), readRequest(file), { pictures: path.resolve(args[2] ?? path.dirname(file)), tracker, repos, identity });
    out(`Tagged #${result.number} as a maintainer task: ${result.url} (comment ${result.comment}, ${result.pictures} picture(s)); blocks ${result.blocked.length ? result.blocked.map((n) => `#${n}`).join(", ") : "no other ticket"}; no issue was created.\nTagged ${filedBy(identity)}`);
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
  if (command === "identity" && !rest.length) {
    out(`Acting ${filedBy(identity)}`);
    return 0;
  }
  const answered = answerCommands(command, args, flags, { tracker, repos, out, now, identity, resolve });
  if (answered !== null) return answered;
  console.error(USAGE);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const repos = readRepos();
    const resolve = () => resolveIdentity({ repo: ticketsRepo(repos), app: repos.maintainer.app });
    const identity = await resolve();
    process.exitCode = await main(process.argv.slice(2), { repos, identity, resolve });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
