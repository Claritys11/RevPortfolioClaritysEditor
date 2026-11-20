import { RepositoryPanel } from "@/components/admin/repository-panel";
import { repositoryStatus } from "@/lib/editor-repository";
import { contentHealth } from "@/lib/content-health";

export default async function RepositoryPage() {
  const [status, content] = await Promise.all([repositoryStatus(), contentHealth()]);
  return (
    <div className="grid gap-8">
      <header>
        <p className="meta mb-2">repository sync and diagnostics</p>
        <h1 className="font-display text-4xl font-bold tracking-tight">Repository health</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Inspect repository integrity, working-tree state and content health, or fetch the latest remote commits. Fetch updates files only through a clean fast-forward; it never resets, rebases or discards local work.</p>
      </header>
      <RepositoryPanel initial={status} content={content} />
    </div>
  );
}
