import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";
import { shellWindow } from "../shellWindow";

export const Workspace = {
  sync: { google: { getCurrentAccount: async () => null } },
  window: shellWindow(() => workspace, {
    openOutlineLocation: async () => {},
    setOutlineSceneCollapsed: () => {},
  }),
};
