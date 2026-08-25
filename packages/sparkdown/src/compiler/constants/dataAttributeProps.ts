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
 * The alias is the ONLY way to set one. `#--spinner-color` does not parse: no
 * prop-name pattern admits a leading `-`, so the `#` matches alone and the `--`
 * opens a Luau line comment that swallows the prop, its value, and every
 * attribute after it on that line — with no diagnostic. Verified: `box
 * #--my-var=4 #gap=12 #background-color=red:` renders with NO style attribute at
 * all, while the same line without the `#--my-var` renders both of the others.
 *
 * (An earlier revision of this comment claimed authors could write `#--name`
 * directly and that the alias was merely a convenience. That was wrong in the
 * most misleading direction: it documented a capability that silently destroys
 * the rest of the line. `ValidationAnnotator`'s unrecognized-prop message still
 * recommends `#--name` and has the same problem.)
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

/**
 * Props the ui writes as real HTML attributes rather than CSS.
 *
 * Lives here, with the other three, because the same set has to be known in
 * two places that used to keep their own copy: the ui runtime (which routes
 * the prop) and the validator's generated vocabulary (which decides whether to
 * warn). They drifted by 29 entries — `#minlength`, `#spellcheck`, `#size`,
 * `#loading` and the rest validated clean, were routed to `style[prop]`
 * instead, and were dropped by CSSOM. No attribute, no style, no warning: the
 * exact silent no-op this file exists to prevent, produced by the file itself.
 *
 * `generateValidStyleProps.ts` now derives its list from this one, so the two
 * cannot disagree again.
 */
export const ATTRIBUTE_PROPS: ReadonlySet<string> = new Set([
  // links / embedded content
  "href", "target", "rel", "download", "ping", "referrerpolicy",
  "src", "srcset", "sizes", "alt", "poster", "preload", "crossorigin",
  "loading", "decoding",
  // form controls
  "type", "name", "value", "for", "form", "placeholder", "min", "max", "step",
  "rows", "cols", "wrap", "maxlength", "minlength", "size", "pattern", "list",
  "accept", "capture", "multiple", "autocomplete", "inputmode", "enterkeyhint",
  "autocapitalize", "spellcheck",
  // presence-semantics (see BOOLEAN_ATTRIBUTES)
  "open", "disabled", "readonly", "required", "checked", "selected", "hidden",
  "autofocus", "controls", "autoplay", "loop", "muted", "inert", "popover",
  // tables
  "colspan", "rowspan", "scope", "headers", "span",
  // universal / misc
  "id", "role", "title", "lang", "dir", "tabindex", "datetime", "draggable",
  "translate", "part", "slot",
]);

/**
 * Attributes whose PRESENCE is the signal, so a false value must remove them.
 *
 * Deliberately excludes the enumerated ones — `draggable`, `spellcheck`,
 * `translate`, `crossorigin`, `contenteditable` — where `="false"` is a real,
 * different value from absence. Treating those as boolean would silently drop
 * the author's explicit "no".
 */
export const BOOLEAN_ATTRIBUTES: ReadonlySet<string> = new Set([
  "open", "disabled", "readonly", "required", "checked", "selected",
  "multiple", "hidden", "autofocus", "controls", "autoplay", "loop", "muted",
  "inert", "popover",
]);

/** Whether a prop is written to the DOM as an attribute (in any spelling). */
export const isAttributeProp = (prop: string): boolean =>
  ATTRIBUTE_PROPS.has(prop) ||
  isAliasedAttributeProp(prop) ||
  prop.startsWith("aria-") ||
  prop.startsWith("data-");

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
