import type { RouteIcon, RouteKind } from "./routeView";

/** The icons of the route's kinds and states, 16 by 16, drawn in the text's
 *  colour so each takes the colour its place gives it. */
export function RouteIconSvg({ icon }: { icon: RouteKind | NonNullable<RouteIcon> }) {
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
          {/* The way taken bends off; the dotted stub is the way the game
              would go. */}
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
      ) : icon === "auto" ? (
        <>
          <path d="M6 4h7M6 8h7M6 12h7" />
          <circle cx="3" cy="4" r="0.6" fill="currentColor" />
          <circle cx="3" cy="8" r="0.6" fill="currentColor" />
          <circle cx="3" cy="12" r="0.6" fill="currentColor" />
        </>
      ) : icon === "pinned" ? (
        <>
          <path d="M6 2h4l-.5 4 2.5 2.5H4L6.5 6z" />
          <path d="M8 8.5V14" />
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
