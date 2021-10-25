import { createPortal } from "react-dom";

export interface PortalProps {
  children: React.ReactNode;
}

const Portal = (props: PortalProps): JSX.Element => {
  const { children } = props;

  if (typeof window === "undefined") {
    return null;
  }

  if (!children || !document.body) {
    return null;
  }

  return createPortal(children, document.body);
};

export default Portal;
