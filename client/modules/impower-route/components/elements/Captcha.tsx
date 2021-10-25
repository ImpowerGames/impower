import styled from "@emotion/styled";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import React from "react";
import LegalNotice from "./LegalNotice";

export interface CaptchaActions extends HCaptcha {
  resetCaptcha(): void;
  execute(): void;
}

const StyledCaptchaArea = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

interface CaptchaProps {
  actionsRef?: React.Ref<CaptchaActions>;
  size?: "invisible" | "normal" | "compact";
  disableNotice?: boolean;
  style?: React.CSSProperties;
  onVerify?: (token: string) => void;
}

const Captcha = React.memo((props: CaptchaProps): JSX.Element => {
  const {
    actionsRef,
    size = "invisible",
    disableNotice,
    onVerify,
    style,
  } = props;
  return (
    <StyledCaptchaArea style={style}>
      <HCaptcha
        ref={actionsRef}
        sitekey={process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY}
        size={size}
        onVerify={onVerify}
      />
      {!disableNotice && <LegalNotice captcha />}
    </StyledCaptchaArea>
  );
});

export default Captcha;
