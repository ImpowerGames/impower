export const CSS_UTILITIES = {
  display: {
    "": { display: "" },
  },

  position: {
    "": { position: "" },
    "sticky-top": { inset: "0 0 auto 0", "z-index": "1" },
    "sticky-bottom": { inset: "auto 0 0 0", "z-index": "1" },
    "sticky-left": { inset: "0 auto 0 0", "z-index": "1" },
    "sticky-right": { inset: "0 0 0 auto", "z-index": "1" },
    "fixed-top": { inset: "0 0 auto 0", "z-index": "1" },
    "fixed-bottom": { inset: "auto 0 0 0", "z-index": "1" },
    "fixed-left": { inset: "0 auto 0 0", "z-index": "1" },
    "fixed-right": { inset: "0 0 0 auto", "z-index": "1" },
  },

  aspect: {
    "": { "aspect-ratio": "" },
  },

  overflow: {
    "": { overflow: "" },
  },
  "overflow-x": {
    "": { "overflow-x": "" },
  },
  "overflow-y": {
    "": { "overflow-y": "" },
  },

  z: {
    "": { "z-index": "" },
  },

  width: {
    "": { width: "" },
  },
  "width-min": {
    "": { "min-width": "" },
  },
  "width-max": {
    "": { "max-width": "" },
  },

  height: {
    "": { height: "" },
  },
  "height-min": {
    "": { "min-height": "" },
  },
  "height-max": {
    "": { "max-height": "" },
  },

  corner: {
    "": { "border-radius": "" },
  },
  "corner-top-left": {
    "": { "border-top-left-radius": "" },
  },
  "corner-top-right": {
    "": { "border-top-right-radius": "" },
  },
  "corner-bottom-left": {
    "": { "border-bottom-left-radius": "" },
  },
  "corner-bottom-right": {
    "": { "border-bottom-right-radius": "" },
  },

  "outline-color": {
    "": { "outline-color": "" },
  },
  "outline-width": {
    "": { "outline-width": "" },
  },
  "outline-style": {
    "": { "outline-style": "" },
  },

  "border-color": {
    "": { "border-color": "" },
  },
  "border-color-top": {
    "": { "border-top-color": "" },
  },
  "border-color-bottom": {
    "": { "border-bottom-color": "" },
  },
  "border-color-left": {
    "": { "border-left-color": "" },
  },
  "border-color-right": {
    "": { "border-right-color": "" },
  },

  "border-width": {
    "": { "border-width": "" },
  },
  "border-width-top": {
    "": { "border-top-width": "" },
  },
  "border-width-bottom": {
    "": { "border-bottom-width": "" },
  },
  "border-width-left": {
    "": { "border-left-width": "" },
  },
  "border-width-right": {
    "": { "border-right-width": "" },
  },

  "border-style": {
    "": { "border-style": "" },
  },
  "border-style-top": {
    "": { "border-top-style": "" },
  },
  "border-style-bottom": {
    "": { "border-bottom-style": "" },
  },
  "border-style-left": {
    "": { "border-left-style": "" },
  },
  "border-style-right": {
    "": { "border-right-style": "" },
  },

  inset: {
    "": { inset: "" },
  },
  "inset-top": {
    "": { top: "" },
  },
  "inset-bottom": {
    "": { bottom: "" },
  },
  "inset-left": {
    "": { left: "" },
  },
  "inset-right": {
    "": { right: "" },
  },

  margin: {
    "": { margin: "" },
  },
  "margin-top": {
    "": { "margin-top": "" },
  },
  "margin-bottom": {
    "": { "margin-bottom": "" },
  },
  "margin-left": {
    "": { "margin-left": "" },
  },
  "margin-right": {
    "": { "margin-right": "" },
  },

  padding: {
    "": { padding: "" },
  },
  "padding-top": {
    "": { "padding-top": "" },
  },
  "padding-bottom": {
    "": { "padding-bottom": "" },
  },
  "padding-left": {
    "": { "padding-left": "" },
  },
  "padding-right": {
    "": { "padding-right": "" },
  },

  "child-layout": {
    row: { display: "flex", "flex-direction": "row" },
    column: { display: "flex", "flex-direction": "column" },
    grid: { display: "grid" },
  },

  "child-columns": {
    "": { "grid-template-columns": "", display: "grid" },
  },

  "child-gap": {
    "": { gap: "" },
  },
  "child-align": {
    "": { "align-items": "" },
  },
  "child-justify": {
    "": { "justify-content": "" },
  },
  "child-overflow": {
    "": { "flex-wrap": "" },
  },

  "self-align": {
    "": { "align-self": "" },
  },

  flex: {
    "": { flex: "" },
  },

  grow: {
    "": { "flex-grow": "" },
  },

  shrink: {
    "": { "flex-shrink": "" },
  },

  order: {
    "": { order: "" },
  },

  fill: {
    "": { fill: "" },
  },
  stroke: {
    "": { stroke: "" },
  },
  "stroke-width": {
    "": { "stroke-width": "" },
  },

  visible: {
    "": { visibility: "" },
  },
  interactable: {
    "": { "pointer-events": "" },
    none: { cursor: "default" },
  },
  selectable: {
    "": { "user-select": "" },
    auto: { cursor: "text" },
    all: { cursor: "text" },
    text: { cursor: "text" },
  },

  cursor: {
    "": { cursor: "" },
  },

  "text-font": {
    "": { "font-family": "" },
  },

  "text-size": {
    "": { "font-size": "" },
    "2xs": { "line-height": "var(---theme-text-2xs-line-height, 1.5)" },
    xs: { "line-height": "var(---theme-text-xs-line-height, 1.5)" },
    sm: { "line-height": "var(---theme-text-sm-line-height, 1.5)" },
    md: { "line-height": "var(---theme-text-md-line-height, 1.5)" },
    lg: { "line-height": "var(---theme-text-lg-line-height, 1.5)" },
    xl: { "line-height": "var(---theme-text-xl-line-height, 1.5)" },
    "2xl": { "line-height": "var(---theme-text-2xl-line-height, 1.5)" },
    "3xl": { "line-height": "var(---theme-text-3xl-line-height, 1.5)" },
    "4xl": { "line-height": "var(---theme-text-4xl-line-height, 1.5)" },
    "5xl": { "line-height": "var(---theme-text-5xl-line-height, 1.5)" },
    "6xl": { "line-height": "var(---theme-text-6xl-line-height, 1.5)" },
    "7xl": { "line-height": "var(---theme-text-7xl-line-height, 1.5)" },
    "8xl": { "line-height": "var(---theme-text-8xl-line-height, 1.5)" },
    "9xl": { "line-height": "var(---theme-text-9xl-line-height, 1.5)" },
  },

  "text-leading": {
    "": { "line-height": "" },
  },

  "text-tracking": {
    "": { "letter-spacing": "" },
  },

  "text-weight": {
    "": { "font-weight": "" },
  },

  "text-style": {
    "": { "font-style": "" },
  },

  "text-decoration-line": {
    "": { "text-decoration-line": "" },
  },
  "text-decoration-color": {
    "": { "text-decoration-color": "" },
  },
  "text-decoration-thickness": {
    "": { "text-decoration-thickness": "" },
  },
  "text-underline-offset": {
    "": { "text-underline-offset": "" },
  },

  "text-case": {
    "": { "text-transform": "" },
  },

  "text-align": {
    "": { "text-align": "" },
  },

  "text-overflow": {
    "": { "text-overflow": "" },
    wrap: { "white-space": "break-spaces" },
    visible: { "white-space": "nowrap" },
    clip: { "white-space": "nowrap" },
    ellipsis: { overflow: "hidden", "white-space": "nowrap" },
  },

  "text-whitespace": {
    "": { "white-space": "" },
  },

  "text-color": {
    "": { color: "" },
  },

  "text-stroke": {
    "": { "text-shadow": "" },
  },

  "background-color": {
    "": { "background-color": "" },
  },
  "background-image": {
    "": { "background-image": "" },
  },
  "background-repeat": {
    "": { "background-repeat": "" },
  },
  "background-align": {
    "": { "background-position": "" },
  },
  "background-fit": {
    "": { "background-size": "" },
  },

  clip: {
    "": { "clip-path": "" },
  },

  filter: {
    "": { filter: "" },
  },
  "backdrop-filter": {
    "": { "backdrop-filter": "" },
  },

  blend: {
    "": { "mix-blend-mode": "" },
  },

  shadow: {
    "": { "box-shadow": "" },
  },
  "shadow-inset": {
    "": { "box-shadow": "" },
  },
  glow: {
    "": { "box-shadow": "" },
  },
  ring: {
    "": { "box-shadow": "" },
  },

  opacity: {
    "": { opacity: "" },
  },

  translate: {
    "": { translate: "" },
  },

  rotate: {
    "": { rotate: "" },
  },

  scale: {
    "": { scale: "" },
  },

  pivot: {
    "": { "transform-origin": "" },
  },

  "transition-delay": {
    "": { "transition-delay": "" },
  },
  "transition-duration": {
    "": { "transition-duration": "" },
  },
  "transition-easing": {
    "": { "transition-timing-function": "" },
  },

  "animation-delay": {
    "": { "animation-delay": "" },
  },
  "animation-duration": {
    "": { "animation-duration": "" },
  },
  "animation-easing": {
    "": { "animation-timing-function": "" },
  },
  "animation-iterations": {
    "": { "animation-iteration-count": "" },
  },
  "animation-direction": {
    "": { "animation-direction": "" },
  },
  "animation-fill": {
    "": { "animation-fill-mode": "" },
  },

  animation: {
    "": { animation: "" },
  },

  mask: {
    "": { mask: "" },
  },

  "content-visibility": {
    "": { "content-visibility": "" },
  },
  "contain-intrinsic-size": {
    "": { "contain-intrinsic-size": "" },
  },

  "fill-color": {
    "": { "---fill-color": "" },
  },
  "track-color": {
    "": { "---track-color": "" },
  },
  "thumb-background-color": {
    "": { "---thumb-background-color": "" },
  },
  "thumb-border-color": {
    "": { "---thumb-border-color": "" },
  },
  "thumb-size": {
    "": { "---thumb-size": "" },
  },
} as const;
