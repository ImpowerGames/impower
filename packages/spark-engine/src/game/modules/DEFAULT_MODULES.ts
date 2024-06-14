import { AudioModule } from "./audio/classes/AudioModule";
import { UIModule } from "./ui/classes/UIModule";
import { WriterModule } from "./writer/classes/WriterModule";

export const DEFAULT_MODULES = {
  ui: UIModule,
  audio: AudioModule,
  writer: WriterModule,
};
