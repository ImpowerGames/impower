export const CONFIRM_DIALOG_NAV_OPEN = "impower/confirm-dialog/NAV_OPEN";
export interface ConfirmDialogNavOpenAction {
  type: typeof CONFIRM_DIALOG_NAV_OPEN;
  payload: {
    title?: string;
    content?: string;
    agreeLabel?: string;
    onAgree?: () => void;
    disagreeLabel?: string;
    onDisagree?: () => void;
    options?: {
      disableAutoFocus?: boolean;
      disableEnforceFocus?: boolean;
      disableRestoreFocus?: boolean;
      asynchronous?: boolean;
      responsive?: boolean;
    };
  };
}
export const confirmDialogNavOpen = (
  title?: string,
  content?: string,
  agreeLabel?: string,
  onAgree?: () => void,
  disagreeLabel?: string,
  onDisagree?: () => void,
  options?: {
    disableAutoFocus?: boolean;
    disableEnforceFocus?: boolean;
    disableRestoreFocus?: boolean;
    asynchronous?: boolean;
    responsive?: boolean;
  }
): ConfirmDialogNavOpenAction => {
  return {
    type: CONFIRM_DIALOG_NAV_OPEN,
    payload: {
      title,
      content,
      agreeLabel,
      onAgree,
      disagreeLabel,
      onDisagree,
      options,
    },
  };
};

export const CONFIRM_DIALOG_OPEN = "impower/confirm-dialog/OPEN";
export interface ConfirmDialogOpenAction {
  type: typeof CONFIRM_DIALOG_OPEN;
  payload: {
    title?: string;
    content?: string;
    agreeLabel?: string;
    onAgree?: () => void;
    disagreeLabel?: string;
    onDisagree?: () => void;
    options?: {
      disableAutoFocus?: boolean;
      disableEnforceFocus?: boolean;
      disableRestoreFocus?: boolean;
      asynchronous?: boolean;
      responsive?: boolean;
    };
  };
}
export const confirmDialogOpen = (
  title?: string,
  content?: string,
  agreeLabel?: string,
  onAgree?: () => void,
  disagreeLabel?: string,
  onDisagree?: () => void,
  options?: {
    disableAutoFocus?: boolean;
    disableEnforceFocus?: boolean;
    disableRestoreFocus?: boolean;
    asynchronous?: boolean;
    responsive?: boolean;
  }
): ConfirmDialogOpenAction => {
  return {
    type: CONFIRM_DIALOG_OPEN,
    payload: {
      title,
      content,
      agreeLabel,
      onAgree,
      disagreeLabel,
      onDisagree,
      options,
    },
  };
};

export const CONFIRM_DIALOG_CLOSE = "impower/confirm-dialog/CLOSE";
export interface ConfirmDialogCloseAction {
  type: typeof CONFIRM_DIALOG_CLOSE;
}
export const confirmDialogClose = (): ConfirmDialogCloseAction => {
  return {
    type: CONFIRM_DIALOG_CLOSE,
  };
};

export type ConfirmDialogAction =
  | ConfirmDialogNavOpenAction
  | ConfirmDialogOpenAction
  | ConfirmDialogCloseAction;
