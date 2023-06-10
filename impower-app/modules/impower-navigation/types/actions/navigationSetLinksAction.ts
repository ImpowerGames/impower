export const NAVIGATION_SET_LINKS = "impower/navigation/SET_LINKS";
export interface NavigationSetLinksAction {
  type: typeof NAVIGATION_SET_LINKS;
  payload: {
    links: {
      label: string;
      link: string;
      icon?: string;
      image?: string;
      backgroundColor?: string;
    }[];
  };
}
