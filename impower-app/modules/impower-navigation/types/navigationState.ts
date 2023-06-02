export interface NavigationState {
  title?: string;
  secondaryTitle?: string;
  subtitle?: string;
  elevation?: number;
  backgroundColor?: string;
  transitioning?: boolean;
  links?: {
    label: string;
    link: string;
    icon?: string;
    image?: string;
    backgroundColor?: string;
  }[];
  search?: {
    label?: string;
    placeholder?: string;
    value?: string;
    searching?: boolean;
  };
  type?: "page" | "studio" | "none";
}

export const createNavigationState = (): NavigationState => ({});
