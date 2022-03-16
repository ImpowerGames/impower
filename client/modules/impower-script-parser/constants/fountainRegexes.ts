export const fountainRegexes = {
  title_page:
    /^([ \t]*)(title|credit|author[s]?|source|notes|draft date|date|watermark|contact(?: info)?|revision|copyright|font|tl|tc|tr|cc|br|bl)(:)(.*)?$/i,

  section:
    /^([ \t]*)(#+)($|[ ]+)([*]?)([\w\d]*)([ ]*)([(][^\n\r]*(?:$|[)]))?([ ]*)$/,
  scene:
    /^([ \t]*)([.][^\n\r. ]+|[.][^\n\r. ]+[ ]+[-]|CLOSEUP[.]|CLOSEUP[ ]+[-]|INT[.]|EXT[.]|EST[.]|INT[.]?\/EXT[.]|I[.]?\/E[.]|I[.]|E[.])($|[ ]+)($|[^\n\r-]+)($|[ ]+)($|[-])($|[ ]+)($|[^\n\r#]+)($|[ ]+)($|[#])($|[^\n\r#]+)($|[#])?/,

  transition: /^([ \t]*)((?:^|.*[ ]+)(?:TO:|TO BLACK:|FADE OUT:|FADE IN:)$)/,

  character:
    /^([ \t]*)(?![#!?]|(?:\[\[)|(?:SUPERIMPOSE:))((?:(?!@)[^\p{Ll}\r\n]*?\p{Lu}[^\p{Ll}\r\n]*?)|(?:@[^\r\n]*?))([ \t]*)(\(.*\))?([ \t]*)(\^)?$/u,
  parenthetical: /^[ \t]*(\(.+\))$/,
  dialogue: /^([ \t]*)(?!!)([^\r\n]+)$/,
  action: /^([ \t]*)(.+)$/,

  page_break: /^([ \t]*)([=]{3,})([^\n\r=]*)$/,
  line_break: /^ {2}$/,

  centered: /^([ \t]*)([>])([ ]*)(.+)([ ]*)([<])([ ]*)$/,

  lyric: /^([ \t]*)(~)(.+)$/,

  list: /^([ \t]*)([*+-])($|[ ]+)(.*)$/,
  assign:
    /^([ \t]*)([*])($|[ ]+)([\w]+[\w\d]*)([ ]*)(?:$|([/*+-]?(?:$|[=]))([ ]*)($|[^\n\r]+)([ ]*))?$/,
  condition: /^([ \t]*)([*])($|[ ]+)($|[^\n\r]+)([ ]*)([:])([ ]*)$/,
  call: /^([ \t]*)([*])($|[ ]+)([\w\d]*)([ ]*)([(][^\n\r]*(?:$|[)]))?([ ]*)$/,
  choice:
    /^([ \t]*)([-][ ]+[~]|[+][ ]+[~]|[-+])($|[ ]+)(?:([^\n\r>]+))?([ ]*)($|[>])([ ]*)(!END|[.\w\d]*)([ ]*)$/,
  go: /^([ \t]*)([>])([ ]*)(!END|[.\w\d]*)([ ]*)([(][^\n\r]*(?:$|[)]))?([ ]*)(?!<)([ ]*)$/,
  repeat: /^([ \t]*)([^])([ ]*)$/,
  return: /^([ \t]*)([<])([ ]*)([\w\d]*)([ ]*)$/,

  variable:
    /^([ \t]*)(var)($|[ ]+)($|[\w]+[\w\d]*)([ ]*)(?:($|[=])($|[ ]*)($|[\w]+[\w\d]*|[\d]+|[\d]*[.][\d]*|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'))?$/,
  asset:
    /^([ \t]*)(image|audio|video|text)($|[ ]+)($|[\w]+[\w\d]*)([ ]*)(?:($|[=])($|[ ]*)($|[\w]+[\w\d]*|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'))?$/,
  tag: /^([ \t]*)(tag)($|[ ]+)($|[\w]+[\w\d]*)([ ]*)(?:($|[=])($|[ ]*)($|[\w]+[\w\d]*|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'))?$/,
  entity:
    /^([ \t]*)(element|object)($|[ ]+)($|[\w]+[\w\d]*)([ ]*)(?:([(])([ ]*)($|[\w]+[\w\d]*)([ ]*)($|[)]))?([ ]*)($|[:])$/,

  synopses: /^([ \t]*)(?![=]{3,})([=])([ ]*)(.*)([ ]*)$/,

  note: /(?:\[{2}(?!\[+))([\s\S]+?)(?:\]{2}(?!\[+))|(?:\({2}(?!\(+))([\s\S]+?)(?:\){2}(?!\(+))/g,

  string: /^(`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*')$/g,
  separator: /([ ]*[,][ ]*)/g,
  parameter_declaration:
    /^([\w]+[\w\d]*)(?:([ ]*)([=])([ ]*)((?:[\w]+[\w\d]|[\d]+|[\d]*[.][\d]*|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*')))?$/,
  argument_value:
    /^([\w]+[\w\d]|[\d]+|[\d]*[.][\d]*|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*')$/,

  emphasis: /(_|\*{1,3}|_\*{1,3}|\*{1,3}_)(.+)(_|\*{1,3}|_\*{1,3}|\*{1,3}_)/g,
  bold_italic_underline:
    /(_{1}\*{3}(?=.+\*{3}_{1})|\*{3}_{1}(?=.+_{1}\*{3}))(.+?)(\*{3}_{1}|_{1}\*{3})/g,
  bold_underline:
    /(_{1}\*{2}(?=.+\*{2}_{1})|\*{2}_{1}(?=.+_{1}\*{2}))(.+?)(\*{2}_{1}|_{1}\*{2})/g,
  italic_underline:
    /(?:_{1}\*{1}(?=.+\*{1}_{1})|\*{1}_{1}(?=.+_{1}\*{1}))(.+?)(\*{1}_{1}|_{1}\*{1})/g,
  bold_italic: /(\*{3}(?=.+\*{3}))(.+?)(\*{3})/g,
  bold: /(\*{2}(?=.+\*{2}))(.+?)(\*{2})/g,
  italic: /(\*{1}(?=.+\*{1}))(.+?)(\*{1})/g,
  underline: /(_{1}(?=.+_{1}))(.+?)(_{1})/g,

  link: /(\[?(\[)([^\][]*\[?[^\][]*\]?[^\][]*)(\])(\()(.+?)(?:\s+(["'])(.*?)\4)?(\)))/g,
};
