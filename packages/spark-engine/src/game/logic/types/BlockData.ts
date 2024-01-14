import { CommandData } from "./CommandData";
import { DocumentSource } from "./DocumentSource";

export interface BlockData {
  source: DocumentSource;
  level: number;
  name: string;
  parent?: string;
  children?: string[];
  commands: CommandData[];
  path: string[];
}
