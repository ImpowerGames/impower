import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./tab.css";

export default spec({
  tag: "s-tab",
  props: {
    disableRipple: false,
    icon: null as string | null,
    activeIcon: null as string | null,
  },
  html: ({ props }) => {
    const { icon, activeIcon, disableRipple } = props;
    const rippleAttr = disableRipple ? () => html`animation="none"` : "";
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
    return html`<button
      class="root"
      part="root"
      type="button"
      role="tab"
      tabindex="-1"
      aria-selected="false"
    >
      <s-ripple class="ripple" part="ripple" ${rippleAttr}></s-ripple>
      <div class="icon" part="icon">
        ${normalIconComponent}${activeIconComponent}
      </div>
      <slot class="label" part="label"></slot>
    </button>`;
  },
  selectors: {
    ripple: "s-ripple",
    label: ".label",
    icon: ".icon",
    inactiveIcon: ".inactive-icon",
    activeIcon: ".active-icon",
  } as const,
  css: [...sharedCSS, css],
});
