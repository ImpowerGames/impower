// PreToolUse hook for the Bash and PowerShell tools: refuses any command
// that would create an issue in this repo's tracker without an issue type.
//
// Every ticket here carries one of Bug, Feature, or Task. `gh issue create`
// cannot set a type, so it is refused. The REST create endpoint can, so a
// `gh api` call that creates an issue is allowed only when one of its field
// flags is `type=<value>`. `gh api` switches to POST on its own as soon as a
// field flag is present, so the check looks at what the call does, not at
// whether `-X POST` was typed.
//
// The payload arrives on stdin as JSON. Only tool_input.command is read; the
// command is split into shell-style tokens (Bash and PowerShell quoting,
// line continuations, comments, here-doc bodies), so a mention of the phrase
// in a quoted string, a comment, or a here-doc body is not a match. A `gh`
// or `curl` token counts as an invocation only at command position: the
// start of a segment, after a shell keyword such as `do` or `then`, after
// environment assignments or redirections, or after a wrapper such as sudo,
// env, xargs, or timeout and that wrapper's own flags. A string handed to a
// shell's `-c` (in any cluster, with the shell's own options before it), to
// `cmd /c`, to `pwsh -Command`, to `eval`, to `env -S`, or to a shell's
// stdin with `<<<` is analysed as a command of its own, as is a `$(...)` or
// backquote substitution inside double quotes.
//
// This is a guardrail against forgetting the type, not against evasion: an
// endpoint or method built from a shell variable, a gh alias, or a wrapper
// script is not seen.
//
// Exercised by typed-issue-hook.test.mjs next to this file, which also runs
// the exact command string .claude/settings.json ships.

import { pathToFileURL } from "node:url";

const RECIPE =
  'gh api -X POST repos/ImpowerGames/impower/issues -f title="<title>" -F body=@ticket.md -f type=Bug -f "labels[]=<label>"   (type is Bug, Feature, or Task; repeat labels[] per label)';

const THIS_REPO = "impowergames/impower";

// gh api flags that take a value which is not a request field.
const GH_API_VALUE_FLAGS = new Set(["-H", "--header", "-p", "--preview", "-q", "--jq", "-t", "--template", "--cache", "--hostname"]);
const GH_API_FIELD_FLAGS = new Set(["-f", "--raw-field", "-F", "--field"]);
// gh issue create flags that take a value.
const GH_ISSUE_CREATE_VALUE_FLAGS = new Set([
  "-t", "--title", "-b", "--body", "-F", "--body-file", "-l", "--label", "-a", "--assignee",
  "-m", "--milestone", "-p", "--project", "-T", "--template", "-R", "--repo", "--recover",
]);

// Words that may precede a program name in a segment without being the
// program, with the flags of each that take a value. `positional` is the
// number of non-flag words the wrapper consumes before the program.
const WRAPPERS = new Map([
  ["sudo", { flags: new Set(["-u", "-g", "-p", "-h", "-C", "-D", "-r", "-t", "-T", "-U", "--user", "--group", "--host", "--prompt", "--chdir"]) }],
  ["doas", { flags: new Set(["-u", "-C"]) }],
  ["env", { flags: new Set(["-u", "-C", "-S", "--unset", "--chdir", "--split-string"]) }],
  ["xargs", { flags: new Set(["-I", "-i", "-n", "-P", "-L", "-l", "-d", "-a", "-s", "-E", "-e", "--max-args", "--max-procs", "--max-lines", "--delimiter", "--replace", "--arg-file", "--max-chars", "--eof"]) }],
  ["time", { flags: new Set(["-f", "-o", "--format", "--output"]) }],
  ["timeout", { flags: new Set(["-s", "-k", "--signal", "--kill-after"]), positional: 1 }],
  ["nice", { flags: new Set(["-n", "--adjustment"]) }],
  ["stdbuf", { flags: new Set(["-o", "-e", "-i", "--output", "--error", "--input"]) }],
  ["npx", { flags: new Set(["-p", "--package", "-c", "--call"]) }],
  ["nohup", { flags: new Set() }],
  ["command", { flags: new Set() }],
  ["builtin", { flags: new Set() }],
  ["exec", { flags: new Set(["-a"]) }],
  ["winpty", { flags: new Set() }],
]);
// Shell keywords after which a command starts.
const KEYWORDS = new Set(["do", "then", "else", "elif", "if", "while", "until", "!", "%", "foreach-object"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "busybox", "pwsh", "powershell", "cmd"]);
// Redirections: a descriptor duplication that takes no target (`2>&1`,
// `<&0`, `2>&-`), a bare operator whose target is the next token (`>`,
// `2>`, `>>`, `<`, `&>`, `&>>`, `>&`), and an operator glued to its target.
const REDIRECT_DUP = /^\d*[<>]{1,2}&[\d-]+$/;
const REDIRECT_OP = /^(\d*[<>]{1,2}|&>>?|>&)$/;
const REDIRECT_GLUED = /^(\d*[<>]{1,2}&?|&>>?)[^<>&]/;
// A PowerShell variable assignment target: `$x`, `${x}`, `$x=`, `$x+=`, `$x=value`.
const PS_ASSIGN = /^\$([A-Za-z_][A-Za-z0-9_:]*|\{[^}]+\})([+-]?=(.*))?$/;

/**
 * Split a command line into tokens the way Bash or PowerShell roughly would.
 * Each token carries its `start` and `end` offsets in the command. The
 * returned array also has a `subs` property: the text of every `$(...)` or
 * backquote substitution found inside double quotes.
 */
