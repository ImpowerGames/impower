import {
  Children,
  isValidElement,
  ReactElement,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PresenceContext } from "../../contexts/presenceContext";

interface PresenceChildProps {
  children: React.ReactElement<unknown>;
  isPresent: boolean;
  isFirstTime?: boolean;
  disableFirstTimeEnter?: boolean;
  exitProps?: Record<string, unknown>;
  onExitComplete?: () => void;
  onMount?: () => void;
  onUnmount?: () => void;
}

let presenceId = 0;
const getPresenceId = (): number => {
  const id = presenceId;
  presenceId += 1;
  return id;
};

export const PresenceChild = (props: PresenceChildProps): JSX.Element => {
  const {
    children,
    isFirstTime,
    isPresent,
    onExitComplete,
    onMount,
    onUnmount,
    disableFirstTimeEnter,
    exitProps,
  } = props;
  const id = useRef(getPresenceId()).current;

  const context = useMemo(
    () => ({
      id,
      isPresent,
      isFirstTime,
      disableFirstTimeEnter,
      onExitComplete,
      exitProps,
    }),
    /**
     * If the presence of a child affects the layout of the components around it,
     * we want to make a new context value to ensure they get re-rendered
     * so they can detect that layout change.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPresent]
  );

  useEffect(() => {
    if (onMount) {
      onMount();
    }
    return (): void => {
      if (onUnmount) {
        onUnmount();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PresenceContext.Provider value={context}>
      {children}
    </PresenceContext.Provider>
  );
};

type ComponentKey = string | number;

const getChildKey = (child: ReactElement<unknown>): ComponentKey => {
  return child.key || "";
};

const onlyElements = (children: ReactNode): { [key: string]: ReactElement } => {
  const filtered: { [key: string]: ReactElement } = {};

  // We use forEach here instead of map as map mutates the component key by preprending `.$`
  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      filtered[getChildKey(child)] = child;
    }
  });

  return filtered;
};

interface UnmountAnimationProps {
  children: React.ReactNode;
  disableFirstTimeEnter?: boolean;
  exitProps?: Record<string, unknown>;
}

export const UnmountAnimation = (props: UnmountAnimationProps): JSX.Element => {
  const { children, disableFirstTimeEnter, exitProps } = props;
  const [, forceRender] = useState({});
  const [isFirstTime, setIsFirstTime] = useState(true);

  useEffect(() => {
    setIsFirstTime(false);
  }, []);

  const exiting = useRef(new Set<string | number>()).current;

  // Filter out any children that aren't ReactElements. We can only track ReactElements with a props.key
  const currentChildren = onlyElements(children);

  const registeredChildren = useRef(currentChildren).current;

  // Whenever a new child is mounted, register it
  Object.entries(currentChildren).forEach(([key, child]) => {
    registeredChildren[key] = child;
    if (exiting.has(key)) {
      exiting.delete(key);
    }
  });

  // Whenever a child is unmounted, start exiting it
  Object.entries(registeredChildren).forEach(([key]) => {
    if (!currentChildren[key]) {
      exiting.add(key);
    }
  });

  const wrappedChildren = Object.values(registeredChildren).map((child) => {
    const key = child.key as string | number;
    if (exiting.has(key)) {
      return (
        <PresenceChild
          key={getChildKey(child)}
          isPresent={false}
          isFirstTime={isFirstTime}
          disableFirstTimeEnter={disableFirstTimeEnter}
          onExitComplete={(): void => {
            exiting.delete(key);
            delete registeredChildren[key];
            forceRender({});
          }}
          exitProps={exitProps}
        >
          {child}
        </PresenceChild>
      );
    }
    return (
      <PresenceChild
        key={getChildKey(child)}
        isPresent={true}
        isFirstTime={isFirstTime}
        disableFirstTimeEnter={disableFirstTimeEnter}
        onMount={(): void => {
          exiting.delete(key);
        }}
      >
        {child}
      </PresenceChild>
    );
  });

  return <>{wrappedChildren}</>;
};

export default UnmountAnimation;
