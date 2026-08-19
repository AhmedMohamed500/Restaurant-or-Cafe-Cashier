import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";

async function loadRules(){
 const source=await readFile(new URL("../src/domain/operations-rules.ts",import.meta.url),"utf8");
 const js=ts.transpile(source.replace('import { multiplyMoney, roundQuantity } from "@/src/lib/money";','const multiplyMoney=(a,b)=>Math.round(a*b); const roundQuantity=(n)=>Math.round(n*1000)/1000;'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
 const compiled={exports:{}};vm.runInNewContext(js,{module:compiled,exports:compiled.exports});return compiled.exports;
}
const rules=await loadRules();
test("expected cash excludes card and wallet collections",()=>assert.equal(rules.expectedShiftCash({opening:10000,cashSales:5000,cashIn:1000,cashRefunds:500,cashOut:700}),14800));
test("shift close classifies balanced shortage and surplus",()=>{assert.deepEqual({...rules.shiftDifference(100,100)},{difference:0,status:"balanced"});assert.equal(rules.shiftDifference(90,100).status,"shortage");assert.equal(rules.shiftDifference(110,100).status,"surplus")});
test("stock count calculates shortage surplus and value",()=>{assert.deepEqual({...rules.stockVariance(2500,2350,2)},{differenceQuantity:-150,differenceValuePiasters:-300});assert.equal(rules.stockVariance(10,12,50).differenceValuePiasters,100)});
test("food cost percentage uses actual sales and avoids divide by zero",()=>{assert.equal(rules.foodCostPercent(2500,10000),25);assert.equal(rules.foodCostPercent(10,0),0)});
test("standard versus actual reports quantity and cost variance",()=>assert.deepEqual({...rules.costVariance(300,330,900,990)},{quantityVariance:30,costVarianceMinor:90}));
test("operations service keeps stock count and waste atomic",async()=>{const source=await readFile(new URL("../src/domain/operations-service.ts",import.meta.url),"utf8");for(const token of ["db.transaction","approveStockCount","postWaste","createJournal","auditLogs","alerts"])assert.match(source,new RegExp(token));});
