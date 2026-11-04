import fs from "node:fs";
import path from "node:path";

const sleeper = new Int32Array(new SharedArrayBuffer(4));
const defaultRetryCodes = new Set(["EPERM", "EBUSY", "ENOTEMPTY"]);
const windowsLinkFallback = new Set(["EPERM", "EISDIR", "EACCES"]);

export function canRetryRemoval(error, attempt, delays, codes = defaultRetryCodes) {
  return codes.has(error.code) && attempt < delays.length;
}

function retryRemoval(action, delays, codes, beforeAttempt = () => {}) {
  for (let attempt = 0; ; attempt++) {
    beforeAttempt();
    try {
      action();
      return;
    } catch (error) {
      if (!canRetryRemoval(error, attempt, delays, codes)) throw error;
      Atomics.wait(sleeper, 0, 0, delays[attempt]);
    }
  }
}

function unlinkLink(target) {
  try {
    fs.unlinkSync(target);
  } catch (error) {
    if (process.platform !== "win32" || !windowsLinkFallback.has(error.code) ||
        !fs.lstatSync(target).isSymbolicLink()) throw error;
    fs.rmdirSync(target);
  }
}

export function removeTreeEntries(root, {
  delays,
  retryCodes,
  linksOnly = false,
  refuseLinks = false,
  force = false,
  retryTree = false,
  beforeUnlink = () => {},
  onRemoved = () => {},
  onError = (_target, error) => { throw error; },
}) {
  const rootPath = path.resolve(root);
  const entryDelays = retryTree ? [] : delays;
  function visit(target, entry) {
    try {
      const stat = !entry || entry.isDirectory() ? fs.lstatSync(target) : entry;
      if (linksOnly && target === rootPath && !stat.isDirectory()) {
        throw Object.assign(new Error(`not a directory: ${target}`), { code: "ENOTDIR" });
      }
      if (stat.isSymbolicLink()) {
        if (refuseLinks) throw new Error(`refusing to remove link ${target}`);
        retryRemoval(() => unlinkLink(target), entryDelays, retryCodes, beforeUnlink);
        onRemoved("links");
      } else if (stat.isDirectory()) {
        let emptied = true;
        for (const child of fs.readdirSync(target, { withFileTypes: linksOnly })) {
          const name = linksOnly ? child.name : child;
          if (!visit(path.join(target, name), linksOnly ? child : undefined)) emptied = false;
        }
        if (!linksOnly && emptied) retryRemoval(() => fs.rmdirSync(target), entryDelays, retryCodes);
        return emptied;
      } else if (!linksOnly) {
        retryRemoval(() => fs.unlinkSync(target), entryDelays, retryCodes);
        onRemoved("files");
      }
      return true;
    } catch (error) {
      if (force && error.code === "ENOENT") return true;
      onError(target, error);
      return false;
    }
  }
  if (retryTree) retryRemoval(() => visit(rootPath), delays, retryCodes);
  else visit(rootPath);
}
