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
    activeIcon: null as string | null,
  },
  html: ({ props }) => {
    const { type, href, accept, multiple, icon, activeIcon } = props;
    const isLink = type === "a" || type === "link" || href;
    const isLabel = type === "label" || type === "file";
    const isDiv = type === "div" || type === "container";
    const isToggle = type === "toggle";
    const tag = isLink ? "a" : isLabel ? "label" : isDiv ? "div" : "button";
    const iconName = icon;
    const activeIconName = activeIcon || icon;
    const normalIconComponent = () =>
      iconName ? html`<s-icon name="${iconName}"></s-icon>` : "";
    const activeIconComponent = () =>
      activeIconName ? html`<s-icon name="${activeIconName}"></s-icon>` : "";
    const iconComponent = () =>
      iconName || activeIconName
        ? html` <div class="icon" part="icon">
            <div class="inactive-icon" part="inactive-icon">
              ${normalIconComponent}
            </div>
            <div class="active-icon" part="active-icon">
              ${activeIconComponent}
            </div>
          </div>`
        : "";
    return html`
    <${tag} class="root" part="root" ${isToggle ? `role="checkbox"` : ""}>
    <div class="ripple" part="ripple">
      <s-ripple id="ripple"></s-ripple>
    </div>
    ${iconComponent}
    <div class="label" part="label">
      <slot></slot>
    </div>
    ${
      type === "file"
        ? () => html`
            <input
              id="input"
              type="${type}"
              ${accept ? `accept="${accept}"` : ""}
              ${multiple != null ? `multiple` : ""}
            />
          `
        : ""
    }
  </${tag}>
    `;
  },
  selectors: {
    input: null,
    ripple: "s-ripple",
    badge: "s-badge",
    icon: ".icon",
    label: ".label",
    spinner: ".spinner",
  } as const,
  css: [...sharedCSS, css],
});
