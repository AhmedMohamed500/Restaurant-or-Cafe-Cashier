"use client";
import {db} from "@/src/db/database";

function sessionId(){
  if(typeof sessionStorage==="undefined")return "local-session";
  const key="restaurantflow-session-id";
  const value=sessionStorage.getItem(key)??crypto.randomUUID();
  sessionStorage.setItem(key,value);
  return value;
}

export async function writeAudit(input:{action:string;entityType:string;entityId:string;reference:string;user:string;userId?:string;module?:string;beforeSummary?:string;afterSummary?:string;reason?:string}){
  const timestamp=new Date().toISOString();
  await db.auditLogs.add({id:crypto.randomUUID(),timestamp,localUser:input.user,userName:input.user,userId:input.userId,sessionId:sessionId(),...input});
}
