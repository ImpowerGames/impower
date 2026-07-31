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

/**
 * Props authored as ordinary names that emit a CSS CUSTOM PROPERTY.
 *
 *   article #busy=true #spinner-color="red"   ->   --spinner-color: red
 *
 * A builtin that wants one knob overridable from the call site has a problem:
 * the thing being styled is a PSEUDO-ELEMENT (the spinner is a `::before`), and
 * no inline prop can reach one. The builtin therefore reads a custom property —
 * `background-color: var(--spinner-color, …)` — and the author sets it.
 *
 * Authors CAN write `#--spinner-color` directly; custom properties pass through
 * untouched. The alias exists so they do not have to know that. Every other prop
 * is a plain name, and asking someone to remember which few need a `--` prefix
 * is a rule with no reason behind it from the outside — the prefix is an
 * implementation detail of how the builtin plumbs the value to a pseudo-element.
 *
 * Aliased rather than open-ended for the same reason as the attribute props
 * above: an unrecognized `#spinnr-color` must still be reported, not silently
 * become an inert variable nothing reads.
 *
 * THIS LIST ONLY SUPPRESSES THE WARNING. The rename and the value handling live
 * in `CSS_UTILITIES` / `STYLE_TRANSFORMERS` (sparkle-style-transformer), which
 * is what actually emits `--spinner-color` and resolves a theme token in the
 * value. Renaming here as well was tried and was worse than useless: it
 * produced the right property name carrying an unresolved token, because the
 * value transformer keys off the AUTHORED name and so never ran. An entry here
 * without a matching CSS_UTILITIES entry means the prop stops warning and still
 * does nothing — the exact silent no-op this file exists to prevent.
 */
export const CUSTOM_PROPERTY_ALIASES: ReadonlyMap<string, string> = new Map([
  ["spinner-color", "--spinner-color"],
]);

/** Props routed to an attribute despite not looking like one. */
export const isAliasedAttributeProp = (prop: string): boolean =>
  DATA_ATTRIBUTE_PROPS.has(prop) || ARIA_ATTRIBUTE_ALIASES.has(prop);

// NOTE: there is deliberately no `toCustomPropertyName` helper. One existed and
// was used to rename the prop in the renderer, which is the wrong layer — the
// value transformer keys off the AUTHORED name, so renaming early emitted
// `--spinner-color: sky_60`, the right property carrying an unresolved token.
// CSS_UTILITIES does the rename and the value together. A helper here would
// only invite that mistake again.

/** The DOM attribute name a prop is written as. */
export const toDataAttributeName = (prop: string): string =>
  ARIA_ATTRIBUTE_ALIASES.get(prop) ??
  (DATA_ATTRIBUTE_PROPS.has(prop) ? `data-${prop}` : prop);
