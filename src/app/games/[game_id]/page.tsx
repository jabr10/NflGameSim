import { notFound } from "next/navigation";
import { GameDetailClient } from "@/components/GameDetailClient";
import { gameExists, loadGame } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ game_id: string }>;
}) {
  const { game_id } = await params;
  if (!gameExists(game_id)) notFound();
  const sim = loadGame(game_id);
  return <GameDetailClient initial={sim} />;
}
