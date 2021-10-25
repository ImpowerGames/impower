export interface GameConfig {
  blockTree: { [blockId: string]: { parent: string; children: string[] } };
  seed: string;
  defaultStartBlockId: string;
}
