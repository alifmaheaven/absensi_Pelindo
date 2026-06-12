import * as React from "react";
import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgCheckRounded = (props: SvgProps) => (
  <Svg
    width={24}
    height={24}
    viewBox="0 0 24 24"
    {...props}
  >
    <Path
      fill="currentColor"
      d="m9.55 15.15 8.475-8.475q.3-.3.7-.3t.7.3.3.713-.3.712l-9.175 9.2q-.3.3-.7.3t-.7-.3L4.55 13q-.3-.3-.288-.712t.313-.713.713-.3.712.3z"
    />
  </Svg>
);
export default SvgCheckRounded;
