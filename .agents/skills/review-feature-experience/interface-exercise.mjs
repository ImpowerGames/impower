import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The interface exercise of the experience review. Nothing is built when a
// design is reviewed, so the reviewing session walks through an author's tasks
// on paper. This module does the two mechanical parts: it checks that each
// declared interface element carries the four items the walkthrough needs, and
// it prints the per-task record the session fills in.
export const REQUIRED_ITEMS = ["Location", "Trigger", "States", "Failure view"];
export const REQUIRED_TASKS = ["First use", "Everyday repeated use", "Recovering from a mistake", "Undoing or removing what the feature added"];
export const COLUMNS = ["What the author sees", "What the author does", "What the tickets leave unspecified"];

const ELEMENT = /^Interface element:\s*(.+?)\s*$/i;
const ITEM = /^(Location|Trigger|States|Failure view)\s*:\s*(.*?)\s*$/i;
const HEADING = /^#{1,6}\s/;
const BULLET = /^\s*[-*+]\s+/;
const FENCE = /^\s*(?:`{3,}|~{3,})/;
const canonical = (label) => REQUIRED_ITEMS.find((item) => item.toLowerCase() === label.toLowerCase());
const emptyItems = () => Object.fromEntries(REQUIRED_ITEMS.map((item) => [item, null]));
// Bold markers and a leading bullet are decoration on the line they sit in.
const plain = (line) => line.replace(BULLET, "").replace(/\*\*/g, "").trim();

// The declared elements of one ticket body: an `Interface element: <name>`
// line, then lines labeled Location, Trigger, States and Failure view, as
// bullets or bare lines. The block may sit inside a code fence, its labels may
// be bold, and a label may carry its text on nested bullets or continuation
// lines. A heading, or a paragraph after a blank line, or the next element
// line ends the block. A name declared twice (a complete block under Proposed
// solution and an abbreviated copy in an embedded draft, say) is one element
// whose items come from whichever copy states them.
export function interfaceElements(body) {
  const blocks = [];
  let current = null, pending = null, blank = false;
  for (const raw of String(body ?? "").split(/\r?\n/)) {
    if (FENCE.test(raw)) continue;
    const text = plain(raw), bulleted = BULLET.test(raw);
    const element = ELEMENT.exec(text);
    if (element) { current = { name: element[1], items: emptyItems() }; blocks.push(current); pending = null; blank = false; continue; }
    if (!current) continue;
    if (!raw.trim()) { blank = true; continue; }
    if (HEADING.test(raw)) { current = null; pending = null; blank = false; continue; }
    const item = ITEM.exec(text);
    if (item) { pending = canonical(item[1]); current.items[pending] = item[2] || null; blank = false; continue; }
    if (bulleted || !blank) {
      if (pending && text) current.items[pending] = current.items[pending] ? `${current.items[pending]} ${text}` : text;
      blank = false;
      continue;
    }
    current = null; pending = null; blank = false;
  }
  const elements = [];
  for (const block of blocks) {
    const twin = elements.find((element) => element.name.toLowerCase() === block.name.toLowerCase());
    if (!twin) { elements.push(block); continue; }
    for (const item of REQUIRED_ITEMS) twin.items[item] ??= block.items[item];
  }
  return elements;
}

export const missingItems = (element) => REQUIRED_ITEMS.filter((item) => !element.items[item]);

// Reviewability of the interface surface across the tickets. A name declared
// in several tickets (the parent's complete block and a slice's abbreviated
// copy) is one element whose items come from whichever ticket states them.
// The named elements are the ones the tickets describe only in prose; a named
// element that no ticket declares lacks all four items. With no element at all
// the result is undetermined: the session names the elements the prose
// describes, or reports that the feature has no interface surface.
export function reviewability(tickets, named = []) {
  const elements = [];
  for (const ticket of tickets) {
    for (const element of interfaceElements(ticket.body)) {
      const twin = elements.find((candidate) => candidate.name.toLowerCase() === element.name.toLowerCase());
      if (!twin) { elements.push({ ticket: ticket.number, tickets: [ticket.number], name: element.name, items: { ...element.items } }); continue; }
      twin.tickets.push(ticket.number);
      for (const item of REQUIRED_ITEMS) twin.items[item] ??= element.items[item];
    }
  }
  for (const element of elements) element.missing = missingItems(element);
  for (const name of named) {
    if (elements.some((element) => element.name.toLowerCase() === name.toLowerCase())) continue;
    elements.push({ ticket: null, tickets: [], name, items: emptyItems(), missing: [...REQUIRED_ITEMS] });
  }
  return { elements, reviewable: elements.length ? elements.every((element) => !element.missing.length) : null };
}

const ticketLabel = (ticket) => `${typeof ticket === "number" ? "#" : ""}${ticket}`;

export function reviewabilityReport(result) {
  if (!result.elements.length) return 'No interface element is declared in these tickets. Name each element the tickets describe in prose with --element "<name>" to record what it lacks, or report that the feature has no interface surface.';
  const lines = [];
  for (const element of result.elements) {
    const where = element.ticket === null ? "named, not declared in any ticket" : `declared in ${element.tickets.map(ticketLabel).join(", ")}`;
    lines.push(element.missing.length ? `Not reviewable: ${element.name} (${where}) lacks ${element.missing.join(", ")}.` : `Reviewable: ${element.name} (${where}) declares its location, trigger, states and failure view.`);
  }
  lines.push(result.reviewable ? "The interface surface is reviewable; fill the walkthrough record for each element." : "The interface surface is not reviewable yet; ask the maintainer for the missing items above before the walkthrough.");
  return lines.join("\n");
}

// The record one element's walkthrough fills in: the four required tasks, each
// a table with the three columns.
export function walkthroughRecord(name) {
  const lines = [`## Interface walkthrough: ${name}`, "", "Every entry in the third column is a finding; so is a step that conflicts with how the existing editor works.", ""];
  REQUIRED_TASKS.forEach((task, index) => {
    lines.push(`### Task ${index + 1}: ${task}`, "", `| Step | ${COLUMNS.join(" | ")} |`, `| --- | ${COLUMNS.map(() => "---").join(" | ")} |`, `| 1 |${COLUMNS.map(() => "  |").join("")}`, "");
  });
  return lines.join("\n");
}

