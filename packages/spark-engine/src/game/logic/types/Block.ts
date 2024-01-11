import { Command } from "./Command";
import { DocumentSource } from "./DocumentSource";

export interface Block {
  source?: DocumentSource;
  level: number;
  name: string;
  parent?: string;
  children?: string[];
  commands?: Command[];
}
