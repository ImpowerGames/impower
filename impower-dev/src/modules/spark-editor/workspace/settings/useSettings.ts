import workspaceSettings from "./WorkspaceSettings";

export const useSettings = () => ({
  preferences: workspaceSettings.preferences.value,
  projectSettings: workspaceSettings.projectSettings.value,
  setPreference: workspaceSettings.setPreference,
  setProjectSetting: workspaceSettings.setProjectSetting,
});
