import { NavigationHideBannerAction } from "./actions/navigationHideBannerAction";
import { NavigationSetBackgroundColorAction } from "./actions/navigationSetBackgroundColorAction";
import { NavigationSetElevationAction } from "./actions/navigationSetElevationAction";
import { NavigationSetLinksAction } from "./actions/navigationSetLinksAction";
import { NavigationSetSearchbarAction } from "./actions/navigationSetSearchbarAction";
import { NavigationSetTextAction } from "./actions/navigationSetTextAction";
import { NavigationSetTypeAction } from "./actions/navigationSetTypeAction";
import { NavigationShowBannerAction } from "./actions/navigationShowBannerAction";

export type NavigationAction =
  | NavigationSetTextAction
  | NavigationSetLinksAction
  | NavigationSetSearchbarAction
  | NavigationSetElevationAction
  | NavigationSetBackgroundColorAction
  | NavigationShowBannerAction
  | NavigationHideBannerAction
  | NavigationSetTypeAction;
