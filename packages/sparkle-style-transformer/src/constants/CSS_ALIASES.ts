export const CSS_ALIASES = {
  display: "displayed",

  "aspect-ratio": "aspect",

  "min-width": "width-min",
  "max-width": "width-max",

  "min-height": "height-min",
  "max-height": "height-max",

  "border-radius": "corner",
  "border-top-left-radius": "corner-top-left",
  "border-top-right-radius": "corner-top-right",
  "border-bottom-right-radius": "corner-bottom-right",
  "border-bottom-left-radius": "corner-bottom-left",

  "border-top-width": "border-width-top",
  "border-right-width": "border-width-right",
  "border-bottom-width": "border-width-bottom",
  "border-left-width": "border-width-left",
  "border-top-color": "border-color-top",
  "border-right-color": "border-color-right",
  "border-bottom-color": "border-color-bottom",
  "border-left-color": "border-color-left",
  "border-top-style": "border-style-top",
  "border-right-style": "border-style-right",
  "border-bottom-style": "border-style-bottom",
  "border-left-style": "border-style-left",

  inset: "anchor",
  top: "anchor-top",
  right: "anchor-right",
  bottom: "anchor-bottom",
  left: "anchor-left",

  "flex-direction": "child-layout",

  "grid-template-columns": "child-columns",

  gap: "child-gap",
  "align-items": "child-align",
  "justify-content": "child-justify",
  "flex-wrap": "child-overflow",

  "align-self": "self-align",
  align: "self-align",

  "flex-grow": "grow",
  "flex-shrink": "shrink",

  visibility: "visible",
  "pointer-events": "interactable",
  "user-select": "selectable",

  "font-family": "text-font",
  "font-size": "text-size",
  "line-height": "text-leading",
  "letter-spacing": "text-tracking",
  "font-weight": "text-weight",
  "font-style": "text-style",
  "text-transform": "text-case",
  "white-space": "text-whitespace",
  color: "text-color",

  "background-position": "background-align",
  "background-size": "background-fit",

  "clip-path": "clip",

  "mix-blend-mode": "blend",

  "box-shadow": "shadow",

  "transform-origin": "pivot",

  "transition-timing-function": "transition-easing",

  "animation-timing-function": "animation-easing",
  "animation-iteration-count": "animation-iterations",
  "animation-fill-mode": "animation-fill",

  "anchor-name": "anchor-id",
  "position-anchor": "anchor-to",
  "position-area": "anchor-placement",
  "inset-area": "anchor-placement",
  "anchor-scope": "anchor-bounds",
  "position-try": "anchor-try",
  "position-try-fallbacks": "anchor-try-fallbacks",
  "position-try-order": "anchor-try-order",
  "position-visibility": "anchor-visibility",
};

export const SPARKLE_TO_CSS_NAME_MAP = Object.fromEntries(
  Object.entries(CSS_ALIASES).map(([key, value]) => [value, key]),
);
