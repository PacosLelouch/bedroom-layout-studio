import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("keeps performance marks local and enforces explicit client budgets", async () => { const performance = await readFile("lib/bedroom/performance.ts", "utf8"); const budget = await readFile("scripts/check-client-budgets.mjs", "utf8"); assert.match(performance, /bedroom:room-switch-visible/); assert.doesNotMatch(performance, /fetch\(|sendBeacon|analytics/); assert.match(budget, /160 \* 1024/); assert.match(budget, /30 \* 1024/); });
