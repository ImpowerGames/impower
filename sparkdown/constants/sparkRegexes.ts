export type SparkRegexType =
  | "title_page"
  | "section"
  | "scene"
  | "transition"
  | "character"
  | "parenthetical"
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
  | "asset"
  | "tag"
  | "entity"
  | "synopsis"
  | "note"
  | "string"
  | "string_template"
  | "boolean"
  | "number"
  | "variableAccess"
  | "entity_object_field"
  | "entity_value_field"
  | "entity_list_value"
  | "interpolation_splitter"
  | "interpolation_token"
  | "parameter_declaration"
  | "parameter_declaration_lint"
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
    /^([ \t]*)((?:^|.*[ ]+)(?:TO:|TO BLACK:|FADE OUT:|FADE IN:))([ ]*)$/,
  centered: /^([ \t]*)([>])([ ]*)(.+[^\s])([ ]*)([<])([ ]*)$/,
  lyric: /^([ \t]*)(~)(.+)([ ]*)$/,
  section:
    /^([ \t]*)(#+)($|[ ]+)($|[a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)($|[^\n\r:]+)?([:])?([ ]*)($|[a-zA-Z]+[a-zA-Z0-9_]*)?([ ]*)$/,
  scene:
    /^([ \t]*)([.](?![. ])|INT[.][ ]+|EXT[.][ ]+|INT[.]?\/EXT[.][ ]+)($|(?:[^\n\r-]|[^ \t\n\r][-])*[^ \t\n\r])($|[ ]+)($|[-])($|[ ]+)($|[^\n\r#]*[^ \t\n\r])($|[ ]+)($|[#])($|[^\n\r#]+)($|[#])?([ ]*)$/,
  title_page:
    /^([ \t]*)(title|credit|author[s]?|source|notes|draft date|date|watermark|contact(?: info)?|revision|copyright|font|tl|tc|tr|cc|br|bl)(:)(.*)?$/i,

  character:
    /^([ \t]*)(?![#!?]|(?:\[\[)|(?:SUPERIMPOSE:))((?:(?!@)[^\p{Ll}\r\n]*?\p{Lu}[^\p{Ll}\r\n]*?)|(?:@[^\r\n]*?))([ \t]*)(\(.*\))?([ \t]*)(\^)?([ ]*)$/u,
  parenthetical: /^([ \t]*)([(])(.+)([)])([ ]*)$/,
  dialogue: /^([ \t]*)(?!!)([^\r\n]+)$/,
  action: /^([ \t]*)(.+)$/,

  list: /^([ \t]*)([*+-])($|[ ]+)(.*)([ ]*)$/,
  condition:
    /^([ \t]*)([*])($|[ ]+)($|if|elif|else)(?:($|[ ]+)($|(?:[ ]+|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[^\n\r:])+))?([ ]*)([:])([ ]*)$/,
  call: /^([ \t]*)([*])($|[ ]+)($|[a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)([(][^\n\r]*(?:$|[)]))?([ ]*)$/,
  assign:
    /^([ \t]*)([*])($|[ ]+)($|[a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)(?:$|([/*+-]?(?:$|[=]))([ ]*)($|[^\n\r]+)([ ]*))?$/,
  choice:
    /^([ \t]*)([-+])($|[ ]+)(?:([^\n\r>]+))?([ ]*)(?:([>])([ ]*)([^\n\r<]+)?([ ]*))?(?!<[ ]*)$/,

  jump: /^([ \t]*)([>])([ ]*)([^\n\r<]+)?([ ]*)(?!<[ ]*)$/,
  repeat: /^([ \t]*)([\^])([ ]*)$/,
  return: /^([ \t]*)([<])([ ]*)([^\n\r]*)([ ]*)$/,

  import: /^([ \t]*)(import)($|[ ]+)($|[^\n\r]+)([ ]*)$/,
  variable:
    /^([ \t]*)(var|temp)($|[ ]+)($|[a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)(?:$|([/*+-]?(?:$|[=]))([ ]*)($|[^\n\r]+)([ ]*))?$/,
  asset:
    /^([ \t]*)(image|audio|video|text)($|[ ]+)($|[a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)(?:($|[=])($|[ ]*)($|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[a-zA-Z]+[a-zA-Z0-9_]*))?([ ]*)$/,
  tag: /^([ \t]*)(tag)($|[ ]+)($|[a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)(?:($|[=])($|[ ]*)($|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[a-zA-Z]+[a-zA-Z0-9_]*))?([ ]*)$/,
  entity:
    /^([ \t]*)(list|map|ui|style|config)($|[ ]+)($|[a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)(?:([(])([ ]*)($|[a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)($|[)]))?([ ]*)([:]?)([ ]*)$/,

  content_continuation: /^([&])?(.+[^\s])([ ]+)?$/,
  dialogue_terminator: /^([\t ]*)([<>^*+-])($|[ ]+[^\n\r]*)$/,

  string: /^(`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*')$/,
  string_template: /^(`[^\n\r`]*`)$/,
  boolean: /^(true|false)$/,
  number: /^([\d]*[.][\d]*|[\d]+)$/,
  variableAccess:
    /^(?!true$|false$)([a-zA-Z]+[a-zA-Z0-9_]*)((?:[.](?:$|[a-zA-Z]+[a-zA-Z0-9_]*))*)$/,
  entity_object_field: /^([ \t]*)([a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)([:])([ ]*)$/,
  entity_value_field:
    /^([ \t]*)($|[a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)(?:$|($|[=])([ ]*)($|[^\n\r]+)([ ]*))?$/,
  entity_list_value: /^([ \t]*)($|[^\n\r]+)([ ]*)$/,
  interpolation_splitter: /([$]?[{][ ]*[^\n\r{}]*[ ]*[}])/g,
  interpolation_token: /^([$]?[{])([ ]*)([^\n\r{}]*)([ ]*)([}])$/,
  parameter_declaration:
    /^([ ]*)([a-zA-Z]+[a-zA-Z0-9_]*)(?:([ ]*)($|[=])([ ]*)($|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[\d]*[.][\d]+|[\d]+|true|false|[a-zA-Z]+[a-zA-Z0-9_]*))?([ ]*)$/,
  parameter_declaration_lint:
    /^([ ]*)([a-zA-Z]+[a-zA-Z0-9_]*)(?:([ ]*)([=])([ ]*)(`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[\d]*[.][\d]+|[\d]+|true|false|[a-zA-Z]+[a-zA-Z0-9_]*))?([ ]*)$/,
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