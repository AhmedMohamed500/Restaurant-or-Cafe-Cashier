"use client";
import { db } from "@/src/db/database";
import type { ShiftCashMovement, StockCount, StockCountLine, StockMovement, WasteEntry, WasteReason } from "./models";
import { convertUnitQuantity } from "@/src/lib/units";
import { multiplyMoney, roundQuantity } from "@/src/lib/money";
import { createJournal } from "./accounting-service";
import { expectedShiftCash, shiftDifference, stockVariance } from "./operations-rules";

const uid=()=>crypto.randomUUID(), stamp=()=>new Date().toISOString(), actor="local-admin";
const audit=()=>({createdAt:stamp(),updatedAt:stamp(),createdBy:actor});
const inventoryAccount=(stage:string)=>stage==="raw"?"1210":stage==="work_in_progress"?"1220":"1230";
async function log(action:string,entityType:string,entityId:string,reference:string,afterSummary?:string){await db.auditLogs.add({id:uid(),action,entityType,entityId,reference,timestamp:stamp(),localUser:actor,afterSummary});}
async function nextNumber(prefix:string,table:{count:()=>Promise<number>}){return `${prefix}-${String(await table.count()+1).padStart(6,"0")}`;}

export async function addShiftCashMovement(type:"cash_in"|"cash_out",amountPiasters:number,reason:string){
  return db.transaction("rw",[db.shifts,db.shiftCashMovements,db.auditLogs],async()=>{
    const shift=await db.shifts.where("status").equals("open").first(); if(!shift)throw new Error("لا توجد وردية مفتوحة");
    if(amountPiasters<=0)throw new Error("القيمة يجب أن تكون أكبر من صفر");
    const row:ShiftCashMovement={id:uid(),shiftId:shift.id,number:await nextNumber("CSH",db.shiftCashMovements),type,amountPiasters,reason,occurredAt:stamp(),...audit()};
    await db.shiftCashMovements.add(row); await log(type,"shiftCashMovement",row.id,row.number,`${amountPiasters}`); return row;
  });
}

export async function closeShiftControlled(shiftId:string,actualCashPiasters:number){
  return db.transaction("rw",[db.shifts,db.shiftCashMovements,db.saleOrders,db.expenses,db.settings,db.accounts,db.journalEntries,db.journalLines,db.auditLogs,db.alerts],async()=>{
    const shift=await db.shifts.get(shiftId); if(!shift||shift.status!=="open")throw new Error("الوردية غير مفتوحة");
    const sales=(await db.saleOrders.where("shiftId").equals(shift.id).toArray());
    const movements=await db.shiftCashMovements.where("shiftId").equals(shift.id).toArray();
    const cash=sales.filter(x=>x.paymentMethod==="cash").reduce((s,x)=>s+x.totalPiasters,0),card=sales.filter(x=>x.paymentMethod==="card").reduce((s,x)=>s+x.totalPiasters,0),wallet=sales.filter(x=>x.paymentMethod==="wallet").reduce((s,x)=>s+x.totalPiasters,0);
    const cashIn=movements.filter(x=>x.type==="cash_in").reduce((s,x)=>s+x.amountPiasters,0),cashOut=movements.filter(x=>x.type==="cash_out").reduce((s,x)=>s+x.amountPiasters,0);
    const expected=expectedShiftCash({opening:shift.openingCashPiasters,cashSales:cash,cashIn,cashRefunds:shift.cashRefundsPiasters,cashOut});
    const result=shiftDifference(actualCashPiasters,expected),closedAt=stamp();
    await db.shifts.update(shift.id,{closedAt,cashSalesPiasters:cash,cardSalesPiasters:card,walletSalesPiasters:wallet,cashInPiasters:cashIn,cashOutPiasters:cashOut,cashPaidOutsPiasters:cashOut,expectedCashPiasters:expected,actualCashPiasters,differencePiasters:result.difference,differenceStatus:result.status,orderCount:sales.length,vatPiasters:sales.reduce((s,x)=>s+x.taxPiasters,0),status:"closed",updatedAt:closedAt});
    if(result.difference)await createJournal({referenceType:result.status==="shortage"?"shift_shortage":"shift_surplus",referenceId:shift.id,referenceNumber:shift.number,description:result.status==="shortage"?"عجز إغلاق وردية":"فائض إغلاق وردية",sourceModule:"shifts",lines:result.difference<0?[{accountCode:"6270",debitMinor:-result.difference,creditMinor:0,description:"عجز كاشير"},{accountCode:"1120",debitMinor:0,creditMinor:-result.difference,description:"تسوية العجز"}]:[{accountCode:"1120",debitMinor:result.difference,creditMinor:0,description:"زيادة نقدية"},{accountCode:"7100",debitMinor:0,creditMinor:result.difference,description:"فائض كاشير"}]});
    if(result.status!=="balanced")await db.alerts.add({id:uid(),type:"shift_shortage",severity:result.status==="shortage"?"critical":"warning",title:result.status==="shortage"?"عجز وردية":"زيادة وردية",message:`${shift.number}: ${Math.abs(result.difference)} قرش`,entityId:shift.id,createdAt:closedAt});
    await db.settings.update("settings",{activeShift:false});await log("shift_close","shift",shift.id,shift.number,`expected=${expected};actual=${actualCashPiasters};difference=${result.difference}`);return result;
  });
}

