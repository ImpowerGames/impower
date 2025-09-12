import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./button.css";

export default spec({
  tag: "s-button",
  props: {
    type: null as string | null,
    href: null as string | null,
    accept: null as string | null,
    multiple: null as string | null,
    icon: null as string | null,
    disableRipple: false,
    activeIcon: null as string | null,
    variant: null as string | null,
  },
  html: ({ props }) => {
    const {
      type,
      href,
      accept,
      multiple,
      icon,
      activeIcon,
      variant,
      disableRipple,
    } = props;
    const isLink = type === "a" || type === "link" || href;
    const isLabel = type === "label" || type === "file";
    const isDiv = type === "div" || type === "container";
    const isToggle = type === "toggle";
    const tag = isLink ? "a" : isLabel ? "label" : isDiv ? "div" : "button";
    const rippleAttr = disableRipple ? () => html`animation="none"` : "";
    const acceptAttr = accept ? () => html`accept="${accept}"` : "";
    const multipleAttr = multiple != null ? `multiple` : "";
    const roleAttr = isToggle ? () => html`role="checkbox"` : "";
    const normalIconComponent = () =>
      icon
        ? html`<div class="normal-icon" part="normal-icon">
            <s-icon name="${icon}"></s-icon>
          </div>`
        : "";
    const activeIconComponent = () =>
      activeIcon
        ? html`<div class="active-icon" part="active-icon">
            <s-icon name="${activeIcon}"></s-icon>
          </div>`
        : "";
    const iconComponent = () =>
      icon || activeIcon
        ? html`<div class="icon" part="icon">
            ${normalIconComponent}${activeIconComponent}
          </div>`
        : "";
    const labelComponent = () =>
      variant === "icon" ? "" : html`<slot class="label" part="label"></slot>`;
    const inputButtonComponent = () =>
      type === "file" ? html` <button class="input-button"></button>` : "";
    const inputComponent = () =>
      type === "file"
        ? html`
            <input id="input" type="${type}" ${acceptAttr} ${multipleAttr} />
          `
        : "";
    return html`
    <${tag} class="root" part="root" ${roleAttr}>
    ${inputButtonComponent}
    <s-ripple class="ripple" part="ripple" ${rippleAttr}></s-ripple>
    ${iconComponent}
    ${labelComponent}
    ${inputComponent}
  </${tag}>
    `;
  },
  selectors: {
    input: null,
    ripple: "s-ripple",
    icon: ".icon",
    label: ".label",
    spinner: ".spinner",
  } as const,
  css: [...sharedCSS, css],
});
