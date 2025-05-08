const STYLE_ALIASES = {
  c: "corner",
  "c-tl": "corner-tl",
  "c-tr": "corner-tr",
  "c-br": "corner-br",
  "c-bl": "corner-bl",

  "o-width": "outline-width",
  "o-color": "outline-color",
  "o-style": "outline-style",

  "b-width": "border-width",
  "b-width-t": "border-width-t",
  "b-width-r": "border-width-r",
  "b-width-b": "border-width-b",
  "b-width-l": "border-width-l",
  "b-color": "border-color",
  "b-color-t": "border-color-t",
  "b-color-r": "border-color-r",
  "b-color-b": "border-color-b",
  "b-color-l": "border-color-l",
  "b-style": "border-style",
  "b-style-t": "border-style-t",
  "b-style-r": "border-style-r",
  "b-style-b": "border-style-b",
  "b-style-l": "border-style-l",

  i: "inset",
  "i-t": "inset-t",
  "i-r": "inset-r",
  "i-b": "inset-b",
  "i-l": "inset-l",

  m: "margin",
  "m-t": "margin-t",
  "m-r": "margin-r",
  "m-b": "margin-b",
  "m-l": "margin-l",

  p: "padding",
  "p-t": "padding-t",
  "p-r": "padding-r",
  "p-b": "padding-b",
  "p-l": "padding-l",

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
