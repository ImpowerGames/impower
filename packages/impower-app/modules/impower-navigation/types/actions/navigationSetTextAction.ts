export const NAVIGATION_SET_TEXT = "@impower/navigation/SET_TEXT";
export interface NavigationSetTextAction {
  type: typeof NAVIGATION_SET_TEXT;
  payload: {
    title: string;
    secondaryTitle: string;
    subtitle: string;
  };
}
