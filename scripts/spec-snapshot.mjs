import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// A spec review freezes the parent Feature and its slice Tasks as one snapshot
// file before any reviewer launches. Reviewers read the frozen bodies and quote
// the snapshot digest in their reports; the launcher validates a report by
// finding that digest in a comment on the parent issue, as it finds a head SHA
// in a comment on a pull request.
export const repository = "ImpowerGames/impower";
export const DIGEST = /^[a-f0-9]{64}$/;
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const normalize = (body) => String(body ?? "").replaceAll("\r\n", "\n");
export const bodyDigest = (body) => sha256(normalize(body));
// Parent first, then the slices in number order; each ticket contributes its
// number, its updated_at and its body digest.
export const snapshotDigest = (tickets) => sha256(tickets.map((ticket) => `${ticket.number} ${ticket.updatedAt} ${ticket.bodyDigest}`).join("\n"));

export function ghIssue(number, cwd = process.cwd()) {
  return JSON.parse(execFileSync("gh", ["api", `repos/${repository}/issues/${number}`], { cwd, encoding: "utf8", windowsHide: true }));
}
const isIssue = (issue, number) => Boolean(issue) && issue.number === number && !issue.pull_request;
const splitFrom = (issue, parent) => new RegExp(`\\bSplit from #${parent}\\b`).test(normalize(issue.body));
// Issue numbers a body mentions as `#123`; `issues/123` and headings are not mentions.
export const mentionedIssues = (body) => [...new Set([...normalize(body).matchAll(/(?<![\w/#])#(\d+)\b/g)].map((match) => Number(match[1])))];
const ticketOf = (issue) => ({ number: issue.number, title: issue.title, type: issue.type?.name ?? null, state: issue.state, updatedAt: issue.updated_at, body: normalize(issue.body), bodyDigest: bodyDigest(issue.body) });

// The slices are every issue the parent mentions whose body says
// `Split from #<parent>`, plus any named slice the parent omits; a named
// number that is not such a slice is refused rather than silently included.
export function takeSnapshot({ parent, slices = [], fetchIssue = ghIssue }) {
  if (!Number.isSafeInteger(parent) || parent < 1) throw new Error("Supply the parent issue number");
  if (!Array.isArray(slices) || !slices.every((number) => Number.isSafeInteger(number) && number > 0 && number !== parent)) throw new Error("Slices must be positive issue numbers other than the parent");
  const parentIssue = fetchIssue(parent);
  if (!isIssue(parentIssue, parent)) throw new Error(`#${parent} is not an issue`);
  const found = [];
  for (const number of [...new Set([...mentionedIssues(parentIssue.body), ...slices])].filter((candidate) => candidate !== parent).sort((a, b) => a - b)) {
    const issue = fetchIssue(number);
    const named = slices.includes(number);
    if (!isIssue(issue, number)) { if (named) throw new Error(`#${number} is not an issue`); continue; }
    if (!splitFrom(issue, parent)) { if (named) throw new Error(`#${number} does not say "Split from #${parent}"; only the parent and its slices are reviewed`); continue; }
    found.push(issue);
  }
  const tickets = [parentIssue, ...found].map(ticketOf);
  return { version: 1, repository, parent, takenAt: new Date().toISOString(), tickets, digest: snapshotDigest(tickets) };
}

// Reads a snapshot back and recomputes every digest, so an edited snapshot
// fails here instead of reaching a reviewer or the launcher.
export function readSnapshot(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) throw new Error("Supply an absolute snapshot path");
  let snapshot;
  try { snapshot = JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { throw new Error(`Cannot read snapshot ${file}: ${error.message}`); }
  const tickets = snapshot?.tickets;
  if (snapshot?.version !== 1 || !Number.isSafeInteger(snapshot.parent) || !Array.isArray(tickets) || !tickets.length || tickets[0]?.number !== snapshot.parent) throw new Error(`Snapshot ${file} is not a spec snapshot of one parent issue and its slices`);
  const mismatch = () => new Error(`Snapshot ${file} does not match its digest; take a fresh snapshot rather than editing one`);
  const numbers = new Set();
  for (const ticket of tickets) {
    if (!Number.isSafeInteger(ticket.number) || numbers.has(ticket.number) || typeof ticket.updatedAt !== "string" || typeof ticket.body !== "string" || ticket.bodyDigest !== bodyDigest(ticket.body)) throw mismatch();
    numbers.add(ticket.number);
  }
  if (snapshot.digest !== snapshotDigest(tickets)) throw mismatch();
  return snapshot;
}

export function parseArgs(argv) {
  const [parentArg, out, ...rest] = argv;
  const parent = Number(parentArg);
  if (!/^\d+$/.test(parentArg ?? "") || !Number.isSafeInteger(parent) || parent < 1 || !out) throw new Error("Usage: node scripts/spec-snapshot.mjs <parent-issue> <absolute-snapshot-file> [--slices 573,574]");
  if (!path.isAbsolute(out)) throw new Error("Write the snapshot to an absolute path in the private review directory");
  let slices = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--slices" && rest[i + 1] !== undefined) slices = rest[++i].split(",").map((number) => Number(number.trim()));
    else throw new Error(`Unknown argument ${rest[i]}`);
  }
  return { parent, out, slices };
}

// One file per snapshot: a round takes a fresh file rather than overwriting
// the one its reports quote.
export function writeSnapshot({ parent, out, slices, fetchIssue }) {
  const snapshot = takeSnapshot({ parent, slices, fetchIssue });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx" });
  return { file: out, parent, digest: snapshot.digest, takenAt: snapshot.takenAt, tickets: snapshot.tickets.map(({ number, type, updatedAt, title }) => ({ number, type, updatedAt, title })) };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(writeSnapshot(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
