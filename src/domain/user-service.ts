"use client";
import {db} from "@/src/db/database";
import type {LocalUser,UserRole} from "./models";
import {requirePermission} from "./authorization-service";
import {hashPassword} from "@/src/lib/auth";
import {writeAudit} from "./audit-service";

const stamp=()=>new Date().toISOString();
export async function ensureOwnerUser(username:string,passwordHash:string,displayName="مدير النظام"){
  const found=await db.users.where("username").equals(username).first();
  if(found)return found;
  const time=stamp(),row:LocalUser={id:crypto.randomUUID(),username,displayName,passwordHash,role:"OWNER",active:true,createdAt:time,updatedAt:time,createdBy:username};
  await db.users.add(row);return row;
}
export async function authenticateLocalUser(username:string,password:string){
  const user=await db.users.where("username").equals(username).first();
  if(!user||!user.active||await hashPassword(password)!==user.passwordHash)throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
  return user;
}
export async function createLocalUser(input:{actorRole:UserRole;actor:string;username:string;displayName:string;password:string;role:UserRole}){
  await requirePermission(input.actorRole,"users.manage");
  const time=stamp(),row:LocalUser={id:crypto.randomUUID(),username:input.username.trim(),displayName:input.displayName.trim(),passwordHash:await hashPassword(input.password),role:input.role,active:true,createdAt:time,updatedAt:time,createdBy:input.actor};
  if(await db.users.where("username").equals(row.username).first())throw new Error("اسم المستخدم مستخدم بالفعل");
  await db.users.add(row);await writeAudit({action:"user_create",entityType:"user",entityId:row.id,reference:row.username,user:input.actor,module:"administration",afterSummary:`role=${row.role}`});return row;
}
