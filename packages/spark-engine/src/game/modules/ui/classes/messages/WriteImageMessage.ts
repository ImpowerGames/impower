import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { Animation } from "../../types/Animation";

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
    /** Reveal/animate animation for the new layer (control: show | animate). */
    enterAnimation?: Animation;
    /** Hide animation for the new layer (control: hide). */
    exitAnimation?: Animation;
    /**
     * Hide animation played on the *previous* layers of this content element
     * before they are destroyed (the crossfade, control: show).
     */
    previousHideAnimation?: Animation;
  };
}

export type WriteImageMethod = typeof WriteImageMessage.method;

export interface WriteImageParams {
  target: string;
  instructions: WriteImageInstruction[];
  instant: boolean;
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
