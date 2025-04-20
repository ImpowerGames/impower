import { CoreModule } from "../core/classes/CoreModule";
import { AudioModule } from "./audio/classes/AudioModule";
import { InterpreterModule } from "./interpreter/classes/InterpreterModule";
import { UIModule } from "./ui/classes/UIModule";
import { WorldModule } from "./world/classes/WorldModule";

export const DEFAULT_MODULES = {
  core: CoreModule,
  ui: UIModule,
  audio: AudioModule,
  world: WorldModule,
  interpreter: InterpreterModule,
};
