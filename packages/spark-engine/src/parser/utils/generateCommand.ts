import type { SparkDisplayToken, SparkToken } from "../../../../sparkdown/src";
import type {
  AssignCommandData,
  CommandData,
  CommandTypeId,
  ConditionCommandData,
  DisplayCommandData,
  DisplayType,
  EnterCommandData,
  ReturnCommandData,
} from "../../data";

const getCommandId = (
  token: SparkToken,
  file: string,
  sectionId: string
): string => {
  return `${file}+${sectionId}.${token.tag}_${token.line}`;
};

const getSource = (token: SparkToken, file: string) => {
  return {
    file,
    line: token.line,
    from: token.from,
    to: token.to,
  };
};

const generateDisplayCommand = (
  token: SparkDisplayToken,
  file: string,
  sectionId: string
): DisplayCommandData => {
  const refId = getCommandId(token as SparkToken, file, sectionId);
  const refTypeId: CommandTypeId = "DisplayCommand";
  return {
    reference: {
      parentId: sectionId,
      type: "Command",
      typeId: refTypeId,
      id: refId,
    },
    source: getSource(token, file),
    indent: token.indent,
    params: {
      type: token.tag as DisplayType,
      position: token.position || "",
      characterName: token.characterName || "",
      characterParenthetical: token.characterParenthetical || "",
      content: token.content || [],
      autoAdvance: token.autoAdvance ?? false,
      clearOnAdvance: token.clearOnAdvance ?? false,
      waitUntilFinished: token.waitUntilFinished ?? false,
    },
  };
};

export const generateCommand = (
  token: SparkToken,
  file: string,
  sectionId: string
): CommandData | null => {
  if (!token) {
    return null;
  }
  if (token.ignore) {
    return null;
  }
  if (
    token.tag === "assign" ||
    token.tag === "struct" ||
    token.tag === "variable"
  ) {
    const refId = getCommandId(token, file, sectionId);
    const refTypeId: CommandTypeId = "AssignCommand";
    const newCommand: AssignCommandData = {
      reference: {
        parentId: sectionId,
        type: "Command",
        id: refId,
        typeId: refTypeId,
      },
      source: getSource(token, file),
      indent: token.indent,
      params: {
        variable: token.name,
        operator: "operator" in token ? token.operator : "=",
        value: token.value,
        waitUntilFinished: true,
      },
    };
    return newCommand;
  }
  if (token.type === "condition") {
    const refId = getCommandId(token, file, sectionId);
    const refTypeId: CommandTypeId = "ConditionCommand";
    const newCommand: ConditionCommandData = {
      reference: {
        parentId: sectionId,
        type: "Command",
        id: refId,
        typeId: refTypeId,
      },
      source: getSource(token, file),
      indent: token.indent,
      params: {
        waitUntilFinished: true,
        value: token.value as string,
        check: (token.check || "") as "if" | "elseif" | "else" | "close",
      },
    };
    return newCommand;
  }
  if (token.type === "call" || token.type === "jump") {
    const refId = getCommandId(token, file, sectionId);
    const refTypeId: CommandTypeId = "EnterCommand";
    const newCommand: EnterCommandData = {
      reference: {
        parentId: sectionId,
        type: "Command",
        id: refId,
        typeId: refTypeId,
      },
      source: getSource(token, file),
      indent: token.indent,
      params: {
        waitUntilFinished: true,
        value: token.value as string,
        returnWhenFinished: token.type === "call",
      },
    };
    return newCommand;
  }
  if (token.type === "return") {
    const refId = getCommandId(token, file, sectionId);
    const refTypeId: CommandTypeId = "ReturnCommand";
    const newCommand: ReturnCommandData = {
      reference: {
        parentId: sectionId,
        type: "Command",
        id: refId,
        typeId: refTypeId,
      },
      source: getSource(token, file),
      indent: token.indent,
      params: {
        waitUntilFinished: true,
        value: token.value as string,
      },
    };
    return newCommand;
  }
  if (token.type === "repeat") {
    const refId = getCommandId(token, file, sectionId);
    const refTypeId: CommandTypeId = "RepeatCommand";
    const newCommand: CommandData = {
      reference: {
        parentId: sectionId,
        type: "Command",
        id: refId,
        typeId: refTypeId,
      },
      source: getSource(token, file),
      indent: token.indent,
      params: {
        waitUntilFinished: true,
      },
    };
    return newCommand;
  }
  if (token.type === "dialogue") {
    return generateDisplayCommand(token, file, sectionId);
  }
  if (token.type === "action") {
    return generateDisplayCommand(token, file, sectionId);
  }
  if (token.type === "centered") {
    return generateDisplayCommand(token, file, sectionId);
  }
  if (token.type === "transition") {
    return generateDisplayCommand(token, file, sectionId);
  }
  if (token.type === "scene") {
    return generateDisplayCommand(token, file, sectionId);
  }
  if (token.type === "assets") {
    return generateDisplayCommand(token, file, sectionId);
  }

  return null;
};
