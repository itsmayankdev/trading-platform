"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Filter, KeyRound, Plus, RefreshCw, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { usePathname } from "next/navigation";

type Plan = { id:number; code:string; name:string; description?:string; active?:boolean; price_cents?:number };
type Role = { id:number; code:string; name:string; description:string; system:boolean; user_count:number; permission_codes:string[] };
type User = {
  id:number; email:string; display_name:string; first_name?:string; last_name?:string; status:string;
  plan:{id:number;code:string;name:string}|null; roles:{id:number;code:string;name:string}[];
  permissions:string[]; modules:Record<string,boolean>; access_version:number; last_seen_at:string|null; created_at:string;
  subscription_started_at:string|null; subscription_ends_at:string|null;
};

type Filters = { status:string; plan_id:string; enrolled_from:string; enrolled_to:string; ends_from:string; ends_to:string };
const EMPTY_FILTERS:Filters={status:"",plan_id:"",enrolled_from:"",enrolled_to:"",ends_from:"",ends_to:""};
const API_BASE="/api/backend/api/v1/admin";
const api=(path:string,init?:RequestInit)=>fetch(`${API_BASE}${path}`,{...init,credentials:"include",cache:"no-store",headers:{"Content-Type":"application/json",...(init?.headers||{})}});
const fmtDate=(v:string|null|undefined)=>v?new Date(v).toLocaleDateString([], {year:"numeric",month:"short",day:"2-digit"}):"—";
const fmtDateTime=(v:string|null|undefined)=>v?new Date(v).toLocaleString([], {dateStyle:"medium",timeStyle:"short"}):"Never";
const toIso=(v:string,end=false)=>v?`${v}T${end?"23:59:59":"00:00:00"}Z`:"";

