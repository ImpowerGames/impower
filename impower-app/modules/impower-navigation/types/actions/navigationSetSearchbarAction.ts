export const NAVIGATION_SET_SEARCHBAR =
  "@impower/navigation/NAVIGATION_SET_SEARCHBAR";
export interface NavigationSetSearchbarAction {
  type: typeof NAVIGATION_SET_SEARCHBAR;
  payload: {
    search?: {
      label?: string;
      placeholder?: string;
    };
  };
}
