export interface GameContext extends Record<string, any> {
  game?: {
    transitions?: boolean;
    skipping?: boolean;
    simulating?: boolean;
    previewing?: boolean;
    restore?: () => void;
    checkpoint?: (id: string) => void;
    supports?: (module: string) => void;
  };
}
