import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold text-white">Not found</h1>
      <p className="text-slate-400">That game is not on the current-week slate.</p>
      <Link href="/" className="text-emerald-400 hover:text-emerald-300">
        Back to week board
      </Link>
    </div>
  );
}
