import { AutoRefreshProvider } from "@/components/auto-refresh-provider";
import { DashboardHeader } from "@/components/dashboard-header";
import { StatsCards } from "@/components/stats-cards";
import { SavedTweetsFeed } from "@/components/saved-tweets-feed";
import { SpamChecksFeed } from "@/components/spam-checks-feed";
import { Leaderboard } from "@/components/leaderboard";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <AutoRefreshProvider>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <DashboardHeader />
        <StatsCards />
        <Separator />
        <section>
          <h2 className="text-lg font-semibold mb-4">Leaderboard</h2>
          <Leaderboard />
        </section>
        <Separator />
        <section>
          <h2 className="text-lg font-semibold mb-4">Recent Spam Checks</h2>
          <SpamChecksFeed />
        </section>
        <Separator />
        <section>
          <h2 className="text-lg font-semibold mb-4">Recent Saves</h2>
          <SavedTweetsFeed />
        </section>
        <footer className="text-center pt-8 border-t text-sm text-muted-foreground">
          <p>
            Powered by{" "}
            <a
              href="https://ethos.network"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Ethos Network
            </a>
            {" · "}
            <a
              href="https://x.com/ethosAgent"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              @ethosAgent
            </a>
          </p>
          <p className="mt-2 flex items-center justify-center gap-2 text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Auto-refreshes every 30 seconds
          </p>
        </footer>
      </div>
    </AutoRefreshProvider>
  );
}
