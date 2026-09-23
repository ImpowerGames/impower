import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type DisplayPreviewMethod = typeof DisplayPreviewMessage.method;

export interface DisplayPreviewParams {
  /** The program to display, by `programIdentity`. */
  program: string;
  file: string;
  line: number;
  /** The program is a suggestion's: its report carries no executed lines. */
  speculative: boolean;
  /** The suggestion the page shows, by `programIdentity`, which the worker
   *  keeps so it can display it again without compiling it. */
  keep?: string;
  /** The real program the page holds as it sends this, by
   *  `programIdentity`, which PLAY names whatever the page displays: the
   *  worker keeps it, and each real program compiled after it, as it does
   *  for a program the page reports taking (`player/programHeld`), which the
   *  page does not report while a display waits for its application. */
  real?: string;
  /** The page's application is new since the game last displayed to it, so
   *  it holds nothing the game sent before: the display connects in full, as
   *  it does for a program the game did not display last. */
  fresh?: boolean;
}

export interface DisplayPreviewResult {
  /** The frame for this point is on the page, and no later display took the
   *  screen over while it was prepared. */
  displayed: boolean;
  /** The worker no longer holds that program. */
  missing?: boolean;
}

/**
 * Display the preview at a point of a program the worker compiled, from the
 * worker's own game, as the page's game would display it: the game declares
 * the preview, loads the route's checkpoint, connects to the page, previews
 * the point and closes the reconcile pass. Answered once the frame is sent,
 * or once a later display or compile took it over.
 */
export class DisplayPreviewMessage {
  static readonly method = "player/displayPreview";
  static readonly type = new MessageProtocolRequestType<
    DisplayPreviewMethod,
    DisplayPreviewParams,
    DisplayPreviewResult
  >(DisplayPreviewMessage.method);
}

export namespace DisplayPreviewMessage {
  export interface Request extends RequestMessage<
    DisplayPreviewMethod,
    DisplayPreviewParams,
    DisplayPreviewResult
  > {}
}
