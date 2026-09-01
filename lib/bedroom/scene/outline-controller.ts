import type { PlanPoint } from "../types";
import { isSimplePolygon } from "../geometry";
export function validRoomOutline(points: PlanPoint[]) { const area = Math.abs(points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point.x * next.z - next.x * point.z; }, 0)) / 2; return area >= 1_000_000 && isSimplePolygon(points); }
