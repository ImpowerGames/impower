export interface ConfirmDialogState {
  mount?: boolean;
  open?: boolean;
  title?: string;
  content?: string;
  disagreeLabel?: string;
  agreeLabel?: string;
  disableAutoFocus?: boolean;
  disableEnforceFocus?: boolean;
  disableRestoreFocus?: boolean;
  asynchronous?: boolean;
  responsive?: boolean;
  onAgree?: () => void;
  onDisagree?: () => void;
}

export const createConfirmDialogState = (): ConfirmDialogState => ({
  open: false,
});
