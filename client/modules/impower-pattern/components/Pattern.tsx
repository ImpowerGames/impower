import PatternAnchorsAway from "../../../resources/patterns/anchors-away.svg";
import PatternArchitect from "../../../resources/patterns/architect.svg";
import PatternAutumn from "../../../resources/patterns/autumn.svg";
import PatternAztec from "../../../resources/patterns/aztec.svg";
import PatternBamboo from "../../../resources/patterns/bamboo.svg";
import PatternBankNote from "../../../resources/patterns/bank-note.svg";
import PatternBathroomFloor from "../../../resources/patterns/bathroom-floor.svg";
import PatternBevelCircle from "../../../resources/patterns/bevel-circle.svg";
import PatternBoxes from "../../../resources/patterns/boxes.svg";
import PatternBrickWall from "../../../resources/patterns/brick-wall.svg";
import PatternBubbles from "../../../resources/patterns/bubbles.svg";
import PatternCage from "../../../resources/patterns/cage.svg";
import PatternCharlieBrown from "../../../resources/patterns/charlie-brown.svg";
import PatternChurchOnSunday from "../../../resources/patterns/church-on-sunday.svg";
import PatternCirclesAndSquares from "../../../resources/patterns/circles-and-squares.svg";
import PatternCircuitBoard from "../../../resources/patterns/circuit-board.svg";
import PatternConnections from "../../../resources/patterns/connections.svg";
import PatternCorkScrew from "../../../resources/patterns/cork-screw.svg";
import PatternCubes from "../../../resources/patterns/cubes.svg";
import PatternCurrent from "../../../resources/patterns/current.svg";
import PatternCurtain from "../../../resources/patterns/curtain.svg";
import PatternCutout from "../../../resources/patterns/cutout.svg";
import PatternDeathStar from "../../../resources/patterns/death-star.svg";
import PatternDiagonalLines from "../../../resources/patterns/diagonal-lines.svg";
import PatternDiagonalStripes from "../../../resources/patterns/diagonal-stripes.svg";
import PatternDominos from "../../../resources/patterns/dominos.svg";
import PatternEndlessClouds from "../../../resources/patterns/endless-clouds.svg";
import PatternEyes from "../../../resources/patterns/eyes.svg";
import PatternFallingTriangles from "../../../resources/patterns/falling-triangles.svg";
import PatternFancyRectangles from "../../../resources/patterns/fancy-rectangles.svg";
import PatternFlippedDiamonds from "../../../resources/patterns/flipped-diamonds.svg";
import PatternFloatingCogs from "../../../resources/patterns/floating-cogs.svg";
import PatternFloorTile from "../../../resources/patterns/floor-tile.svg";
import PatternFormalInvitation from "../../../resources/patterns/formal-invitation.svg";
import PatternFourPointStars from "../../../resources/patterns/four-point-stars.svg";
import PatternGlamourous from "../../../resources/patterns/glamorous.svg";
import PatternGraphPaper from "../../../resources/patterns/graph-paper.svg";
import PatternGroovy from "../../../resources/patterns/groovy.svg";
import PatternHappyIntersection from "../../../resources/patterns/happy-intersection.svg";
import PatternHeavyRain from "../../../resources/patterns/heavy-rain.svg";
import PatternHexagons from "../../../resources/patterns/hexagons.svg";
import PatternHideout from "../../../resources/patterns/hideout.svg";
import PatternHoundstooth from "../../../resources/patterns/houndstooth.svg";
import PatternILikeFood from "../../../resources/patterns/i-like-food.svg";
import PatternIntersectingCircles from "../../../resources/patterns/intersecting-circles.svg";
import PatternJigsaw from "../../../resources/patterns/jigsaw.svg";
import PatternJupiter from "../../../resources/patterns/jupiter.svg";
import PatternKiwi from "../../../resources/patterns/kiwi.svg";
import PatternLeaf from "../../../resources/patterns/leaf.svg";
import PatternLinesInMotion from "../../../resources/patterns/lines-in-motion.svg";
import PatternLips from "../../../resources/patterns/lips.svg";
import PatternLisbon from "../../../resources/patterns/lisbon.svg";
import PatternMelt from "../../../resources/patterns/melt.svg";
import PatternMoroccan from "../../../resources/patterns/moroccan.svg";
import PatternMorphingDiamonds from "../../../resources/patterns/morphing-diamonds.svg";
import PatternOvercast from "../../../resources/patterns/overcast.svg";
import PatternOverlappingCircles from "../../../resources/patterns/overlapping-circles.svg";
import PatternOverlappingDiamonds from "../../../resources/patterns/overlapping-diamonds.svg";
import PatternOverlappingHexagons from "../../../resources/patterns/overlapping-hexagons.svg";
import PatternParkayFloor from "../../../resources/patterns/parkay-floor.svg";
import PatternPianoMan from "../../../resources/patterns/piano-man.svg";
import PatternPieFactory from "../../../resources/patterns/pie-factory.svg";
import PatternPixelDots from "../../../resources/patterns/pixel-dots.svg";
import PatternPlus from "../../../resources/patterns/plus.svg";
import PatternPolkaDots from "../../../resources/patterns/polka-dots.svg";
import PatternRails from "../../../resources/patterns/rails.svg";
import PatternRain from "../../../resources/patterns/rain.svg";
import PatternRandomShapes from "../../../resources/patterns/random-shapes.svg";
import PatternRoundedPlusConnected from "../../../resources/patterns/rounded-plus-connected.svg";
import PatternSignal from "../../../resources/patterns/signal.svg";
import PatternSkulls from "../../../resources/patterns/skulls.svg";
import PatternSlantedStars from "../../../resources/patterns/slanted-stars.svg";
import PatternSquaresInSquares from "../../../resources/patterns/squares-in-squares.svg";
import PatternSquares from "../../../resources/patterns/squares.svg";
import PatternStampCollection from "../../../resources/patterns/stamp-collection.svg";
import PatternSteelBeams from "../../../resources/patterns/steel-beams.svg";
import PatternStripes from "../../../resources/patterns/stripes.svg";
import PatternTemple from "../../../resources/patterns/temple.svg";
import PatternTexture from "../../../resources/patterns/texture.svg";
import PatternTicTacToe from "../../../resources/patterns/tic-tac-toe.svg";
import PatternTinyCheckers from "../../../resources/patterns/tiny-checkers.svg";
import PatternTopography from "../../../resources/patterns/topography.svg";
import PatternVolcanoLamp from "../../../resources/patterns/volcano-lamp.svg";
import PatternWallpaper from "../../../resources/patterns/wallpaper.svg";
import PatternWiggle from "../../../resources/patterns/wiggle.svg";
import PatternXEquals from "../../../resources/patterns/x-equals.svg";
import PatternYYY from "../../../resources/patterns/yyy.svg";
import PatternZigZag from "../../../resources/patterns/zig-zag.svg";
import { PatternName } from "../types/patternName";

