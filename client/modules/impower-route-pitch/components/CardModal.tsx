import { ModalManager, ModalUnstyledProps } from "@mui/material/Modal";
import {
  unstable_createChainedFunction as createChainedFunction,
  unstable_ownerDocument as ownerDocument,
  unstable_useEventCallback as useEventCallback,
  unstable_useForkRef as useForkRef,
} from "@mui/utils";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface Modal {
  mount: Element;
  mountNode: Element;
  modalRef: Element;
}

const getContainer = (container): HTMLElement => {
  return typeof container === "function" ? container() : container;
};

const getHasTransition = (props): boolean => {
  return props.children ? props.children.props.in !== undefined : false;
};

const defaultManager = new ModalManager();

interface CardModalProps extends ModalUnstyledProps {
  manager?: ModalManager;
  onTransitionEnter?: () => void;
  onTransitionExited?: () => void;
  // TODO: Update to use latest mui components / componentsProps interface
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  componentsProps?: any;
}

const CardModal = React.forwardRef(
  (props: CardModalProps, ref): JSX.Element => {
    const {
      children,
      className,
      closeAfterTransition = false,
      component = "div",
      components = {},
      componentsProps = {},
      container,
      disableEscapeKeyDown = false,
      disableScrollLock = false,
      hideBackdrop = false,
      keepMounted = false,
      // private
      // eslint-disable-next-line react/prop-types
      manager = defaultManager,
      onBackdropClick,
      onClose,
      onKeyDown,
      open,
      onTransitionEnter,
      onTransitionExited,
      ...other
    } = props;

    const [exited, setExited] = useState(true);
    const modal = useRef<Modal>({
      mount: undefined,
      mountNode: undefined,
      modalRef: undefined,
    });
    const mountNodeRef = useRef(null);
    const modalRef = useRef(null);
    const handleRef = useForkRef(modalRef, ref);
    const hasTransition = getHasTransition(props);

    const getDoc = (): Document => ownerDocument(mountNodeRef.current);
    const getModal = (): Modal => {
      modal.current.modalRef = modalRef.current;
      modal.current.mountNode = mountNodeRef.current;
      return modal.current;
    };

    const handleMounted = useCallback((): void => {
      manager.mount(getModal(), { disableScrollLock });

      // Fix a bug on Chrome where the scroll isn't initially 0.
      modalRef.current.scrollTop = 0;
    }, [disableScrollLock, manager]);

    const handleOpen = useEventCallback(() => {
      const resolvedContainer = getContainer(container) || getDoc().body;

      manager.add(getModal(), resolvedContainer);

      // The element was already mounted.
      if (modalRef.current) {
        handleMounted();
      }
    });

    const isTopModal = useCallback(
      () => manager.isTopModal(getModal()),
      [manager]
    );

    const handleClose = useCallback(() => {
      manager.remove(getModal());
    }, [manager]);

    useEffect(() => {
      return (): void => {
        handleClose();
      };
    }, [handleClose]);

    useEffect(() => {
      if (open) {
        handleOpen();
      } else if (!hasTransition || !closeAfterTransition) {
        handleClose();
      }
    }, [open, handleClose, hasTransition, closeAfterTransition, handleOpen]);

    const handleEnter = useCallback((): void => {
      setExited(false);

      if (onTransitionEnter) {
        onTransitionEnter();
      }
    }, [onTransitionEnter]);

    const handleExited = useCallback((): void => {
      setExited(true);

      if (onTransitionExited) {
        onTransitionExited();
      }

      if (closeAfterTransition) {
        handleClose();
      }
    }, [closeAfterTransition, handleClose, onTransitionExited]);

    const handleBackdropClick = useCallback(
      (event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        if (onBackdropClick) {
          onBackdropClick(event);
        }

        if (onClose) {
          onClose(event, "backdropClick");
        }
      },
      [onBackdropClick, onClose]
    );

    const handleKeyDown = useCallback(
      (event): void => {
        if (onKeyDown) {
          onKeyDown(event);
        }

        // The handler doesn't take event.defaultPrevented into account:
        //
        // event.preventDefault() is meant to stop default behaviors like
        // clicking a checkbox to check it, hitting a button to submit a form,
        // and hitting left arrow to move the cursor in a text input etc.
        // Only special HTML elements have these default behaviors.
        if (event.key !== "Escape" || !isTopModal()) {
          return;
        }

        if (!disableEscapeKeyDown) {
          // Swallow the event, in case someone is listening for the escape key on the body.
          event.stopPropagation();

          if (onClose) {
            onClose(event, "escapeKeyDown");
          }
        }
      },
      [disableEscapeKeyDown, isTopModal, onClose, onKeyDown]
    );

    if (!keepMounted && !open && (!hasTransition || exited)) {
      return null;
    }

    const childProps: {
      tabIndex?: string;
      onEnter?: () => void;
      onExited?: () => void;
    } = {};
    if (children.props.tabIndex === undefined) {
      childProps.tabIndex = "-1";
    }

    // It's a Transition like component
    if (hasTransition) {
      childProps.onEnter = createChainedFunction(
        handleEnter,
        children.props.onEnter
      );
      childProps.onExited = createChainedFunction(
        handleExited,
        children.props.onExited
      );
    }

    const Root = components.Root || component;
    const BackdropComponent = components.Backdrop;
    const rootProps = componentsProps.root || {};
    const backdropProps = componentsProps.backdrop || {};

    return (
      <Root
        role="presentation"
        {...rootProps}
        {...other}
        className={className}
        ref={handleRef}
        onKeyDown={handleKeyDown}
      >
        {!hideBackdrop && BackdropComponent ? (
          <BackdropComponent
            open={open}
            onClick={handleBackdropClick}
            {...backdropProps}
          />
        ) : null}
        {React.cloneElement(children, childProps)}
      </Root>
    );
  }
);

export default CardModal;
