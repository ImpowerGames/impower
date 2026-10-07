import type { CoreBuiltins } from "../coreBuiltinDefinitions";
import type { SystemConfiguration } from "./SystemConfiguration";

export type GameContext<B = any> = {
  [K in keyof B]?: B[K];
} & Partial<CoreBuiltins> & {
    system: {
      transitions?: boolean;
      skipping?: boolean;
      /** The flow a route replay starts at, while one runs. */
      simulating?: string;
      /** Whether the game shows a preview, and when it knows one, the
       *  address of the beat it previews (`Game.markPreviewing`). */
      previewing?: boolean | string | number | null;
      debugging?: boolean;
      locale?: string;
      uuid: () => string;
      checkpoint: () => void;
      supports: (module: string) => void;
      setTimeout: (
        handler: Function,
        timeout?: number,
        ...args: any[]
      ) => number;
      now: () => number;
    } & SystemConfiguration;
    config?: Partial<Record<string, any>>;
    preferences?: Partial<Record<string, any>>;
  };
