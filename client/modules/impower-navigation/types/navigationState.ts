import React from "react";
import { AlertColor } from "./enums/alertColor";

export interface NavigationState {
  title?: string;
  secondaryTitle?: string;
  subtitle?: string;
  elevation?: number;
  backgroundColor?: string;
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
  banner?: {
    mount?: boolean;
    id?: string;
    message?: string;
    severity?: AlertColor;
    buttonLabel?: React.ReactNode;
    onClickButton?: () => void;
  };
  type?: "page" | "studio" | "none";
}

export const createNavigationState = (): NavigationState => ({});
