const VALID_FIELD_NAME_REGEX = /^[_a-zA-Z]+[_a-zA-Z0-9]$/;

const isValidFieldName = (str: string) => {
  return VALID_FIELD_NAME_REGEX.test(str);
};

const getType = (obj: any) => {
  const type = typeof obj;
  if (Array.isArray(obj)) {
    return "array";
  } else if (type == "string") {
    return "string";
  } else if (type == "boolean") {
    return "boolean";
  } else if (type == "number") {
    return "number";
  } else if (type == "undefined" || obj === null) {
    return "null";
  } else {
    return "object";
  }
};

const convertArray = (obj: any, lines: string[], indent: string) => {
  if (obj.length === 0) {
    lines.push("[]");
  }
  for (let i = 0; i < obj.length; i++) {
    const val = obj[i];
    const recurse: string[] = [];
    convert(val, recurse, indent);
    for (let j = 0; j < recurse.length; j++) {
      lines.push((j == 0 ? "- " : indent) + recurse[j]);
    }
  }
};

const convertObject = (obj: any, lines: string[], indent: string) => {
  for (let k in obj) {
    const recurse: string[] = [];
    if (obj.hasOwnProperty(k)) {
      const val = obj[k];
      convert(val, recurse, indent);
      const type = getType(val);
      const fieldName = isValidFieldName(k) ? k : wrapString(k);
      if (
        type == "string" ||
        type == "null" ||
        type == "number" ||
        type == "boolean"
      ) {
        lines.push(fieldName + ": " + recurse[0]);
      } else {
        lines.push(fieldName + ": ");
        for (let i = 0; i < recurse.length; i++) {
          lines.push(indent + recurse[i]);
        }
      }
    }
  }
};

const wrapString = (str: string) => {
  return (
    '"' +
    encodeURI(str)
      .replace(/%u/g, "\\u")
      .replace(/%U/g, "\\U")
      .replace(/%/g, "\\x") +
    '"'
  );
};

const convertString = (obj: any, ret: string[]) => {
  ret.push(wrapString(obj));
};

const convert = (obj: any, lines: string[], indent: string) => {
  const type = getType(obj);

  switch (type) {
    case "array":
      convertArray(obj, lines, indent);
      break;
    case "object":
      convertObject(obj, lines, indent);
      break;
    case "string":
      convertString(obj, lines);
      break;
    case "null":
      lines.push("null");
      break;
    case "number":
      lines.push(obj.toString());
      break;
    case "boolean":
      lines.push(obj ? "true" : "false");
      break;
  }
};

export const yamlStringify = (
  obj: any,
  lineSeparator = "\n",
  indent = "  "
): string => {
  const lines: string[] = [];
  convert(obj, lines, indent);
  return lines.join(lineSeparator);
};
