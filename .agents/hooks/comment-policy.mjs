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
  while (j < text.length && text[j] !== quote && text[j] !== "\n") j += text[j] !== escape ? 1 : text[j + 1] === "\r" && text[j + 2] === "\n" ? 3 : 2;
  return Math.min(j + 1, text.length);
}

const REGEX_AFTER_WORD = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

const CONDITION_WORDS = new Set(["if", "while", "for", "with"]);

const EXPRESSION_WORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "default", "yield", "await"]);

function blockOpens(last) {
  if (["", "=>", ")", ";", "{", "}"].includes(last)) return true;
  return /^[A-Za-z_$][\w$]*$/.test(last) && last !== "value" && !EXPRESSION_WORDS.has(last);
}

const GENERIC_ARROW = /^<(?:const\s+)?[A-Za-z_$][\w$]*\s*(?:,|=(?!>)|extends\b)/;

function scanJs(text, jsx = false) {
  const comments = [];
  const frames = [{ mode: "code", blocks: [] }];
  const parens = [];
  const notJsx = new Set();
  let regexAllowed = true, last = "", caseLabel = false;
  let i = text.startsWith("#!") ? lineEnd(text, 0) : 0;
  const copyFrames = (list) => list.map((f) => ({ ...f, blocks: f.blocks && [...f.blocks] }));
  const enterCode = () => {
    frames.push({ mode: "code", blocks: [] });
    regexAllowed = true;
    last = "";
  };
  const endTag = (frame) => {
    if (frame.open > 0) frame.mode = "jsxText";
    else {
      frames.pop();
      regexAllowed = false;
      last = "value";
    }
  };
  for (;;) {
    if (i >= text.length) {
      const open = frames.find((f) => f.checkpoint);
      if (!open) break;
      const saved = open.checkpoint;
      notJsx.add(saved.i);
      comments.length = saved.comments;
      frames.length = 0;
      frames.push(...copyFrames(saved.frames));
      parens.length = 0;
      parens.push(...saved.parens);
      ({ i, regexAllowed, last } = saved);
      continue;
    }
    const frame = frames[frames.length - 1];
    const c = text[i], n = text[i + 1];
    if (frame.mode === "template") {
      if (c === "\\") i += 2;
      else if (c === "`") {
        frames.pop();
        regexAllowed = false;
        last = "value";
        i++;
      } else if (c === "$" && n === "{") {
        enterCode();
        i += 2;
      } else i++;
      continue;
    }
    if (frame.mode === "jsxText") {
      if (c === "{") {
        enterCode();
        i++;
      } else if (c === "<") {
        frame.mode = "jsxTag";
        frame.closing = n === "/";
        if (!frame.closing) frame.open++;
        i += frame.closing ? 2 : 1;
      } else i++;
      continue;
    }
    if (frame.mode === "jsxTag") {
      if (c === "/" && (n === "/" || n === "*")) {
        const close = n === "/" ? lineEnd(text, i) : text.indexOf("*/", i + 2);
        const end = close < 0 ? text.length : n === "/" ? close : close + 2;
        comments.push({ start: i, end });
        i = end;
      } else if (c === "'" || c === '"') {
        const close = text.indexOf(c, i + 1);
        i = close < 0 ? text.length : close + 1;
      } else if (c === "{") {
        enterCode();
        i++;
      } else if (c === "/" && n === ">") {
        frame.open--;
        i += 2;
        endTag(frame);
      } else if (c === ">") {
        if (frame.closing) frame.open--;
        i++;
        endTag(frame);
      } else i++;
      continue;
    }
    if (c === "<" && jsx && regexAllowed && !notJsx.has(i) && /[A-Za-z>]/.test(n ?? "") && !GENERIC_ARROW.test(text.slice(i, i + 80))) {
      const checkpoint = { i, comments: comments.length, frames: copyFrames(frames), parens: [...parens], regexAllowed, last };
      frames.push({ mode: "jsxTag", open: 1, closing: false, checkpoint });
      i++;
      continue;
    }
    const word = /[A-Za-z0-9_$]/.test(c);
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
      last = "value";
    } else if (c === "`") {
      frames.push({ mode: "template" });
      i++;
    } else if (c === "/" && regexAllowed) {
      let j = i + 1, inClass = false;
      while (j < text.length && text[j] !== "\n" && (inClass || text[j] !== "/")) {
        if (text[j] === "\\") j++;
        else if (text[j] === "[") inClass = true;
        else if (text[j] === "]") inClass = false;
        j++;
      }
      if (text[j] === "/" && text[j + 1] !== "/" && text[j + 1] !== "*") {
        j++;
        while (/[A-Za-z]/.test(text[j] ?? "")) j++;
        i = j;
        regexAllowed = false;
        last = "value";
      } else {
        i++;
        regexAllowed = true;
        last = "/";
      }
    } else if (word) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_$]/.test(text[j])) j++;
      last = text.slice(i, j);
      regexAllowed = REGEX_AFTER_WORD.has(last) && text[i - 1] !== ".";
      if (text[i - 1] !== "." && (last === "case" || (last === "default" && /^\s*:/.test(text.slice(j, j + 40))))) caseLabel = true;
      i = j;
    } else if (/\s/.test(c)) {
      i++;
    } else if (c === "}" && !frame.blocks.length && frames.length > 1) {
      frames.pop();
      i++;
    } else if ((c === "+" || c === "-") && n === c) {
      i += 2;
    } else {
      if (c === "{") frame.blocks.push(blockOpens(last));
      if (c === "}") regexAllowed = frame.blocks.pop() ?? true;
      else if (c === "(") {
        parens.push(CONDITION_WORDS.has(last));
        regexAllowed = true;
      } else if (c === ")") regexAllowed = parens.pop() ?? false;
      else regexAllowed = c !== "]";
      last = c === ">" && text[i - 1] === "=" ? "=>" : c;
      if (c === ":" && caseLabel) {
        caseLabel = false;
        last = ";";
      }
      i++;
    }
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

