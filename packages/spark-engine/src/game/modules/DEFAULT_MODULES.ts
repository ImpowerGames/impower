import { CoreModule } from "../core/classes/CoreModule";
import { AudioModule } from "./audio/classes/AudioModule";
import { UIModule } from "./ui/classes/UIModule";
import { InterpreterModule } from "./interpreter/classes/InterpreterModule";

export const DEFAULT_MODULES = {
  core: CoreModule,
  ui: UIModule,
  audio: AudioModule,
  interpreter: InterpreterModule,
};
