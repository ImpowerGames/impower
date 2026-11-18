import { render } from "preact";
import ScriptsPage from "../../src/modules/spark-editor/components/scripts-page";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const facts = { modified: 1, size: 10 };

const listing = (names: readonly string[]) => ({
  projectId: "p",
  files: Object.fromEntries([["main.sd", facts], ...names.map((name) => [`Scripts/${name}.sd`, facts])]),
  folders: ["Scripts"],
});

const NAMES = Array.from({ length: 120 }, (_, index) => `scene_${String(index).padStart(3, "0")}`);

declare global {
  interface Window {
    scriptsPage: { mount: () => void; insert: (name: string) => void };
  }
}

window.scriptsPage = {
  mount: () => {
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: "p" },
      lists: { ...workspace.current.lists, scriptsFolder: "Scripts", scriptsTab: "files" },
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
};
