import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import type { Animation } from "../../types/Animation";

/**
 * [D15] A single image event, with all engine-context-dependent values already
 * resolved by the engine so the renderer needs no access to the `image` /
 * `layered_image` / `filtered_image` / `animation` / `ease` / `transition`
 * context.
 *
 * Mirrors the relationship `getRevealAnimation` has to text: the engine still
 * owns the context lookups (`getBackgroundImageFromString`,
 * `getAnimationDefinition`, transition resolution) — it just ships the resolved
 * CSS strings + `Animation` objects instead of pre-built DOM + per-element
 * `ui/create`/`ui/animate`/`ui/destroy`.
 */
export interface WriteImageInstruction {
  control: "show" | "hide" | "animate";
  /**
   * Animations to play on the *target wrapper element* itself (the structural
   * `backdrop`/`portrait`/… element). Carries the first-content-reveal `show`
   * for content events and the show/hide/animate for layer-visibility events.
   */
  targetAnimations?: Animation[];
  /**
   * Transition "also-affected" elements: a class selector → animations to play
   * on every matching element (resolved consumer-side via the same target
   * lookup, since these arbitrary classes are not the write's own target).
   */
  affected?: { target: string; animations: Animation[] }[];
  /**
   * When the event carries assets, the resolved content layer to realize. The
   * engine resolves the background/mask CSS + the first `img` src; the consumer
   * builds an `instance` span (+ child `object` img) under each `image` content
   * element (filling `background_image`) and each `mask` content element
   * (filling `mask_image`) — the resolved value is identical for both, so only
   * the target CSS property differs, which the consumer picks per element kind.
   */
  content?: {
    /** Resolved CSS value (e.g. `url("a"), url("b")`), reversed-and-joined. */
    background: string;
    /** Space-separated asset names, set as the `image` attribute. */
    imageNames: string;
    /** First resolved image src for the child `<img class="object">`, if any. */
    src?: string;
    /** Every fetched src the layer paints, in the order the assets name them:
     *  the keys the page keeps resident for as long as the layer is on
     *  screen. */
    srcs: string[];
    /** The movie the layer plays, when a name is a video rather than an
     *  image: the page builds a `<video>` for it in place of the `img`. */
    video?: {
      /** The video file's src, which the page's asset cache is keyed by. */
      src: string;
      loop: boolean;
      muted: boolean;
      /** Written by a preview, which shows the first frame and never plays. */
      preview?: boolean;
    };
    /** Reveal/animate animation for the new layer (control: show | animate). */
    enterAnimation?: Animation;
    /** Hide animation for the new layer (control: hide). */
    exitAnimation?: Animation;
    /**
     * Hide animation played on the *previous* layers of this content element
     * before they are destroyed (the crossfade, control: show).
     */
    previousHideAnimation?: Animation;
    /** The morphs that play on the layer's images, when any do. */
    morph?: MorphImageContent;
  };
}

/** One morph playing on one image of an image write. */
export interface MorphLayerPlay {
  /** The image's place in the write's `background`, counted bottom first. */
  layer: number;
  /** The compact reference compilation made for the image's variant. */
  ref: MorphRef;
  timing: MorphTiming;
  /**
   * Identity of the morph's definition (its recipe and timing): an edited
   * definition starts the portrait's morph again at rest.
   */
  definition: string;
}

/**
 * What an image write carries for the morphs that play on it: references,
 * never artifacts, so a write stays small and its JSON deduplicates as
 * before. The page resolves each reference itself.
 */
export interface MorphImageContent {
  plays: MorphLayerPlay[];
  /** Counts the game's loads and restarts; a new epoch starts every morph at rest. */
  epoch: number;
}

export type WriteImageMethod = typeof WriteImageMessage.method;

export interface WriteImageParams {
  target: string;
  instructions: WriteImageInstruction[];
  instant: boolean;
  /** When the beat this write belongs to starts, on the shared clock
   *  (`sharedNow`, milliseconds). The page shows it that long after the
   *  audio's output latency. Absent for writes that start when the page
   *  handles them. */
  time?: number;
  /** The structural ids of the elements the write goes to, when the game
   *  sends it inside a composed `ui/beat` (#1820): the target as it resolved
   *  where the write stands in the beat, not as it resolves once the beat's
   *  later structure is on the page. */
  elements?: string[];
}

export class WriteImageMessage {
  static readonly method = "ui/write-image";
  static readonly type = new MessageProtocolRequestType<
    WriteImageMethod,
    WriteImageParams,
    string
  >(WriteImageMessage.method);
}

export interface WriteImageMessageMap extends Record<string, [any, any]> {
  [WriteImageMessage.method]: [
    ReturnType<typeof WriteImageMessage.type.request>,
    ReturnType<typeof WriteImageMessage.type.response>,
  ];
}
