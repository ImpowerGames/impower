export const storageLeft = async (): Promise<number | null> => {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate?.quota != null && estimate.usage != null ? Math.max(0, estimate.quota - estimate.usage) : null;
  } catch {
    return null;
  }
};
