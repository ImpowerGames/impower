import type {
  SparkDisplayToken,
  SparkToken,
} from "../../../../sparkdown/src/types/SparkToken";
import { CommandData } from "../../game/logic/types/CommandData";
import { BranchCommandData } from "../classes/commands/branchCommand/BranchCommandData";
import { DisplayCommandData } from "../classes/commands/displayCommand/DisplayCommandData";
import { EvaluateCommandData } from "../classes/commands/evaluateCommand/EvaluateCommandData";
import { JumpCommandData } from "../classes/commands/jumpCommand/JumpCommandData";
import { ReturnCommandData } from "../classes/commands/returnCommand/ReturnCommandData";

const getCommandId = (parent: string, index: number): string => {
  return `${parent}.${index}`;
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
  parent: string,
  index: number
): DisplayCommandData => {
  const id = token.checkpoint || getCommandId(parent, index);
  return {
    type: "DisplayCommand",
    parent,
    id,
    index,
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
    source: getSource(token, file),
  };
};

export const generateCommand = (
  token: SparkToken,
  file: string,
  parent: string,
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
      const id = token.checkpoint || getCommandId(parent, index);
      const newCommand: EvaluateCommandData = {
        type: "EvaluateCommand",
        parent,
        id,
        index,
        indent: token.indent,
        params: {
          expression: `${token.name} ${token.operator} ${token.value}`,
        },
        source: getSource(token, file),
      };
      return newCommand;
    }
  }
  if (token.tag === "delete") {
    const id = token.checkpoint || getCommandId(parent, index);
    const newCommand: EvaluateCommandData = {
      type: "EvaluateCommand",
      parent,
      id,
      index,
      indent: token.indent,
      params: {
        expression: `delete ${token.name}`,
      },
      source: getSource(token, file),
    };
    return newCommand;
  }
  if (
    token.tag === "if" ||
    token.tag === "elseif" ||
    token.tag === "else" ||
    token.tag === "end"
  ) {
    const id = token.checkpoint || getCommandId(parent, index);
    const newCommand: BranchCommandData = {
      type: "BranchCommand",
      parent,
      id,
      index,
      indent: token.indent,
      params: {
        condition: token.condition as string,
        check: (token.tag || "") as "if" | "elseif" | "else" | "end",
      },
      source: getSource(token, file),
    };
    return newCommand;
  }
  if (token.tag === "jump") {
    const id = token.checkpoint || getCommandId(parent, index);
    const newCommand: JumpCommandData = {
      type: "JumpCommand",
      parent,
      id,
      index,
      indent: token.indent,
      params: {
        value: token.section as string,
        returnWhenFinished: false,
        waitUntilFinished: true,
      },
      source: getSource(token, file),
    };
    return newCommand;
  }
  if (token.tag === "return") {
    const id = token.checkpoint || getCommandId(parent, index);
    const newCommand: ReturnCommandData = {
      type: "ReturnCommand",
      parent,
      id,
      index,
      indent: token.indent,
      params: {
        value: token.value as string,
        waitUntilFinished: true,
      },
      source: getSource(token, file),
    };
    return newCommand;
  }
  if (token.tag === "dialogue_box") {
    return generateDisplayCommand(token, file, parent, index);
  }
  if (token.tag === "action_box") {
    return generateDisplayCommand(token, file, parent, index);
  }
  if (token.tag === "transition") {
    return generateDisplayCommand(token, file, parent, index);
  }
  if (token.tag === "scene") {
    return generateDisplayCommand(token, file, parent, index);
  }

  return null;
};
