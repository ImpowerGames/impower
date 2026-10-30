export const DATA_ATTRIBUTE_PROPS: ReadonlySet<string> = new Set(["tooltip"]);

export const ARIA_ATTRIBUTE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["busy", "aria-busy"],
  ["invalid", "aria-invalid"],
  ["label", "aria-label"],
]);

export const CUSTOM_PROPERTY_ALIASES: ReadonlyMap<string, string> = new Map([
  ["spinner-color", "--spinner-color"],
]);

export const isAliasedAttributeProp = (prop: string): boolean =>
  DATA_ATTRIBUTE_PROPS.has(prop) || ARIA_ATTRIBUTE_ALIASES.has(prop);

export const ATTRIBUTE_PROPS: ReadonlySet<string> = new Set([
  "href", "target", "rel", "download", "ping", "referrerpolicy",
  "src", "srcset", "sizes", "alt", "poster", "preload", "crossorigin",
  "loading", "decoding",
  "type", "name", "value", "for", "form", "placeholder", "min", "max", "step",
  "rows", "cols", "wrap", "maxlength", "minlength", "size", "pattern", "list",
  "accept", "capture", "multiple", "autocomplete", "inputmode", "enterkeyhint",
  "autocapitalize", "spellcheck",
  "open", "disabled", "readonly", "required", "checked", "selected", "hidden",
  "autofocus", "controls", "autoplay", "loop", "muted", "inert", "popover",
  "colspan", "rowspan", "scope", "headers", "span",
  "id", "role", "title", "lang", "dir", "tabindex", "datetime", "draggable",
  "part", "slot",
]);

export const BOOLEAN_ATTRIBUTES: ReadonlySet<string> = new Set([
  "open", "disabled", "readonly", "required", "checked", "selected",
  "multiple", "hidden", "autofocus", "controls", "autoplay", "loop", "muted",
  "inert", "popover",
]);

export const WIDGET_CONTROL_ATTRIBUTE = "data-widget-control";

export const HANDLER_ATTRIBUTE = "data-ui-handler";

export const DISPLAY_TARGET_ATTRIBUTE = "data-display-target";

export const DISPLAY_TARGETS: readonly string[] = [
  "backdrop",
  "portrait",
  "character_name",
  "character_parenthetical",
  "title",
  "heading",
  "transitional",
  "dialogue",
  "action",
  "choice",
];

const RESERVED_ATTRIBUTES = new Set([
  WIDGET_CONTROL_ATTRIBUTE,
  HANDLER_ATTRIBUTE,
  DISPLAY_TARGET_ATTRIBUTE,
]);

export const isReservedAttribute = (prop: string): boolean =>
  RESERVED_ATTRIBUTES.has(prop.toLowerCase());

export const isAttributeProp = (prop: string): boolean =>
  !isReservedAttribute(prop) &&
  (ATTRIBUTE_PROPS.has(prop) ||
    isAliasedAttributeProp(prop) ||
    prop.startsWith("aria-") ||
    prop.startsWith("data-"));

export const toDataAttributeName = (prop: string): string =>
  ARIA_ATTRIBUTE_ALIASES.get(prop) ??
  (DATA_ATTRIBUTE_PROPS.has(prop) ? `data-${prop}` : prop);
