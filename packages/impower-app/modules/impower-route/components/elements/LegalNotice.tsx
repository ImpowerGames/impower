import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, { useMemo } from "react";

const legalNotice =
  "By registering, you agree to Impower's [Terms](/docs/legal/terms) and [Privacy Policy](/docs/legal/privacy).";
const captchaNotice =
  "Protected by hCaptcha. Its [Terms](https://hcaptcha.com/terms) and [Privacy Policy](https://hcaptcha.com/privacy) apply.";

const Markdown = dynamic(() => import("./Markdown"));

const StyledLegalNotice = styled.div`
  font-size: 0.6875rem;
  opacity: 0.5;
  display: flex;
  flex-direction: column;
  a {
    color: inherit;
    text-decoration: none;
    font-weight: ${(props): number => props.theme.fontWeight.bold};
  }
  text-align: center;
`;

interface LegalNoticeProps {
  register?: boolean;
  captcha?: boolean;
  style?: React.CSSProperties;
}

const LegalNotice = React.memo((props: LegalNoticeProps): JSX.Element => {
  const { register, captcha, style } = props;
  const md = useMemo(() => {
    const notices = [];
    if (register) {
      notices.push(legalNotice);
    }
    if (captcha) {
      notices.push(captchaNotice);
    }
    return notices.join("\n\n");
  }, [captcha, register]);
  return (
    <StyledLegalNotice style={style}>
      <Markdown defaultStyle>{md}</Markdown>
    </StyledLegalNotice>
  );
});

export default LegalNotice;
