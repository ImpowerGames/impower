import { iconMasks } from "@impower/impower-ui/icon-masks";
import type { RouteIcon, RouteKind } from "./routeView";

export function RouteIconSvg({
  icon,
}: {
  icon: RouteKind | NonNullable<RouteIcon> | "sliders" | "warning" | "error";
}) {
  if (icon === "auto" || icon === "pinned") {
    return (
      <span
        class="route-icon route-icon-mask"
        data-icon={icon}
        aria-hidden="true"
        style={{ "--route-icon-mask": iconMasks[icon === "pinned" ? "pin-fill" : "pin"] }}
      />
    );
  }
  return (
    <svg
      class="route-icon"
      data-icon={icon}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {icon === "forced" ? (
        <>
          <path d="M4 14V9a3 3 0 0 1 3-3h6" />
          <path d="M10.5 3.5 13 6l-2.5 2.5" />
          <path d="M4 6.5V2" stroke-dasharray="1 2" />
        </>
      ) : icon === "clipped" ? (
        <>
          <circle cx="4.5" cy="11.5" r="2" />
          <circle cx="11.5" cy="11.5" r="2" />
          <path d="M5.8 10 12 2.5M10.2 10 4 2.5" />
        </>
      ) : icon === "sliders" ? (
        <>
          <path d="M2 4.5h6.5M11.5 4.5H14M2 11.5h2.5M7.5 11.5H14" />
          <circle cx="10" cy="4.5" r="1.5" />
          <circle cx="6" cy="11.5" r="1.5" />
        </>
      ) : icon === "error" ? (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.8v3.8" />
          <circle cx="8" cy="11" r="0.5" fill="currentColor" />
        </>
      ) : (
        <>
          <path d="M8 2 14.5 13.5h-13z" />
          <path d="M8 6.5v3.5" />
          <circle cx="8" cy="12" r="0.5" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
