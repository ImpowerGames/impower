export const NAVIGATION_SET_TRANSITIONING =
  "@impower/navigation/SET_TRANSITIONING";
export interface NavigationSetTransitioningAction {
  type: typeof NAVIGATION_SET_TRANSITIONING;
  payload: {
    transitioning?: boolean;
  };
}
