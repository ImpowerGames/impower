import type { SparkDisplayToken, SparkToken } from "../../../../sparkdown/src";
import type {
  BranchCommandData,
  CommandData,
  DisplayCommandData,
  EvaluateCommandData,
  JumpCommandData,
  ReturnCommandData,
} from "../../data";

const getCommandId = (sectionId: string, index: number): string => {
  return `${sectionId}.${index}`;
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
  sectionId: string,
  index: number
): DisplayCommandData => {
  const refId = token.checkpoint || getCommandId(sectionId, index);
  return {
    reference: {
      type: "Command",
      typeId: "DisplayCommand",
      parentId: sectionId,
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
      characterKey: token.characterKey || "",
      content: token.content || [],
      autoAdvance: token.autoAdvance ?? false,
      waitUntilFinished: token.waitUntilFinished ?? true,
    },
  };
};

export const generateCommand = (
  token: SparkToken,
  file: string,
  sectionId: string,
  index: number
): CommandData | null => {
  if (!token) {
    return null;
  }
  if (token.ignore) {
    return null;
  }
  if (
    token.tag === "define" ||
    token.tag === "store" ||
    token.tag === "assign"
  ) {
    if (token.operator) {
      const refId = token.checkpoint || getCommandId(sectionId, index);
      const newCommand: EvaluateCommandData = {
        reference: {
          type: "Command",
          typeId: "EvaluateCommand",
          parentId: sectionId,
          id: refId,
        },
        source: getSource(token, file),
        indent: token.indent,
        params: {
          expression: `${token.name} ${token.operator} ${token.value}`,
        },
      };
      return newCommand;
    }
  }
  if (token.tag === "delete") {
    const refId = token.checkpoint || getCommandId(sectionId, index);
    const newCommand: EvaluateCommandData = {
      reference: {
        type: "Command",
        typeId: "EvaluateCommand",
        parentId: sectionId,
        id: refId,
      },
      source: getSource(token, file),
      indent: token.indent,
      params: {
        expression: `delete ${token.name}`,
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
    const refId = token.checkpoint || getCommandId(sectionId, index);
    const newCommand: BranchCommandData = {
      reference: {
        type: "Command",
        typeId: "BranchCommand",
        parentId: sectionId,
        id: refId,
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
    const refId = token.checkpoint || getCommandId(sectionId, index);
    const newCommand: JumpCommandData = {
      reference: {
        type: "Command",
        typeId: "JumpCommand",
        parentId: sectionId,
        id: refId,
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
    const refId = token.checkpoint || getCommandId(sectionId, index);
    const newCommand: ReturnCommandData = {
      reference: {
        type: "Command",
        typeId: "ReturnCommand",
        parentId: sectionId,
        id: refId,
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
    return generateDisplayCommand(token, file, sectionId, index);
  }
  if (token.tag === "action_box") {
    return generateDisplayCommand(token, file, sectionId, index);
  }
  if (token.tag === "transition") {
    return generateDisplayCommand(token, file, sectionId, index);
  }
  if (token.tag === "scene") {
    return generateDisplayCommand(token, file, sectionId, index);
  }

  return null;
};
