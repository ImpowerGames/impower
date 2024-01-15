export interface GameContext extends Record<string, any> {
  game?: {
    simulating?: boolean;
    previewing?: boolean;
    checkpoint?: (id: string) => void;
    supports?: (module: string) => void;
  };
}
