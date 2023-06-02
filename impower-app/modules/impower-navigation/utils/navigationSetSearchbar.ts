import {
  NavigationSetSearchbarAction,
  NAVIGATION_SET_SEARCHBAR,
} from "../types/actions/navigationSetSearchbarAction";

const navigationSetSearchbar = (search?: {
  label?: string;
  placeholder?: string;
  value?: string;
  searching?: boolean;
}): NavigationSetSearchbarAction => {
  return {
    type: NAVIGATION_SET_SEARCHBAR,
    payload: { search },
  };
};

export default navigationSetSearchbar;
