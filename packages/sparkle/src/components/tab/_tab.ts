import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./tab.css";

export default spec({
  tag: "s-tab",
  props: {
    ripple: null as string | null,
    icon: null as string | null,
    activeIcon: null as string | null,
  },
  html: ({ props }) => {
    const { icon, activeIcon, ripple } = props;
    const iconName = icon;
    const activeIconName = activeIcon || icon;
    const rippleAttr = ripple ? () => html`animation="${ripple}"` : "";
    const iconComponent = () =>
      iconName ? html`<s-icon name="${iconName}"></s-icon>` : "";
    const activeIconComponent = () =>
      activeIconName ? html`<s-icon name="${activeIconName}"></s-icon>` : "";
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
        <div class="inactive-icon" part="inactive-icon">${iconComponent}</div>
        <div class="active-icon" part="active-icon">${activeIconComponent}</div>
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
