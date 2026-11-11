import { holds, LibrarySelection } from "./librarySelection";
import workspace from "./WorkspaceStore";

export default new LibrarySelection({
  exists: (path) => holds(workspace.assetListing.value, path),
});
