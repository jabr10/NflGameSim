"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

export function Header({ authEnabled }: { authEnabled: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#070b14]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-baseline gap-2 font-semibold tracking-tight">
          <span className="text-emerald-400">NflGameSim</span>
          <span className="hidden text-xs font-normal text-slate-400 sm:inline">
            week board
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-slate-300 hover:text-white">
            Week
          </Link>
          <Link href="/fantasy" className="text-slate-300 hover:text-white">
            Fantasy
          </Link>
          {authEnabled ? (
            <>
              <SignedIn>
                <UserButton />
              </SignedIn>
              <SignedOut>
                <SignInButton mode="redirect">
                  <button className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400">
                    Sign in
                  </button>
                </SignInButton>
              </SignedOut>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