export async function createStockCount(warehouseId:string,notes?:string){
  return db.transaction("rw",[db.stockCounts,db.stockCountLines,db.balances,db.items],async()=>{
    const count:StockCount={id:uid(),number:await nextNumber("CNT",db.stockCounts),warehouseId,countDate:stamp().slice(0,10),status:"in_progress",notes,...audit()};
    const balances=await db.balances.where("warehouseId").equals(warehouseId).toArray();const lines:StockCountLine[]=[];
    for(const balance of balances){const item=await db.items.get(balance.itemId);if(item)lines.push({id:uid(),stockCountId:count.id,itemId:item.id,unitId:item.baseUnitId,systemQuantity:balance.quantity,differenceQuantity:0,unitCostPiasters:balance.averageCostPiasters||item.averageCostPiasters,differenceValuePiasters:0});}
    await db.stockCounts.add(count);if(lines.length)await db.stockCountLines.bulkAdd(lines);return count;
  });
}
export async function setCountActual(lineId:string,enteredQuantity:number,enteredUnitId:string){
  const line=await db.stockCountLines.get(lineId),unit=await db.units.get(enteredUnitId),base=line?await db.units.get(line.unitId):undefined;if(!line||!unit||!base||unit.family!==base.family)throw new Error("وحدة الجرد غير متوافقة");
  const actual=convertUnitQuantity(enteredQuantity,unit.baseFactor,base.baseFactor),v=stockVariance(line.systemQuantity,actual,line.unitCostPiasters);await db.stockCountLines.update(line.id,{actualQuantity:actual,...v});return v;
}
export async function approveStockCount(countId:string){
  return db.transaction("rw",[db.stockCounts,db.stockCountLines,db.warehouses,db.balances,db.movements,db.accounts,db.journalEntries,db.journalLines,db.auditLogs,db.alerts],async()=>{
    const count=await db.stockCounts.get(countId);if(!count||count.status==="approved")throw new Error("الجرد غير قابل للاعتماد");const warehouse=await db.warehouses.get(count.warehouseId);if(!warehouse)throw new Error("المخزن غير موجود");
    const lines=await db.stockCountLines.where("stockCountId").equals(count.id).toArray();if(lines.some(x=>x.actualQuantity===undefined))throw new Error("أدخل الكميات الفعلية لكل الأصناف");
    let shortage=0,surplus=0;const moves:StockMovement[]=[];
    for(const line of lines){if(!line.differenceQuantity)continue;const balance=await db.balances.get(`${count.warehouseId}:${line.itemId}`);if(!balance)throw new Error("رصيد الصنف غير موجود");await db.balances.update(balance.id,{quantity:line.actualQuantity!,updatedAt:stamp()});const value=Math.abs(line.differenceValuePiasters);if(line.differenceQuantity<0)shortage+=value;else surplus+=value;moves.push({id:uid(),warehouseId:count.warehouseId,itemId:line.itemId,type:"adjustment",quantity:line.differenceQuantity,unitCostPiasters:line.unitCostPiasters,totalCostPiasters:line.differenceValuePiasters,reference:count.number,note:line.differenceQuantity<0?"ADJUSTMENT_OUT":"ADJUSTMENT_IN",...audit()});}
    if(moves.length)await db.movements.bulkAdd(moves);const asset=inventoryAccount(warehouse.stage);if(shortage)await createJournal({referenceType:"stock_count_shortage",referenceId:count.id,referenceNumber:count.number,description:"عجز جرد مخزون",sourceModule:"stock_count",lines:[{accountCode:"6260",debitMinor:shortage,creditMinor:0,description:"فروق مخزون"},{accountCode:asset,debitMinor:0,creditMinor:shortage,description:"خفض المخزون"}]});if(surplus)await createJournal({referenceType:"stock_count_surplus",referenceId:count.id,referenceNumber:count.number,description:"زيادة جرد مخزون",sourceModule:"stock_count",lines:[{accountCode:asset,debitMinor:surplus,creditMinor:0,description:"زيادة المخزون"},{accountCode:"7200",debitMinor:0,creditMinor:surplus,description:"أرباح تسوية المخزون"}]});
    await db.stockCounts.update(count.id,{status:"approved",approvedAt:stamp(),updatedAt:stamp()});if(moves.length)await db.alerts.add({id:uid(),type:"stock_variance",severity:shortage?"warning":"info",title:"تم اعتماد فرق جرد",message:`${count.number}: صافي ${surplus-shortage} قرش`,entityId:count.id,createdAt:stamp()});await log("stock_count_approve","stockCount",count.id,count.number,`shortage=${shortage};surplus=${surplus}`);return {shortage,surplus};
  });
}

