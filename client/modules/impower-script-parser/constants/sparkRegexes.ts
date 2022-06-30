export const sparkRegexes = {
  title_page:
    /^([ \t]*)(title|credit|author[s]?|source|notes|draft date|date|watermark|contact(?: info)?|revision|copyright|font|tl|tc|tr|cc|br|bl)(:)(.*)?$/i,

  section:
    /^([ \t]*)(#+)($|[ ]+)(?:$|([\w]+)([ ]+)(?!$))?($|[a-zA-Z]*[\w]*)([ ]*)([([][^\n\r]*(?:$|[\])]))?([ ]*)$/,
  scene:
    /^([ \t]*)([.](?![. ])|CLOSEUP[.][ ]+|CLOSEUP[ ]+[-][ ]+|INT[.][ ]+|EXT[.][ ]+|EST[.][ ]+|INT[.]?\/EXT[.][ ]+|I[.]?\/E[.][ ]+|I[.][ ]+|E[.][ ]+)($|(?:[^\n\r-]|[^\s][-])*[^\s])($|[ ]+)($|[-])($|[ ]+)($|[^\n\r#]*[^\s])($|[ ]+)($|[#])($|[^\n\r#]+)($|[#])?([ ]*)$/,

  transition:
    /^([ \t]*)((?:^|.*[ ]+)(?:TO:|TO BLACK:|FADE OUT:|FADE IN:))([ ]*)$/,

  character:
    /^([ \t]*)(?![#!?]|(?:\[\[)|(?:SUPERIMPOSE:))((?:(?!@)[^\p{Ll}\r\n]*?\p{Lu}[^\p{Ll}\r\n]*?)|(?:@[^\r\n]*?))([ \t]*)(\(.*\))?([ \t]*)(\^)?([ ]*)$/u,
  parenthetical: /^([ \t]*)([(])(.+)([)])([ ]*)$/,
  dialogue: /^([ \t]*)(?!!)([^\r\n]+)$/,
  action: /^([ \t]*)(.+)$/,

  page_break: /^([ \t]*)([=]{3,})([^\n\r=]*)([ ]*)$/,
  line_break: /^ {2}$/,

  centered: /^([ \t]*)([>])([ ]*)(.+[^\s])([ ]*)([<])([ ]*)$/,
  content_continuation: /^([&])?(.+[^\s])([ ]+)?$/,

  lyric: /^([ \t]*)(~)(.+)([ ]*)$/,

  list: /^([ \t]*)([*+-])($|[ ]+)(.*)([ ]*)$/,
  call: /^([ \t]*)([*])($|[ ]+)($|[a-zA-Z]+[\w]*)([ ]*)([(][^\n\r]*(?:$|[)]))?([ ]*)$/,
  condition:
    /^([ \t]*)([*])($|[ ]+)($|if|elif|else)(?:($|[ ]+)($|(?:[ ]+|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[^\n\r:])+))?([ ]*)([:])([ ]*)$/,
  assign:
    /^([ \t]*)([*])($|[ ]+)($|[a-zA-Z]+[\w]*)([ ]*)(?:$|([/*+-]?(?:$|[=]))([ ]*)($|[^\n\r]+)([ ]*))?$/,
  choice:
    /^([ \t]*)([-+])($|[ ]+)(?:([^\n\r>]+))?([ ]*)(?:([>])([ ]*)([^\n\r<]+)?([ ]*))?(?!<[ ]*)$/,
  go: /^([ \t]*)([>])([ ]*)([^\n\r<]+)?([ ]*)(?!<[ ]*)$/,
  repeat: /^([ \t]*)(\^)([ ]*)$/,
  return: /^([ \t]*)([<])([ ]*)([^\n\r]*)([ ]*)$/,
  dialogue_terminator: /^([\t ]*)([<>^*+-])($|[ ]+[^\n\r]*)$/,

  variable:
    /^([ \t]*)(var|temp)($|[ ]+)($|[a-zA-Z]+[\w]*)([ ]*)(?:$|([/*+-]?(?:$|[=]))([ ]*)($|[^\n\r]+)([ ]*))?$/,
  asset:
    /^([ \t]*)(image|audio|video|text)($|[ ]+)($|[a-zA-Z]+[\w]*)([ ]*)(?:($|[=])($|[ ]*)($|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[a-zA-Z]+[\w]*))?([ ]*)$/,
  tag: /^([ \t]*)(tag)($|[ ]+)($|[a-zA-Z]+[\w]*)([ ]*)(?:($|[=])($|[ ]*)($|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[a-zA-Z]+[\w]*))?([ ]*)$/,
  entity:
    /^([ \t]*)(list|map|struct|config)($|[ ]+)($|[a-zA-Z]+[\w]*)([ ]*)(?:([(])([ ]*)($|[a-zA-Z]+[\w]*)([ ]*)($|[)]))?([ ]*)([:]?)([ ]*)$/,

  synopses: /^([ \t]*)(?![=]{3,})([=])([ ]*)(.*)([ ]*)$/,

  note: /(?:\[{2}(?!\[+))([\s\S]*)(?:\]{2}(?!\[+))|(?:\({2}(?!\(+))([\s\S]*)(?:\){2}(?!\(+))/g,

  string: /^(`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*')$/,
  string_template: /^(`[^\n\r`]*`)$/,
  boolean: /^(true|false)$/,
  number: /^([\d]*[.][\d]*|[\d]+)$/,
  variableAccess:
    /^(?!true$|false$)([a-zA-Z]+[\w]*)((?:[.](?:$|[a-zA-Z]+[\w]*))*)$/,
  entity_object_field: /^([ \t]*)([a-zA-Z]+[\w]*)([ ]*)([:])([ ]*)$/,
  entity_value_field:
    /^([ \t]*)($|[a-zA-Z]+[\w]*)([ ]*)(?:$|($|[=])([ ]*)($|[^\n\r]+)([ ]*))?$/,
  entity_list_value: /^([ \t]*)($|[^\n\r]+)([ ]*)$/,
  interpolation_splitter: /([$]?[{][ ]*[^\n\r{}]*[ ]*[}])/g,
  interpolation_token: /^([$]?[{])([ ]*)([^\n\r{}]*)([ ]*)([}])$/,
  parameter_declaration:
    /^([ ]*)([a-zA-Z]+[\w]*)(?:([ ]*)($|[=])([ ]*)($|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[\d]*[.][\d]+|[\d]+|true|false|[a-zA-Z]+[\w]*))?([ ]*)$/,
  parameter_declaration_lint:
    /^([ ]*)([a-zA-Z]+[\w]*)(?:([ ]*)([=])([ ]*)(`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[\d]*[.][\d]+|[\d]+|true|false|[a-zA-Z]+[\w]*))?([ ]*)$/,
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
