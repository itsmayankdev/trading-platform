"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC_PATHS=["/login","/admin"];
const session=()=>fetch("/api/backend/api/v1/auth/session",{credentials:"include",cache:"no-store"});

export default function AuthGate({children}:{children:React.ReactNode}){
  const pathname=usePathname(); const router=useRouter(); const [ready,setReady]=useState(false);
  useEffect(()=>{
    if(PUBLIC_PATHS.some(p=>pathname===p||pathname.startsWith(`${p}/`))){setReady(true);return;}
    let alive=true;
    const check=async()=>{try{const r=await session();if(!alive)return;if(r.ok){const b=await r.json();if(b.authenticated){setReady(true);return;}}router.replace(`/login?next=${encodeURIComponent(pathname)}`);}catch{router.replace(`/login?next=${encodeURIComponent(pathname)}`)}};
    void check();
    const id=window.setInterval(()=>{void check()},5000);
    return()=>{alive=false;window.clearInterval(id)};
  },[pathname,router]);
  if(!ready&&!PUBLIC_PATHS.some(p=>pathname===p||pathname.startsWith(`${p}/`)))return <div className="min-h-screen bg-[#070a0f]"/>;
  return <>{children}</>;
}
