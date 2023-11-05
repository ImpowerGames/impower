const SPARK_PRIMITIVE_TYPE_REGEX = {
  string: /([`"'])((?:(?=\\?)\2.)*?)(\1)/,
  boolean: /(true|false)/,
  number: /([\d]*[.][\d]*|[\d]+)/,
  variableAccess:
    /^(?!true$|false$)([_a-zA-Z]+[_a-zA-Z0-9]*)((?:[.](?:$|[_a-zA-Z]+[_a-zA-Z0-9]*))*)$/,
  hex_color: /^(#)((?:[0-9a-fA-F]{2}){2,4})$/,
  rgb_color:
    /^(rgb)([(][\d]+[\s]+[\d]+[\s]+[\d]+(?:[\s]*[/][\s]*[\d.]+[%]?)?[)])$/,
  hsl_color:
    /^(hsl)([(][\d]+[\s]+[\d]+[%]?[\s]+[\d]+[%]?(?:[\s]*[/][\s]*[\d.]+[%]?)?[)])$/,
} as const;

export default SPARK_PRIMITIVE_TYPE_REGEX;
