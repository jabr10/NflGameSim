/** True when real Clerk keys are present (not the build placeholders). */
export function isClerkConfigured(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  if (!pk.startsWith("pk_") || !sk.startsWith("sk_")) return false;
  if (sk.includes("placeholder")) return false;
  if (pk.includes("nflgamesim.lcl.dev")) return false;
  return true;
}
