import { z } from "zod";
import type { FurnitureItem, LayoutSnapshot, RoomLayout } from "./bedroom.js";

const dimensionsSchema = z.object({
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
}).strict();

const planPointSchema = z.object({ x: z.number(), z: z.number() }).strict();

const parameterValueSchema = z.union([z.number().finite(), z.boolean(), z.string()]);

const furnitureItemInputSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  name: z.string().min(1),
  position: planPointSchema,
  rotation: z.number(),
  size: dimensionsSchema,
  color: z.string().min(1),
  wallMounted: z.boolean().optional(),
  supportSurface: z.enum(["floor", "bay-window", "wall"]).optional(),
  baseHeight: z.number().nonnegative().optional(),
  clearanceDepth: z.number().nonnegative().optional(),
  clearanceLabel: z.string().min(1).optional(),
  parameterValues: z.record(z.string(), parameterValueSchema).optional(),
  stateId: z.string().min(1).nullable().optional(),
  presetId: z.string().min(1).optional(),
  // Version 1 compatibility fields. They are normalized and never emitted again.
  interactionState: z.enum(["open", "closed"]).optional(),
  loweredHeight: z.number().positive().optional(),
  raisedHeight: z.number().positive().optional(),
  collapsedDepth: z.number().positive().optional(),
  expandedDepth: z.number().positive().optional(),
  collapsedWidth: z.number().positive().optional(),
  expandedWidth: z.number().positive().optional(),
  collapsedPositionX: z.number().optional(),
  expandedPositionX: z.number().optional(),
  collapsedPositionZ: z.number().optional(),
  expandedPositionZ: z.number().optional(),
}).strict();

function normalizeFurnitureItem(input: z.infer<typeof furnitureItemInputSchema>): FurnitureItem {
  const {
    interactionState,
    loweredHeight,
    raisedHeight,
    collapsedDepth,
    expandedDepth,
    collapsedWidth,
    expandedWidth,
    collapsedPositionX,
    expandedPositionX,
    collapsedPositionZ,
    expandedPositionZ,
    ...item
  } = input;
  const parameters = { ...(item.parameterValues ?? {}) };
  if (loweredHeight !== undefined) parameters.loweredHeight = loweredHeight;
  if (raisedHeight !== undefined) parameters.raisedHeight = raisedHeight;
  if (collapsedDepth !== undefined) parameters.collapsedDepth = collapsedDepth;
  if (expandedDepth !== undefined) parameters.expandedDepth = expandedDepth;
  if (collapsedWidth !== undefined) parameters.collapsedWidth = collapsedWidth;
  if (expandedWidth !== undefined) parameters.expandedWidth = expandedWidth;
  if (collapsedPositionX !== undefined) parameters.collapsedPositionX = collapsedPositionX;
  if (expandedPositionX !== undefined) parameters.expandedPositionX = expandedPositionX;
  if (collapsedPositionZ !== undefined) parameters.collapsedPositionZ = collapsedPositionZ;
  if (expandedPositionZ !== undefined) parameters.expandedPositionZ = expandedPositionZ;
  return {
    ...item,
    parameterValues: parameters,
    stateId: item.stateId ?? interactionState ?? null,
  };
}

const furnitureItemSchema = furnitureItemInputSchema.transform(normalizeFurnitureItem);

const keepOutZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  x: z.number(),
  z: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  kind: z.enum(["door", "circulation"]),
}).strict();

const doorOpeningSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  hinge: planPointSchema,
  width: z.number().positive(),
  wallAxis: z.enum(["x", "z"]),
  wallCoordinate: z.number(),
  openingStart: z.number(),
  closedAngle: z.number(),
  openAngle: z.number(),
  isOpen: z.boolean().optional(),
}).strict();

const bayWindowSchema = z.object({
  side: z.enum(["bottom", "right"]),
  start: z.number(),
  length: z.number().positive(),
  depth: z.number().positive(),
  sillHeight: z.number().nonnegative(),
}).strict();

export const roomLayoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dimensions: dimensionsSchema,
  clearArea: z.number().positive(),
  planSrc: z.string().min(1).optional(),
  outline: z.array(planPointSchema).min(3),
  keepOutZones: z.array(keepOutZoneSchema),
  doors: z.array(doorOpeningSchema),
  bayWindow: bayWindowSchema.optional(),
  items: z.array(furnitureItemSchema),
}).strict();

export const layoutSnapshotV2Schema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  name: z.string().min(1),
  savedAt: z.string().datetime(),
  rooms: z.array(roomLayoutSchema).min(1),
}).strict();

const layoutSnapshotV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  savedAt: z.string().datetime(),
  rooms: z.array(roomLayoutSchema).min(1),
}).strict();

const layoutIndexSchema = z.object({
  schemaVersion: z.literal(1),
  layouts: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    file: z.string().regex(/^[a-z0-9-]+\.json$/),
  }).strict()).min(1),
}).strict();

export function parseRoomLayouts(value: unknown): RoomLayout[] {
  return z.array(roomLayoutSchema).min(1).parse(value) as RoomLayout[];
}

export function parseLayoutSnapshot(value: unknown): LayoutSnapshot {
  const version = value && typeof value === "object" ? (value as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (version === 1) {
    const legacy = layoutSnapshotV1Schema.parse(value);
    return { ...legacy, schemaVersion: 2 } as LayoutSnapshot;
  }
  return layoutSnapshotV2Schema.parse(value) as LayoutSnapshot;
}

export function parseIndexedRoomLayouts(indexValue: unknown, files: Record<string, unknown>): RoomLayout[] {
  const index = layoutIndexSchema.parse(indexValue);
  const seenIds = new Set<string>();
  return index.layouts.map((entry) => {
    if (seenIds.has(entry.id)) throw new Error(`Duplicate layout id in index.json: ${entry.id}`);
    seenIds.add(entry.id);
    if (!(entry.file in files)) throw new Error(`Layout file is not registered: ${entry.file}`);
    const room = roomLayoutSchema.parse(files[entry.file]) as RoomLayout;
    if (room.id !== entry.id) throw new Error(`Layout id mismatch for ${entry.file}: expected ${entry.id}, got ${room.id}`);
    return room;
  });
}
