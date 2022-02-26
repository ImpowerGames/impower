export interface GameConfig {
  blockTree: {
    [blockId: string]: {
      index: number;
      pos: number;
      line: number;
      parent: string;
      children: string[];
    };
  };
  seed: string;
  defaultStartBlockId: string;
  defaultStartCommandIndex: number;
}
