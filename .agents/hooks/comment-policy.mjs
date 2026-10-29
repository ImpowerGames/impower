import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const configFile = "comment-policy.json";
const config = JSON.parse(fs.readFileSync(path.join(here, configFile), "utf8"));
const directives = config.directives.map((d) => ({ form: new RegExp(d.form), extensions: d.extensions }));
const platforms = new Set(config.platforms);

const FAMILIES = {
  ".ts": "js", ".tsx": "js", ".js": "js", ".mjs": "js", ".cjs": "js",
  ".css": "css", ".html": "html",
  ".yaml": "yaml", ".yml": "yaml", ".sh": "sh", ".py": "py", ".ps1": "ps1",
};

export const rule =
  "The repository's comment rule (AGENTS.md, Repository-wide rules) allows a code comment only as a directive a tool reads or a `workaround(<name>): ...` note naming a lockfile dependency or a listed platform. " +
  "Restructure or rename the code, or fix the cause, instead of explaining it; the rationale belongs in the ticket.";

const posix = (file) => String(file).replaceAll("\\", "/").replace(/^\.\//, "");

export function generatedFile(file) {
  return typeof file === "string" && /(?:^|\/)language\/sparkdown\.language-(?:grammar|config|snippets)\.json$/i.test(posix(file));
}

export function exemptPath(file) {
  const rel = posix(file);
  return generatedFile(rel) || config.exempt.some((prefix) => (prefix.endsWith("/") ? rel.startsWith(prefix) : rel === prefix));
}

function familyOf(file) {
  return FAMILIES[path.posix.extname(posix(file)).toLowerCase()];
}

function lineEnd(text, i) {
  const n = text.indexOf("\n", i);
  if (n < 0) return text.length;
  return text[n - 1] === "\r" ? n - 1 : n;
}

function skipQuoted(text, i, quote, escape = "\\") {
  let j = i + 1;
  while (j < text.length && text[j] !== quote && text[j] !== "\n") j += text[j] === escape ? 2 : 1;
  return Math.min(j + 1, text.length);
}

const REGEX_AFTER_WORD = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

function scanJs(text) {
  const comments = [];
  const templates = [];
  let depth = 0, regexAllowed = true, previous = "";
  let i = text.startsWith("#!") ? lineEnd(text, 0) : 0;
  const template = (j) => {
    while (j < text.length) {
      if (text[j] === "\\") j += 2;
      else if (text[j] === "`") return j + 1;
      else if (text[j] === "$" && text[j + 1] === "{") {
        templates.push(depth++);
        regexAllowed = true;
        return j + 2;
      } else j++;
    }
    return text.length;
  };
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (c === "/" && n === "/") {
      const end = lineEnd(text, i);
      comments.push({ start: i, end });
      i = end;
    } else if (c === "/" && n === "*") {
      const close = text.indexOf("*/", i + 2);
      const end = close < 0 ? text.length : close + 2;
      comments.push({ start: i, end });
      i = end;
    } else if (c === "'" || c === '"') {
      i = skipQuoted(text, i, c);
      regexAllowed = false;
    } else if (c === "`") {
      i = template(i + 1);
      regexAllowed = false;
    } else if (c === "/" && regexAllowed && previous !== "<") {
      let j = i + 1, inClass = false;
      while (j < text.length && text[j] !== "\n" && (inClass || text[j] !== "/")) {
        if (text[j] === "\\") j++;
        else if (text[j] === "[") inClass = true;
        else if (text[j] === "]") inClass = false;
        j++;
      }
      if (text[j] === "/") {
        j++;
        while (/[A-Za-z]/.test(text[j] ?? "")) j++;
        i = j;
        regexAllowed = false;
      } else {
        i++;
        regexAllowed = true;
      }
    } else if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_$]/.test(text[j])) j++;
      regexAllowed = REGEX_AFTER_WORD.has(text.slice(i, j)) && text[i - 1] !== ".";
      i = j;
    } else if (/\s/.test(c)) {
      i++;
      continue;
    } else if (c === "}" && templates.length && templates[templates.length - 1] === depth - 1) {
      templates.pop();
      depth--;
      i = template(i + 1);
      regexAllowed = false;
    } else {
      if (c === "{") depth++;
      else if (c === "}") depth--;
      regexAllowed = c !== ")" && c !== "]";
      i++;
    }
    previous = c;
  }
  return comments;
}

