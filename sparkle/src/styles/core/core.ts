import core from "./core.css";

export const LIGHT_DOM_CORE_CSS = new CSSStyleSheet();
LIGHT_DOM_CORE_CSS.replaceSync(core);

export const SHADOW_DOM_CORE_CSS = new CSSStyleSheet();
const hostWrappedStyles = core.replace(/(\n\s*)(.+)(\s+[>])/g, `$1:host($2)$3`);
SHADOW_DOM_CORE_CSS.replaceSync(hostWrappedStyles);
