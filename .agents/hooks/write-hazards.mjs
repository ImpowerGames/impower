// Two silent write hazards in the routes the repository sends content through.
//
// An editor capability can decode an escape sequence in the content it is
// handed, so source meant to hold the six characters of a JSON NUL escape
// lands as a raw 0x00 byte. The file still parses and runs, but git then
// classifies it as binary and every diff shows only "Binary files differ".
// Written content is therefore refused when it holds a C0 control byte other
// than tab, carriage return and newline; source that needs such a character
// spells it as an escape or builds it from its code point.
//
// .NET file calls in PowerShell resolve a relative path against the process
// directory, which Set-Location does not change. A runner that keeps its
// process in the main checkout therefore sends a worktree session's relative
// [IO.File] write into the main checkout. Such a call is refused when its path
// argument is relative as written: a relative literal, a Join-Path or
// parenthesized expression whose first path is one, or a variable the same
// command assigns one. A variable the command does not assign is not judged.
// The command is read with the shared PowerShell tokenizer, so a call spelled
// inside a comment, a string or a here-string is text, not an invocation.

import { readCommand } from "./typed-issue-hook.mjs";

const CONTROL_BYTE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

export function controlByteReason(texts) {
  for (const text of texts) {
    if (typeof text !== "string") continue;
    const match = CONTROL_BYTE.exec(text);
    if (!match) continue;
    const code = match[0].charCodeAt(0).toString(16).padStart(2, "0");
    return (
      `This content contains the raw control byte 0x${code}, which makes git treat the file as binary and hides it from diffs. ` +
      "The editor capability decodes escape sequences in the content it is given, so an escape such as a JSON NUL escape lands as the byte itself. " +
      "Spell the character in source form instead, for example an escape the language decodes at run time or String.fromCharCode, and write that."
    );
  }
  return null;
}

// Static members that take a path first and resolve it against the process
// directory. A backtick line continuation may sit between the parenthesis and
// the argument.
const DOTNET_CALL = /\[(?:System\.)?IO\.(File|Directory|Path)\]::(\w+)\((?:\s|`\r?\n)*/gi;
const PATH_STRING_MEMBERS = /^(?:Combine|Join|GetFileName|GetFileNameWithoutExtension|GetExtension|GetDirectoryName|ChangeExtension|HasExtension|IsPathRooted|GetTempPath|GetTempFileName|GetRandomFileName|GetInvalidPathChars|GetInvalidFileNameChars)$/i;
// Automatic and environment variables that always hold an absolute path.
const ABSOLUTE_ROOTS = /^\$(?:\{?env:|PWD\b|HOME\b|PSScriptRoot\b|PSHOME\b)/i;

// Judges the text a path value starts with: true when relative, false when
// absolute, null when it depends on a variable this command does not assign.
function relativeText(text, values, depth = 0) {
  if (depth > 4) return null;
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(text) || ABSOLUTE_ROOTS.test(text)) return false;
  const variable = /^\$(?:\{(\w+)\}|(\w+))/.exec(text);
  if (!variable) return true;
  const name = (variable[1] ?? variable[2]).toLowerCase();
  return values.has(name) ? relativeText(values.get(name), values, depth + 1) : null;
}

// Judges the argument expression at the start of `arg`.
function relativeArgument(arg, values, depth = 0) {
  if (depth > 4) return null;
  const inner = /^\(\s*/.exec(arg);
  if (inner) return relativeArgument(arg.slice(inner[0].length), values, depth + 1);
  const join = /^Join-Path\s+(?:-Path\s+)?/i.exec(arg);
  if (join) return relativeArgument(arg.slice(join[0].length), values, depth + 1);
  const quoted = /^(['"])(.*?)\1/s.exec(arg);
  if (quoted) return quoted[1] === "'" && quoted[2].startsWith("$") ? true : relativeText(quoted[2], values);
  if (/^\$/.test(arg)) return relativeText(arg, values);
  return null;
}

// Collects `$name = <quoted value>` assignments and the offsets of unquoted
// command text, both from the shared tokenizer.
function readPowerShell(command) {
  const values = new Map();
  const code = [];
  for (const { tokens } of readCommand(command, "powershell").segments) {
    for (const [i, t] of tokens.entries()) {
      if (!t.quoted) code.push([t.start, t.end]);
      const next = tokens[i + 1], value = tokens[i + 2];
      if (!t.quoted && /^\$\w+$/.test(t.text) && next?.text === "=" && !next.quoted && value?.quoted) values.set(t.text.slice(1).toLowerCase(), value.text);
    }
  }
  return { values, isCode: (offset) => code.some(([start, end]) => offset >= start && offset < end) };
}

export function dotNetRelativePathReason(command) {
  if (typeof command !== "string" || !/IO\.(?:File|Directory|Path)\]::/i.test(command)) return null;
  const { values, isCode } = readPowerShell(command);
  for (const m of command.matchAll(DOTNET_CALL)) {
    const [call, type, member] = m;
    if (/^Path$/i.test(type) ? !/^GetFullPath$/i.test(member) : PATH_STRING_MEMBERS.test(member)) continue;
    if (!isCode(m.index)) continue;
    if (relativeArgument(command.slice(m.index + call.length), values) !== true) continue;
    return (
      `This command passes a relative path to ${call.replace(/\((?:\s|`\r?\n)*$/, "")}. .NET resolves relative paths against the process directory, ` +
      "which Set-Location does not change and which the runner may keep at the main checkout, so the call can read or write the main checkout instead of this worktree. " +
      "Pass an absolute path, or use a cmdlet such as Get-Content or Set-Content -LiteralPath, which follows the PowerShell location."
    );
  }
  return null;
}
