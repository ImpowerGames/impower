import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type SkipCutsceneMethod = typeof SkipCutsceneMessage.method;

export interface SkipCutsceneParams {}

export class SkipCutsceneMessage {
  static readonly method = "ui/skip-cutscene";
  static readonly type = new MessageProtocolNotificationType<
    SkipCutsceneMethod,
    SkipCutsceneParams
  >(SkipCutsceneMessage.method);
}

export interface SkipCutsceneMessageMap extends Record<string, [any, any]> {
  [SkipCutsceneMessage.method]: [
    ReturnType<typeof SkipCutsceneMessage.type.notification>,
    undefined,
  ];
}
