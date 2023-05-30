export type SparkRegexType =
  | "title_page"
  | "section"
  | "scene"
  | "transition"
  | "dialogue_character"
  | "dialogue_parenthetical"
  | "dialogue"
  | "action"
  | "page_break"
  | "line_break"
  | "centered"
  | "content_continuation"
  | "lyric"
  | "import"
  | "list"
  | "call"
  | "condition"
  | "assign"
  | "choice"
  | "jump"
  | "repeat"
  | "return"
  | "dialogue_terminator"
  | "variable"
  | "struct"
  | "synopsis"
  | "note"
  | "string"
  | "string_template"
  | "boolean"
  | "number"
  | "variableAccess"
  | "struct_field"
  | "interpolation_splitter"
  | "interpolation_token"
  | "parameter_declaration"
  | "expression_list"
  | "emphasis"
  | "bold_italic_underline"
  | "bold_underline"
  | "italic_underline"
  | "bold_italic"
  | "bold"
  | "italic"
  | "underline"
  | "comment_inline"
  | "comment_block"
  | "comment_mark"
  | "indent"
  | "link";

interface SparkRegexes extends Record<SparkRegexType, RegExp> {}

export const sparkRegexes: SparkRegexes = {
  note: /(?:\[{2}(?!\[+))([\s\S]*)(?:\]{2}(?!\[+))|(?:\({2}(?!\(+))([\s\S]*)(?:\){2}(?!\(+))/g,
  synopsis: /^([ \t]*)(?![=]{3,})([=])([ ]*)(.*)([ ]*)$/,
  line_break: /^ {2}$/,
  page_break: /^([ \t]*)([=]{3,})([^\n\r=]*)([ ]*)$/,
  transition:
    /^([ \t]*)([>][ ]+[^ ]*[ ][^ ][^a-z]*|(?:^|[^a-z]*[ ]+)(?:TO:|TO BLACK:|FADE OUT:|FADE IN:|TO[ ]+.*[.]))([ ]*)$/,
  centered: /^([ \t]*)([>])([ ]*)(.+[^\s])([ ]*)([<])([ ]*)$/,
  lyric: /^([ \t]*)(~)(.+)([ ]*)$/,
  section:
    /^([ \t]*)(#+)($|[ ]+)($|[_a-zA-Z]+[_a-zA-Z0-9]*)([ ]*)($|[^\n\r:]+)?([:])?([ ]*)($|[_a-zA-Z]+[_a-zA-Z0-9]*)?([ ]*)$/,
  scene:
    /^([ \t]*)([.](?![. ])|INT[.][ ]+|EXT[.][ ]+|INT[.]?\/EXT[.][_a-zA-Z]+[_a-zA-Z0-9][ ]+)($|(?:[^\n\r-]|[^ \t\n\r][-])*[^ \t\n\r])($|[ ]+)($|[-])($|[ ]+)($|[^\n\r#]*[^ \t\n\r])($|[ ]+)($|[#])($|[^\n\r#]+)($|[#])?([ ]*)$/,
  title_page:
    /^([ \t]*)(title|credit|author[s]?|source|notes|draft date|date|watermark|contact(?: info)?|revision|copyright|font|tl|tc|tr|cc|br|bl)(:)(.*)?$/i,

  dialogue_character:
    /^([ \t]*)(?![#!?]|\[\[)([^\p{Ll}\r\n]*?\p{Lu}[^\p{Ll}\r\n]*?)([ \t]*)(\(.*\))?([ \t]*)(\^)?([ ]*)$/u,
  dialogue_parenthetical: /^([ \t]*)([(])(.+)([)])([ ]*)$/,
  dialogue: /^([ \t]*)(?!!)([^\r\n]+)$/,
  action: /^([ \t]*)(.+)$/,

  import: /^([ \t]*)(import)($|[ ]+)($|[^\n\r]+)([ ]*)$/,
  struct:
    /^([ \t]*)(@)($|[ ]+)($|[a-z]+)($|[ ]+)($|[_a-zA-Z]+[_a-zA-Z0-9]*)([ ]*)(?:([(])([ ]*)($|[_a-zA-Z]+[_a-zA-Z0-9]*)([ ]*)($|[)]))?([ ]*)([:]?)([ ]*)$/,

  list: /^([ \t]*)([*+-])($|[ ]+)(.*)([ ]*)$/,
  choice:
    /^([ \t]*)([+])($|[ ]+)(?:([^\n\r>]+))?([ ]*)(?:([>])([ ]*)([^\n\r<]+)?([ ]*))?(?!<[ ]*)$/,
  condition:
    /^([ \t]*)([*])([ ]+)(if|elif|else)(?:($|[ ]+)($|(?:[ ]+|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[^\n\r:])+))?([ ]*)($|[:])([ ]*)$/,
  variable:
    /^([ \t]*)([*])([ ]+)(var)($|[ ]+)($|[_a-zA-Z]+[_a-zA-Z0-9]*)($|[ ]*)(?:($|[:])($|[ ]*)($|[_a-zA-Z]+[_a-zA-Z0-9]*)($|[ ]*))?(?:$|($|[=])([ ]*)($|[^\n\r]+)([ ]*))?$/,
  call: /^([ \t]*)([*])([ ]+)([_a-zA-Z]+[_a-zA-Z0-9]*)([ ]*)[(][^\n\r]*(?:$|[)])([ ]*)$/,
  assign:
    /^([ \t]*)([*])($|[ ]+)($|[_a-zA-Z]+[_a-zA-Z0-9]*)([ ]*)(?:$|([/*+-]?(?:$|[=]))([ ]*)($|[^\n\r]+)([ ]*))?$/,

  jump: /^([ \t]*)([>])([ ]*)([^\n\r<]+)?([ ]*)(?!<[ ]*)$/,
  repeat: /^([ \t]*)([\^])([ ]*)$/,
  return: /^([ \t]*)([<])([ ]*)([^\n\r]*)([ ]*)$/,

  content_continuation: /^([&])?(.+[^\s])([ ]+)?$/,
  dialogue_terminator: /^([\t ]*)([<>^*+-])($|[ ]+[^\n\r]*)$/,

  string: /^(`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*')$/,
  string_template: /^(`[^\n\r`]*`)$/,
  boolean: /^(true|false)$/,
  number: /^([\d]*[.][\d]*|[\d]+)$/,
  variableAccess:
    /^(?!true$|false$)([_a-zA-Z]+[_a-zA-Z0-9]*)((?:[.](?:$|[_a-zA-Z]+[_a-zA-Z0-9]*))*)$/,
  struct_field:
    /^([ \t]*)(?:([-])($|[ ]+))?(?:($|[_a-zA-Z]+[_a-zA-Z0-9]*|"[^\n\r]+"|'[^\n\r]+')([ ]*)($|[:]))?([ ]*)([^\n\r]+)?([ ]*)$/,
  interpolation_splitter: /([{][ ]*[^\n\r{}]*[ ]*[}])/g,
  interpolation_token: /^([{])([ ]*)([^\n\r{}]*)([ ]*)([}])$/,
  parameter_declaration:
    /^([ ]*)($|[_a-zA-Z]+[_a-zA-Z0-9]*)($|[ ]*)(?:($|[:])($|[ ]*)($|[_a-zA-Z]+[_a-zA-Z0-9]*)($|[ ]*))?(?:$|($|[=])([ ]*)($|[^\n\r]+)([ ]*))?$/,
  expression_list: /(`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[^, ]|[\t ]+)|([,])/g,

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

  comment_inline: /([/][/][ ]?.*)$/,
  comment_block: /(\/\*){1}|(\*\/){1}|([^/*]+)/g,
  comment_mark: /([/][/][ ]?)/g,
  indent: /^([ \t]*)/,

  link: /(\[?(\[)([^\][]*\[?[^\][]*\]?[^\][]*)(\])(\()(.+?)(?:\s+(["'])(.*?)\4)?(\)))/g,
};
