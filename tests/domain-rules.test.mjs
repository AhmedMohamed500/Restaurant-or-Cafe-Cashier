import assert from "node:assert/strict";
import test from "node:test";
import { assertCompatibleUnitFamilies, convertUnitQuantity } from "../src/lib/units.ts";
import { multiplyMoney, roundQuantity } from "../src/lib/money.ts";

test("converts kilograms to grams and keeps three decimal places", () => {
  assert.equal(convertUnitQuantity(10, 1000, 1), 10000);
  assert.equal(convertUnitQuantity(0.75, 1000, 1), 750);
});

test("converts grams to kilograms", () => {
  assert.equal(convertUnitQuantity(750, 1, 1000), 0.75);
  assert.equal(roundQuantity(10 - convertUnitQuantity(750, 1, 1000)), 9.25);
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
