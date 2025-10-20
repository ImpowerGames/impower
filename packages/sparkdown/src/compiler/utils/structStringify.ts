const VALID_FIELD_NAME_REGEX = /^[_\p{L}][_\p{L}0-9]*$/u;

const SCALAR_ASSIGN_OPERATOR = " = ";

const OBJECT_ASSIGN_OPERATOR = ": ";

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

const convertArray = (
  obj: any,
  lines: string[],
  indent: string,
  scalarAssignOperator: string,
  objectAssignOperator: string
) => {
  if (obj.length === 0) {
    lines.push("- ");
  }
  for (let i = 0; i < obj.length; i++) {
    const val = obj[i];
    const recurse: string[] = [];
    convert(val, recurse, indent, scalarAssignOperator, objectAssignOperator);
    for (let j = 0; j < recurse.length; j++) {
      lines.push((j == 0 ? "- " : indent) + recurse[j]);
    }
  }
};

const convertObject = (
  obj: any,
  lines: string[],
  indent: string,
  scalarAssignOperator: string,
  objectAssignOperator: string
) => {
  for (let k in obj) {
    const recurse: string[] = [];
    if (obj.hasOwnProperty(k)) {
      const val = obj[k];
      convert(val, recurse, indent, scalarAssignOperator, objectAssignOperator);
      const type = getType(val);
      const fieldName = isValidFieldName(k) ? k : wrapString(k);
      if (
        type == "string" ||
        type == "null" ||
        type == "number" ||
        type == "boolean"
      ) {
        lines.push(fieldName + scalarAssignOperator + recurse[0]);
      } else {
        lines.push(fieldName + objectAssignOperator);
        for (let i = 0; i < recurse.length; i++) {
          lines.push(indent + recurse[i]);
        }
      }
    }
  }
};

const wrapString = (str: string) => {
  const quote = str.includes('"') ? "`" : '"';
  return `${quote}${str}${quote}`;
};

const convertString = (obj: any, ret: string[]) => {
  ret.push(wrapString(obj));
};

const convert = (
  obj: any,
  lines: string[],
  indent: string,
  scalarAssignOperator: string,
  objectAssignOperator: string
) => {
  const type = getType(obj);

  switch (type) {
    case "array":
      convertArray(
        obj,
        lines,
        indent,
        scalarAssignOperator,
        objectAssignOperator
      );
      break;
    case "object":
      convertObject(
        obj,
        lines,
        indent,
        scalarAssignOperator,
        objectAssignOperator
      );
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

export const structStringify = (
  obj: any,
  lineSeparator = "\n",
  indent = "  ",
  scalarAssignOperator = SCALAR_ASSIGN_OPERATOR,
  objectAssignOperator = OBJECT_ASSIGN_OPERATOR
): string => {
  const lines: string[] = [];
  convert(obj, lines, indent, scalarAssignOperator, objectAssignOperator);
  return lines.join(lineSeparator);
};
