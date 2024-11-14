export const PRIMITIVE_TYPE_REGEX = {
  string: /([`"'])((?:(?=\\?)\2.)*?)(\1)/,
  boolean: /(true|false)/,
  number: /([\d]*[.][\d]*|[\d]+)/,
  variableAccess:
    /^(?!true$|false$)([_\p{L}][_\p{L}0-9]*)((?:[.](?:$|[_\p{L}][_\p{L}0-9]*))*)$/u,
} as const;
