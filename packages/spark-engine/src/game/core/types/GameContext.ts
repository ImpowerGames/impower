export type GameContext<B = any> = {
  [K in keyof B]: B[K];
} & {
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
    resolve?: (path: string) => string;
    fetch?: (url: string) => Promise<string | ArrayBuffer>;
  };
  config?: Partial<Record<string, any>>;
  preferences?: Partial<Record<string, any>>;
};
