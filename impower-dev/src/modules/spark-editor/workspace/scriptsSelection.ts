import { holds, LibrarySelection } from "./librarySelection";
import { MAIN_SCRIPT } from "./scriptsListing";
import workspace from "./WorkspaceStore";

export default new LibrarySelection({
  exists: (path) => holds(workspace.scriptListing.value, path),
  fixed: (path) => path === MAIN_SCRIPT,
});
