export const NAVIGATION_SET_BACKGROUND_COLOR =
  "@impower/navigation/SET_BACKGROUND_COLOR";
export interface NavigationSetBackgroundColorAction {
  type: typeof NAVIGATION_SET_BACKGROUND_COLOR;
  payload: {
    backgroundColor?: string;
  };
}
