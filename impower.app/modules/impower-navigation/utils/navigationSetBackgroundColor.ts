import {
  NavigationSetBackgroundColorAction,
  NAVIGATION_SET_BACKGROUND_COLOR,
} from "../types/actions/navigationSetBackgroundColorAction";

const navigationSetBackgroundColor = (
  backgroundColor?: string
): NavigationSetBackgroundColorAction => {
  return {
    type: NAVIGATION_SET_BACKGROUND_COLOR,
    payload: { backgroundColor },
  };
};

export default navigationSetBackgroundColor;
