export interface GameContext extends Record<string, any> {
  game?: {
    transitions?: boolean;
    skipping?: boolean;
    simulating?: boolean;
    previewing?: boolean;
    restore?: () => Promise<void>;
    checkpoint?: (id: string) => void;
    supports?: (module: string) => void;
  };
}
