"use client";
import {db} from "@/src/db/database";
import type {Permission,RolePermission,UserRole} from "./models";
const roleGrants:Record<UserRole,Permission[]>={
 OWNER:["inventory.view","inventory.receive","inventory.transfer","production.view","production.execute","purchases.request","purchases.approve_request","purchases.create_order","purchases.approve_order","purchases.receive","waste.create","waste.approve","stock_count.create","stock_count.approve","cashier.sell","cashier.discount","cashier.refund","shifts.open","shifts.close","shifts.approve_difference","accounting.view","accounting.post","accounting.reverse","reports.financial","users.manage","settings.manage"],
 MANAGER:["inventory.view","inventory.receive","inventory.transfer","production.view","production.execute","purchases.request","purchases.approve_request","purchases.create_order","purchases.approve_order","purchases.receive","waste.create","waste.approve","stock_count.create","stock_count.approve","cashier.discount","cashier.refund","shifts.open","shifts.close","shifts.approve_difference"],
 ACCOUNTANT:["accounting.view","accounting.post","accounting.reverse","reports.financial"],
 STOREKEEPER:["inventory.view","inventory.receive","inventory.transfer","purchases.request","purchases.receive","waste.create","stock_count.create"],
 CASHIER:["cashier.sell","cashier.discount","cashier.refund","shifts.open","shifts.close"],
 KITCHEN:["production.view","production.execute","inventory.view"],
};
export async function ensureRolePermissions(){if(await db.rolePermissions.count())return;const rows:RolePermission[]=[];for(const [role,permissions] of Object.entries(roleGrants) as [UserRole,Permission[]][])for(const permission of permissions)rows.push({id:`${role}:${permission}`,role,permission});await db.rolePermissions.bulkPut(rows);}
export async function hasPermission(role:UserRole,permission:Permission){return Boolean(await db.rolePermissions.where("[role+permission]").equals([role,permission]).first());}
export async function requirePermission(role:UserRole,permission:Permission){if(!(await hasPermission(role,permission)))throw new Error("ليس لديك صلاحية لتنفيذ هذه العملية");}
export function permissionsForRole(role:UserRole){return roleGrants[role];}
