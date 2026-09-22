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
// argument is a relative literal, or a variable the same command assigns a
// relative literal. A variable the command does not assign is not judged.

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

// Static members that take a path first and resolve it against the process directory.
const DOTNET_CALL = /\[(?:System\.)?IO\.(?:File|Directory|Path)\]::(\w+)\(\s*/gi;
const PATH_MEMBERS = /^(?!(?:Combine|Join|GetFileName|GetFileNameWithoutExtension|GetExtension|GetDirectoryName|ChangeExtension|HasExtension|IsPathRooted|GetTempPath|GetTempFileName|GetRandomFileName|GetInvalidPathChars|GetInvalidFileNameChars)$)/i;

function absolute(text) {
  return /^(?:[A-Za-z]:[\\/]|[\\/])/.test(text);
}

function assignments(command) {
  const values = new Map();
  for (const m of command.matchAll(/\$(\w+)\s*=\s*(['"])(.*?)\2/g)) values.set(m[1].toLowerCase(), m[3]);
  return values;
}

// Returns true, false, or null when the argument's value cannot be known.
function relativeArgument(arg, values) {
  const quoted = /^(['"])(.*?)\1/.exec(arg);
  if (quoted) {
    const text = quoted[2];
    const variable = quoted[1] === '"' && /^\$(?:\{(\w+)\}|(\w+))/.exec(text);
    if (!variable) return !absolute(text);
    const name = (variable[1] ?? variable[2]).toLowerCase();
    return values.has(name) ? !absolute(values.get(name)) : null;
  }
  const variable = /^\$(\w+)\s*[,)]/.exec(arg);
  if (variable) {
    const name = variable[1].toLowerCase();
    return values.has(name) ? !absolute(values.get(name)) : null;
  }
  return null;
}

export function dotNetRelativePathReason(command) {
  if (typeof command !== "string" || !/IO\.(?:File|Directory|Path)\]::/i.test(command)) return null;
  const values = assignments(command);
  for (const m of command.matchAll(DOTNET_CALL)) {
    if (/^Path$/i.test(/IO\.(\w+)\]/i.exec(m[0])[1]) && !/^GetFullPath$/i.test(m[1])) continue;
    if (!PATH_MEMBERS.test(m[1])) continue;
    if (relativeArgument(command.slice(m.index + m[0].length), values) !== true) continue;
    return (
      `This command passes a relative path to ${m[0].replace(/\(\s*$/, "")}. .NET resolves relative paths against the process directory, ` +
      "which Set-Location does not change and which the runner may keep at the main checkout, so the call can read or write the main checkout instead of this worktree. " +
      "Pass an absolute path, or use a cmdlet such as Get-Content or Set-Content -LiteralPath, which follows the PowerShell location."
    );
  }
  return null;
}
