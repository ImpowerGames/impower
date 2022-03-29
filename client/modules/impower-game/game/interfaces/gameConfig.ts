import { Block } from "./block";

export interface GameConfig {
  blockTree: Record<string, Block>;
  seed: string;
  defaultStartBlockId: string;
  defaultStartCommandIndex: number;
  debugging: boolean;
}
