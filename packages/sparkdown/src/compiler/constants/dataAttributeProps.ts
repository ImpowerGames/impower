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

/**
 * ARIA state, authored WITHOUT the `aria-` prefix.
 *
 *   button "Save" #busy={saving}   ->   aria-busy="true"
 *   input #invalid={has_error}     ->   aria-invalid="true"
 *   button "x" #label="Close"      ->   aria-label="Close"
 *
 * ARIA is a WEB concept. Unity's USS has no notion of it, so binding the
 * authored vocabulary — and worse, the style SELECTORS — to `aria-*` names
 * would tie the language to one renderer. The author writes a plain state name
 * and only the DOM renderer knows it becomes an ARIA attribute, leaving a Unity
 * front-end free to map the same names onto whatever it uses.
 *
 * Nothing is lost on the web: the emitted DOM and its accessibility semantics
 * are identical.
 *
 * `#label` was a SILENT NO-OP before this — not an attribute prop, and
 * meaningless as CSS, so it parsed, was dropped, and was never reported. Giving
 * it a meaning is strictly better than leaving a plausible-looking prop that
 * quietly does nothing.
 */
export const ARIA_ATTRIBUTE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["busy", "aria-busy"],
  ["invalid", "aria-invalid"],
  ["label", "aria-label"],
]);

/** Props routed to an attribute despite not looking like one. */
export const isAliasedAttributeProp = (prop: string): boolean =>
  DATA_ATTRIBUTE_PROPS.has(prop) || ARIA_ATTRIBUTE_ALIASES.has(prop);

/** The DOM attribute name a prop is written as. */
export const toDataAttributeName = (prop: string): string =>
  ARIA_ATTRIBUTE_ALIASES.get(prop) ??
  (DATA_ATTRIBUTE_PROPS.has(prop) ? `data-${prop}` : prop);