export default function UserManagementWorkspace(){
  const pathname=usePathname();
  const [active,setActive]=useState(false);
  const [left,setLeft]=useState(248);
  const [users,setUsers]=useState<User[]>([]);
  const [plans,setPlans]=useState<Plan[]>([]);
  const [roles,setRoles]=useState<Role[]>([]);
  const [query,setQuery]=useState("");
  const [filters,setFilters]=useState<Filters>(EMPTY_FILTERS);
  const [draftFilters,setDraftFilters]=useState<Filters>(EMPTY_FILTERS);
  const [showFilters,setShowFilters]=useState(false);
  const [page,setPage]=useState(0);
  const [hasNext,setHasNext]=useState(false);
  const [loading,setLoading]=useState(false);
  const [selected,setSelected]=useState<User|null>(null);
  const [showCreate,setShowCreate]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(pathname!=="/admin"){setActive(false);return;}
    const detect=()=>{
      const marker=document.querySelector('input[placeholder="Search by name or email..."]');
      setActive(Boolean(marker));
      const aside=document.querySelector("main.min-h-screen aside");
      const width=aside?.getBoundingClientRect().width||248;
      setLeft(window.innerWidth<1024?0:width);
    };
    detect();
    const observer=new MutationObserver(detect);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
    window.addEventListener("resize",detect);
    return()=>{observer.disconnect();window.removeEventListener("resize",detect)};
  },[pathname]);

  const loadMeta=async()=>{
    const [p,r]=await Promise.all([api("/plans"),api("/roles")]);
    if(p.ok)setPlans(await p.json());
    if(r.ok)setRoles(await r.json());
  };

  const loadUsers=async()=>{
    if(!active)return;
    setLoading(true);setError("");
    const params=new URLSearchParams({q:query.trim(),limit:"51",offset:String(page*50)});
    if(filters.status)params.set("status",filters.status);
    if(filters.plan_id)params.set("plan_id",filters.plan_id);
    if(filters.enrolled_from)params.set("enrolled_from",toIso(filters.enrolled_from));
    if(filters.enrolled_to)params.set("enrolled_to",toIso(filters.enrolled_to,true));
    if(filters.ends_from)params.set("ends_from",toIso(filters.ends_from));
    if(filters.ends_to)params.set("ends_to",toIso(filters.ends_to,true));
    try{const r=await api(`/users?${params.toString()}`);const b=await r.json().catch(()=>[]);if(!r.ok)throw new Error(b.detail||"Unable to load users");setHasNext(Array.isArray(b)&&b.length>50);setUsers(Array.isArray(b)?b.slice(0,50):[]);}catch(e){setError(e instanceof Error?e.message:"Unable to load users");setUsers([])}finally{setLoading(false)}
  };

  useEffect(()=>{if(!active)return;void loadMeta()},[active]);
  useEffect(()=>{if(!active)return;void loadUsers()},[active,page,query,filters.status,filters.plan_id,filters.enrolled_from,filters.enrolled_to,filters.ends_from,filters.ends_to]);

  if(!active)return null;

  const activeFilterCount=Object.values(filters).filter(Boolean).length;
  return <div className="fixed bottom-0 right-0 z-[45] overflow-hidden bg-[#06090d] text-white" style={{top:64,left}}>
    <div className="h-full overflow-auto px-4 py-4 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><h1 className="text-[24px] font-semibold tracking-[-0.03em]">Users</h1><span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2 py-0.5 text-[10px] text-white/40">50 / page</span></div><p className="mt-1 text-[11px] text-white/35">Accounts, subscriptions, access and operational rights.</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={()=>void loadUsers()} className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 text-[11px] text-white/55 hover:bg-white/[0.05] hover:text-white"><RefreshCw size={13} className={loading?"animate-spin":""}/>Refresh</button><button type="button" onClick={()=>setShowCreate(true)} className="flex h-9 items-center gap-2 rounded-lg bg-amber-300 px-3 text-[11px] font-semibold text-black hover:bg-amber-200"><Plus size={14}/>Add user</button></div>
        </div>

        <div className="relative mb-3 flex items-center gap-2">
          <div className="relative min-w-0 flex-1"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25"/><input value={query} onChange={e=>{setPage(0);setQuery(e.target.value)}} placeholder="Search by name or email..." className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0a0e14] pl-9 pr-3 text-[12px] text-white/80 outline-none placeholder:text-white/20 focus:border-amber-300/30"/></div>
          <button type="button" onClick={()=>{setDraftFilters(filters);setShowFilters(v=>!v)}} className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-[11px] ${showFilters||activeFilterCount?"border-amber-300/25 bg-amber-300/[0.06] text-amber-200":"border-white/[0.08] bg-[#0a0e14] text-white/50"}`}><Filter size={13}/>Filters{activeFilterCount>0&&<span className="rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-bold text-black">{activeFilterCount}</span>}</button>
          {showFilters&&<FilterPanel draft={draftFilters} setDraft={setDraftFilters} plans={plans} onClear={()=>{setDraftFilters(EMPTY_FILTERS);setFilters(EMPTY_FILTERS);setPage(0)}} onApply={()=>{setFilters(draftFilters);setPage(0);setShowFilters(false)}}/>}
        </div>

        {error&&<div className="mb-3 rounded-lg border border-red-400/15 bg-red-400/[0.05] px-3 py-2 text-[11px] text-red-200">{error}</div>}
        <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#0a0e14]">
          <div className="grid grid-cols-[minmax(220px,1.7fr)_90px_110px_130px_120px_120px_120px] border-b border-white/[0.06] bg-white/[0.018] px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/30"><div>User</div><div>Status</div><div>Plan</div><div>Role</div><div>Enrolled</div><div>Ends</div><div>Last seen</div></div>
          <div className="divide-y divide-white/[0.05]">
            {loading&&!users.length?<div className="px-4 py-10 text-center text-[11px] text-white/30">Loading users…</div>:users.length===0?<div className="px-4 py-10 text-center text-[11px] text-white/30">No users match the current search or filters.</div>:users.map(u=><button type="button" key={u.id} onClick={()=>setSelected(u)} className="grid w-full grid-cols-[minmax(220px,1.7fr)_90px_110px_130px_120px_120px_120px] items-center px-4 py-2.5 text-left transition hover:bg-white/[0.025]">
              <div className="min-w-0 pr-3"><div className="truncate text-[12px] font-medium text-white/85">{u.display_name||`${u.first_name||""} ${u.last_name||""}`.trim()||"Unnamed user"}</div><div className="mt-0.5 truncate text-[10px] text-white/30">{u.email}</div></div>
              <div><span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${u.status==="active"?"bg-emerald-400/[0.09] text-emerald-300":"bg-white/[0.06] text-white/45"}`}>{u.status}</span></div>
              <div className="text-[11px] text-white/60">{u.plan?.name||"No plan"}</div>
              <div className="truncate text-[11px] text-white/55">{u.roles.map(r=>r.name).join(", ")||"—"}</div>
              <div className="text-[11px] text-white/45">{fmtDate(u.subscription_started_at||u.created_at)}</div>
              <div className={`text-[11px] ${u.subscription_ends_at&&new Date(u.subscription_ends_at)<new Date()?"text-red-300":"text-white/45"}`}>{fmtDate(u.subscription_ends_at)}</div>
              <div className="text-[11px] text-white/40">{u.last_seen_at?fmtDate(u.last_seen_at):"Never"}</div>
            </button>)}
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5"><span className="text-[10px] text-white/30">Page {page+1}</span><div className="flex items-center gap-1"><button type="button" disabled={page===0||loading} onClick={()=>setPage(v=>Math.max(0,v-1))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.07] text-white/40 disabled:opacity-25 hover:bg-white/[0.04]"><ChevronLeft size={14}/></button><button type="button" disabled={!hasNext||loading} onClick={()=>setPage(v=>v+1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.07] text-white/40 disabled:opacity-25 hover:bg-white/[0.04]"><ChevronRight size={14}/></button></div></div>
        </div>
      </div>
    </div>
    {selected&&<UserModal user={selected} plans={plans} roles={roles} onClose={()=>setSelected(null)} onSaved={()=>{setSelected(null);void loadUsers()}}/>}
    {showCreate&&<CreateUserModal plans={plans} roles={roles} onClose={()=>setShowCreate(false)} onCreated={()=>{setShowCreate(false);setPage(0);void loadUsers()}}/>}
  </div>;
}

