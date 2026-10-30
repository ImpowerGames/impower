import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { Animation } from "../../types/Animation";

export type PlayCutsceneMethod = typeof PlayCutsceneMessage.method;

export interface PlayCutsceneParams {
  src: string;
  loop: boolean;
  muted: boolean;
  mixer: string;
  mixerGain: number;
  with?: string;
  enter?: Animation;
  exit?: Animation;
  preview?: boolean;
}

export class PlayCutsceneMessage {
  static readonly method = "ui/play-cutscene";
  static readonly type = new MessageProtocolRequestType<
    PlayCutsceneMethod,
    PlayCutsceneParams,
    null
  >(PlayCutsceneMessage.method);
}

export interface PlayCutsceneMessageMap extends Record<string, [any, any]> {
  [PlayCutsceneMessage.method]: [
    ReturnType<typeof PlayCutsceneMessage.type.request>,
    ReturnType<typeof PlayCutsceneMessage.type.response>,
  ];
}