const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

function scanHtml(text) {
  const comments = [];
  const lower = text.toLowerCase();
  for (let i = 0; i < text.length; ) {
    if (text.startsWith("<!--", i)) {
      const close = text.indexOf("-->", i + 4);
      const end = close < 0 ? text.length : close + 3;
      comments.push({ start: i, end });
      i = end;
    } else if (text[i] === "<" && /[A-Za-z/]/.test(text[i + 1] ?? "")) {
      const name = /^\/?([A-Za-z][\w-]*)/.exec(text.slice(i + 1, i + 64))?.[1]?.toLowerCase() ?? "";
      const closing = text[i + 1] === "/";
      let j = i + 1;
      while (j < text.length && text[j] !== ">") {
        if (text[j] === '"' || text[j] === "'") {
          const close = text.indexOf(text[j], j + 1);
          j = close < 0 ? text.length : close + 1;
        } else j++;
      }
      i = j + 1;
      if (!closing && RAW_TEXT_ELEMENTS.has(name)) {
        const close = lower.indexOf(`</${name}`, i);
        i = close < 0 ? text.length : close;
      }
    } else i++;
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

function scanSh(text) {
  const comments = [];
  const to = text.length;
  let heredocs = [];
  const quoted = (j) => {
    while (j < to && text[j] !== '"') {
      if (text[j] === "\\") j += 2;
      else if (text[j] === "$" && text[j + 1] === "(" && text[j + 2] !== "(") j = code(j + 2, true);
      else j++;
    }
    return j + 1;
  };
  const code = (i, nested) => {
    let depth = 0;
    while (i < to) {
      const c = text[i];
      if (c === "\\") i += 2;
      else if (c === "'") {
        const close = text.indexOf("'", i + 1);
        i = close < 0 ? to : close + 1;
      } else if (c === "$" && text[i + 1] === "'") {
        let j = i + 2;
        while (j < to && text[j] !== "'") j += text[j] === "\\" ? 2 : 1;
        i = j + 1;
      } else if (c === '"') i = quoted(i + 1);
      else if (c === "#" && (i === 0 || /[\s;&|()<>]/.test(text[i - 1]))) {
        const end = lineEnd(text, i);
        comments.push({ start: i, end });
        i = end;
      } else if (c === "(") {
        depth++;
        i++;
      } else if (c === ")") {
        if (nested && depth === 0) return i + 1;
        depth--;
        i++;
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
    return i;
  };
  code(text.startsWith("#!") ? lineEnd(text, 0) : 0, false);
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
  return (family === "js" ? scanJs(text, /\.tsx$/i.test(posix(file))) : SCANNERS[family](text))
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
  const family = familyOf(file);
  if (family === "html") {
    let out = "", at = 0;
    for (const c of refused) {
      out += text.slice(at, c.start);
      at = c.end;
    }
    return out + text.slice(at);
  }
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
    } else if (family !== "js" && leading) {
      cuts.push({ from: c.start, to: c.end });
    } else {
      let from = c.start, to = c.end;
      while (to < text.length && /[ \t]/.test(text[to])) to++;
      if (leading) while (from > c.lineStart && /[ \t]/.test(text[from - 1])) from--;
      const joins = leading && !/[([{]/.test(text[from - 1]) && !/[)\]},;]/.test(text[to]);
      const breaks = leading && (/[\n\r]/.test(c.text) || [0x2028, 0x2029].some((code) => c.text.includes(String.fromCharCode(code))));
      cuts.push({ from, to, replacement: breaks ? "\n" : joins ? " " : "" });
    }
  }
  cuts.sort((a, b) => a.from - b.from);
  const strength = (replacement) => ["", " ", "\n"].indexOf(replacement ?? "");
  const merged = [];
  for (const cut of cuts) {
    const last = merged[merged.length - 1];
    if (last && cut.from <= last.to) {
      last.to = Math.max(last.to, cut.to);
      last.whole ||= cut.whole;
      if (strength(cut.replacement) > strength(last.replacement)) last.replacement = cut.replacement;
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

function findLines(lines, wanted, from) {
  const fits = (at, same) => wanted.every((line, k) => same(lines[at + k] ?? "", line));
  for (const same of [(a, b) => a === b, (a, b) => a.trimEnd() === b.trimEnd(), (a, b) => a.trim() === b.trim()]) {
    for (let at = from; at + wanted.length <= lines.length; at++) if (fits(at, same)) return at;
  }
  return -1;
}

function applyHunks(before, hunks) {
  const lines = before.split("\n");
  let cursor = 0;
  for (const hunk of hunks) {
    for (const anchor of hunk.anchors) {
      const found = findLines(lines, [anchor], cursor);
      if (found < 0) return null;
      cursor = found + 1;
    }
    const old = hunk.lines.filter((l) => l.op !== "+").map((l) => l.text);
    const replacement = hunk.lines.filter((l) => l.op !== "-").map((l) => l.text);
    const end = lines.length - (lines[lines.length - 1] === "" ? 1 : 0);
    const at = !old.length ? end : hunk.eof ? (findLines(lines.slice(0, end), old, Math.max(cursor, end - old.length)) === end - old.length ? end - old.length : -1) : findLines(lines, old, cursor);
    if (at < 0) return null;
    lines.splice(at, old.length, ...replacement);
    cursor = at + replacement.length;
  }
  return lines.join("\n");
}

const commentKey = (comment) => comment.text.replace(/\s+/g, " ").trim();

function introducedRefusal(before, after, rel, root) {
  const existing = new Map();
  for (const c of scanComments(before, rel)) existing.set(commentKey(c), (existing.get(commentKey(c)) ?? 0) + 1);
  return judgeComments(after, rel, { root }).find((c) => {
    const key = commentKey(c);
    if (existing.get(key) > 0) {
      existing.set(key, existing.get(key) - 1);
      return false;
    }
    return c.kind === "refused";
  });
}

function fragmentRefusal(lines, rel, root) {
  const removed = new Map();
  for (const l of lines) if (l.op === "-") removed.set(l.text.trim(), (removed.get(l.text.trim()) ?? 0) + 1);
  const shown = lines.filter((l) => l.op !== "-");
  const introduced = new Set();
  shown.forEach((l, index) => {
    const key = l.text.trim();
    if (l.op !== "+" || !key) return;
    if (removed.get(key) > 0) removed.set(key, removed.get(key) - 1);
    else introduced.add(index + 1);
  });
  return judgeComments(shown.map((l) => l.text).join("\n"), rel, { root }).find((c) => {
    if (c.kind !== "refused") return false;
    for (let line = c.line; line <= c.endLine; line++) if (introduced.has(line)) return true;
    return false;
  });
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
      before = fs.readFileSync(path.resolve(cwd, file.source ?? file.path), "utf8").replace(/\r\n/g, "\n");
    } catch {}
    const after =
      typeof file.content === "string" ? file.content.replace(/\r\n/g, "\n")
      : Array.isArray(file.edits) ? applyEdits(before, file.edits)
      : Array.isArray(file.hunks) ? applyHunks(before, file.hunks)
      : null;
    let offending = null, where = rel;
    if (after !== null) {
      offending = introducedRefusal(before, after, rel, root);
      if (offending) where = `${rel}:${offending.line}`;
    } else {
      const fragments = Array.isArray(file.hunks) ? file.hunks.map((h) => h.lines) : (file.edits ?? []).map((e) => String(e?.new_string ?? "").split(/\r?\n/).map((text) => ({ op: "+", text })));
      for (const fragment of fragments) if ((offending = fragmentRefusal(fragment, rel, root))) break;
    }
    if (!offending) continue;
    const excerpt = offending.text.split(/\r?\n/)[0].trim();
    return `${rule} This edit adds a comment the rule refuses at ${where}: \`${excerpt.length > 120 ? excerpt.slice(0, 117) + "..." : excerpt}\` (${offending.reason}).`;
  }
  return null;
}
