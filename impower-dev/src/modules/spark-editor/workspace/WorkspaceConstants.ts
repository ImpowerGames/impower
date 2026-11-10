export class WorkspaceConstants {
  static readonly LOCAL_PROJECT_ID = "local";
  static readonly DEFAULT_PROJECT_NAME = "Untitled story";
  static readonly LOADED_PROJECT_STORAGE_KEY = "project";
  static readonly WORKSPACE_STATE_STORAGE_KEY_PREFIX = "workspace/";
  static readonly ROUTE_TOGGLES_STORAGE_KEY = "preferences/routeToggles";
  static readonly ROUTE_TAB_STORAGE_KEY = "preferences/routeTab";
  static readonly PREVIEW_STRIP_HEIGHT = {
    default: 280,
    min: 200,
    collapsed: 48,
    reserve: 240,
  } as const;
}
