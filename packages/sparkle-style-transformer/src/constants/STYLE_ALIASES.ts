const STYLE_ALIASES = {
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
} as const;

export default STYLE_ALIASES;
