"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import UserManagementWorkspace from "@/components/admin/UserManagementWorkspace";

export default function UserManagementWorkspaceGate(){
  const pathname=usePathname();
  const [show,setShow]=useState(false);

  useEffect(()=>{
    if(pathname!=="/admin"){setShow(false);return;}

    const isUsersButton=(button:Element)=>{
      const text=(button.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
      return text.startsWith("users") && text.includes("accounts & entitlements");
    };

    const detect=()=>{
      const buttons=Array.from(document.querySelectorAll("main.min-h-screen aside button"));
      const usersButton=buttons.find(isUsersButton);
      setShow(Boolean(usersButton && usersButton.className.includes("bg-amber-300/[0.08]")));
    };

    const handleClick=(event:MouseEvent)=>{
      const target=event.target as Element|null;
      const button=target?.closest("main.min-h-screen aside button");
      if(!button)return;
      setShow(isUsersButton(button));
    };

    detect();
    document.addEventListener("click",handleClick,true);
    const observer=new MutationObserver(detect);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
    window.addEventListener("resize",detect);
    return()=>{
      observer.disconnect();
      document.removeEventListener("click",handleClick,true);
      window.removeEventListener("resize",detect);
    };
  },[pathname]);

  return show ? <div className="fixed inset-0 z-[9999]" style={{pointerEvents:"none"}}><div style={{pointerEvents:"auto"}}><UserManagementWorkspace/></div></div> : null;
}
