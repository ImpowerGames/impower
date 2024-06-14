import { CommandData } from "../../../core/types/CommandData";
import { DocumentSource } from "../../../core/types/DocumentSource";

export interface BlockData {
  source: DocumentSource;
  level: number;
  name: string;
  parent?: string;
  children?: string[];
  commands: CommandData[];
  path: string[];
}
