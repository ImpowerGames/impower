import { useStylesheet } from "../utils/useStylesheet";
import routeListCss from "./route-list.css?inline";

export const ROUTE_LIST_STYLESHEET_ID = "swp-route-list-css";

export const useRouteListStylesheet = () =>
  useStylesheet(ROUTE_LIST_STYLESHEET_ID, routeListCss);
