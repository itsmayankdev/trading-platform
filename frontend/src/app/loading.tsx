"use client";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <div className="flex h-12 items-center border-b border-white/8 px-4">
        <div className="h-7 w-7 animate-pulse rounded-md bg-white/10" />
        <div className="ml-3 h-3 w-28 animate-pulse rounded bg-white/10" />
      </div>
      <div className="flex">
        <aside className="hidden h-[calc(100vh-48px)] w-[188px] border-r border-white/7 bg-[#090d13] lg:block">
          <div className="space-y-2 px-3 py-4">
            <div className="h-8 animate-pulse rounded bg-white/[0.03]" />
            <div className="h-8 animate-pulse rounded bg-white/[0.03]" />
            <div className="h-8 animate-pulse rounded bg-white/[0.03]" />
            <div className="h-8 animate-pulse rounded bg-white/[0.03]" />
            <div className="h-8 animate-pulse rounded bg-white/[0.03]" />
          </div>
        </aside>
        <section className="min-w-0 flex-1 px-6 py-7 sm:px-10">
          <div className="h-6 w-48 animate-pulse rounded bg-white/10" />
          <div className="mt-3 h-4 w-80 animate-pulse rounded bg-white/[0.05]" />
          <div className="mt-6 h-40 animate-pulse rounded-lg border border-white/7 bg-white/[0.02]" />
        </section>
      </div>
    </main>
  );
}
