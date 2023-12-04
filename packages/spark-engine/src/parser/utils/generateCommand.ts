import type { SparkDisplayToken, SparkToken } from "../../../../sparkdown/src";
import type {
  BranchCommandData,
  CommandData,
  CommandTypeId,
  DisplayCommandData,
  EvaluateCommandData,
  JumpCommandData,
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
      type:
        token.tag === "action_box"
          ? "action"
          : token.tag === "dialogue_box"
          ? "dialogue"
          : token.tag === "scene"
          ? "scene"
          : token.tag === "transition"
          ? "transition"
          : "action",
      position: token.position || "",
      characterName: token.characterName?.text || "",
      characterParenthetical: token.characterParenthetical?.text || "",
      content: token.content || [],
      autoAdvance: token.autoAdvance ?? false,
      waitUntilFinished: token.waitUntilFinished ?? true,
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
    token.tag === "store_scalar" ||
    token.tag === "store_object" ||
    token.tag === "define_scalar" ||
    token.tag === "define_object"
  ) {
    const refId = getCommandId(token, file, sectionId);
    const refTypeId: CommandTypeId = "EvaluateCommand";
    const newCommand: EvaluateCommandData = {
      reference: {
        parentId: sectionId,
        type: "Command",
        id: refId,
        typeId: refTypeId,
      },
      source: getSource(token, file),
      indent: token.indent,
      params: {
        expression: `${token.name} = ${token.value}`,
      },
    };
    return newCommand;
  }
  if (token.tag === "assign") {
    const refId = getCommandId(token, file, sectionId);
    const refTypeId: CommandTypeId = "EvaluateCommand";
    const newCommand: EvaluateCommandData = {
      reference: {
        parentId: sectionId,
        type: "Command",
        id: refId,
        typeId: refTypeId,
      },
      source: getSource(token, file),
      indent: token.indent,
      params: {
        expression: `${token.name} ${token.operator} ${token.value}`,
      },
    };
    return newCommand;
  }
  if (
    token.tag === "if" ||
    token.tag === "elseif" ||
    token.tag === "else" ||
    token.tag === "end"
  ) {
    const refId = getCommandId(token, file, sectionId);
    const refTypeId: CommandTypeId = "BranchCommand";
    const newCommand: BranchCommandData = {
      reference: {
        parentId: sectionId,
        type: "Command",
        id: refId,
        typeId: refTypeId,
      },
      source: getSource(token, file),
      indent: token.indent,
      params: {
        condition: token.condition as string,
        check: (token.tag || "") as "if" | "elseif" | "else" | "end",
      },
    };
    return newCommand;
  }
  if (token.tag === "jump") {
    const refId = getCommandId(token, file, sectionId);
    const refTypeId: CommandTypeId = "JumpCommand";
    const newCommand: JumpCommandData = {
      reference: {
        parentId: sectionId,
        type: "Command",
        id: refId,
        typeId: refTypeId,
      },
      source: getSource(token, file),
      indent: token.indent,
      params: {
        value: token.section as string,
        returnWhenFinished: false,
        waitUntilFinished: true,
      },
    };
    return newCommand;
  }
  if (token.tag === "return") {
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
        value: token.value as string,
        waitUntilFinished: true,
      },
    };
    return newCommand;
  }
  if (token.tag === "dialogue_box") {
    return generateDisplayCommand(token, file, sectionId);
  }
  if (token.tag === "action_box") {
    return generateDisplayCommand(token, file, sectionId);
  }
  if (token.tag === "transition") {
    return generateDisplayCommand(token, file, sectionId);
  }
  if (token.tag === "scene") {
    return generateDisplayCommand(token, file, sectionId);
  }

  return null;
};
