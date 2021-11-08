import { NAVIGATION_HIDE_BANNER } from "./actions/navigationHideBannerAction";
import { NAVIGATION_SET_BACKGROUND_COLOR } from "./actions/navigationSetBackgroundColorAction";
import { NAVIGATION_SET_ELEVATION } from "./actions/navigationSetElevationAction";
import { NAVIGATION_SET_LINKS } from "./actions/navigationSetLinksAction";
import { NAVIGATION_SET_SEARCHBAR } from "./actions/navigationSetSearchbarAction";
import { NAVIGATION_SET_TEXT } from "./actions/navigationSetTextAction";
import { NAVIGATION_SET_TRANSITIONING } from "./actions/navigationSetTransitioningAction";
import { NAVIGATION_SET_TYPE } from "./actions/navigationSetTypeAction";
import { NAVIGATION_SHOW_BANNER } from "./actions/navigationShowBannerAction";
import { NavigationAction } from "./navigationActions";
import { NavigationState } from "./navigationState";

export const navigationReducer = (
  state: NavigationState,
  action: NavigationAction
): NavigationState => {
  switch (action.type) {
    case NAVIGATION_SET_TRANSITIONING: {
      const { transitioning } = action.payload;
      return {
        ...state,
        transitioning,
      };
    }
    case NAVIGATION_SET_TEXT: {
      const { title, secondaryTitle, subtitle } = action.payload;
      return {
        ...state,
        title,
        secondaryTitle,
        subtitle,
      };
    }
    case NAVIGATION_SET_LINKS: {
      const { links } = action.payload;
      return {
        ...state,
        links,
      };
    }
    case NAVIGATION_SET_SEARCHBAR: {
      const { search } = action.payload;
      return {
        ...state,
        search: search
          ? {
              ...state.search,
              ...search,
            }
          : search,
      };
    }
    case NAVIGATION_SET_ELEVATION: {
      const { elevation } = action.payload;
      return {
        ...state,
        elevation,
      };
    }
    case NAVIGATION_SET_BACKGROUND_COLOR: {
      const { backgroundColor } = action.payload;
      return {
        ...state,
        backgroundColor,
      };
    }
    case NAVIGATION_SHOW_BANNER: {
      const { id, message, severity, buttonLabel, onClickButton } =
        action.payload;
      return {
        ...state,
        banner: {
          mount: true,
          id,
          message,
          severity,
          buttonLabel,
          onClickButton,
        },
      };
    }
    case NAVIGATION_HIDE_BANNER: {
      return {
        ...state,
        banner: undefined,
      };
    }
    case NAVIGATION_SET_TYPE: {
      const { type } = action.payload;
      return {
        ...state,
        type,
      };
    }
    default:
      throw new Error(`Navigation Action not recognized: ${action}`);
  }
};
