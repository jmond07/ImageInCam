const WRIST = 0;
const MIDDLE_MCP = 9;
const FINGER_TIPS = [8, 12, 16, 20]; // index, middle, ring, pinky

// Average fingertip distance from the wrist, in palm lengths.
// Open hand is around 1.8-2.0, a closed fist is below 1.
export const OPEN_RATIO = 1.5;

export function measureHand(points, width, height) {
  const px = (i) => ({ x: points[i].x * width, y: points[i].y * height });
  const wrist = px(WRIST);
  const mcp = px(MIDDLE_MCP);
  const palmSize = Math.hypot(wrist.x - mcp.x, wrist.y - mcp.y) || 1;

  const reach = FINGER_TIPS.map((i) => {
    const tip = px(i);
    return Math.hypot(tip.x - wrist.x, tip.y - wrist.y) / palmSize;
  });
  const openness = reach.reduce((a, b) => a + b, 0) / reach.length;

  return {
    palmX: (wrist.x + mcp.x) / 2,
    palmY: (wrist.y + mcp.y) / 2,
    palmSize,
    openness,
    open: openness > OPEN_RATIO,
  };
}