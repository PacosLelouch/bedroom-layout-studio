export const BEDROOM_PERFORMANCE_MARKS = {
  viewportModuleReady: "bedroom:viewport-module-ready",
  firstRoomReady: "bedroom:first-room-ready",
  roomSwitchStart: "bedroom:room-switch-start",
  roomSwitchVisible: "bedroom:room-switch-visible",
  viewSwitchStart: "bedroom:view-switch-start",
  viewSwitchVisible: "bedroom:view-switch-visible",
  assetRuntimeLoad: "bedroom:asset-runtime-load",
  roomPrewarm: "bedroom:room-prewarm",
} as const;

export function markBedroomPerformance(name: typeof BEDROOM_PERFORMANCE_MARKS[keyof typeof BEDROOM_PERFORMANCE_MARKS], detail?: unknown) {
  if (typeof performance === "undefined") return;
  try { performance.mark(name, detail === undefined ? undefined : { detail }); } catch { performance.mark(name); }
}
