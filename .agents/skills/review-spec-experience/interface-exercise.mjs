import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The interface exercise of the experience review. Nothing is built when a
// design is reviewed, so the reviewer walks through an author's tasks on paper.
// This module does the two mechanical parts: it checks that each declared
// interface element carries the four items the walkthrough needs, and it
// prints the per-task record the reviewer fills in.
export const REQUIRED_ITEMS = ["Location", "Trigger", "States", "Failure view"];
export const REQUIRED_TASKS = ["First use", "Everyday repeated use", "Recovering from a mistake", "Undoing or removing what the feature added"];
export const COLUMNS = ["What the author sees", "What the author does", "What the spec leaves unspecified"];

const ELEMENT = /^\s*Interface element:\s*(.+?)\s*$/i;
const ITEM = /^\s*[-*+]\s*(Location|Trigger|States|Failure view)\s*:\s*(.*?)\s*$/i;
const HEADING = /^#{1,6}\s/;
const canonical = (label) => REQUIRED_ITEMS.find((item) => item.toLowerCase() === label.toLowerCase());
const emptyItems = () => Object.fromEntries(REQUIRED_ITEMS.map((item) => [item, null]));

// The declared elements of one ticket body: an `Interface element: <name>`
// line, then bullets labeled Location, Trigger, States and Failure view. A
// heading, a paragraph after a blank line, or the next element line ends the
// block; fenced code is skipped.
export function interfaceElements(body) {
  const elements = [];
  let current = null, fence = null, blank = false;
  for (const line of String(body ?? "").split(/\r?\n/)) {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line);
    if (mark) {
      if (!fence) fence = mark[1];
      else if (mark[1][0] === fence[0] && mark[1].length >= fence.length) fence = null;
      current = null;
      continue;
    }
    if (fence) continue;
    const element = ELEMENT.exec(line);
    if (element) { current = { name: element[1], items: emptyItems() }; elements.push(current); blank = false; continue; }
    if (!current) continue;
    if (!line.trim()) { blank = true; continue; }
    const item = ITEM.exec(line);
    if (item) { if (item[2]) current.items[canonical(item[1])] = item[2]; blank = false; continue; }
    if (blank || HEADING.test(line)) current = null;
    blank = false;
  }
  return elements;
}

export const missingItems = (element) => REQUIRED_ITEMS.filter((item) => !element.items[item]);

// Reviewability of the interface surface across the snapshot's tickets. The
// named elements are the ones the tickets describe only in prose; a named
// element that no ticket declares lacks all four items. With no element at all
// the result is undetermined: the reviewer names the elements the prose
// describes, or reports that the feature has no interface surface.
export function reviewability(tickets, named = []) {
  const elements = [];
  for (const ticket of tickets) for (const element of interfaceElements(ticket.body)) elements.push({ ticket: ticket.number, name: element.name, items: element.items, missing: missingItems(element) });
  for (const name of named) {
    if (elements.some((element) => element.name.toLowerCase() === name.toLowerCase())) continue;
    elements.push({ ticket: null, name, items: emptyItems(), missing: [...REQUIRED_ITEMS] });
  }
  return { elements, reviewable: elements.length ? elements.every((element) => !element.missing.length) : null };
}

export function reviewabilityReport(result) {
  if (!result.elements.length) return 'No interface element is declared in these tickets. Name each element the tickets describe in prose with --element "<name>" to record what it lacks, or report that the feature has no interface surface.';
  const lines = [];
  for (const element of result.elements) {
    const where = element.ticket === null ? "named, not declared in any ticket" : `declared in ${typeof element.ticket === "number" ? "#" : ""}${element.ticket}`;
    lines.push(element.missing.length ? `Not reviewable: ${element.name} (${where}) lacks ${element.missing.join(", ")}.` : `Reviewable: ${element.name} (${where}) declares its location, trigger, states and failure view.`);
  }
  lines.push(result.reviewable ? "The interface surface is reviewable; fill the walkthrough record for each element." : "The interface surface is not reviewable; report the missing items above and stop the exercise there.");
  return lines.join("\n");
}

// The record one element's walkthrough fills in: the four required tasks, each
// a table with the three columns.
export function walkthroughRecord(name) {
  const lines = [`## Interface walkthrough: ${name}`, "", "Every entry in the third column is a finding; so is a step that conflicts with how the existing editor works.", ""];
  REQUIRED_TASKS.forEach((task, index) => {
    lines.push(`### Task ${index + 1}: ${task}`, "", `| Step | ${COLUMNS.join(" | ")} |`, `| --- | ${COLUMNS.map(() => "---").join(" | ")} |`, "| 1 |  |  |  |", "");
  });
  return lines.join("\n");
}

function readTickets(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!file.endsWith(".json")) return [{ number: path.basename(file), body: text }];
  const snapshot = JSON.parse(text);
  if (!Array.isArray(snapshot.tickets)) throw new Error(`${file} is not a spec snapshot`);
  return snapshot.tickets.map(({ number, body }) => ({ number, body }));
}

export function main(argv) {
  const [command, ...rest] = argv;
  const named = [], files = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--element" && rest[i + 1] !== undefined) named.push(rest[++i]);
    else if (rest[i].startsWith("-")) throw new Error(`Unknown argument ${rest[i]}`);
    else files.push(rest[i]);
  }
  if (command === "check") {
    if (files.length !== 1) throw new Error("Usage: interface-exercise.mjs check <snapshot.json or ticket.md> [--element <name>]...");
    const result = reviewability(readTickets(path.resolve(files[0])), named);
    return { output: reviewabilityReport(result), status: result.reviewable ? 0 : 1 };
  }
  if (command === "record") {
    if (!named.length || files.length) throw new Error("Usage: interface-exercise.mjs record --element <name> [--element <name>]...");
    return { output: named.map(walkthroughRecord).join("\n"), status: 0 };
  }
  throw new Error("Usage: interface-exercise.mjs <check|record> ...");
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { const { output, status } = main(process.argv.slice(2)); console.log(output); process.exitCode = status; }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
