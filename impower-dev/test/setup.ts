// jsdom lacks matchMedia; WorkspaceWindow's constructor reads it to pick the
// initial responsive layout. Provide a minimal stub (desktop, no listeners).
if (!window.matchMedia) {
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

// jsdom has no Worker; nothing under test instantiates one (the Workspace
// singleton, which would, is mocked), but stub it so an accidental import
// doesn't throw.
if (!(globalThis as { Worker?: unknown }).Worker) {
  (globalThis as { Worker?: unknown }).Worker = class {
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
  };
}
