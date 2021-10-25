import {
  NavigationHideBannerAction,
  NAVIGATION_HIDE_BANNER,
} from "../types/actions/navigationHideBannerAction";

const navigationHideBanner = (): NavigationHideBannerAction => {
  return {
    type: NAVIGATION_HIDE_BANNER,
  };
};

export default navigationHideBanner;
