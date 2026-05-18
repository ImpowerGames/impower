import {
  cloneElement,
  type ComponentChildren,
  isValidElement,
  toChildArray,
} from "preact";

export const propDefaults = {};

export type IconProps = {
  children?: ComponentChildren;
};

// Decorate raw <svg> children with sensible aria defaults so consumers don't
// have to remember them. Components that render an <svg> (like the generated
// icon library) carry their own aria defaults and pass through here unchanged.
// User overrides win because their props spread comes AFTER ours.
export default function Icon({ children }: IconProps) {
  return (
    <>
      {toChildArray(children).map((child) =>
        isValidElement(child) && child.type === "svg"
          ? cloneElement(
              child,
              {
                "aria-hidden": "true",
                focusable: "false",
                ...child.props,
              } as Record<string, unknown>,
            )
          : child,
      )}
    </>
  );
}

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "s-icon": JSX.HTMLAttributes<HTMLElement>;
    }
  }
}