export function tokenize(command) {
  const tokens = [];
  tokens.subs = [];
  let text = "";
  let quoted = false;
  let started = false;
  let start = 0;
  let arith = 0;
  let noEscapedCloseFrom = command.length;
  const heredocs = [];
  const flush = (end) => {
    if (started) tokens.push({ text, quoted, start, end });
    text = "";
    quoted = false;
    started = false;
  };
  const sep = (end) => {
    flush(end);
    tokens.push({ sep: true });
  };
  const begin = (at) => {
    if (!started) start = at;
    started = true;
  };
  // A parenthesised or hashtable group that follows a `-Flag` token is that
  // flag's value and stays one token.
  const lastIsFlag = () => {
    const last = tokens[tokens.length - 1];
    return Boolean(last && !last.sep && !last.quoted && /^-[A-Za-z]/.test(last.text));
  };
  let i = 0;
  const n = command.length;
  while (i < n) {
    const c = command[i];
    if (c === "@" && (command[i + 1] === '"' || command[i + 1] === "'") && !started && /^\r?\n/.test(command.slice(i + 2, i + 4))) {
      // PowerShell here-string: @" ... "@ or @' ... '@, one quoted token.
      const q = command[i + 1];
      const close = command.indexOf(`\n${q}@`, i + 2);
      const end = close < 0 ? n : close + 3;
      tokens.push({ text: command.slice(i + 2, close < 0 ? n : close).replace(/^\r?\n/, ""), quoted: true, start: i, end });
      i = end;
      continue;
    }
    if (c === "'") {
      begin(i);
      quoted = true;
      i++;
      while (i < n) {
        if (command[i] === "'") {
          if (command[i + 1] === "'") {
            text += "'"; // PowerShell doubled quote
            i += 2;
            continue;
          }
          break;
        }
        text += command[i++];
      }
      i++;
      continue;
    }
    if (c === '"') {
      begin(i);
      quoted = true;
      // Backslash escapes apply only when they lead to a closing quote;
      // otherwise this is a PowerShell string where backslash is literal.
      // Once the escaping reading fails from some offset, it fails from
      // every later one, so the scan is not repeated.
      const backslashEscapes = i < noEscapedCloseFrom && scanQuote(command, i, true) >= 0;
      if (!backslashEscapes) noEscapedCloseFrom = Math.min(noEscapedCloseFrom, i);
      i++;
      while (i < n && command[i] !== '"') {
        if (backslashEscapes && command[i] === "\\" && i + 1 < n && '"\\$`\n'.includes(command[i + 1])) {
          i++;
          if (command[i] !== "\n") text += command[i];
          i++;
          continue;
        }
        if (command[i] === "$" && command[i + 1] === "(") {
          const close = matchParen(command, i + 1);
          tokens.subs.push(command.slice(i + 2, close));
          text += command.slice(i, close + 1);
          i = close + 1;
          continue;
        }
        if (command[i] === "`") {
          // A backtick before one of PowerShell's escape characters (`n,
          // `t, `", `$) is an escape; otherwise, with a partner backtick
          // later, it is a Bash substitution; alone, it is literal.
          const next = command[i + 1] ?? "";
          const close = "0abfnrtv\"'$` ".includes(next) ? -1 : command.indexOf("`", i + 1);
          if (close < 0) {
            if (i + 1 < n) text += next;
            i += 2;
            continue;
          }
          tokens.subs.push(command.slice(i + 1, close));
          text += command.slice(i, close + 1);
          i = close + 1;
          continue;
        }
        text += command[i++];
      }
      i++;
      continue;
    }
    const opensGroup = c === "(" || (c === "$" && command[i + 1] === "(") || (c === "@" && (command[i + 1] === "(" || command[i + 1] === "{"));
    // -Body:@{...}; tested only at an opener so a long bare word is not
    // re-read at every character.
    const flagPrefix = opensGroup && started && text.startsWith("-") && text.endsWith(":");
    if (opensGroup && ((!started && lastIsFlag()) || flagPrefix)) {
      // A balanced group that is a flag's value (`-Body (...)`, `-Headers
      // @{...}`, `-Body:@{...}`) stays one token so the invocation continues
      // after it. A parenthesised group is still analysed as a command of
      // its own, since in Bash it may be a substitution. An unbalanced group
      // falls through to the ordinary separator handling.
      const openAt = c === "(" ? i : i + 1;
      const close = matchBracket(command, openAt);
      if (close < n) {
        if (command[openAt] === "(") tokens.subs.push(command.slice(openAt + 1, close));
        if (flagPrefix) {
          text += command.slice(i, close + 1);
          quoted = true;
        } else {
          tokens.push({ text: command.slice(i, close + 1), quoted: true, group: true, start: i, end: close + 1 });
        }
        i = close + 1;
        continue;
      }
    }
    if (c === "\\") {
      if (i + 1 < n) {
        const next = command[i + 1];
        if (next === "\n") {
          i += 2; // Bash line continuation
          continue;
        }
        if (next === "\r" && command[i + 2] === "\n") {
          i += 3;
          continue;
        }
        begin(i);
        // A backslash before a quote, space, or another backslash escapes
        // it; anywhere else it is kept, so a Windows path from the
        // PowerShell tool keeps its separators.
        text += '"\'\\ $`'.includes(next) ? next : c + next;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === "`") {
      if (command[i + 1] === "\n") {
        i += 2; // PowerShell line continuation
        continue;
      }
      if (command[i + 1] === "\r" && command[i + 2] === "\n") {
        i += 3;
        continue;
      }
      // At the start of a word or anywhere in an assignment, a backtick is a
      // Bash command substitution and opens a new segment. Inside another
      // bare word it is a PowerShell escape and keeps its character.
      if (started && !text.includes("=") && i + 1 < n && !" \t".includes(command[i + 1])) {
        text += command[i + 1];
        i += 2;
        continue;
      }
      sep(i);
      i++;
      continue;
    }
    if (c === "#" && !started) {
      while (i < n && command[i] !== "\n") i++; // comment to end of line
      continue;
    }
    if (c === "<" && command[i + 1] === "<" && command[i + 2] === "<") {
      flush(i);
      tokens.push({ text: "<<<", quoted: false, start: i, end: i + 3 });
      i += 3;
      continue;
    }
    if (c === "<" && command[i + 1] === "<" && arith === 0) {
      // Here-doc operator. The delimiter is recorded and the body is skipped
      // at the next newline; a body with no terminator runs to the end of
      // the command, as it does in the shell. A purely numeric delimiter is
      // a shift operator, not a here-doc.
      flush(i);
      const doc = readHeredocOperator(command, i);
      if (doc) {
        heredocs.push(doc);
        i = doc.next;
      } else {
        i += 2;
      }
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      flush(i);
      i++;
      continue;
    }
    if (c === "\n") {
      sep(i);
      i++;
      arith = 0;
      i = skipHeredocBodies(command, i, heredocs);
      continue;
    }
    if (c === "(" && command[i + 1] === "(") {
      arith++;
      sep(i);
      i += 2;
      continue;
    }
    if (c === ")" && command[i + 1] === ")" && arith > 0) {
      arith--;
      sep(i);
      i += 2;
      continue;
    }
    if (c === "&" && started && /[<>]$/.test(text)) {
      text += c; // 2>&1, >&2
      i++;
      continue;
    }
    if (c === "&" && !started && command[i + 1] === ">") {
      begin(i); // &>file
      text += "&>";
      i += 2;
      continue;
    }
    if (c === ";" || c === "|" || c === "&" || c === "(" || c === ")") {
      sep(i);
      i++;
      continue;
    }
    if ((c === "{" || c === "}") && !started) {
      sep(i); // a brace that starts a word groups commands, in Bash and in PowerShell
      i++;
      continue;
    }
    if (c === "$" && command[i + 1] === "(") {
      sep(i);
      i += 2;
      if (command[i] === "(") {
        arith++;
        i++;
      }
      continue;
    }
    begin(i);
    text += c;
    i++;
  }
  flush(n);
  return tokens;
}

/** Index of the `)` matching the `(` at `open`, or the end of the string. */
function matchParen(command, open) {
  return matchBracket(command, open);
}

/**
 * Reads a here-doc operator at `i` (`<<`, `<<-`, then the delimiter, with
 * quotes and backslashes stripped). Returns the delimiter, whether leading
 * tabs are stripped from body lines, and the index after the delimiter, or
 * null when the delimiter is empty or purely numeric (a shift operator).
 */
function readHeredocOperator(command, i) {
  const n = command.length;
  let j = i + 2;
  let strip = false;
  if (command[j] === "-") {
    strip = true;
    j++;
  }
  while (j < n && " \t".includes(command[j])) j++;
  let delim = "";
  while (j < n && !" \t\r\n;|&<>()".includes(command[j])) {
    const ch = command[j++];
    if (ch === "'" || ch === '"') continue;
    if (ch === "\\" && j < n) {
      delim += command[j++];
      continue;
    }
    delim += ch;
  }
  if (!delim || /^\d+$/.test(delim)) return null;
  return { delim, strip, next: j };
}

/** Skips the bodies of the pending here-docs starting at line offset `i`; returns the offset after the last terminator. */
function skipHeredocBodies(command, i, heredocs) {
  const n = command.length;
  while (heredocs.length && i < n) {
    const { delim, strip } = heredocs.shift();
    while (i < n) {
      let end = command.indexOf("\n", i);
      if (end < 0) end = n;
      let line = command.slice(i, end).replace(/\r$/, "");
      if (strip) line = line.replace(/^\t+/, "");
      i = Math.min(end + 1, n);
      if (line === delim) break;
    }
  }
  heredocs.length = 0;
  return i;
}

/**
 * Index of the closing bracket matching the opener at `open`, or the end of
 * the string when unbalanced. Partners come from one pass over the command
 * (cached for the last command seen), so every lookup is constant time and
 * a run of unbalanced openers costs nothing extra.
 */
function matchBracket(command, open) {
  const partner = bracketPartners(command).get(open);
  return partner === undefined ? command.length : partner;
}

let partnerCacheKey = null;
let partnerCache = null;

/**
 * Map from the index of every balanced `(` or `{` to the index of its
 * partner. The pass skips what the tokenizer skips: quoted text, comments,
 * and here-doc bodies. A `$(` inside double quotes opens a substitution
 * whose contents are code again until its partner. A quote with no
 * partner is an ordinary character, so a stray apostrophe in prose does
 * not unbalance everything after it.
 */
function bracketPartners(command) {
  if (partnerCacheKey === command) return partnerCache;
  // A flag-value opener that never closes would keep the PowerShell reading
  // on for the rest of the command, so the pass runs again without it.
  let result = computePartners(command, new Set());
  if (result.unclosedFlagValues.length) result = computePartners(command, new Set(result.unclosedFlagValues));
  partnerCacheKey = command;
  partnerCache = result.map;
  return result.map;
}

function computePartners(command, suppressed) {
  const map = new Map();
  const stack = []; // { ch, at, resumesString }
  const heredocs = [];
  const n = command.length;
  let inString = false; // inside double quotes
  let backslashEscapes = true;
  let wordStart = true; // at the start of a word, where `#` opens a comment
  let arith = 0; // inside `$((...))` or `((...))`, where `<<` is a shift
  let noCloseFrom = n; // offset from which no `"` has a closing partner
  // A group that is a PowerShell `-Flag`'s value (`-Body (...)`, `-Headers
  // @{...}`, `-Body:@{...}`) is PowerShell, where a backslash inside a
  // string is literal. A PowerShell flag word has a capital letter or at
  // least three letters; a Bash short flag (`-n`, `-e`) does not count. A
  // `$(` counts only after a capitalised word of two or more characters
  // (`-Body $(...)`): a single capital letter is a Bash short flag (`curl
  // -H $(...)`, `grep -E $(...)`), and a lowercase word is as likely a
  // Bash substitution (`find -name $(...)`), so `-body $(...)` is read as
  // Bash even though PowerShell parameters are case-insensitive. A
  // backtick line continuation may separate the flag from its group.
  const flagValue = (at) => {
    if (suppressed.has(at)) return false;
    let j = at - 1;
    const dollar = command[j] === "$";
    if (command[j] === "@" || dollar) j--;
    for (;;) {
      while (j >= 0 && " \t".includes(command[j])) j--;
      if (j >= 1 && command[j] === "\n" && (command[j - 1] === "`" || (command[j - 1] === "\r" && command[j - 2] === "`"))) {
        j -= command[j - 1] === "`" ? 2 : 3;
        continue;
      }
      break;
    }
    let start = j;
    while (start >= 0 && /[\w:-]/.test(command[start])) start--;
    const word = command.slice(start + 1, j + 1);
    return dollar ? /^-[A-Z][\w-]+:?$/.test(word) : /^-(?:[A-Z][\w-]*|[a-z][\w-]{2,}):?$/.test(word);
  };
  // Each stack entry carries whether it or any entry below it is a flag
  // value, so the test is constant time.
  const inFlagValue = () => stack.length > 0 && stack[stack.length - 1].psIn;
  const push = (ch, at, resumesString, ps) => {
    stack.push({ ch, at, resumesString, ps, psIn: ps || (stack.length > 0 && stack[stack.length - 1].psIn) });
  };
  for (let k = 0; k < n; k++) {
    const ch = command[k];
    if (inString) {
      if (ch === "`" || (backslashEscapes && ch === "\\")) {
        k++;
        continue;
      }
      if (ch === '"') {
        inString = false;
        continue;
      }
      if (ch === "$" && command[k + 1] === "(") {
        push("(", k + 1, true, false);
        inString = false;
        k++;
        if (command[k + 1] === "(") {
          arith++; // "$((1 << n))": a shift, not a here-doc
          push("(", k + 1, false, false);
          k++;
        }
      }
      continue;
    }
    if (ch === "\\") {
      k++;
      wordStart = false;
      continue;
    }
    if (ch === "'") {
      const end = scanQuote(command, k, false);
      if (end >= 0) k = end;
      wordStart = false;
      continue;
    }
    if (ch === '"') {
      // The literal reading finds a partner whenever the escaping one does,
      // so it is tried first; once it fails, no later quote closes either.
      // Inside a flag's value group the string is PowerShell and the
      // backslash is always literal.
      if (k < noCloseFrom && scanQuote(command, k, false) >= 0) {
        backslashEscapes = !inFlagValue() && scanQuote(command, k, true) >= 0;
        inString = true;
      } else noCloseFrom = Math.min(noCloseFrom, k);
      wordStart = false;
      continue;
    }
    if (ch === "#" && wordStart) {
      const end = command.indexOf("\n", k);
      k = end < 0 ? n : end - 1;
      continue;
    }
    if (ch === "<" && command[k + 1] === "<" && command[k + 2] !== "<" && arith === 0) {
      const doc = readHeredocOperator(command, k);
      if (doc) {
        heredocs.push(doc);
        k = doc.next - 1;
      } else k++;
      wordStart = false;
      continue;
    }
    if (ch === "\n") {
      wordStart = true;
      arith = 0;
      if (heredocs.length) k = skipHeredocBodies(command, k + 1, heredocs) - 1;
      continue;
    }
    // Arithmetic is counted exactly as the tokenizer counts it: any `((`
    // opens a context and any `))` while one is open closes it. Both
    // parentheses are still paired normally.
    if (ch === "(" && command[k + 1] === "(") {
      arith++;
      push(ch, k, false, flagValue(k));
      push(ch, k + 1, false, false);
      k++;
      wordStart = false;
      continue;
    }
    if (ch === ")" && command[k + 1] === ")" && arith > 0) arith--;
    if (ch === "(" || ch === "{") {
      push(ch, k, false, flagValue(k));
    } else if (ch === ")" || ch === "}") {
      const want = ch === ")" ? "(" : "{";
      // Pop back to the nearest opener of this kind; an unmatched closer
      // of the other kind is ignored.
      let j = stack.length - 1;
      while (j >= 0 && stack[j].ch !== want) j--;
      if (j >= 0) {
        map.set(stack[j].at, k);
        if (stack[j].resumesString) inString = true;
        stack.length = j;
      }
    }
    wordStart = " \t;|&(".includes(ch);
  }
  return { map, unclosedFlagValues: stack.filter((e) => e.ps).map((e) => e.at) };
}

function scanQuote(command, open, backslashEscapes) {
  const q = command[open];
  for (let k = open + 1; k < command.length; k++) {
    const ch = command[k];
    if (q === '"' && (ch === "`" || (backslashEscapes && ch === "\\"))) {
      k++;
      continue;
    }
    if (ch === q) {
      if (q === "'" && command[k + 1] === "'") {
        k++; // doubled apostrophe
        continue;
      }
      return k;
    }
  }
  return -1;
}

function baseName(token) {
  return token.text.replace(/\\/g, "/").split("/").pop().toLowerCase().replace(/\.exe$/, "");
}

function normalizeRepo(value) {
  const v = value.trim().replace(/^=/, "").replace(/\/+$/, "").replace(/\.git$/, "").toLowerCase();
  const m = v.match(/(?:^|[/:])([^/:]+\/[^/:]+)$/);
  return m ? m[1] : v;
}

function isThisRepo(repo) {
  const r = normalizeRepo(repo);
  return r === THIS_REPO || r === "{owner}/{repo}" || r === ":owner/:repo";
}

/** Reads `--flag value`, `--flag=value`, `-Xvalue`, `-X=value`; returns [value, tokensConsumed]. */
function flagValue(args, i) {
  const t = args[i].text;
  const eq = t.indexOf("=");
  if (t.startsWith("--") && eq > 0) return [t.slice(eq + 1), 1];
  if (!t.startsWith("--") && t.length > 2) return [t.slice(2).replace(/^=/, ""), 1];
  return [args[i + 1]?.text ?? "", 2];
}

function flagName(t) {
  if (t.startsWith("--")) return t.toLowerCase().split("=")[0];
  if (t.startsWith("-") && t.length > 1) return t.slice(0, 2);
  return null;
}

/** True when the flag token carries no joined value, so the next token is its value. */
function takesNextToken(t, name) {
  return !t.includes("=") && t.length === name.length;
}

/**
 * Reads the arguments after `gh`: the subcommand words (`api`, or `issue`
 * plus its action), the remaining tokens in order, and a repo given by
 * `-R`/`--repo` before the action. gh accepts those flags before the
 * subcommand, so `gh -R o/r issue create` and `gh issue -R o/r create` both
 * resolve here; `--hostname` is consumed the same way so its value is not
 * mistaken for a subcommand.
 */
function ghInvocation(args) {
  const words = [];
  const rest = [];
  let repo = null;
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    const wantWord = words.length === 0 || (words.length === 1 && words[0] === "issue");
    if (wantWord && t.startsWith("-")) {
      const name = flagName(t);
      if (name === "-R" || name === "--repo" || name === "--hostname") {
        const [value, used] = flagValue(args, i);
        if (name !== "--hostname") repo = value;
        i += used - 1;
        continue;
      }
      rest.push(args[i]);
      continue;
    }
    if (wantWord) words.push(t.toLowerCase());
    else rest.push(args[i]);
  }
  return { words, rest, repo };
}

