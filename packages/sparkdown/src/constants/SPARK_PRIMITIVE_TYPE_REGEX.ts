const SPARK_PRIMITIVE_TYPE_REGEX = {
  string: /([`"'])(?:(?=(\\?))\2.)*?(\1)/,
  boolean: /(true|false)/,
  number: /([\d]*[.][\d]*|[\d]+)/,
  variableAccess:
    /^(?!true$|false$)([_a-zA-Z]+[_a-zA-Z0-9]*)((?:[.](?:$|[_a-zA-Z]+[_a-zA-Z0-9]*))*)$/,
} as const;

export default SPARK_PRIMITIVE_TYPE_REGEX;
