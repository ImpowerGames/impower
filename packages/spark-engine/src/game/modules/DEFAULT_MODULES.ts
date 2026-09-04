import { CoreModule } from "../core/classes/CoreModule";
import { AssetModule } from "./assets/classes/AssetModule";
import { AudioModule } from "./audio/classes/AudioModule";
import { InterpreterModule } from "./interpreter/classes/InterpreterModule";
import { UIModule } from "./ui/classes/UIModule";
import { WorldModule } from "./world/classes/WorldModule";

// Order matters at connect: `assets` reads the checkpoint image state for its
// restore gate before `ui` clears the transient layers, and the modules connect
// in this order.
export const DEFAULT_MODULES = {
  core: CoreModule,
  assets: AssetModule,
  ui: UIModule,
  audio: AudioModule,
  world: WorldModule,
  interpreter: InterpreterModule,
};
