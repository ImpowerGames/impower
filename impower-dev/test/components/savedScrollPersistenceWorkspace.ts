export const Workspace = {
  window: {
    setListState: (lists: never) => window.persistencePage.opened.setListState(lists),
    persistNow: () => window.persistencePage.opened.persistNow(),
  },
};
