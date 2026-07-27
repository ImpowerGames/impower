/**
 * Props that are neither a style property nor a standard HTML attribute, but
 * which the ui gives meaning to — authored bare and written to the DOM with a
 * `data-` prefix.
 *
 *   text "Abbr." #tooltip="Abbreviation"   ->   <… data-tooltip="Abbreviation">
 *
 * Why a list rather than "anything unknown becomes an attribute": an inline
 * prop is validated as a STYLE property first, and that is what catches typos.
 * If every unrecognized name silently became an attribute, `#colr="red"` would
 * emit an inert `colr="red"` and nothing would ever report it — the exact
 * silent no-op the validator exists to prevent. Naming them keeps the check.
 *
 * Why `data-`: a bare `tooltip=""` is not a conforming HTML attribute, while
 * `data-*` is precisely HTML's mechanism for custom data. Authors get the short
 * spelling; the DOM stays valid.
 *
 * This is the single source for all three places that have to agree — the
 * validator (so the prop is not flagged), the ui runtime (so it is routed to an
 * attribute and prefixed), and the style transformer (so a `#tooltip` SELECTOR
 * matches the `data-tooltip` that was written).
 */
export const DATA_ATTRIBUTE_PROPS: ReadonlySet<string> = new Set(["tooltip"]);

/** The DOM attribute name a prop is written as. */
export const toDataAttributeName = (prop: string): string =>
  DATA_ATTRIBUTE_PROPS.has(prop) ? `data-${prop}` : prop;
