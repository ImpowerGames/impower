import { downloadFile } from "./downloadFile";

export const downloadProjectZip = async (): Promise<boolean> => {
  const { Workspace } = await import("../workspace/Workspace");
  const exported = await Workspace.window.backUpProject(async () => {
    const project = await Workspace.window.exportLocalProject();
    if (!project) {
      return null;
    }
    const name = Workspace.window.store.project.name;
    downloadFile(`${name}.zip`, "application/x-zip", project.zip);
    return project;
  });
  return !!exported;
};
