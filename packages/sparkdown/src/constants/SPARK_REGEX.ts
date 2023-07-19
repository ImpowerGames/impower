export const SPARK_BLOCK_REGEX = {
  front_matter: /^([ \t]*)([-]{3,})([ \t]*)($|[/][/][ \t]+.*)/,
  struct:
    /^([ \t]*)(@)($|[ ]+)($|[_a-zA-Z]+[_a-zA-Z0-9]*)($|[ ]+)($|[_a-zA-Z]+[_a-zA-Z0-9]*)([ ]*)(?:([(])([ ]*)($|[_a-zA-Z]+[_a-zA-Z0-9]*)([ ]*)($|[)]))?([ ]*)([:]?)([ \t]*)($|[/][/][ \t]+.*)/,
  variable:
    /^([ \t]*)([@])([ ]+)($|[_a-zA-Z]+[_a-zA-Z0-9]*(?:\[\])*)($|[ ]+)($|[_a-zA-Z]+[_a-zA-Z0-9]*)($|[ ]*)($|[=])([ ]*)($|.+)/,
  image: /^([ \t]*)(\[{2})([^\]]*)(\]{2})([ ]*)($|[/][/][ \t]+.*)/,
  audio: /^([ \t]*)([(]{2})([^)]*)([)]{2})([ ]*)($|[/][/][ \t]+.*)/,
  page_break: /^([ \t]*)(===+)([ \t]*)($|[/][/][ \t]+.*)/,
  centered:
    /^([ \t]*)([|])([\s]+)?((?:(?![\s]+[|]).)*)([\s]*)([|])([\s]*)($|[/][/][ \t]+.*)/,
  centered_angle:
    /^([ \t]*)([>])([\s]+)?((?:(?![\s]+[<]).)*)([\s]*)([<])([\s]*)($|[/][/][ \t]+.*)/,
  load: /^([ \t]*)([>][>])([ ]*)([^\n\r ]+|[{].+[}])?([ ]*)($|[/][/][ \t]+.*)/,
  jump: /^([ \t]*)([>])([ ]*)([^\n\r ]+|[{].+[}])?([ ]*)($|[/][/][ \t]+.*)/,
  import: /^([ \t]*)([*])([ ]+)(import)($|[ ]+)($|["'].*)$/,
  condition:
    /^([ \t]*)([*])($|[ ]+)($|if|elseif|else)(?:($|[ ]+)($|(?:[ ]+|`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*'|[^\n\r:])+))?([ ]*)($|[:])([ ]*)($|[/][/][ \t]+.*)/,
  logic: /^([ \t]*)([*])($|[ ]+)($|.+)/,
  choice:
    /^([ \t]*)([+-])($|[ ]+)(?:([^\n\r>]+))?([ ]*)(?:([>])([ ]*)((?:(?![/][/][ ]+).)*)?)?($|[/][/][ \t]+.*)/,
  repeat: /^([ \t]*)([\^])([ \t]*)($|[/][/][ \t]+.*)/,
  return: /^([ \t]*)([<])([ ]*)(.*)/,
  label: /^([ \t]*)([=])($|[ ]+)((?:(?![/][/][ ]+).)*)($|[/][/][ \t]+.*)/,
  section:
    /^([ \t]*)(#+)($|[ ]+)($|[a-zA-Z]+[a-zA-Z0-9_]*)([ ]*)($|[^\n\r:]+)?([:])?([ ]*)($|[a-zA-Z]+[a-zA-Z0-9_]*)?([ \t]*)($|[/][/][ \t]+.*)/,
  scene:
    /^([ \t]*)([.](?![. ])|INT[.](?:$|[ ]+)|EXT[.](?:$|[ ]+)|INT[.]?[/]EXT[.](?:$|[ ]+))($|(?:(?![ ][-]).)*)($|[ ]+)($|[-])($|[ ]+)($|(?:(?![/][/][ ]+).)*)($|[/][/][ \t]+.*)/,
  transition:
    /^([ \t]*)((?:[^ \p{Ll}]+\b[ ]+){0,2}(?:TO[:]|TO BLACK[:.]|FADE OUT[:.]|FADE IN[:.]))([ ]*)($|[/][/][ \t]+.*)$/,
  dialogue:
    /^([ \t]*)(?![!#]|\[\[)([^\p{Ll}\r\n*_]*?\p{Lu}[^\p{Ll}\r\n]*?)(\(.*\))?(\s*)(\^)?(\s*)($|[/][/][ \t]+.*)/,
} as const;

export type SparkBlockType = keyof typeof SPARK_BLOCK_REGEX;

export const SPARK_REGEX = {
  ...SPARK_BLOCK_REGEX,

  front_matter_entry:
    /^([ \t]*)([^\n\r:]+)([ ]*)([:])([^\n\r]*)($|[/][/][ \t]+.*)/,

  comment: /([/][/][ \t]+)(.*)$/gm,

  dialogue_character:
    /^([ \t]*)([\p{Lu}][^\p{Ll}^()]+[\p{Lu}])([ \t]*)([(][^)]*(?:$|[)]))?([ \t]*)(\^)?([ ]*)$/u,
  dialogue_parenthetical: /^([ \t]*)([(])(.+)([)])([ ]*)$/,

  call: /^([ \t]*)([*])([ ]+)([_a-zA-Z]+[_a-zA-Z0-9]*)([ ]*)[(][^\n\r]*(?:$|[)])([ ]*)$/,

  assign_variable:
    /^([ \t]*)([*])($|[ ]+)($|[_a-zA-Z]+[_a-zA-Z0-9]*)([ ]*)(?:$|([/*+-]?(?:$|[=]))([ ]*)($|[^\n\r]+)([ ]*))?$/,

  note_inline:
    /(?:\[{2}(?!\[+))([\s\S]*)(?:\]{2}(?!\[+))|(?:\({2}(?!\(+))([\s\S]*)(?:\){2}(?!\(+))/g,

  line_break: /^[ \t]{2,}$/,

  lyric: /^([ \t]*)(~)(.+)([ ]*)$/,

  content_continuation: /^([&])?(.+[^\s])([ ]+)?$/,
  dialogue_terminator: /^([\t ]*)([<>^*+-])($|[ ]+[^\n\r]*)$/,

  hex_color: /^(#)((?:[0-9a-fA-F]{2}){2,4})$/,
  rgb_color:
    /^(rgb)([(][\d]+[\s]+[\d]+[\s]+[\d]+(?:[\s]*[/][\s]*[\d.]+[%]?)?[)])$/,
  hsl_color:
    /^(hsl)([(][\d]+[\s]+[\d]+[%]?[\s]+[\d]+[%]?(?:[\s]*[/][\s]*[\d.]+[%]?)?[)])$/,

  array_begin: /(\[)/g,
  array_end: /(\])/g,

  string: /^(`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*')$/,
  string_template: /^(`[^\n\r`]*`)$/,
  string_template_begin: /([`])/,
  boolean: /^(true|false)$/,
  number: /^([\d]*[.][\d]*|[\d]+)$/,
  variableAccess:
    /^(?!true$|false$)([_a-zA-Z]+[_a-zA-Z0-9]*)((?:[.](?:$|[_a-zA-Z]+[_a-zA-Z0-9]*))*)$/,
  struct_field:
    /^([ \t]*)(?:([-])($|[ ]+))?(?:($|[_a-zA-Z]+[_a-zA-Z0-9]*|"[^\n\r]+"|'[^\n\r]+')([ ]*)($|[:=]))?([ ]*)([^\n\r]+)?([ ]*)$/,
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

  comment_block: /(\/\*){1}|(\*\/){1}|([^/*]+)/g,
  comment_mark: /([/][/][ ]+[ ]?)/g,
  indent: /^([ \t]*)/,

  link: /(\[?(\[)([^\][]*\[?[^\][]*\]?[^\][]*)(\])(\()(.+?)(?:\s+(["'])(.*?)\4)?(\)))/g,
} as const;

export type SparkRegexType = keyof typeof SPARK_REGEX;
