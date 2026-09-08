"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import UserManagementWorkspace from "@/components/admin/UserManagementWorkspace";

export default function UserManagementWorkspaceGate(){
  const pathname=usePathname();
  const [show,setShow]=useState(false);

  useEffect(()=>{
    if(pathname!=="/admin"){setShow(false);return;}
    const detect=()=>{
      const buttons=Array.from(document.querySelectorAll("main.min-h-screen aside button"));
      const usersButton=buttons.find(button=>{
        const label=button.querySelector("span.block.text-\\[11px\\]")?.textContent?.trim() || button.textContent?.trim() || "";
        return label === "Users" || label.startsWith("UsersAccounts & entitlements");
      });
      const active=Boolean(usersButton && usersButton.className.includes("bg-amber-300/[0.08]"));
      setShow(active);
    };
    detect();
    const observer=new MutationObserver(detect);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
    window.addEventListener("resize",detect);
    return()=>{observer.disconnect();window.removeEventListener("resize",detect)};
  },[pathname]);

  return show?<div className="relative z-[9999]"><UserManagementWorkspace/></div>:null;
}