export async function postWaste(input:{warehouseId:string;itemId:string;enteredQuantity:number;unitId:string;reason:WasteReason;notes?:string}){
  return db.transaction("rw",[db.wasteEntries,db.units,db.items,db.warehouses,db.balances,db.movements,db.shifts,db.accounts,db.journalEntries,db.journalLines,db.auditLogs,db.alerts],async()=>{
    const [item,warehouse,unit]=await Promise.all([db.items.get(input.itemId),db.warehouses.get(input.warehouseId),db.units.get(input.unitId)]);if(!item||!warehouse||!unit)throw new Error("بيانات الهالك غير مكتملة");const base=await db.units.get(item.baseUnitId);if(!base||base.family!==unit.family)throw new Error("وحدة الهالك غير متوافقة");const quantity=convertUnitQuantity(input.enteredQuantity,unit.baseFactor,base.baseFactor),balance=await db.balances.get(`${warehouse.id}:${item.id}`);if(!balance||quantity<=0||quantity>balance.quantity-balance.reserved)throw new Error("كمية الهالك أكبر من الرصيد المتاح");const cost=balance.averageCostPiasters||item.averageCostPiasters,total=multiplyMoney(cost,quantity),number=await nextNumber("WST",db.wasteEntries),shift=await db.shifts.where("status").equals("open").first();const row:WasteEntry={id:uid(),number,occurredAt:stamp(),warehouseId:warehouse.id,itemId:item.id,quantity,enteredQuantity:input.enteredQuantity,unitId:unit.id,reason:input.reason,unitCostPiasters:cost,totalCostPiasters:total,shiftId:shift?.id,notes:input.notes,...audit()};
    await db.balances.update(balance.id,{quantity:roundQuantity(balance.quantity-quantity),updatedAt:stamp()});await db.wasteEntries.add(row);await db.movements.add({id:uid(),warehouseId:warehouse.id,itemId:item.id,type:"waste",quantity:-quantity,enteredQuantity:input.enteredQuantity,enteredUnitId:unit.id,unitCostPiasters:cost,totalCostPiasters:-total,reference:number,note:input.reason,...audit()});await createJournal({referenceType:"waste",referenceId:row.id,referenceNumber:number,description:"إثبات هالك تشغيلي",sourceModule:"waste",lines:[{accountCode:"5400",debitMinor:total,creditMinor:0,description:"تكلفة الهالك"},{accountCode:inventoryAccount(warehouse.stage),debitMinor:0,creditMinor:total,description:"صرف مخزون هالك"}]});await db.alerts.add({id:uid(),type:"waste",severity:"warning",title:"هالك مسجل",message:`${item.nameAr}: ${input.enteredQuantity} ${unit.symbol}`,entityId:row.id,createdAt:stamp()});await log("waste_post","waste",row.id,number,`quantity=${quantity};cost=${total}`);return row;
  });
}

export async function getFoodCostAnalysis(){
 const recipes=await db.recipes.toArray(),items=await db.items.toArray(),orders=await db.productionOrders.toArray(),movements=await db.movements.where("type").equals("production_consume").toArray();
 return recipes.map(recipe=>{const output=items.find(x=>x.id===recipe.outputItemId);const standard=recipe.ingredients.reduce((s,i)=>s+multiplyMoney(items.find(x=>x.id===i.itemId)?.averageCostPiasters??0,i.quantity),0);const related=orders.filter(o=>o.recipeId===recipe.id);const actual=related.reduce((s,o)=>s+o.totalCostPiasters,0);const batches=related.reduce((s,o)=>s+(o.plannedQuantity/recipe.outputQuantity||1),0);return {recipeId:recipe.id,name:output?.nameAr??recipe.nameAr,standardCostPiasters:standard,actualCostPiasters:actual,standardForActualPiasters:Math.round(standard*batches),variancePiasters:actual-Math.round(standard*batches),sellingPricePiasters:output?.salePricePiasters??recipe.sellingPricePiasters??0,productionOrders:related.length,consumptionLines:movements.filter(m=>related.some(o=>o.number===m.reference)).length};});
}
