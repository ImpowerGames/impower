export interface GameContext extends Record<string, any> {
  system: {
    initialized?: boolean;
    transitions?: boolean;
    skipping?: boolean;
    simulating?: boolean;
    previewing?: boolean;
    debugging?: boolean;
    stored?: string[];
    evaluate: (expression: string) => unknown;
    uuid: () => string;
    restore: () => Promise<void>;
    checkpoint: (id: string) => void;
    supports: (module: string) => void;
  };
  config?: Partial<Record<string, any>>;
  preferences?: Partial<Record<string, any>>;
}
