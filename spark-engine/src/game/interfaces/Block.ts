import { Command } from "./Command";
import { Variable } from "./Variable";

export interface Block {
  from: number;
  to: number;
  line: number;
  indent: number;
  index: number;
  level: number;
  type: "section" | "function" | "method" | "detector";
  parent: string;
  children: string[];
  triggers: string[];
  parameters: string[];
  name: string;
  variables?: Record<string, Variable>;
  commands?: Record<string, Command>;
  ids: Record<string, string>;
}
