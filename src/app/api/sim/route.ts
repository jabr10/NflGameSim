import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { WEEK_PACK_SEASON, WEEK_PACK_WEEK } from "@/lib/constants";
import { isClerkConfigured } from "@/lib/clerk-config";
import { engineReady, EngineNotWiredError, runSim, SimEngineError } from "@/lib/engine";
import { gameExists, loadGame } from "@/lib/fixtures";
import { parseSimRequest } from "@/lib/sim-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (isClerkConfigured()) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gameId =
    typeof raw === "object" && raw != null && "game_id" in raw && typeof raw.game_id === "string"
      ? raw.game_id
      : "";

  let defaults = { season: WEEK_PACK_SEASON, week: WEEK_PACK_WEEK };
  if (gameId && gameExists(gameId)) {
    const game = loadGame(gameId);
    defaults = { season: game.season, week: game.week };
  }

  const parsed = parseSimRequest(raw, defaults);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (!engineReady() && !gameExists(parsed.value.game_id)) {
    return NextResponse.json({ error: "Unknown game_id" }, { status: 404 });
  }

  try {
    const result = await runSim(parsed.value);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EngineNotWiredError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
    }
    if (err instanceof SimEngineError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    throw err;
  }
}
