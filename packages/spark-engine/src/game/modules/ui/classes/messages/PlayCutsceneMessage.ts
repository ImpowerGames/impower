import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { Animation } from "../../types/Animation";

export type PlayCutsceneMethod = typeof PlayCutsceneMessage.method;

/**
 * A `[[play NAME]]` cutscene, with its video already resolved to the file the
 * page's asset cache is keyed by, and its mixer and transition resolved, so
 * the page needs no access to the `video` context.
 */
export interface PlayCutsceneParams {
  /** The video file's src. */
  src: string;
  /** Plays until the player skips it, rather than until it ends. */
  loop: boolean;
  muted: boolean;
  /** The mixer the `movie` channel plays through, which the page routes the
   *  video's sound into, creating it at `mixerGain` when it is the first. */
  mixer: string;
  mixerGain: number;
  /** Transition for showing and hiding the cutscene. */
  with?: string;
  /** The animations `with` resolves to, played on the cutscene as it shows
   *  and as it goes. */
  enter?: Animation;
  exit?: Animation;
  /** Sent by a preview: the page shows the first frame, never plays it, and
   *  answers at once. */
  preview?: boolean;
}

/**
 * Plays a cutscene full screen, above every layout. The page answers once the
 * video has ended, or once the player or a `ui/skip-cutscene` has skipped it,
 * after its exit transition.
 */
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
