import type {
  SparkDisplayToken,
  SparkToken,
} from "../../../../sparkdown/src/types/SparkToken";
import type { CommandData } from "../../game/core/types/CommandData";
import type { BranchCommandData } from "../../game/modules/logic/classes/commands/branchCommand/BranchCommandData";
import type { ClearCommandData } from "../../game/modules/logic/classes/commands/clearCommand/ClearCommandData";
import type { EvaluateCommandData } from "../../game/modules/logic/classes/commands/evaluateCommand/EvaluateCommandData";
import type { JumpCommandData } from "../../game/modules/logic/classes/commands/jumpCommand/JumpCommandData";
import type { ReturnCommandData } from "../../game/modules/logic/classes/commands/returnCommand/ReturnCommandData";
import type { DisplayCommandData } from "../../game/modules/writer/classes/commands/displayCommand/DisplayCommandData";

const getCommandId = (parent: string, index: number): string => {
  return `${parent}.${index}`;
};

const getSource = (token: SparkToken) => {
  return {
    file: token.file,
    line: token.line,
    from: token.from,
    to: token.to,
  };
};

const generateDisplayCommand = (
  token: SparkDisplayToken,
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
    source: getSource(token),
  };
};

const generateCommand = (
  token: SparkToken,
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
        source: getSource(token),
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
      source: getSource(token),
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
      source: getSource(token),
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
      source: getSource(token),
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
      source: getSource(token),
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
      source: getSource(token),
    };
    return newCommand;
  }
  if (token.tag === "dialogue_box") {
    return generateDisplayCommand(token, parent, index);
  }
  if (token.tag === "action_box") {
    return generateDisplayCommand(token, parent, index);
  }
  if (token.tag === "transition") {
    return generateDisplayCommand(token, parent, index);
  }
  if (token.tag === "scene") {
    return generateDisplayCommand(token, parent, index);
  }

  return null;
};

export default generateCommand;