function checkGhIssueCreate(args, presetRepo) {
  let repo = presetRepo;
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    const name = flagName(t);
    if (name === null) continue;
    if (name === "-R" || name === "--repo") {
      const [value, used] = flagValue(args, i);
      repo = value;
      i += used - 1;
      continue;
    }
    if (GH_ISSUE_CREATE_VALUE_FLAGS.has(name) && takesNextToken(t, name)) i++;
  }
  if (repo !== null && !isThisRepo(repo)) return null;
  return (
    "gh issue create cannot set an issue type, and every ticket here carries one (Bug, Feature, or Task). " +
    "Create the issue with one typed REST call instead: " + RECIPE
  );
}

function normalizeEndpoint(raw) {
  return raw
    .replace(/^https?:\/\/[^/]+\//i, "")
    .split("?")[0]
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function checkGhApi(args) {
  let method = null;
  let input = false;
  const fields = [];
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    if (t === "--") {
      positional.push(...args.slice(i + 1).map((a) => a.text));
      break;
    }
    // Long flags are case-insensitive here; short flags keep their case
    // because -f and -F are different flags to gh.
    const name = flagName(t);
    if (name === null) {
      positional.push(t);
      continue;
    }
    if (GH_API_FIELD_FLAGS.has(name)) {
      const [value, used] = flagValue(args, i);
      fields.push({ raw: name === "-f" || name === "--raw-field", value });
      i += used - 1;
      continue;
    }
    if (name === "-X" || name === "--method") {
      const [value, used] = flagValue(args, i);
      method = value.toUpperCase();
      i += used - 1;
      continue;
    }
    if (name === "--input") {
      const [, used] = flagValue(args, i);
      input = true;
      i += used - 1;
      continue;
    }
    if (GH_API_VALUE_FLAGS.has(name)) {
      const [, used] = flagValue(args, i);
      i += used - 1;
      continue;
    }
    // boolean flag: --paginate, --slurp, --silent, -i, --verbose, ...
  }
  const endpoint = normalizeEndpoint(positional[0] ?? "");

  if (endpoint === "graphql") {
    if (fields.some((f) => /createissue/i.test(f.value))) {
      return (
        "This GraphQL mutation creates an issue, and the hook cannot see whether it sets an issue type. " +
        "Use the REST call instead: " + RECIPE
      );
    }
    return null;
  }

  const m = endpoint.match(/^repos\/([^/]+\/[^/]+)\/issues$/);
  if (!m || !isThisRepo(m[1])) return null;

  const creates = method === null ? fields.length > 0 || input : method === "POST";
  if (!creates) return null;

  if (input) {
    return (
      "This creates an issue from a request body file, and the hook cannot see whether the body sets an issue type " +
      "(field flags next to --input go to the query string, not the body). Use field flags instead: " + RECIPE
    );
  }
  // -F converts true, false, null, and integers to JSON values and reads
  // `@file` from a file, so none of those is a type name the hook can see.
  const typed = fields.some((f) => {
    const v = f.value.match(/^type=(.+)$/)?.[1];
    if (!v) return false;
    return f.raw || !/^(true|false|null|-?\d+|@.*)$/.test(v);
  });
  if (typed) return null;
  return (
    "This creates an issue without an issue type, and every ticket here carries one (Bug, Feature, or Task). " +
    "Add -f type=Bug, -f type=Feature, or -f type=Task to the same call: " + RECIPE
  );
}

const COLLECTION_URL = /api\.github\.com\/repos\/([^/\s"']+\/[^/\s"']+)\/issues\/?(\?|$)/i;
// A `type` entry in a non-JSON body once string values are blanked: a
// hashtable entry (`type=`) after `{`, `;`, `,`, `(`, or `&`, or a quoted
// JSON key in text that did not parse. Lowercase, because keys are
// case-sensitive.
const TYPE_ENTRY = /(["']type["']\s*[:=]\s*\S|(^|[{;,(&\n\r])\s*type\s*=\s*\S)/;

/**
 * True when a request body carries a top-level `type` field with a value.
 * A JSON body is parsed; anything else has its string values blanked first,
 * so prose inside a title or a body text does not count.
 */
function bodyHasTypeField(body) {
  const inner = unwrapBody(body);
  if (/^[{[]/.test(inner)) {
    try {
      const obj = JSON.parse(inner);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return typeof obj.type === "string" && obj.type.length > 0;
      return false;
    } catch {
      // Not valid JSON (a trailing comma, a comment): fall through to the
      // lenient text check below.
    }
  }
  if (/^&?[A-Za-z0-9_][^{@(\s"'=]*=/.test(inner)) {
    // Form-encoded data: title=x&type=Bug, labels[]=bug&type=Bug
    const type = new URLSearchParams(inner).get("type");
    return typeof type === "string" && type.length > 0;
  }
  // Anything else is a hashtable or JSON-like text; prose is not a body.
  if (!/^(@?\{|\[)/.test(inner)) return false;
  // Every quoted or here-string value is blanked first (a one-character
  // placeholder when it has content, an empty string otherwise), then empty
  // type entries are dropped, then the entry regex runs on what is left.
  const blanked = blankValues(inner).replace(/["']?type["']?\s*[:=]\s*(["'])\1/g, "");
  return TYPE_ENTRY.test(blanked);
}

/**
 * One forward pass over a hashtable or object-literal body that replaces
 * every quoted string except a key (one followed by `=` or `:`) with `"h"`
 * when it has content and `""` when empty, and does the same for a
 * here-string (`@"` or `@'` at a line end, through the matching `"@` or
 * `'@` at a line start); a here-string with no terminator is text. Quoted
 * text is consumed as a unit, so an `= @"` inside a value is never taken
 * for an opener, and every character is visited once. A hashtable literal
 * is PowerShell, where a backslash is literal; any other body is JSON-like,
 * where a backslash escapes while that reading keeps reaching closing
 * quotes and is literal from the first time it does not, so each quote is
 * scanned at most twice over the whole body.
 */
function blankValues(text) {
  const n = text.length;
  let backslashEscapes = !text.startsWith("@{");
  const noTerminator = { '"': false, "'": false };
  let out = "";
  let k = 0;
  const isKey = (after) => {
    let j = after;
    while (j < n && " \t\r\n".includes(text[j])) j++;
    return j < n && (text[j] === "=" || text[j] === ":");
  };
  while (k < n) {
    const ch = text[k];
    if (ch === "@" && (text[k + 1] === '"' || text[k + 1] === "'") && /^\r?\n/.test(text.slice(k + 2, k + 4))) {
      const q = text[k + 1];
      const term = noTerminator[q] ? -1 : text.indexOf(`\n${q}@`, k + 2);
      if (term >= 0) {
        const body = text.slice(k + 2, term);
        out += body.trim().length ? `${q}h${q}` : `${q}${q}`;
        k = term + 3;
        continue;
      }
      noTerminator[q] = true;
    }
    if (ch === '"' || ch === "'") {
      let end = -1;
      if (ch === '"' && backslashEscapes) {
        end = scanQuote(text, k, true);
        if (end < 0) backslashEscapes = false;
      }
      if (end < 0) end = scanQuote(text, k, false);
      const close = end < 0 ? n - 1 : end;
      if (isKey(close + 1)) out += text.slice(k, close + 1);
      else out += close > k + 1 ? `${ch}h${ch}` : ch + ch;
      k = close + 1;
      continue;
    }
    out += ch;
    k++;
  }
  return out;
}

/**
 * Strips the wrappers a body may sit in: `(...)`, `$(...)`, `@(...)`, one
 * layer of quotes, Bash `$'...'` (or the bare `$` the tokenizer leaves
 * after removing its quotes), a `ConvertTo-Json` call (prefix with flags
 * before or after the object, or a trailing pipe), and a `[Type]`
 * accelerator before a hashtable literal; unescapes the quotes inside.
 */
function unwrapBody(body) {
  let s = body.trim();
  // `ConvertTo-Json`, with any flags (`-Depth 10`, `-Depth:10`), before or
  // after the object, or after a pipe. The pipe form is tested only on the
  // text after the last `|`, anchored, so no whitespace run is backtracked.
  const toJsonFlags = String.raw`(?:\s+-[\w-]+(?:(?:\s+|[:=]\s*)(?!-)[^\s@{(]\S*)?)*`;
  const toJsonPrefix = new RegExp(String.raw`^convertto-json${toJsonFlags}\s+(?=[$@(\[]?[{(\[])`, "i");
  const toJsonTail = new RegExp(String.raw`^\|\s*convertto-json${toJsonFlags}\s*$`, "i");
  // Greedy, so a closer inside a value cannot end the object early; the
  // flag run is anchored to the end, so the object's own closer is found
  // from the right.
  const trailingFlags = new RegExp(String.raw`^([$@(\[].*[)}\]])${toJsonFlags}\s*$`, "is");
  for (let guard = 0; guard < 8; guard++) {
    if (/^[$@]?\(/.test(s) && s.endsWith(")")) {
      s = s.replace(/^[$@]?\(/, "").slice(0, -1).trim();
      continue;
    }
    const pipe = s.lastIndexOf("|");
    if (pipe > 0 && toJsonTail.test(s.slice(pipe))) {
      s = s.slice(0, pipe).trim();
      continue;
    }
    if (toJsonPrefix.test(s)) {
      s = s.replace(toJsonPrefix, "").trim();
      // `ConvertTo-Json (...) -Depth 10`: flags after the object.
      const m = /^([$@(\[])/.test(s) && !/[)}\]]$/.test(s) ? s.match(trailingFlags) : null;
      if (m) s = m[1];
      continue;
    }
    if (/^\[[^\][]+\]\s*@\{/.test(s)) {
      s = s.replace(/^\[[^\][]+\]\s*/, ""); // [ordered]@{...}, [pscustomobject]@{...}
      continue;
    }
    if (s.length >= 3 && s.startsWith("$'") && s.endsWith("'")) {
      s = s.slice(2, -1).replace(/\\(["'\\])/g, "$1"); // Bash ANSI-C quoting
      continue;
    }
    if (/^\$([{[]|&?[A-Za-z0-9_][^{@(\s"'=]*=)/.test(s)) {
      s = s.slice(1); // ANSI-C quoting after the tokenizer removed the quotes
      continue;
    }
    if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
      s = s.slice(1, -1).replace(/''/g, "'");
      continue;
    }
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
      s = s.slice(1, -1).replace(/`(["`$])/g, "$1").replace(/\\(["\\])/g, "$1");
      continue;
    }
    break;
  }
  return s;
}

// curl short flags that take a value; every other letter in a cluster is
// taken as a boolean, so an unlisted flag cannot swallow the next token.
const CURL_VALUE = "AbcCdDeEFHKmoQrtTuUwxXyYzP";
const CURL_DATA_LONG = /^--(data(-ascii|-raw|-binary|-urlencode)?|form(-string)?|json)(=|$)/;

function checkCurl(args) {
  const urlIndex = args.findIndex((a) => COLLECTION_URL.test(a.text));
  if (urlIndex < 0 || !isThisRepo(args[urlIndex].text.match(COLLECTION_URL)[1])) return null;
  let method = null;
  const bodies = [];
  let get = false;
  const setMethod = (value) => {
    if (value) method = value.toUpperCase();
  };
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    if (/^(-X|--request)$/.test(t)) setMethod(args[++i]?.text);
    else if (/^--request=/.test(t)) setMethod(t.slice("--request=".length));
    else if (t === "--get") get = true;
    else if (CURL_DATA_LONG.test(t)) {
      const eq = t.indexOf("=");
      bodies.push(eq > 0 ? t.slice(eq + 1) : (args[++i]?.text ?? ""));
    } else if (t.startsWith("-") && !t.startsWith("--")) {
      // Walk a short-flag cluster: booleans continue, the first flag that
      // takes a value ends it and takes the rest of the token or the next one.
      for (let p = 1; p < t.length; p++) {
        const ch = t[p];
        if (!CURL_VALUE.includes(ch)) {
          if (ch === "G") get = true;
          continue;
        }
        const rest = t.slice(p + 1).replace(/^=/, "");
        const value = rest.length ? rest : (args[++i]?.text ?? "");
        if (ch === "d" || ch === "F") bodies.push(value);
        else if (ch === "X") setMethod(value);
        break;
      }
    }
  }
  const creates = method === null ? bodies.length > 0 && !get : method === "POST";
  if (!creates) return null;
  if (bodies.some((b) => bodyHasTypeField(b))) return null;
  return (
    "This creates an issue without an issue type (or from a body the hook cannot read). " +
    "Use the gh recipe instead: " + RECIPE
  );
}

/**
 * The `-Body` value of a PowerShell invocation: the token after `-Body`,
 * which the tokenizer keeps whole for a quoted string, a here-string, a
 * parenthesised group, or a hashtable literal. Null when there is no
 * `-Body` in the segment.
 */
function bodyText(seg) {
  const bodyIndex = seg.findIndex((t) => /^-body(:|$)/i.test(t.text));
  if (bodyIndex < 0) return null;
  const colon = seg[bodyIndex].text.match(/^-body:([\s\S]*)$/i);
  if (colon && colon[1]) return colon[1];
  const next = seg[bodyIndex + 1]; // `-Body value` or `-Body: value`
  return next ? next.text : "";
}

function checkInvokeRestMethod(args) {
  const urlToken = args.find((a) => COLLECTION_URL.test(a.text));
  if (!urlToken || !isThisRepo(urlToken.text.match(COLLECTION_URL)[1])) return null;
  const joined = args.map((a) => a.text).join(" ");
  const body = bodyText(args);
  const posts = /(^|\s)-method\s+post\b/i.test(joined) || body !== null;
  if (!posts) return null;
  if (body !== null && bodyHasTypeField(body)) return null;
  return (
    "This creates an issue without an issue type (or from a body the hook cannot read). " +
    "Use the gh recipe instead: " + RECIPE
  );
}

/**
 * The indices in a segment where a program name may stand: after any run of
 * shell keywords, environment assignments, redirections, and wrappers with
 * their own flags, flag values, and positional arguments. One forward pass.
 */
function commandPositions(seg) {
  const positions = new Set();
  let k = 0;
  while (k < seg.length) {
    positions.add(k);
    const tok = seg[k];
    const t = tok.text;
    if (!tok.quoted && KEYWORDS.has(t.toLowerCase())) {
      k++;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      k++;
      continue;
    }
    if (!tok.quoted && PS_ASSIGN.test(t)) {
      // `$x = cmd`, `$x= cmd`, `$x =cmd`, `$x += cmd`
      k++;
      if (!t.includes("=") && /^[+-]?=$/.test(seg[k]?.text ?? "")) k++;
      continue;
    }
    if (!tok.quoted && REDIRECT_DUP.test(t)) {
      k++;
      continue;
    }
    if (!tok.quoted && REDIRECT_OP.test(t)) {
      k += 2;
      continue;
    }
    if (!tok.quoted && REDIRECT_GLUED.test(t)) {
      k++;
      continue;
    }
    const wrapper = tok.quoted ? null : WRAPPERS.get(baseName(tok));
    if (!wrapper) break;
    k++;
    let positional = wrapper.positional ?? 0;
    while (k < seg.length) {
      const f = seg[k].text;
      if (f.startsWith("-")) {
        const name = flagName(f);
        k++;
        if (wrapper.flags.has(name) && takesNextToken(f, name)) k++;
        continue;
      }
      if (positional > 0) {
        positional--;
        k++;
        continue;
      }
      break;
    }
  }
  return positions;
}

/**
 * True when the quoted token at index i is run as a command: it follows a
 * shell's `-c` (in any short-flag cluster, after the shell's own options),
 * `cmd /c`, a PowerShell `-Command`, `env -S`, `eval`, or a shell's `<<<`,
 * and that shell itself stands at command position.
 */
function isShellCommandString(seg, i, positions) {
  const prev = seg[i - 1];
  if (!prev) return false;
  const p = prev.text.toLowerCase();
  if (p === "eval") return positions.has(i - 1);
  const at = programBefore(seg, i - 1);
  if (at < 0 || !positions.has(at)) return false;
  const program = baseName(seg[at]);
  if (program === "env") return p === "-s" || p === "--split-string";
  if (p === "<<<" || p === "/c" || p === "-c" || p.startsWith("-comm")) return true;
  return /^-[a-z]*c[a-z]*$/.test(p);
}

/**
 * The index of the shell (or env) whose options run up to `flagIndex`,
 * walking back over options and their values, or -1. `--` ends a shell's
 * options, and `-File` hands control to a script, so both stop the walk.
 */
function programBefore(seg, flagIndex) {
  for (let k = flagIndex - 1, steps = 0; k >= 0 && steps < 16; k--, steps++) {
    const t = seg[k].text;
    const lower = t.toLowerCase();
    if (t === "--" || lower === "-file") return -1;
    if (!seg[k].quoted) {
      const base = baseName(seg[k]);
      if (SHELLS.has(base) || base === "env") return k;
      if (t.startsWith("-") || t.startsWith("/")) continue;
    }
    if (k > 0 && seg[k - 1].text.startsWith("-") && seg[k - 1].text !== "--") continue; // an option's value
    return -1;
  }
  return -1;
}

/** Returns a deny reason for the command, or null to allow it. */
export function decide(command, depth = 0) {
  if (typeof command !== "string" || command.length === 0 || depth > 3) return null;
  const tokens = tokenize(command);
  for (const sub of tokens.subs) {
    const inner = decide(sub, depth + 1);
    if (inner) return inner;
  }
  const segments = [];
  let current = [];
  for (const t of tokens) {
    if (t.sep) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(t);
  }
  if (current.length) segments.push(current);

  for (const seg of segments) {
    splitPsAssignments(seg);
    const positions = commandPositions(seg);
    for (let i = 0; i < seg.length; i++) {
      const tok = seg[i];
      if (tok.quoted && isShellCommandString(seg, i, positions)) {
        const inner = decide(tok.text, depth + 1);
        if (inner) return inner;
      }
      if (!positions.has(i)) continue;
      const base = baseName(tok);
      let reason = null;
      if (base === "gh") {
        const { words, rest, repo } = ghInvocation(seg.slice(i + 1));
        if (words[0] === "issue" && words[1] === "create") reason = checkGhIssueCreate(rest, repo);
        else if (words[0] === "api") reason = checkGhApi(rest);
      } else if (base === "curl") {
        reason = checkCurl(seg.slice(i + 1));
      } else if (base === "invoke-restmethod" || base === "irm" || base === "invoke-webrequest" || base === "iwr") {
        reason = checkInvokeRestMethod(seg.slice(i + 1));
      }
      if (reason) return reason;
    }
  }
  return null;
}

/** Splits a glued PowerShell assignment (`$x=gh ...`, or `$x =gh ...`) into the assignment and the program token, in place. */
function splitPsAssignments(seg) {
  const out = [];
  const head = /^\$(?:[A-Za-z_][A-Za-z0-9_:]*|\{[^}]+\})[+-]?=/;
  for (let k = 0; k < seg.length; k++) {
    let tok = seg[k];
    if (tok.quoted) {
      out.push(tok);
      continue;
    }
    let m = tok.text.match(head);
    if (!m && k > 0 && PS_ASSIGN.test(seg[k - 1].text) && !seg[k - 1].text.includes("=")) m = tok.text.match(/^[+-]?=/);
    // A chained `$x=$y=gh` splits once per assignment; each step shortens
    // the tail, and only the head is matched, so the cost is linear.
    while (m && m[0].length < tok.text.length) {
      const len = m[0].length;
      out.push({ ...tok, text: m[0], end: tok.start + len });
      tok = { ...tok, text: tok.text.slice(len), start: tok.start + len };
      m = tok.text.match(head);
    }
    out.push(tok);
  }
  seg.length = 0;
  for (const t of out) seg.push(t);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let command;
  try {
    command = JSON.parse(raw)?.tool_input?.command;
  } catch {
    // An unparseable payload is refused only when it looks like it carries a
    // gh call, so a broken harness cannot let an untyped create through and
    // cannot block unrelated commands either.
    if (/\bgh\s+(issue|api)\b/i.test(raw)) deny("The typed-issue hook could not parse the tool payload, so it cannot tell whether this command creates an untyped issue. " + RECIPE);
    return;
  }
  const reason = decide(command);
  if (reason) deny(reason);
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase();
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`typed-issue-hook: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
