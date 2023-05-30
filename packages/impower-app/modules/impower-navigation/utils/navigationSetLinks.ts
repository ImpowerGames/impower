import {
  NavigationSetLinksAction,
  NAVIGATION_SET_LINKS,
} from "../types/actions/navigationSetLinksAction";

const navigationSetLinks = (
  links?: {
    label: string;
    link: string;
    icon?: string;
    image?: string;
    backgroundColor?: string;
  }[]
): NavigationSetLinksAction => {
  return {
    type: NAVIGATION_SET_LINKS,
    payload: { links },
  };
};

export default navigationSetLinks;
