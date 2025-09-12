import { Component } from "../../../../../../packages/spec-component/src/component";
import getUniqueFileName from "../../utils/getUniqueFileName";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_file-add-button";

export default class FileAddButton extends Component(spec) {
  override onConnected() {
    this.addEventListener("click", this.handleClick);
  }

  override onDisconnected() {
    this.removeEventListener("click", this.handleClick);
  }

  handleClick = async (e: MouseEvent) => {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      const files = await Workspace.fs.getFiles(projectId);
      const fileUris = Object.keys(files);
      const filenames = fileUris.map((uri) => Workspace.fs.getFilename(uri));
      const filename = this.filename;
      if (filename) {
        const uniqueFileName = getUniqueFileName(filenames, filename);
        await Workspace.fs.createFiles({
          files: [
            {
              uri: Workspace.fs.getFileUri(projectId, uniqueFileName),
              data: new ArrayBuffer(0),
            },
          ],
        });
        await Workspace.window.recordScriptChange();
      }
    }
  };

  override onInit() {
    this.setup();
  }

  override onStoreUpdate() {
    this.setup();
  }

  setup() {
    const store = this.stores.workspace.current;
    const syncStatus = store?.sync?.status;
    if (
      syncStatus === "syncing" ||
      syncStatus === "loading" ||
      syncStatus === "importing" ||
      syncStatus === "exporting"
    ) {
      this.refs.button.setAttribute("disabled", "");
    } else {
      this.refs.button.removeAttribute("disabled");
    }
  }
}
