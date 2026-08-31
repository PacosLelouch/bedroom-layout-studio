import largeSecondaryRoom from "./layouts/large-secondary.json";
import layoutIndex from "./layouts/index.json";
import masterRoom from "./layouts/master.json";
import smallSecondaryRoom from "./layouts/small-secondary.json";
import { parseIndexedRoomLayouts } from "./layout-schema";

/** Built-in room layouts, validated from the JSON assets in ./layouts. */
export const INITIAL_ROOMS = parseIndexedRoomLayouts(layoutIndex, {
  "master.json": masterRoom,
  "large-secondary.json": largeSecondaryRoom,
  "small-secondary.json": smallSecondaryRoom,
});
