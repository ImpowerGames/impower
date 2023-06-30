import {
  continuedIndent,
  delimitedIndent,
  flatIndent,
  TreeIndentContext,
} from "@codemirror/language";

/** 1. Closing */
const PARSE_DELIMITED_INDENT_REGEX = /^delimited\((.+?)\)$/;

/** 1. Except Regex */
const PARSE_CONTINUED_INDENT_REGEX = /^continued(?:\((.+?)\))?$/;

/** 1. Units */
const PARSE_ADD_INDENT_REGEX = /^add\(([+-]?\d+)\)$/;

/** 1. Units */
const PARSE_SET_INDENT_REGEX = /^set\(([+-]?\d+)\)$/;

/** Parses an indent string, returning a `indentNodeProp` compatible function. */
const parseIndent = (
  indent: string
): ((context: TreeIndentContext) => number) => {
  if (indent === "flat") {
    return flatIndent;
  }
  if (indent === "continued") {
    return continuedIndent();
  }

  if (indent.startsWith("delimited")) {
    const match = PARSE_DELIMITED_INDENT_REGEX.exec(indent);
    if (!match) {
      throw new Error("Invalid delimited indent");
    }
    const [, closing] = match;
    return delimitedIndent({ closing: closing! });
  }

  if (indent.startsWith("continued")) {
    const match = PARSE_CONTINUED_INDENT_REGEX.exec(indent);
    if (!match) {
      throw new Error("Invalid continued indent");
    }
    const except = new RegExp(match[1]!);
    if (!except) {
      throw new Error("Invalid continued indent except regex");
    }
    return continuedIndent({ except });
  }

  if (indent.startsWith("add")) {
    const match = PARSE_ADD_INDENT_REGEX.exec(indent);
    if (!match) {
      throw new Error("Invalid add indent");
    }
    const units = parseInt(match[1]!, 10);
    return (cx) => cx.baseIndent + cx.unit * units;
  }

  if (indent.startsWith("set")) {
    const match = PARSE_SET_INDENT_REGEX.exec(indent);
    if (!match) {
      throw new Error("Invalid set indent");
    }
    const units = parseInt(match[1]!, 10);
    return () => units;
  }

  throw new Error(`Unknown indent option: ${indent}`);
};

export default parseIndent;
