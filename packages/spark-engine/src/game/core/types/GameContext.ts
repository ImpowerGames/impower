import { CoreBuiltins } from "../coreBuiltinDefinitions";
import { SystemConfiguration } from "./SystemConfiguration";

export type GameContext<B = any> = {
  [K in keyof B]?: B[K];
} & Partial<CoreBuiltins> & {
    system: {
      transitions?: boolean;
      skipping?: boolean;
      simulating?: string;
      previewing?: boolean | string | null;
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
