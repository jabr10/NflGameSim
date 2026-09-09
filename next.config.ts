import type { NextConfig } from "next";

// Placeholders so `next build` can compile without a Clerk instance.
// Replace with real keys in `.env.local` before running the app.
if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
    "pk_test_Y2xlcmsubmZsZ2FtZXNpbS5sY2wuZGV2JA";
}
if (!process.env.CLERK_SECRET_KEY) {
  process.env.CLERK_SECRET_KEY = "sk_test_placeholder_for_local_build_only";
}
if (!process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL) {
  process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL = "/sign-in";
}
if (!process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL) {
  process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL = "/sign-up";
}

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": ["./fixtures/**/*"],
    "/games/[game_id]": ["./fixtures/**/*"],
    "/fantasy": ["./fixtures/**/*"],
    "/api/sim": ["./fixtures/**/*"],
  },
};

export default nextConfig;
