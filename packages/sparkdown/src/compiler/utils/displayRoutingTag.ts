// Shared contract for the per-beat DISPLAY ROUTING TAG.
//
// Every non-glued display beat the compiler lowers (`lowerDisplay.ts`) emits a
// single reserved tag carrying that beat's routing metadata: the line TYPE
// (`dialogue` / `action` / `title` / `heading` / `transitional` / `write`) and,
// for dialogue/write, an IDENTIFIER (the full character cue, or the write
// layer). The engine's interpreter (`InterpreterModule.queue`) reads this tag
// to route the beat to a target — instead of re-deriving it by regex over the
// visible body text (the old `<prefix>:` mechanism, now removed).
//
// The token is prefixed with a reserved SENTINEL so it can be told apart from
// author `# tag` annotations, which also land in `story.currentTags`. The
// sentinel is the NUL control char: authors cannot type it into `.sd` source,
// so an author tag can never collide with — or be mistaken for — a routing
// tag. NUL is whitespace-free, so the engine's `CleanOutputWhitespace`
// (StoryState) leaves it intact in the tag stream (and the author-tag lowerer,
// which trims surrounding whitespace, never strips it either).
//
// Format: `<SENTINEL><lineType>` or `<SENTINEL><lineType>:<identifier>`.
// The identifier itself may contain `:` / spaces / parens (it's the raw cue),
// so the engine splits on the FIRST `:` only.

export const DISPLAY_ROUTING_TAG_SENTINEL = "\u0000";

/** Build the routing-tag text for a display beat (compiler side). */
export const formatDisplayRoutingTag = (
  lineType: string,
  identifier: string | null,
): string =>
  DISPLAY_ROUTING_TAG_SENTINEL +
  (identifier ? `${lineType}:${identifier}` : lineType);

/** True when a `story.currentTags` entry is a routing tag (not an author tag). */
export const isDisplayRoutingTag = (tag: string): boolean =>
  tag.startsWith(DISPLAY_ROUTING_TAG_SENTINEL);

export interface ParsedDisplayRoutingTag {
  lineType: string;
  /** The cue / layer identifier, or "" when the line type carries none. */
  identifier: string;
}

/**
 * Parse a routing tag (engine side). Strips the sentinel, then splits on the
 * FIRST `:` into `lineType` + `identifier`. Returns null when `tag` is not a
 * routing tag.
 */
export const parseDisplayRoutingTag = (
  tag: string,
): ParsedDisplayRoutingTag | null => {
  if (!isDisplayRoutingTag(tag)) {
    return null;
  }
  const body = tag.slice(DISPLAY_ROUTING_TAG_SENTINEL.length);
  const colon = body.indexOf(":");
  if (colon === -1) {
    return { lineType: body, identifier: "" };
  }
  return {
    lineType: body.slice(0, colon),
    identifier: body.slice(colon + 1),
  };
};
