export interface GameConfig {
  blockTree: {
    [blockId: string]: {
      index: number;
      pos: number;
      line: number;
      triggerable: boolean;
      parent: string;
      children: string[];
    };
  };
  seed: string;
  defaultStartBlockId: string;
  defaultStartCommandIndex: number;
}
