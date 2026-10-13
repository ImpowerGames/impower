import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type HoldClearMethod = typeof HoldClearMessage.method;

export interface HoldClearParams {
  /** Each target cleared, with the elements its clear hides, and which
   *  content the clear empties: the text clear's (`text` and `stroke`, and
   *  the element's `text` attribute) and the image clear's (`image` and
   *  `mask`). */
  targets: {
    target: string;
    elements: string[];
    text?: boolean;
    image?: boolean;
  }[];
}

/**
 * Clears targets as the text and image clears do, but when the page next
 * touches each one rather than now (#1820). A preview display sends its clears
 * this way, from its connect until its beat is written. The page hides a held
 * target's element immediately before the next message that updates, animates,
 * moves or destroys it, empties its content immediately before the next write
 * to it, and applies whatever is still held at the pass's sweep, so no frame
 * shows a target empty between its clear and what replaces it. A target an
 * element of which this pass created is cleared at once, since it has nothing
 * on screen to keep.
 */
export class HoldClearMessage {
  static readonly method = "ui/reconcile-clear";
  static readonly type = new MessageProtocolNotificationType<
    HoldClearMethod,
    HoldClearParams
  >(HoldClearMessage.method);
}

export interface HoldClearMessageMap extends Record<string, [any, any]> {
  [HoldClearMessage.method]: [
    ReturnType<typeof HoldClearMessage.type.notification>,
    undefined,
  ];
}
