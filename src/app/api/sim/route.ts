import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { gameExists, loadGame } from "@/lib/fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { game_id?: string } = {};
  try {
    body = (await request.json()) as { game_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gameId = body.game_id;
  if (!gameId || !gameExists(gameId)) {
    return NextResponse.json({ error: "Unknown game_id" }, { status: 404 });
  }

  // Stub: ignore toggles and return the committed fixture.
  return NextResponse.json(loadGame(gameId));
}
