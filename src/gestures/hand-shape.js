const WRIST = 0;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const FINGER_TIPS = [8, 12, 16, 20]; // index, middle, ring, pinky

// Fingertip distance from the wrist, in palm lengths.
// Extended finger is around 1.8-2.0, a curled one is below 1.
export const OPEN_RATIO = 1.5; // average of the four fingers
export const POINT_EXTENDED = 1.6; // pointing: the index must reach at least this far
export const POINT_CURLED = 1.25; // pointing: the other three must stay below this

export function measureHand(points, width, height) {
  const px = (i) => ({ x: points[i].x * width, y: points[i].y * height });
  const wrist = px(WRIST);
  const mcp = px(MIDDLE_MCP);
  const palmSize = Math.hypot(wrist.x - mcp.x, wrist.y - mcp.y) || 1;

  const reach = FINGER_TIPS.map((i) => {
    const tip = px(i);
    return Math.hypot(tip.x - wrist.x, tip.y - wrist.y) / palmSize;
  });
  const [indexReach, middleReach, ringReach, pinkyReach] = reach;
  const openness = reach.reduce((a, b) => a + b, 0) / reach.length;

  return {
    palmX: (wrist.x + mcp.x) / 2,
    palmY: (wrist.y + mcp.y) / 2,
    palmSize,
    reach,
    openness,
    open: openness > OPEN_RATIO,
    pointing:
      indexReach > POINT_EXTENDED &&
      middleReach < POINT_CURLED &&
      ringReach < POINT_CURLED &&
      pinkyReach < POINT_CURLED,
    indexTip: px(INDEX_TIP),
  };
}