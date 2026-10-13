import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type FrameMethod = typeof FrameMessage.method;

export interface FrameParams {
  /** True opens a frame, false closes the one opened last. */
  open: boolean;
}

/**
 * Brackets what one beat changes on the screen (#1820). The page handles each
 * message as a task of its own and can render between any two, so a beat that
 * clears a target in one message and writes it in the next could show it
 * empty for a frame. Between an open and its close the page holds every
 * screen message and puts them all on the screen in one task at the close:
 * the beat's clears, rewrites and the targets it leaves empty change together,
 * and a target rewritten with what it already shows does not change at all.
 */
export class FrameMessage {
  static readonly method = "ui/frame";
  static readonly type = new MessageProtocolNotificationType<
    FrameMethod,
    FrameParams
  >(FrameMessage.method);
}

export interface FrameMessageMap extends Record<string, [any, any]> {
  [FrameMessage.method]: [
    ReturnType<typeof FrameMessage.type.notification>,
    undefined,
  ];
}
