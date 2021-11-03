import BinocularsRegularIcon from "../../../resources/icons/regular/binoculars.svg";
import HandshakeSimpleRegularIcon from "../../../resources/icons/regular/handshake-simple.svg";
import LightbulbOnRegularIcon from "../../../resources/icons/regular/lightbulb-on.svg";
import BinocularsSolidIcon from "../../../resources/icons/solid/binoculars.svg";
import HandshakeSimpleSolidIcon from "../../../resources/icons/solid/handshake-simple.svg";
import LightbulbOnSolidIcon from "../../../resources/icons/solid/lightbulb-on.svg";
import { PitchGoalFilter } from "../types/pitchGoalFilter";

const getPitchGoalFilterOptionIcons = (
  filter: PitchGoalFilter
): {
  [filter in PitchGoalFilter]: React.ComponentType;
} => ({
  All: filter === "All" ? BinocularsSolidIcon : BinocularsRegularIcon,
  collaboration:
    filter === "collaboration"
      ? HandshakeSimpleSolidIcon
      : HandshakeSimpleRegularIcon,
  inspiration:
    filter === "inspiration" ? LightbulbOnSolidIcon : LightbulbOnRegularIcon,
});

export default getPitchGoalFilterOptionIcons;
