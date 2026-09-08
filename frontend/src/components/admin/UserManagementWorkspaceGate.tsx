"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import UserManagementWorkspace from "@/components/admin/UserManagementWorkspace";

export default function UserManagementWorkspaceGate(){
  const pathname=usePathname();
  const [show,setShow]=useState(false);
  useEffect(()=>{
    if(pathname!=="/admin"){setShow(false);return;}
    const detect=()=>setShow(Boolean(document.querySelector('main.min-h-screen input[placeholder="Search by name or email..."]')));
    detect();
    const observer=new MutationObserver(detect);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
    window.addEventListener("resize",detect);
    return()=>{observer.disconnect();window.removeEventListener("resize",detect)};
  },[pathname]);
  return show?<UserManagementWorkspace/>:null;
}
