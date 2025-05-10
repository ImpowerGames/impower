const CSS_ALIASES = {
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

  top: "inset-top",
  right: "inset-right",
  bottom: "inset-bottom",
  left: "inset-left",

  "flex-direction": "child-layout",

  "grid-template-columns": "child-columns",

  gap: "child-gap",
  "align-items": "child-align",
  "justify-content": "child-justify",
  "flex-wrap": "child-overflow",

  "align-self": "self-align",

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
};

export const SPARKLE_TO_CSS_NAME_MAP = Object.fromEntries(
  Object.entries(CSS_ALIASES).map(([key, value]) => [value, key])
);

export const STYLE_ALIASES = {
  c: "corner",
  "c-tl": "corner-top-left",
  "c-tr": "corner-top-right",
  "c-br": "corner-bottom-right",
  "c-bl": "corner-bottom-left",

  "o-width": "outline-width",
  "o-color": "outline-color",
  "o-style": "outline-style",

  "b-width": "border-width",
  "b-width-t": "border-width-top",
  "b-width-r": "border-width-right",
  "b-width-b": "border-width-bottom",
  "b-width-l": "border-width-left",
  "b-color": "border-color",
  "b-color-t": "border-color-top",
  "b-color-r": "border-color-right",
  "b-color-b": "border-color-bottom",
  "b-color-l": "border-color-left",
  "b-style": "border-style",
  "b-style-t": "border-style-top",
  "b-style-r": "border-style-right",
  "b-style-b": "border-style-bottom",
  "b-style-l": "border-style-left",

  i: "inset",
  "i-t": "inset-top",
  "i-r": "inset-right",
  "i-b": "inset-bottom",
  "i-l": "inset-left",

  m: "margin",
  "m-t": "margin-top",
  "m-r": "margin-right",
  "m-b": "margin-bottom",
  "m-l": "margin-left",

  p: "padding",
  "p-t": "padding-top",
  "p-r": "padding-right",
  "p-b": "padding-bottom",
  "p-l": "padding-left",

  w: "width",
  "w-min": "width-min",
  "w-max": "width-max",

  h: "height",
  "h-min": "height-min",
  "h-max": "height-max",

  "bg-color": "background-color",
  "bg-image": "background-image",
  "bg-repeat": "background-repeat",
  "bg-align": "background-align",
  "bg-fit": "background-fit",

  /** CSS PROPERTY ALIASES */
  ...CSS_ALIASES,
} as const;
