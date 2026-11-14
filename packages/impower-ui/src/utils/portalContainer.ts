export const portalContainer = (): HTMLElement | undefined =>
  typeof document === "undefined"
    ? undefined
    : ((document.fullscreenElement as HTMLElement | null) ??
      document.querySelector<HTMLElement>("dialog[data-portal-host][open]") ??
      undefined);
