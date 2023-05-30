/* eslint-disable @typescript-eslint/ban-ts-comment */
import * as React from "react";

export type LazyProps = {
  hydrate?: boolean;
  ssrOnly?: boolean;
  whenIdle?: boolean;
  whenVisible?: boolean | IntersectionObserverInit;
  didHydrate?: VoidFunction;
  promise?: Promise<unknown>;
  children: React.ReactElement;
};

type Props = Omit<React.HTMLProps<HTMLElement>, "dangerouslySetInnerHTML"> &
  LazyProps;

type VoidFunction = () => void;

const isBrowser = typeof window !== "undefined";

// React currently throws a warning when using useLayoutEffect on the server.
const useIsomorphicLayoutEffect = isBrowser
  ? React.useLayoutEffect
  : React.useEffect;

const LazyHydrate = (props: Props): JSX.Element => {
  const childRef = React.useRef<HTMLElement>(null);

  const {
    hydrate,
    ssrOnly,
    whenIdle,
    whenVisible,
    promise, // pass a promise which hydrates
    children,
    didHydrate, // callback for hydration
    ...rest
  } = props;

  // Always render on server
  const [hydrateState, setHydrateState] = React.useState(hydrate || !isBrowser);

  useIsomorphicLayoutEffect(() => {
    // No SSR Content
    if (!childRef.current.hasChildNodes()) {
      setHydrateState(true);
    }
  }, []);

  React.useEffect(() => {
    if (hydrateState && didHydrate) {
      didHydrate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateState]);

  React.useEffect(() => {
    if (ssrOnly || hydrateState) {
      return (): void => null;
    }
    const rootElement = childRef.current;

    const cleanupFns: VoidFunction[] = [];
    const cleanup = (): void => {
      cleanupFns.forEach((fn) => {
        fn();
      });
    };

    if (promise) {
      promise.then(setHydrateState, setHydrateState);
    }

    if (whenVisible) {
      const element = rootElement.firstElementChild;

      if (element && typeof IntersectionObserver !== "undefined") {
        const observerOptions =
          typeof whenVisible === "object"
            ? whenVisible
            : {
                rootMargin: "250px",
              };

        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting || entry.intersectionRatio > 0) {
              setHydrateState(true);
            }
          });
        }, observerOptions);

        io.observe(element);

        cleanupFns.push(() => {
          io.disconnect();
        });
      } else {
        setHydrateState(true);
        return (): void => null;
      }
    }
    if (whenIdle) {
      // @ts-ignore
      if (typeof requestIdleCallback !== "undefined") {
        // @ts-ignore
        const idleCallbackId = requestIdleCallback(setHydrateState, {
          timeout: 500,
        });
        cleanupFns.push(() => {
          // @ts-ignore
          cancelIdleCallback(idleCallbackId);
        });
      } else {
        const id = setTimeout(setHydrateState, 2000);
        cleanupFns.push(() => {
          clearTimeout(id);
        });
      }
    }

    return cleanup;
  }, [hydrateState, ssrOnly, whenIdle, whenVisible, didHydrate, promise]);

  const WrapperElement = "div" as unknown as React.FC<
    React.HTMLProps<HTMLElement>
  >;

  if (hydrateState) {
    return (
      <WrapperElement ref={childRef} style={{ display: "contents" }} {...rest}>
        {children}
      </WrapperElement>
    );
  }
  return (
    <WrapperElement
      {...rest}
      ref={childRef}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: "" }}
    />
  );
};

export default LazyHydrate;