interface PatternSvgProps {
  pattern: PatternName;
}

const PatternSvg = (props: PatternSvgProps): JSX.Element => {
  const { pattern } = props;
  if (pattern === "anchors-away") return <PatternAnchorsAway />;
  if (pattern === "architect") return <PatternArchitect />;
  if (pattern === "autumn") return <PatternAutumn />;
  if (pattern === "aztec") return <PatternAztec />;
  if (pattern === "bamboo") return <PatternBamboo />;
  if (pattern === "bank-note") return <PatternBankNote />;
  if (pattern === "bathroom-floor") return <PatternBathroomFloor />;
  if (pattern === "bevel-circle") return <PatternBevelCircle />;
  if (pattern === "boxes") return <PatternBoxes />;
  if (pattern === "brick-wall") return <PatternBrickWall />;
  if (pattern === "bubbles") return <PatternBubbles />;
  if (pattern === "cage") return <PatternCage />;
  if (pattern === "charlie-brown") return <PatternCharlieBrown />;
  if (pattern === "church-on-sunday") return <PatternChurchOnSunday />;
  if (pattern === "circles-and-squares") return <PatternCirclesAndSquares />;
  if (pattern === "circuit-board") return <PatternCircuitBoard />;
  if (pattern === "connections") return <PatternConnections />;
  if (pattern === "cork-screw") return <PatternCorkScrew />;
  if (pattern === "cubes") return <PatternCubes />;
  if (pattern === "current") return <PatternCurrent />;
  if (pattern === "curtain") return <PatternCurtain />;
  if (pattern === "cutout") return <PatternCutout />;
  if (pattern === "death-star") return <PatternDeathStar />;
  if (pattern === "diagonal-lines") return <PatternDiagonalLines />;
  if (pattern === "diagonal-stripes") return <PatternDiagonalStripes />;
  if (pattern === "dominos") return <PatternDominos />;
  if (pattern === "endless-clouds") return <PatternEndlessClouds />;
  if (pattern === "eyes") return <PatternEyes />;
  if (pattern === "falling-triangles") return <PatternFallingTriangles />;
  if (pattern === "fancy-rectangles") return <PatternFancyRectangles />;
  if (pattern === "flipped-diamonds") return <PatternFlippedDiamonds />;
  if (pattern === "floating-cogs") return <PatternFloatingCogs />;
  if (pattern === "floor-tile") return <PatternFloorTile />;
  if (pattern === "formal-invitation") return <PatternFormalInvitation />;
  if (pattern === "four-point-stars") return <PatternFourPointStars />;
  if (pattern === "glamorous") return <PatternGlamourous />;
  if (pattern === "graph-paper") return <PatternGraphPaper />;
  if (pattern === "groovy") return <PatternGroovy />;
  if (pattern === "happy-intersection") return <PatternHappyIntersection />;
  if (pattern === "heavy-rain") return <PatternHeavyRain />;
  if (pattern === "hexagons") return <PatternHexagons />;
  if (pattern === "hideout") return <PatternHideout />;
  if (pattern === "houndstooth") return <PatternHoundstooth />;
  if (pattern === "i-like-food") return <PatternILikeFood />;
  if (pattern === "intersecting-circles") return <PatternIntersectingCircles />;
  if (pattern === "jigsaw") return <PatternJigsaw />;
  if (pattern === "jupiter") return <PatternJupiter />;
  if (pattern === "kiwi") return <PatternKiwi />;
  if (pattern === "leaf") return <PatternLeaf />;
  if (pattern === "lines-in-motion") return <PatternLinesInMotion />;
  if (pattern === "lips") return <PatternLips />;
  if (pattern === "lisbon") return <PatternLisbon />;
  if (pattern === "melt") return <PatternMelt />;
  if (pattern === "moroccan") return <PatternMoroccan />;
  if (pattern === "morphing-diamonds") return <PatternMorphingDiamonds />;
  if (pattern === "overcast") return <PatternOvercast />;
  if (pattern === "overlapping-circles") return <PatternOverlappingCircles />;
  if (pattern === "overlapping-diamonds") return <PatternOverlappingDiamonds />;
  if (pattern === "overlapping-hexagons") return <PatternOverlappingHexagons />;
  if (pattern === "parkay-floor") return <PatternParkayFloor />;
  if (pattern === "piano-man") return <PatternPianoMan />;
  if (pattern === "pie-factory") return <PatternPieFactory />;
  if (pattern === "pixel-dots") return <PatternPixelDots />;
  if (pattern === "plus") return <PatternPlus />;
  if (pattern === "polka-dots") return <PatternPolkaDots />;
  if (pattern === "rails") return <PatternRails />;
  if (pattern === "rain") return <PatternRain />;
  if (pattern === "random-shapes") return <PatternRandomShapes />;
  if (pattern === "rounded-plus-connected")
    return <PatternRoundedPlusConnected />;
  if (pattern === "signal") return <PatternSignal />;
  if (pattern === "skulls") return <PatternSkulls />;
  if (pattern === "slanted-stars") return <PatternSlantedStars />;
  if (pattern === "squares-in-squares") return <PatternSquaresInSquares />;
  if (pattern === "squares") return <PatternSquares />;
  if (pattern === "stamp-collection") return <PatternStampCollection />;
  if (pattern === "steel-beams") return <PatternSteelBeams />;
  if (pattern === "stripes") return <PatternStripes />;
  if (pattern === "temple") return <PatternTemple />;
  if (pattern === "texture") return <PatternTexture />;
  if (pattern === "tic-tac-toe") return <PatternTicTacToe />;
  if (pattern === "tiny-checkers") return <PatternTinyCheckers />;
  if (pattern === "topography") return <PatternTopography />;
  if (pattern === "volcano-lamp") return <PatternVolcanoLamp />;
  if (pattern === "wallpaper") return <PatternWallpaper />;
  if (pattern === "wiggle") return <PatternWiggle />;
  if (pattern === "x-equals") return <PatternXEquals />;
  if (pattern === "yyy") return <PatternYYY />;
  if (pattern === "zig-zag;") return <PatternZigZag />;
  return null;
};

interface PatternProps {
  pattern: PatternName;
  color?: string;
  opacity?: number;
  size?: number;
  style?: React.CSSProperties;
}

const Pattern = (props: PatternProps): JSX.Element => {
  const { pattern, color = "black", opacity = 0.25, size, style } = props;

  return (
    <div
      className="font-icon"
      style={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: size,
        height: size,
        fontSize: size,
        opacity,
        color,
        ...style,
      }}
    >
      <PatternSvg pattern={pattern} />
    </div>
  );
};

export default Pattern;
