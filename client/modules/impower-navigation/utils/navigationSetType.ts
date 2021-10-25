import {
  NavigationSetTypeAction,
  NAVIGATION_SET_TYPE,
} from "../types/actions/navigationSetTypeAction";

const navigationSetType = (
  type: "page" | "studio" | "none"
): NavigationSetTypeAction => {
  return {
    type: NAVIGATION_SET_TYPE,
    payload: {
      type,
    },
  };
};

export default navigationSetType;
