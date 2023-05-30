export const NAVIGATION_SET_TYPE = "@impower/navigation/NAVIGATION_SET_TYPE";
export interface NavigationSetTypeAction {
  type: typeof NAVIGATION_SET_TYPE;
  payload: {
    type: "page" | "studio" | "none";
  };
}
