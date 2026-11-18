import { render } from "preact";
import ScriptsPage from "../../src/modules/spark-editor/components/scripts-page";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const facts = { modified: 1, size: 10 };

let folder = "Scripts";

const listing = (names: readonly string[]) => ({
  projectId: "p",
  files: Object.fromEntries([["main.sd", facts], ...names.map((name) => [`${folder}/${name}.sd`, facts])]),
  folders: folder === "Scripts" ? ["Scripts"] : ["Scripts", folder],
});

const NAMES = Array.from({ length: 120 }, (_, index) => `scene_${String(index).padStart(3, "0")}`);

type Setup = { folder?: string; lists?: Record<string, unknown> };

declare global {
  interface Window {
    scriptsPage: { mount: (setup?: Setup) => void; insert: (name: string) => void; lists: () => Record<string, unknown> };
  }
}

window.scriptsPage = {
  mount: ({ folder: inside = "Scripts", lists = {} } = {}) => {
    folder = inside;
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: "p" },
      lists: { ...workspace.current.lists, scriptsFolder: folder, scriptsTab: "files", ...lists },
    };
    workspace.scriptListing.value = listing(NAMES);
    workspace.scriptReferences.value = [];
    const host = document.body.appendChild(document.createElement("div"));
    host.className = "flex h-screen flex-col";
    render(<ScriptsPage />, host);
  },
  insert: (name) => {
    workspace.scriptListing.value = listing([...NAMES, name]);
  },
  lists: () => ({ ...workspace.current.lists }),
};
