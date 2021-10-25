import {
  NavigationShowBannerAction,
  NAVIGATION_SHOW_BANNER,
} from "../types/actions/navigationShowBannerAction";
import { AlertColor } from "../types/enums/alertColor";

const navigationShowBanner = (
  id: string,
  message?: string,
  severity?: AlertColor,
  buttonLabel?: React.ReactNode,
  onClickButton?: () => void
): NavigationShowBannerAction => {
  return {
    type: NAVIGATION_SHOW_BANNER,
    payload: {
      id,
      message,
      buttonLabel,
      severity,
      onClickButton,
    },
  };
};

export default navigationShowBanner;
