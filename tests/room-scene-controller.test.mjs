import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("exposes the room scene lifecycle through a controller", async () => { const source = await readFile("lib/bedroom/scene/room-scene-controller.ts", "utf8"); for (const method of ["applyProps", "showRoom", "setViewMode", "setSelection", "setCollisions", "invalidate", "dispose"]) assert.match(source, new RegExp(`${method}\\(`)); });
