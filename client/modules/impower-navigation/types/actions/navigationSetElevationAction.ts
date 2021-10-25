export const NAVIGATION_SET_ELEVATION = "@impower/navigation/SET_ELEVATION";
export interface NavigationSetElevationAction {
  type: typeof NAVIGATION_SET_ELEVATION;
  payload: {
    elevation?: number;
  };
}
