if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

if (!(globalThis as { Worker?: unknown }).Worker) {
  (globalThis as { Worker?: unknown }).Worker = class {
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
  };
}
