import { NavigationSetBackgroundColorAction } from "./actions/navigationSetBackgroundColorAction";
import { NavigationSetElevationAction } from "./actions/navigationSetElevationAction";
import { NavigationSetLinksAction } from "./actions/navigationSetLinksAction";
import { NavigationSetSearchbarAction } from "./actions/navigationSetSearchbarAction";
import { NavigationSetTextAction } from "./actions/navigationSetTextAction";
import { NavigationSetTransitioningAction } from "./actions/navigationSetTransitioningAction";
import { NavigationSetTypeAction } from "./actions/navigationSetTypeAction";

export type NavigationAction =
  | NavigationSetTransitioningAction
  | NavigationSetTextAction
  | NavigationSetLinksAction
  | NavigationSetSearchbarAction
  | NavigationSetElevationAction
  | NavigationSetBackgroundColorAction
  | NavigationSetTypeAction;
