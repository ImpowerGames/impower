import type { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { WriteImageParams } from "./WriteImageMessage";
import type { WriteTextParams } from "./WriteTextMessage";

export type BeatMethod = typeof BeatMessage.method;

/** What one beat leaves in one target's text or image content. */
export interface BeatContent<P> {
  target: string;
  /** The beat clears the target before its writes, so the target ends with
   *  exactly what `writes` put in it: nothing when `writes` is empty (an
   *  explicit empty). Without it the writes add to what the target shows, as
   *  a write does. */
  replace: boolean;
  /** The writes, in order, as `ui/write-text` or `ui/write-image` carry them. */
  writes: P[];
  /** The structural ids of the elements the target resolved to when the beat
   *  first touched it. */
  elements?: string[];
}

export interface BeatParams {
  /** The display's structural ops, in order: creates, updates, destroys,
   *  moves, observes, the theme, and the reconcile pass's begin when the
   *  display connects. The page applies them before the content. */
  messages: IMessage[];
  /** The final text of every target the beat touches. */
  text: BeatContent<WriteTextParams>[];
  /** The final image content of every target the beat touches. */
  image: BeatContent<WriteImageParams>[];
  /** When a played beat starts on the shared clock (`sharedNow`,
   *  milliseconds), as its writes are stamped. The page commits the beat at
   *  the instant its text starts revealing. Absent for a beat shown at once
   *  (a preview, or a beat shown in full on a click). */
  time?: number;
  /** The display is a preview that reconnected the screen: once its content
   *  is in, the page removes what the display did not emit again. */
  sweep?: boolean;
  /** Ops that act on what the commit puts up (an entering layout's
   *  animation), applied once the commit is on the page.
   *
   *  SEAM(#1820 layout transitions): how enter and exit transitions run
   *  around a composed beat is the maintainer's decision. Until it is made,
   *  an animation of an element the beat itself creates goes here, and every
   *  other animation goes to the page as it is sent. */
  after: IMessage[];
}

/**
 * One beat, composed (#1820). The maintainer's rule: the old beat stays fully
 * visible until the instant the new beat's text starts revealing, and at that
 * same instant the targets the new beat does not write are emptied and the
 * written ones replaced. The engine composes everything a display or a played
 * beat changes on the screen into this one message, and the page applies it
 * in one handler, so in one frame, at that instant.
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
