import { render } from "preact";
import NameRow from "../../src/modules/spark-editor/components/library-page/NameRow";
import { FolderIcon } from "@impower/impower-ui/components";

declare global {
  interface Window {
    nameRow: { mount: () => void };
  }
}

window.nameRow = {
  mount: () => {
    const host = document.body.appendChild(document.createElement("div"));
    host.id = "host";
    render(
      <div role="list">
        <NameRow icon={<FolderIcon />} label="New folder name" onCommit={async () => {}} onCancel={() => {}} />
      </div>,
      host,
    );
  },
};
