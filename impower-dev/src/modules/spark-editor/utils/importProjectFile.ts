export const importProjectFile = async (
  input: HTMLInputElement,
): Promise<void> => {
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  const { Workspace } = await import("../workspace/Workspace");
  const buffer = await file.arrayBuffer();
  await Workspace.window.importLocalProject(file.name, buffer);
  input.value = "";
};
