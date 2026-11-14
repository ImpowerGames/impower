import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const ANSWERED_STATES = Object.freeze(["answered", "accepted", "done", "will-not-do"]);
const OPEN_STATES = new Set(["open", "waiting", "question"]);
const CLOSED_STATES = new Set(["closed", "withdrawn", "unclear", ...ANSWERED_STATES]);
const STATES = new Set([...OPEN_STATES, ...CLOSED_STATES]);

export function requestIndexRoot(env = process.env) {
  if (env.IMPOWER_MAINTAINER_REQUEST_INDEX) return path.resolve(env.IMPOWER_MAINTAINER_REQUEST_INDEX);
  const base = env.LOCALAPPDATA || (env.XDG_STATE_HOME ? env.XDG_STATE_HOME : path.join(os.homedir(), ".local", "state"));
  return path.join(base, "impower", "maintainer-requests");
}

export function requestIndexDir(repo, env = process.env) {
  if (typeof repo !== "string" || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new Error(`The request index needs an owner/name repository, not ${JSON.stringify(repo)}`);
  return path.join(requestIndexRoot(env), repo.toLowerCase().replace("/", "__"));
}

const entryFile = (dir, number) => path.join(dir, `${number}.json`);

export class RequestIndexUnreadable extends Error {}

export function openRequestIndex(repo, env = process.env) {
  const dir = requestIndexDir(repo, env);
  let listing;
  try {
    if (!statSync(dir).isDirectory()) throw new Error("it is not a directory");
    listing = new Set(readdirSync(dir));
  } catch (error) {
    throw new RequestIndexUnreadable(`the maintainer request index at ${dir} cannot be read (${error.code === "ENOENT" ? "it does not exist yet" : error.message})`);
  }
  return {
    dir,
    entry(number) {
      const name = `${number}.json`;
      if (!listing.has(name)) return null;
      let data;
      try {
        data = JSON.parse(readFileSync(entryFile(dir, number), "utf8"));
      } catch (error) {
        throw new RequestIndexUnreadable(`the maintainer request index entry ${entryFile(dir, number)} cannot be read (${error.message})`);
      }
      if (!data || data.number !== number || !STATES.has(data.state)) throw new RequestIndexUnreadable(`the maintainer request index entry ${entryFile(dir, number)} is malformed`);
      return data;
    },
  };
}

export const isAnswered = (entry) => Boolean(entry) && ANSWERED_STATES.includes(entry.state);

function readEntry(dir, number) {
  try {
    return JSON.parse(readFileSync(entryFile(dir, number), "utf8"));
  } catch {
    return null;
  }
}

function settle(previous, state) {
  if (!previous?.state) return state;
  if (state === "open" && OPEN_STATES.has(previous.state)) return previous.state;
  if (state === "closed" && CLOSED_STATES.has(previous.state)) return previous.state;
  return state;
}

export function noteRequests(repo, entries, { env = process.env, now = new Date() } = {}) {
  const dir = requestIndexDir(repo, env);
  mkdirSync(dir, { recursive: true });
  for (const { number, kind, state, tagged = false } of entries) {
    if (!Number.isSafeInteger(number) || number < 1) throw new Error(`The request index takes positive issue numbers, not ${JSON.stringify(number)}`);
    if (!STATES.has(state)) throw new Error(`The request index has no state ${JSON.stringify(state)}`);
    const previous = readEntry(dir, number);
    const next = { number, kind: kind ?? previous?.kind ?? null, tagged: Boolean(tagged || previous?.tagged), state: settle(previous, state) };
    if (previous && previous.kind === next.kind && previous.tagged === next.tagged && previous.state === next.state) continue;
    const temp = path.join(dir, `.${number}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
    writeFileSync(temp, `${JSON.stringify({ ...next, noted: now.toISOString() })}\n`);
    renameSync(temp, entryFile(dir, number));
  }
  return dir;
}
