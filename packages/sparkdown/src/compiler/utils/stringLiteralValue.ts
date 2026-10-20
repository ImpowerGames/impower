// The string the runtime holds for a string literal's text as written
// (`"a\n"`, `'%d'`, `[[a]]`): a quoted string's text with its escapes read,
// a long string's as written, with its line endings normalized to "\n" and
// a line break directly after the opening bracket dropped (`[[\nfoo]]` is
// "foo"). The compiler (`lowerString`) and the FormatString lint both read
// literals through this, so the lint checks the format that actually runs.
export function stringLiteralValue(text: string, raw: boolean): string {
  const body = stripQuotes(text.trim());
  if (!raw) return processLuauEscapes(body);
  const value = body.replace(/\r\n|\r/g, "\n");
  return value.startsWith("\n") ? value.slice(1) : value;
}

// Convert Luau string-literal escape sequences to their character
// values. Mirrors Luau's lexer: standard one-letter escapes
// (`\a \b \f \n \r \t \v`), quote escapes (`\' \"`), backslash
// (`\\`), brace (`\{`), and `\z` (skip following whitespace),
// plus numeric (`\ddd`), hex (`\xHH`), and Unicode (`\u{HHHH}`)
// forms. Unknown escapes pass the following character through.
export function processLuauEscapes(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c !== "\\") {
      out += c;
      i++;
      continue;
    }
    if (i + 1 >= s.length) {
      out += "\\";
      break;
    }
    const next = s[i + 1]!;
    switch (next) {
      case "a":
        out += "\x07";
        i += 2;
        break;
      case "b":
        out += "\b";
        i += 2;
        break;
      case "f":
        out += "\f";
        i += 2;
        break;
      case "n":
        out += "\n";
        i += 2;
        break;
      case "r":
        out += "\r";
        i += 2;
        break;
      case "t":
        out += "\t";
        i += 2;
        break;
      case "v":
        out += "\v";
        i += 2;
        break;
      case "'":
      case '"':
      case "\\":
      case "{":
        out += next;
        i += 2;
        break;
      case "z": {
        i += 2;
        while (i < s.length && /\s/.test(s[i]!)) i++;
        break;
      }
      case "x": {
        const hex = s.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          out += next;
          i += 2;
        }
        break;
      }
      case "u": {
        const m = s.slice(i + 2).match(/^\{([0-9a-fA-F]+)\}/);
        if (m) {
          // Luau encodes up to `\u{7FFFFFFF}` as extended UTF-8; a JS string
          // cannot hold anything above U+10FFFF, so those become U+FFFD.
          // The validator already reports anything above Luau's own limit.
          const code = parseInt(m[1]!, 16);
          out += code > 0x10ffff ? "�" : String.fromCodePoint(code);
          i += 2 + m[0]!.length;
        } else {
          out += next;
          i += 2;
        }
        break;
      }
      case "\n":
        out += "\n";
        i += 2;
        break;
      default: {
        if (/\d/.test(next)) {
          // Decimal escape: 1–3 digits.
          const m = s.slice(i + 1).match(/^\d{1,3}/);
          if (m) {
            const code = parseInt(m[0]!, 10);
            if (code <= 255) {
              out += String.fromCharCode(code);
              i += 1 + m[0]!.length;
              break;
            }
          }
        }
        out += next;
        i += 2;
      }
    }
  }
  return out;
}

// A quoted literal's text between its delimiters.
export function stripQuotes(text: string): string {
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  if (
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === "`" && last === "`")
  ) {
    return text.slice(1, -1);
  }
  if (first === "[") {
    const m = text.match(/^\[(=*)\[([\s\S]*?)\]\1\]$/);
    if (m) return m[2]!;
  }
  return text;
}
