import { baseName, readCommand } from "./typed-issue-hook.mjs";

// workaround(git): git classifies a file holding a NUL byte as binary, so every diff of it shows only "Binary files differ"
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

const DOTNET_CALL = /\[(?:System\.)?IO\.(File|Directory|Path)\]::(\w+)\((?:\s|`\r?\n)*/gi;
const PATH_STRING_MEMBERS = /^(?:Combine|Join|GetFileName|GetFileNameWithoutExtension|GetExtension|GetDirectoryName|ChangeExtension|HasExtension|IsPathRooted|GetTempPath|GetTempFileName|GetRandomFileName|GetInvalidPathChars|GetInvalidFileNameChars)$/i;
const ABSOLUTE_ROOTS = /^\$(?:\{?env:|PWD\b|HOME\b|PSScriptRoot\b|PSHOME\b)/i;

function relativeText(text, values, depth = 0) {
  if (depth > 4) return null;
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(text) || ABSOLUTE_ROOTS.test(text)) return false;
  if (!text.startsWith("$")) return true;
  const variable = /^\$(?:\{(\w+)\}|(\w+))/.exec(text);
  if (!variable) return null;
  const name = (variable[1] ?? variable[2]).toLowerCase();
  return values.has(name) ? relativeText(values.get(name), values, depth + 1) : null;
}

function valueLength(text) {
  const quoted = /^(['"])(?:(?!\1)[\s\S]|\1\1)*\1/.exec(text);
  if (quoted) return quoted[0].length;
  const open = text.startsWith("$(") ? 2 : text.startsWith("(") ? 1 : 0;
  if (open) {
    let level = 1, i = open;
    for (; i < text.length && level; i++) level += text[i] === "(" ? 1 : text[i] === ")" ? -1 : 0;
    return i;
  }
  return /^[^\s,)]*/.exec(text)[0].length;
}

const VALUE_PARAMETERS = /^(?:ChildPath|AdditionalChildPath|ErrorAction|ErrorVariable|WarningAction|WarningVariable|InformationAction|InformationVariable|OutVariable|OutBuffer|PipelineVariable)$/i;

function joinPathSource(text) {
  let positional = null;
  for (let rest = text; ; ) {
    rest = rest.replace(/^(?:\s|`\r?\n)+/, "");
    if (!rest || rest.startsWith(")")) return positional;
    const named = /^-(\w+)(:?)(?:\s|`\r?\n)*/.exec(rest);
    if (named) {
      rest = rest.slice(named[0].length);
      const length = valueLength(rest);
      if (/^Path$/i.test(named[1])) return rest.slice(0, length);
      if (named[2] || VALUE_PARAMETERS.test(named[1])) rest = rest.slice(length);
      continue;
    }
    const length = valueLength(rest);
    if (!length) return positional;
    positional ??= rest.slice(0, length);
    rest = rest.slice(length);
  }
}

function relativeArgument(arg, values, depth = 0) {
  if (depth > 4) return null;
  const inner = /^\(\s*/.exec(arg);
  if (inner) return relativeArgument(arg.slice(inner[0].length), values, depth + 1);
  const join = /^Join-Path\b/i.exec(arg);
  if (join) {
    const source = joinPathSource(arg.slice(join[0].length));
    if (!source) return null;
    return /^[^'"($]/.test(source) ? relativeText(source, values) : relativeArgument(source, values, depth + 1);
  }
  const quoted = /^(['"])(.*?)\1/s.exec(arg);
  if (quoted) return quoted[1] === "'" && quoted[2].startsWith("$") ? true : relativeText(quoted[2], values);
  if (arg.startsWith("$")) return relativeText(arg, values);
  return null;
}

function readPowerShell(command) {
  const code = [];
  const starts = new Set();
  const { segments, subs } = readCommand(command, "powershell");
  for (const { tokens } of segments) {
    for (const t of tokens) {
      starts.add(t.start);
      if (!t.quoted) code.push([t.start, t.end]);
    }
  }
  const isCode = (offset) => code.some(([start, end]) => offset >= start && offset < end);
  const values = new Map();
  for (const m of command.matchAll(/\$(\w+)[ \t]*=[ \t]*(['"])(.*?)\2/g)) {
    if (isCode(m.index) || starts.has(m.index)) values.set(m[1].toLowerCase(), m[3]);
  }
  return { values, isCode, subs: subs ?? [] };
}

// workaround(powershell): Windows PowerShell 5.1 strips double quotes from native command arguments, breaking gh --jq filters
export function jqQuoteReason(command) {
  if (typeof command !== "string" || !/(?:--jq|-q)/.test(command)) return null;
  const { segments, subs } = readCommand(command, "powershell");
  for (const sub of subs ?? []) {
    const reason = jqQuoteReason(sub);
    if (reason) return reason;
  }
  for (const { tokens, positions } of segments) {
    const start = tokens.findIndex((t, i) => positions.has(i) && baseName(t) === "gh");
    if (start < 0) continue;
    for (let i = start + 1; i < tokens.length; i++) {
      const { text } = tokens[i];
      const filter = /^(?:--jq|-q)$/.test(text) ? tokens[i + 1]?.text : /^--jq=|^-q./.test(text) ? text : null;
      if (!filter?.includes('"')) continue;
      return (
        "This command passes gh a --jq filter that contains a double quote. Windows PowerShell 5.1 drops embedded double quotes from native arguments, " +
        "whatever the quoting, so jq receives a damaged filter. Run this command through the POSIX shell tool instead."
      );
    }
  }
  return null;
}

// workaround(powershell): .NET file calls resolve a relative path against the process directory, not the PowerShell location
export function dotNetRelativePathReason(command, inherited, depth = 0) {
  if (typeof command !== "string" || !/IO\.(?:File|Directory|Path)\]::/i.test(command) || depth > 3) return null;
  const { values, isCode, subs } = readPowerShell(command);
  for (const [name, value] of inherited ?? []) if (!values.has(name)) values.set(name, value);
  for (const sub of subs) {
    const reason = dotNetRelativePathReason(sub, values, depth + 1);
    if (reason) return reason;
  }
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
