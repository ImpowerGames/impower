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
    locale?: string;
    uuid: () => string;
    restore: () => Promise<void>;
    checkpoint: () => void;
    supports: (module: string) => void;
    resolve?: (path: string) => string;
    fetch?: (url: string) => Promise<string | ArrayBuffer>;
    log?: (message: unknown, severity: "info" | "warning" | "error") => void;
  };
  config?: Partial<Record<string, any>>;
  preferences?: Partial<Record<string, any>>;
};