function scanCss(text) {
  const comments = [];
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      const end = close < 0 ? text.length : close + 2;
      comments.push({ start: i, end });
      i = end;
    } else if (c === "'" || c === '"') i = skipQuoted(text, i, c);
    else i++;
  }
  return comments;
}

function scanHtml(text) {
  const comments = [];
  for (let i = text.indexOf("<!--"); i >= 0; i = text.indexOf("<!--", i)) {
    const close = text.indexOf("-->", i + 4);
    const end = close < 0 ? text.length : close + 3;
    comments.push({ start: i, end });
    i = end;
  }
  return comments;
}

function scanPy(text) {
  const comments = [];
  let i = text.startsWith("#!") ? lineEnd(text, 0) : 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "#") {
      const end = lineEnd(text, i);
      comments.push({ start: i, end });
      i = end;
    } else if (c === "'" || c === '"') {
      const triple = c.repeat(3);
      if (text.startsWith(triple, i)) {
        let j = i + 3;
        while (j < text.length && !text.startsWith(triple, j)) j += text[j] === "\\" ? 2 : 1;
        i = Math.min(j + 3, text.length);
      } else i = skipQuoted(text, i, c);
    } else i++;
  }
  return comments;
}

function scanSh(text, from = 0, to = text.length) {
  const comments = [];
  let heredocs = [];
  let i = from === 0 && text.startsWith("#!") ? lineEnd(text, 0) : from;
  while (i < to) {
    const c = text[i];
    if (c === "\\") i += 2;
    else if (c === "'") {
      const close = text.indexOf("'", i + 1);
      i = close < 0 ? to : close + 1;
    } else if (c === '"' || (c === "$" && text[i + 1] === "'")) {
      const quote = c === "$" ? "'" : '"';
      let j = i + (c === "$" ? 2 : 1);
      while (j < to && text[j] !== quote) j += text[j] === "\\" ? 2 : 1;
      i = j + 1;
    } else if (c === "#" && (i === from || /[\s;&|()<>]/.test(text[i - 1]))) {
      const end = Math.min(lineEnd(text, i), to);
      comments.push({ start: i, end });
      i = end;
    } else if (text.startsWith("<<", i) && text[i + 2] !== "<") {
      const m = /^<<(-?)[ \t]*(['"]?)([A-Za-z_][\w]*)\2/.exec(text.slice(i, i + 200));
      if (m) heredocs.push({ dash: Boolean(m[1]), word: m[3] });
      i += m ? m[0].length : 2;
    } else if (c === "\n" && heredocs.length) {
      i++;
      for (const { dash, word } of heredocs) {
        while (i < to) {
          const end = lineEnd(text, i);
          const line = text.slice(i, end);
          i = Math.min(text.indexOf("\n", end) + 1 || to, to);
          if ((dash ? line.replace(/^\t+/, "") : line) === word) break;
        }
      }
      heredocs = [];
    } else i++;
  }
  return comments;
}

function scanYaml(text) {
  const comments = [];
  let i = 0, quote = null;
  while (i < text.length) {
    const end = lineEnd(text, i);
    const next = Math.min(text.indexOf("\n", end) + 1 || text.length, text.length);
    let code = "";
    for (let j = i; j < end; j++) {
      const c = text[j];
      if (quote) {
        if (quote === '"' && c === "\\") j++;
        else if (c === quote && quote === "'" && text[j + 1] === "'") j++;
        else if (c === quote) quote = null;
        code += c;
      } else if (c === "#" && (j === i || /\s/.test(text[j - 1]))) {
        comments.push({ start: j, end });
        break;
      } else {
        if ((c === "'" || c === '"') && /^$|[:\-[{,?]$/.test(code.trimEnd().slice(-1))) quote = c;
        code += c;
      }
    }
    i = next;
    if (quote) continue;
    const block = /(?:^\s*-|:)\s+[|>][-+1-9]*\s*$/.test(code);
    if (!block) continue;
    const indent = /^\s*/.exec(code)[0].length;
    let blockEnd = i;
    while (blockEnd < text.length) {
      const lineStop = lineEnd(text, blockEnd);
      const line = text.slice(blockEnd, lineStop);
      if (line.trim() && /^\s*/.exec(line)[0].length <= indent) break;
      blockEnd = Math.min(text.indexOf("\n", lineStop) + 1 || text.length, text.length);
    }
    if (/^\s*(?:-\s+)?run\s*:/.test(code)) comments.push(...scanSh(text, i, blockEnd));
    i = blockEnd;
  }
  return comments;
}

function scanPs1(text) {
  const comments = [];
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === "<" && text[i + 1] === "#") {
      const close = text.indexOf("#>", i + 2);
      const end = close < 0 ? text.length : close + 2;
      comments.push({ start: i, end });
      i = end;
    } else if (c === "#" && (i === 0 || /[\s;|&(){}=,]/.test(text[i - 1]))) {
      const end = lineEnd(text, i);
      comments.push({ start: i, end });
      i = end;
    } else if (c === "`") i += 2;
    else if (c === "@" && (text[i + 1] === "'" || text[i + 1] === '"') && /^\r?\n/.test(text.slice(i + 2, i + 4))) {
      const close = new RegExp(`\\n${text[i + 1]}@`).exec(text.slice(i + 2));
      i = close ? i + 2 + close.index + close[0].length : text.length;
    } else if (c === "'") {
      let j = i + 1;
      while (j < text.length && !(text[j] === "'" && text[j + 1] !== "'")) j += text[j] === "'" ? 2 : 1;
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      while (j < text.length && !(text[j] === '"' && text[j + 1] !== '"')) j += text[j] === "`" || text[j] === '"' ? 2 : 1;
      i = j + 1;
    } else i++;
  }
  return comments;
}

const SCANNERS = { js: scanJs, css: scanCss, html: scanHtml, py: scanPy, sh: scanSh, yaml: scanYaml, ps1: scanPs1 };

export function scanComments(text, file) {
  const family = familyOf(file);
  if (!family) return [];
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  const lineOf = (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return SCANNERS[family](text)
    .sort((a, b) => a.start - b.start)
    .map(({ start, end }) => {
      const line = lineOf(start), endLine = lineOf(Math.max(start, end - 1));
      const lineStart = starts[line];
      return { start, end, line: line + 1, endLine: endLine + 1, column: start - lineStart, lineStart, lineStop: lineEnd(text, end === start ? start : end - 1), text: text.slice(start, end) };
    });
}

function bodyLines(comment) {
  const delimited = [["/*", "*/"], ["<!--", "-->"], ["<#", "#>"], ["//", ""], ["#", ""]].find(([open]) => comment.startsWith(open));
  let body = comment.slice(delimited[0].length);
  if (delimited[1] && body.endsWith(delimited[1])) body = body.slice(0, -delimited[1].length);
  return body.split(/\r?\n/).map((line) => line.trim().replace(/^\*+(?!\/)\s*/, "").trim()).filter(Boolean);
}

const dependencyCache = new Map();

function dependencies(root) {
  if (dependencyCache.has(root)) return dependencyCache.get(root);
  const found = { external: new Set(), workspace: new Set() };
  const listed = spawnSync("git", ["-C", root, "ls-files", "-z", "--", "*package-lock.json"], { encoding: "utf8", windowsHide: true });
  const lockfiles = listed.status === 0 ? listed.stdout.split("\0").filter((f) => path.posix.basename(f) === "package-lock.json") : ["package-lock.json"];
  for (const lockfile of lockfiles) {
    let lock;
    try {
      lock = JSON.parse(fs.readFileSync(path.join(root, lockfile), "utf8"));
    } catch {
      continue;
    }
    for (const [key, entry] of Object.entries(lock.packages ?? {})) {
      const marker = key.lastIndexOf("node_modules/");
      if (marker < 0) {
        if (key) found.workspace.add(path.posix.basename(key));
        if (entry?.name) found.workspace.add(entry.name);
        continue;
      }
      const name = key.slice(marker + "node_modules/".length);
      if (entry?.link) {
        found.workspace.add(name);
        found.workspace.add(name.replace(/^@[^/]+\//, ""));
      } else found.external.add(name);
    }
  }
  dependencyCache.set(root, found);
  return found;
}

function workaroundNameReason(name, root) {
  if (platforms.has(name.toLowerCase())) return null;
  const { external, workspace } = dependencies(root);
  if (external.has(name)) return null;
  if (workspace.has(name)) return `\`${name}\` is a package of this repository, and a quirk of the repository's own code is a defect to fix or ticket, never a workaround to record beside the code`;
  return `\`${name}\` is neither a dependency in a package-lock.json nor a platform listed in .agents/hooks/${configFile}`;
}

export function classifyComment(text, file, { root = path.resolve(here, "../..") } = {}) {
  const rel = posix(file);
  if (exemptPath(rel)) return { kind: "exempt", reason: `${rel} is under a path the rule exempts` };
  const extension = path.posix.extname(rel).toLowerCase();
  if (!FAMILIES[extension]) return { kind: "exempt", reason: `${extension || rel} is not a code file type the rule covers` };
  const lines = bodyLines(text);
  if (!lines.length) return { kind: "refused", reason: "an empty comment" };
  if (/^workaround\b/i.test(lines[0])) {
    const marker = /^workaround\(([^()\s]+)\):\s*\S/.exec(lines[0]);
    if (!marker) return { kind: "refused", reason: "a workaround note takes the form `workaround(<name>): <what the dependency or platform does wrong, with the version or link that retires the note>`" };
    const reason = workaroundNameReason(marker[1], root);
    return reason ? { kind: "refused", reason } : { kind: "workaround", reason: `a workaround note for \`${marker[1]}\`` };
  }
  const allowed = directives.filter((d) => !d.extensions || d.extensions.includes(extension));
  if (lines.every((line) => allowed.some((d) => d.form.test(line)))) return { kind: "directive", reason: "a directive a tool reads" };
  return { kind: "refused", reason: "neither a directive a tool reads nor a `workaround(<name>):` note" };
}

export function judgeComments(text, file, options = {}) {
  const comments = scanComments(text, file);
  let previous = null;
  for (const comment of comments) {
    Object.assign(comment, classifyComment(comment.text, file, options));
    const single = (c) => !c.text.startsWith("/*") && !c.text.startsWith("<") && c.line === c.endLine && !text.slice(c.lineStart, c.start).trim();
    if (comment.kind === "refused" && previous?.kind === "workaround" && single(comment) && single(previous) && comment.line === previous.endLine + 1 && comment.column === previous.column) {
      comment.kind = "workaround";
      comment.reason = `continues the workaround note on line ${previous.line}`;
    }
    previous = comment;
  }
  return comments;
}

export function refusedComments(text, file, options = {}) {
  return judgeComments(text, file, options)
    .filter((c) => c.kind === "refused")
    .map(({ line, endLine, text: comment, reason }) => ({ line, endLine, text: comment, reason }));
}

export function stripComments(text, file, options = {}) {
  const refused = judgeComments(text, file, options).filter((c) => c.kind === "refused");
  if (!refused.length) return text;
  const removed = new Uint8Array(text.length);
  for (const c of refused) removed.fill(1, c.start, c.end);
  const code = (from, to) => {
    for (let k = from; k < to; k++) if (!removed[k] && !/\s/.test(text[k])) return true;
    return false;
  };
  const nextLine = (offset) => Math.min(text.indexOf("\n", offset) + 1 || text.length, text.length);
  const cuts = [];
  for (const c of refused) {
    const leading = code(c.lineStart, c.start), following = code(c.end, c.lineStop);
    if (!leading && !following) cuts.push({ from: c.lineStart, to: nextLine(c.lineStop), whole: true });
    else if (!following) {
      let from = c.start;
      while (from > c.lineStart && /[ \t]/.test(text[from - 1])) from--;
      cuts.push({ from, to: c.end });
    } else {
      let from = c.start, to = c.end;
      while (to < text.length && /[ \t]/.test(text[to])) to++;
      if (leading) while (from > c.lineStart && /[ \t]/.test(text[from - 1])) from--;
      const joins = leading && !/[([{]/.test(text[from - 1]) && !/[)\]},;]/.test(text[to]);
      cuts.push({ from, to, replacement: joins ? " " : "" });
    }
  }
  cuts.sort((a, b) => a.from - b.from);
  const merged = [];
  for (const cut of cuts) {
    const last = merged[merged.length - 1];
    if (last && cut.from <= last.to) {
      last.to = Math.max(last.to, cut.to);
      last.whole ||= cut.whole;
    } else merged.push({ ...cut });
  }
  const blankAt = (offset) => offset < text.length && !text.slice(offset, lineEnd(text, offset)).trim();
  const blankBefore = (offset) => {
    if (offset === 0) return true;
    let start = text.lastIndexOf("\n", offset - 2) + 1;
    return !text.slice(start, offset).trim();
  };
  for (const cut of merged) {
    if (!cut.whole) continue;
    if (blankBefore(cut.from) && blankAt(cut.to)) cut.to = nextLine(cut.to);
    else if (cut.to >= text.length && cut.from > 0 && blankBefore(cut.from)) cut.from = text.lastIndexOf("\n", cut.from - 2) + 1;
  }
  let out = "", at = 0;
  for (const cut of merged) {
    if (cut.from < at) continue;
    out += text.slice(at, cut.from) + (cut.replacement ?? "");
    at = cut.to;
  }
  return out + text.slice(at);
}

function checkoutRoot(file) {
  for (let dir = path.dirname(file); ; ) {
    if (fs.existsSync(path.join(dir, ".git"))) return fs.existsSync(path.join(dir, ".agents/hooks", configFile)) ? dir : null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function applyEdits(before, edits) {
  let after = before;
  for (const edit of edits) {
    const oldText = String(edit?.old_string ?? "").replace(/\r\n/g, "\n");
    const newText = String(edit?.new_string ?? "").replace(/\r\n/g, "\n");
    if (!oldText) {
      if (after) return null;
      after = newText;
      continue;
    }
    const index = after.indexOf(oldText);
    if (index < 0) return null;
    after = edit.replace_all ? after.split(oldText).join(newText) : after.slice(0, index) + newText + after.slice(index + oldText.length);
  }
  return after;
}

function counts(lines) {
  const map = new Map();
  for (const line of lines) map.set(line.trim(), (map.get(line.trim()) ?? 0) + 1);
  return map;
}

function introducedLines(lines, existing) {
  const introduced = new Set();
  lines.forEach((line, index) => {
    const key = line.trim();
    if (!key) return;
    if (existing.get(key) > 0) existing.set(key, existing.get(key) - 1);
    else introduced.add(index + 1);
  });
  return introduced;
}

export function introducedCommentReason(files, cwd = process.cwd()) {
  for (const file of files ?? []) {
    if (typeof file?.path !== "string") continue;
    const absolute = path.resolve(cwd, file.path);
    const root = checkoutRoot(absolute);
    if (!root) continue;
    const rel = posix(path.relative(root, absolute));
    if (!familyOf(rel) || exemptPath(rel)) continue;
    let before = "";
    try {
      before = fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n");
    } catch {}
    let text, introduced, numbered = true;
    const after = typeof file.content === "string" ? file.content.replace(/\r\n/g, "\n") : Array.isArray(file.edits) ? applyEdits(before, file.edits) : null;
    if (after !== null) {
      text = after;
      introduced = introducedLines(after.split("\n"), counts(before.split("\n")));
    } else {
      const lines = Array.isArray(file.lines) ? file.lines : (file.edits ?? []).flatMap((e) => String(e?.new_string ?? "").split(/\r?\n/).map((t) => ({ text: t, added: true })));
      text = lines.map((l) => l.text).join("\n");
      const removed = counts(file.removed ?? []);
      introduced = new Set();
      lines.forEach((l, index) => {
        if (!l.added || !l.text.trim()) return;
        const key = l.text.trim();
        if (removed.get(key) > 0) removed.set(key, removed.get(key) - 1);
        else introduced.add(index + 1);
      });
      numbered = Boolean(file.whole);
    }
    if (!introduced.size) continue;
    const offending = judgeComments(text, rel, { root }).find((c) => {
      if (c.kind !== "refused") return false;
      for (let line = c.line; line <= c.endLine; line++) if (introduced.has(line)) return true;
      return false;
    });
    if (!offending) continue;
    const excerpt = offending.text.split(/\r?\n/)[0].trim();
    const where = numbered ? `${rel}:${offending.line}` : rel;
    return `${rule} This edit adds a comment the rule refuses at ${where}: \`${excerpt.length > 120 ? excerpt.slice(0, 117) + "..." : excerpt}\` (${offending.reason}).`;
  }
  return null;
}