export const ghIssueCommand = (number) => ["api", `repos/ImpowerGames/impower/issues/${number}`];
export function ghIssueBody(number) {
  return JSON.parse(execFileSync("gh", ghIssueCommand(number), { encoding: "utf8", windowsHide: true })).body ?? "";
}

// Sources are live issues (`--issue N`, read through gh) or markdown files.
function readTickets(sources, fetchIssue) {
  return sources.map((source) => {
    if (source.issue !== undefined) return { number: source.issue, body: fetchIssue(source.issue) };
    const file = path.resolve(source.file);
    return { number: path.basename(file), body: fs.readFileSync(file, "utf8") };
  });
}

const USAGE = {
  check: "Usage: interface-exercise.mjs check (--issue <number> | <ticket.md>)... [--element <name>]...",
  record: "Usage: interface-exercise.mjs record --element <name> [--element <name>]...",
};

export function main(argv, { fetchIssue = ghIssueBody } = {}) {
  const [command, ...rest] = argv;
  const usage = USAGE[command] ?? "Usage: interface-exercise.mjs <check|record> ...";
  if (!USAGE[command]) throw new Error(usage);
  const named = [], sources = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--element") {
      const value = rest[++i];
      if (value === undefined || value.startsWith("-")) throw new Error(`${usage}; --element takes a name`);
      named.push(value);
    } else if (arg === "--issue") {
      const value = rest[++i];
      if (!/^\d+$/.test(value ?? "")) throw new Error(`${usage}; --issue takes an issue number, got ${JSON.stringify(value ?? "")}`);
      sources.push({ issue: Number(value) });
    } else if (arg.startsWith("-")) throw new Error(`Unknown argument ${arg}`);
    else sources.push({ file: arg });
  }
  if (command === "check") {
    if (!sources.length) throw new Error(usage);
    const result = reviewability(readTickets(sources, fetchIssue), named);
    return { output: reviewabilityReport(result), status: result.reviewable ? 0 : 1 };
  }
  if (!named.length || sources.length) throw new Error(usage);
  return { output: named.map(walkthroughRecord).join("\n"), status: 0 };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { const { output, status } = main(process.argv.slice(2)); console.log(output); process.exitCode = status; }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
