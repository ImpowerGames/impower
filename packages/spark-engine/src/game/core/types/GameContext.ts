import { CoreBuiltins } from "../coreBuiltinDefinitions";

export type GameContext<B = any> = {
  [K in keyof B]?: B[K];
} & Partial<CoreBuiltins> & {
    system: {
      initialized?: boolean;
      transitions?: boolean;
      skipping?: boolean;
      simulating?: boolean;
      previewing?: string;
      debugging?: boolean;
      locale?: string;
      uuid: () => string;
      checkpoint: () => void;
      setTimeout: (
        handler: Function,
        timeout?: number,
        ...args: any[]
      ) => number;
      supports: (module: string) => void;
      resolve?: (path: string) => string;
      fetch?: (url: string) => Promise<string | ArrayBuffer>;
      log?: (message: unknown, severity: "info" | "warning" | "error") => void;
    };
    config?: Partial<Record<string, any>>;
    preferences?: Partial<Record<string, any>>;
  };
