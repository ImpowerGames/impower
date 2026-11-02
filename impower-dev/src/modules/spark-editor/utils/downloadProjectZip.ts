import { downloadFile } from "./downloadFile";

export const downloadProjectZip = async (): Promise<boolean> => {
  const { Workspace } = await import("../workspace/Workspace");
  const zip = await Workspace.window.exportLocalProject();
  if (!zip) {
    return false;
  }
  const name = Workspace.window.store.project.name;
  downloadFile(`${name}.zip`, "application/x-zip", zip);
  return true;
};
