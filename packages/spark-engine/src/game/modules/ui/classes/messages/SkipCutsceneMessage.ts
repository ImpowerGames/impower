import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type SkipCutsceneMethod = typeof SkipCutsceneMessage.method;

export interface SkipCutsceneParams {}

/**
 * Ends the cutscene the page is playing, as a click on it would: the page
 * plays its exit transition and then answers its `ui/play-cutscene`.
 */
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
