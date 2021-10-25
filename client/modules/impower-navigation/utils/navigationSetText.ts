import {
  NavigationSetTextAction,
  NAVIGATION_SET_TEXT,
} from "../types/actions/navigationSetTextAction";

const navigationSetText = (
  title?: string,
  secondaryTitle?: string,
  subtitle?: string
): NavigationSetTextAction => {
  return {
    type: NAVIGATION_SET_TEXT,
    payload: { title, secondaryTitle, subtitle },
  };
};

export default navigationSetText;
