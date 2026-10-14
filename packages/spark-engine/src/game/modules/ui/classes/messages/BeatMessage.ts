import type { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type BeatMethod = typeof BeatMessage.method;

export interface BeatParams {
  /** What the display or the beat sends the page, in the order it was sent:
   *  creates, updates, destroys and moves (in `ui/batch`es), observes, the
   *  reconcile pass's begin when the display connects, text and image writes
   *  (each naming the elements its target resolved to, `elements`), and
   *  layout transitions. The page applies them in this order, as it would
   *  have one at a time, in one task. It answers an animation once it has
   *  played; every other op the engine has already answered. */
  messages: IMessage[];
  /** When a played beat starts on the shared clock (`sharedNow`,
   *  milliseconds), as its writes are stamped. The page commits the beat at
   *  the instant its text starts revealing. Absent for a beat shown at once
   *  (a preview, or a beat shown in full on a click). */
  time?: number;
  /** The display is a preview that reconnected the screen: once its ops are
   *  in, the page removes what the display did not emit again. */
  sweep?: boolean;
}

/**
 * One beat, composed (#1820). The maintainer's rule: the old beat stays fully
 * visible until the instant the new beat's text starts revealing, and at that
 * same instant the targets the new beat does not write are emptied and the
 * written ones replaced. The engine composes everything a display or a played
 * beat changes on the screen into this one message, in order, and the page
 * applies it in one handler, so in one frame, at that instant. Layout
 * transitions start then too: a composed beat covers mounts and content, and
 * an enter or exit animation plays from the commit (the maintainer's
 * decision).
 */
export class BeatMessage {
  static readonly method = "ui/beat";
  static readonly type = new MessageProtocolNotificationType<
    BeatMethod,
    BeatParams
  >(BeatMessage.method);
}

export interface BeatMessageMap extends Record<string, [any, any]> {
  [BeatMessage.method]: [
    ReturnType<typeof BeatMessage.type.notification>,
    undefined,
  ];
}
