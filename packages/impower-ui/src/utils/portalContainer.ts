export const portalContainer = (): HTMLElement | undefined =>
  typeof document === "undefined"
    ? undefined
    : ((document.fullscreenElement as HTMLElement | null) ?? undefined);
