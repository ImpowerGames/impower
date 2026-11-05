import type { Metadata } from "./Metadata";
import type { World } from "./World";

export interface CoreBuiltins {
  metadata: Record<string, Metadata>;
  world: Record<string, World>;
}
