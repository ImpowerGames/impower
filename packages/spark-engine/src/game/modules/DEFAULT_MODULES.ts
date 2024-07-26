import { AudioModule } from "./audio/classes/AudioModule";
import { UIModule } from "./ui/classes/UIModule";
import { InterpreterModule } from "./interpreter/classes/InterpreterModule";

export const DEFAULT_MODULES = {
  ui: UIModule,
  audio: AudioModule,
  interpreter: InterpreterModule,
};
