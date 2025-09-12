import { Component } from "../../../../../../packages/spec-component/src/component";
import getValidFileName from "../../utils/getValidFileName";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_file-upload-button";

export default class FileAddButton extends Component(spec) {
  override onConnected() {
    this.refs.button.addEventListener("change", this.handleInputChange);
  }

  override onDisconnected() {
    this.refs.button.removeEventListener("change", this.handleInputChange);
  }

  handleInputChange = async (e: Event) => {
    const event = e as Event & {
      target: HTMLInputElement & EventTarget;
    };
    const fileList = event.target.files;
    if (fileList) {
      this.upload(fileList);
    }
  };

  async upload(fileList: FileList) {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      if (fileList) {
        const files = await Promise.all(
          Array.from(fileList).map(async (file) => {
            const validFileName = getValidFileName(file.name);
            const data = await file.arrayBuffer();
            return {
              uri: Workspace.fs.getFileUri(projectId, validFileName),
              data,
            };
          })
        );
        await Workspace.fs.createFiles({
          files,
        });
        await Workspace.window.recordAssetChange();
      }
    }
  }

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
