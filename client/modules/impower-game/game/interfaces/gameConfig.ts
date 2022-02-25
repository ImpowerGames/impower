export interface GameConfig {
  blockTree: {
    [blockId: string]: {
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