function FilterPanel({draft,setDraft,plans,onClear,onApply}:{draft:Filters;setDraft:(v:Filters)=>void;plans:Plan[];onClear:()=>void;onApply:()=>void}){
  const set=(k:keyof Filters,v:string)=>setDraft({...draft,[k]:v});
  return <div className="absolute right-0 top-12 z-50 w-[420px] rounded-xl border border-white/[0.10] bg-[#0b1017] p-4 shadow-2xl shadow-black/50"><div className="mb-3 flex items-center justify-between"><div><div className="text-[12px] font-semibold">User filters</div><div className="mt-0.5 text-[10px] text-white/30">Narrow large user lists without loading everything.</div></div><Filter size={14} className="text-amber-200/60"/></div><div className="grid grid-cols-2 gap-3"><Field label="Status"><select value={draft.status} onChange={e=>set("status",e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option></select></Field><Field label="Plan"><select value={draft.plan_id} onChange={e=>set("plan_id",e.target.value)}><option value="">All plans</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Enrolled from"><input type="date" value={draft.enrolled_from} onChange={e=>set("enrolled_from",e.target.value)}/></Field><Field label="Enrolled to"><input type="date" value={draft.enrolled_to} onChange={e=>set("enrolled_to",e.target.value)}/></Field><Field label="Subscription ends from"><input type="date" value={draft.ends_from} onChange={e=>set("ends_from",e.target.value)}/></Field><Field label="Subscription ends to"><input type="date" value={draft.ends_to} onChange={e=>set("ends_to",e.target.value)}/></Field></div><div className="mt-4 flex justify-between"><button type="button" onClick={onClear} className="text-[11px] text-white/35 hover:text-white">Clear all</button><button type="button" onClick={onApply} className="rounded-lg bg-amber-300 px-3 py-2 text-[11px] font-semibold text-black">Apply filters</button></div></div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.1em] text-white/35">{label}</span><span className="block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-white/[0.08] [&_input]:bg-black/20 [&_input]:px-2.5 [&_input]:text-[11px] [&_input]:text-white/75 [&_input]:outline-none [&_select]:h-9 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-white/[0.08] [&_select]:bg-[#0a0e14] [&_select]:px-2.5 [&_select]:text-[11px] [&_select]:text-white/75 [&_select]:outline-none">{children}</span></label>}

function UserModal({user,plans,roles,onClose,onSaved}:{user:User;plans:Plan[];roles:Role[];onClose:()=>void;onSaved:()=>void}){
  const [status,setStatus]=useState(user.status);const [planId,setPlanId]=useState(String(user.plan?.id||""));const [started,setStarted]=useState(user.subscription_started_at?user.subscription_started_at.slice(0,10):user.created_at.slice(0,10));const [ends,setEnds]=useState(user.subscription_ends_at?user.subscription_ends_at.slice(0,10):"");const [roleIds,setRoleIds]=useState<number[]>(user.roles.map(r=>r.id));const [modules,setModules]=useState<Record<string,boolean>>(user.modules||{});const [password,setPassword]=useState("");const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
  const moduleNames=useMemo(()=>Object.keys(modules).sort(),[modules]);
  const toggleRole=(id:number)=>setRoleIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
  const save=async()=>{setSaving(true);setMessage("");const r=await api(`/users/${user.id}`,{method:"PATCH",body:JSON.stringify({status,plan_id:planId?Number(planId):null,subscription_started_at:started?toIso(started):null,subscription_ends_at:ends?toIso(ends,true):null,role_ids:roleIds,modules,password:password||undefined})});const b=await r.json().catch(()=>({}));setSaving(false);if(!r.ok){setMessage(b.detail||"Unable to save user");return}setMessage("Changes saved");setTimeout(onSaved,350)};
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"><div className="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-white/[0.10] bg-[#0b1017] shadow-2xl shadow-black/60"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/[0.07] text-amber-200"><UserRound size={17}/></div><div className="min-w-0"><div className="truncate text-[14px] font-semibold">{user.display_name||"Unnamed user"}</div><div className="truncate text-[10px] text-white/35">{user.email}</div></div></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.05] hover:text-white"><X size={17}/></button></div><div className="overflow-y-auto p-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Info label="Enrolled" value={fmtDateTime(user.subscription_started_at||user.created_at)}/><Info label="Subscription ends" value={fmtDateTime(user.subscription_ends_at)}/><Info label="Last seen" value={fmtDateTime(user.last_seen_at)}/><Info label="Access version" value={String(user.access_version)}/></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><section><h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Account</h3><div className="space-y-3"><Field label="Status"><select value={status} onChange={e=>setStatus(e.target.value)}><option value="active">Active</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option></select></Field><Field label="Plan"><select value={planId} onChange={e=>setPlanId(e.target.value)}><option value="">No plan</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Enrollment date"><input type="date" value={started} onChange={e=>setStarted(e.target.value)}/></Field><Field label="End date"><input type="date" value={ends} onChange={e=>setEnds(e.target.value)}/></Field></div><Field label="Reset password"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Leave blank to keep current password"/></Field></div></section><section><h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Roles</h3><div className="space-y-1.5">{roles.map(r=><label key={r.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2"><span><span className="block text-[11px] text-white/75">{r.name}</span><span className="text-[9px] text-white/25">{r.code}</span></span><input type="checkbox" checked={roleIds.includes(r.id)} onChange={()=>toggleRole(r.id)} /></label>)}</div></section></div><section className="mt-5"><h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Module access</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{moduleNames.map(name=><label key={name} className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-[10px] text-white/60"><input type="checkbox" checked={Boolean(modules[name])} onChange={e=>setModules(v=>({...v,[name]:e.target.checked}))}/><span className="truncate">{name}</span></label>)}</div></section><section className="mt-5"><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Effective permissions</h3><div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">{user.permissions.length?user.permissions.map(p=><span key={p} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[9px] text-white/40">{p}</span>):<span className="text-[10px] text-white/25">No direct permissions.</span>}</div></section></div><div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3"><div className="text-[10px] text-emerald-300/70">{message}</div><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/45 hover:text-white">Cancel</button><button type="button" disabled={saving} onClick={()=>void save()} className="rounded-lg bg-amber-300 px-4 py-2 text-[11px] font-semibold text-black disabled:opacity-50">{saving?"Saving…":"Save changes"}</button></div></div></div></div>;
}

function Info({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5"><div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/25">{label}</div><div className="mt-1 truncate text-[11px] text-white/70">{value}</div></div>}

function CreateUserModal({plans,roles,onClose,onCreated}:{plans:Plan[];roles:Role[];onClose:()=>void;onCreated:()=>void}){
  const [email,setEmail]=useState("");const [name,setName]=useState("");const [password,setPassword]=useState("");const [planId,setPlanId]=useState("");const [roleIds,setRoleIds]=useState<number[]>([]);const [started,setStarted]=useState(new Date().toISOString().slice(0,10));const [ends,setEnds]=useState("");const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  const toggle=(id:number)=>setRoleIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
  const create=async()=>{setSaving(true);setError("");const r=await api("/users",{method:"POST",body:JSON.stringify({email,display_name:name,password,plan_id:planId?Number(planId):null,role_ids:roleIds,subscription_started_at:toIso(started),subscription_ends_at:ends?toIso(ends,true):null})});const b=await r.json().catch(()=>({}));setSaving(false);if(!r.ok){setError(b.detail||"Unable to create user");return}onCreated()};
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4"><div className="w-full max-w-[560px] rounded-2xl border border-white/[0.10] bg-[#0b1017] shadow-2xl shadow-black/60"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div><div className="text-[14px] font-semibold">Add user</div><div className="mt-0.5 text-[10px] text-white/30">Create an account and assign access before launch.</div></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.05]"><X size={17}/></button></div><div className="grid gap-3 p-5"><Field label="Name"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"/></Field><Field label="Email"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="user@example.com"/></Field><Field label="Password"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Temporary password"/></Field><div className="grid grid-cols-2 gap-3"><Field label="Plan"><select value={planId} onChange={e=>setPlanId(e.target.value)}><option value="">No plan</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Subscription ends"><input type="date" value={ends} onChange={e=>setEnds(e.target.value)}/></Field></div><Field label="Enrolled"><input type="date" value={started} onChange={e=>setStarted(e.target.value)}/></Field><div><div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/35">Roles</div><div className="flex flex-wrap gap-2">{roles.map(r=><label key={r.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 py-2 text-[10px] text-white/60"><input type="checkbox" checked={roleIds.includes(r.id)} onChange={()=>toggle(r.id)}/>{r.name}</label>)}</div></div>{error&&<div className="rounded-lg border border-red-400/15 bg-red-400/[0.05] px-3 py-2 text-[10px] text-red-200">{error}</div>}</div><div className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-3"><button type="button" onClick={onClose} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/45">Cancel</button><button type="button" disabled={saving} onClick={()=>void create()} className="rounded-lg bg-amber-300 px-4 py-2 text-[11px] font-semibold text-black disabled:opacity-50">{saving?"Creating…":"Create user"}</button></div></div></div>;
}
