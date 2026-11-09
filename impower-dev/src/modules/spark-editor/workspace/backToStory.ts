export const backToStory = async () => {
  const { Workspace } = await import("./Workspace");
  Workspace.window.navigateTo("write");
};
