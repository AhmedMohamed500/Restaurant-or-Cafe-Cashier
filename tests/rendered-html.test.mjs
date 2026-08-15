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
  assert.match(source, /preferredCode.*=== "mass" \? "G" : "COUNT"/);
  assert.match(source, /الأوزان تُحفظ بالجرام/);
});

test("shows main and kitchen balances together and refreshes the current kitchen balance", async () => {
  const source = await readFile(new URL("../src/features/app/RestaurantFlowApp.tsx", import.meta.url), "utf8");
  assert.match(source, /<th>رصيد المخزن<\/th><th>رصيد المطبخ<\/th>/);
  assert.match(source, /<th>الرصيد الحالي<\/th>/);
  assert.match(source, /currentWarehouseId=\{kitchen\?\.id\}/);
  assert.match(source, /displayQuantity\(data, item, currentBalance\)/);
});

test("uses the warm restaurant red brand palette", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--brand: #c7352d/);
  assert.match(css, /--brand-dark: #9f241f/);
  assert.match(css, /--brand-soft: #fff1ef/);
  assert.doesNotMatch(css, /--brand: #3b82f6/);
});

test("uses the requested Tahoma bold cashier typography", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.match(css, /font-family: Tahoma, Arial, sans-serif; font-size: 12px; font-weight: 700/);
  assert.match(css, /small, \.badge, th, \.eyebrow, \.nav-label, \.product-category \{ font-size: 11px; \}/);
  assert.doesNotMatch(css, /--font-(?:cairo|tajawal|changa)/);
});
