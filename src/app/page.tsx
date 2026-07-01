import { CreateGameForm } from "@/components/CreateGameForm";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50">🃏 Poker Night</h1>
        <p className="mt-2 text-zinc-400">Create a game, share the link, and play Texas Hold&apos;em with your friends.</p>
      </div>
      <CreateGameForm />
    </div>
  );
}
