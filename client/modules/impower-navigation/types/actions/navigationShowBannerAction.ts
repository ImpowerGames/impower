import { AlertColor } from "../enums/alertColor";

export const NAVIGATION_SHOW_BANNER = "@impower/navigation/SHOW_BANNER";
export interface NavigationShowBannerAction {
  type: typeof NAVIGATION_SHOW_BANNER;
  payload: {
    id: string;
    message?: string;
    severity?: AlertColor;
    buttonLabel?: React.ReactNode;
    onClickButton?: () => void;
  };
}
