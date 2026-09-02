import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders development preview metadata", async () => {
  const response = await render();

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("renders the unified furniture review route without a write API", async () => {
  const response = await render("/furniture-review?asset=wardrobe");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /家具资产检视/);
  assert.match(html, /内置与用户家具/);
});

test("keeps the former asset review URL compatible", async () => {
  const response = await render("/asset-review?asset=crown-chest");

  assert.equal(response.status, 200);
  assert.match(await response.text(), /家具资产检视/);
});
