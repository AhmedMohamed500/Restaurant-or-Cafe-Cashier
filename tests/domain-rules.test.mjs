import assert from "node:assert/strict";
import test from "node:test";
import { assertCompatibleUnitFamilies, convertUnitQuantity, normalizeRecipeMassQuantity } from "../src/lib/units.ts";
import { multiplyMoney, roundQuantity } from "../src/lib/money.ts";
import { hashPassword } from "../src/lib/auth.ts";

test("converts kilograms to grams and keeps three decimal places", () => {
  assert.equal(convertUnitQuantity(10, 1000, 1), 10000);
  assert.equal(convertUnitQuantity(0.75, 1000, 1), 750);
});

test("converts grams to kilograms", () => {
  assert.equal(convertUnitQuantity(750, 1, 1000), 0.75);
  assert.equal(roundQuantity(10 - convertUnitQuantity(750, 1, 1000)), 9.25);
});

test("normalizes recipe weights to grams", () => {
  assert.equal(normalizeRecipeMassQuantity(1.5, "mass", 1000), 1500);
  assert.equal(normalizeRecipeMassQuantity(125, "mass", 1), 125);
  assert.equal(normalizeRecipeMassQuantity(3, "count", 1), 3);
});

test("rejects conversion between mass and count", () => {
  assert.throws(() => assertCompatibleUnitFamilies("mass", "count"), /لا يمكن التحويل/);
  assert.doesNotThrow(() => assertCompatibleUnitFamilies("mass", "mass"));
});

test("rejects zero and negative quantities", () => {
  assert.throws(() => convertUnitQuantity(0, 1, 1000), /أكبر من صفر/);
  assert.throws(() => convertUnitQuantity(-1, 1, 1000), /أكبر من صفر/);
});

test("stores money calculations as integer piasters", () => {
  assert.equal(multiplyMoney(125, 2.5), 313);
  assert.equal(Number.isInteger(multiplyMoney(125, 2.5)), true);
});

test("hashes local passwords without storing their plain text", async () => {
  const first = await hashPassword("restaurant-secret");
  const second = await hashPassword("restaurant-secret");
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.notEqual(first, "restaurant-secret");
});
