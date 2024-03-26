import type {
  SparkDisplayToken,
  SparkToken,
} from "../../../../sparkdown/src/types/SparkToken";
import type { CommandData } from "../../game/modules/logic/types/CommandData";
import type { BranchCommandData } from "../classes/commands/branchCommand/BranchCommandData";
import { ClearCommandData } from "../classes/commands/clearCommand/ClearCommandData";
import type { DisplayCommandData } from "../classes/commands/displayCommand/DisplayCommandData";
import type { EvaluateCommandData } from "../classes/commands/evaluateCommand/EvaluateCommandData";
import type { JumpCommandData } from "../classes/commands/jumpCommand/JumpCommandData";
import type { ReturnCommandData } from "../classes/commands/returnCommand/ReturnCommandData";

const getCommandId = (parent: string, index: number): string => {
  return `${parent}.${index}`;
};

const getSource = (token: SparkToken, file: number) => {
  return {
    file,
    line: token.line,
    from: token.from,
    to: token.to,
  };
};

const generateDisplayCommand = (
  token: SparkDisplayToken,
  file: number,
  parent: string,
  index: number
): DisplayCommandData => {
  const id = token.id || getCommandId(parent, index);
  token.id = id;
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
      position: token.position || 0,
      characterKey: token.characterKey || "",
      content: token.content || [],
      autoAdvance: token.autoAdvance ?? false,
    },
    source: getSource(token, file),
  };
};

const generateCommand = (
  token: SparkToken,
  file: number,
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
      const id = token.id || getCommandId(parent, index);
      token.id = id;
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
    const id = token.id || getCommandId(parent, index);
    token.id = id;
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
    const id = token.id || getCommandId(parent, index);
    token.id = id;
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
    const id = token.id || getCommandId(parent, index);
    token.id = id;
    const newCommand: JumpCommandData = {
      type: "JumpCommand",
      parent,
      id,
      index,
      indent: token.indent,
      params: {
        value: token.section as string,
        returnWhenFinished: false,
      },
      source: getSource(token, file),
    };
    return newCommand;
  }
  if (token.tag === "return") {
    const id = token.id || getCommandId(parent, index);
    token.id = id;
    const newCommand: ReturnCommandData = {
      type: "ReturnCommand",
      parent,
      id,
      index,
      indent: token.indent,
      params: {
        value: token.value as string,
      },
      source: getSource(token, file),
    };
    return newCommand;
  }
  if (token.tag === "chunk") {
    const id = token.id || getCommandId(parent, index);
    token.id = id;
    const newCommand: ClearCommandData = {
      type: "ClearCommand",
      parent,
      id,
      index,
      indent: token.indent,
      params: {},
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

export default generateCommand;
