import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders RestaurantFlow Arabic shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /RestaurantFlow/);
  assert.match(html, /lang="ar"/);
  assert.match(html, /dir="rtl"/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("renders only the five-step operating workflow", async () => {
  const html = await readFile(new URL("../src/features/app/RestaurantFlowApp.tsx", import.meta.url), "utf8");
  for (const label of ["المخزون", "المطبخ", "التصنيع", "المنتج التام", "الكاشير"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /label: "الوحدات"/);
  assert.doesNotMatch(html, /label: "الوصفات"/);
  assert.doesNotMatch(html, /label: "حركات المخزون"/);
  assert.match(html, /المنتج التام فقط/);
});

test("includes restaurant branding and local login flows", async () => {
  const source = await readFile(new URL("../src/features/app/RestaurantFlowApp.tsx", import.meta.url), "utf8");
  assert.match(source, /جهّز حساب مطعمك/);
  assert.match(source, /دخول إلى النظام/);
  assert.match(source, /إعدادات المطعم/);
  assert.match(source, /شعار المطعم/);
  assert.match(source, /hashPassword/);
});

test("keeps the production withdrawal unit choices consistent", async () => {
  const source = await readFile(new URL("../src/features/app/RestaurantFlowApp.tsx", import.meta.url), "utf8");
  assert.match(source, /PRODUCTION_UNIT_CODES = \["KG", "G", "COUNT"\]/);
  assert.match(source, /aria-label="وحدة سحب مكون التصنيع"/);
  assert.match(source, /disabled=\{!compatible\}/);
});
