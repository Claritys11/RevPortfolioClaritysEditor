"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/admin/field";
import { formatBytes } from "@/lib/format";
import type { ContentHealth } from "@/lib/content-health";
import {
  commitRepositoryAction,
  fetchRepositoryRemoteAction,
  getRepositoryDiffAction,
  inspectRepositoryAction,
  pushRepositoryAction,
} from "@/lib/admin/actions/repository";

type HealthData = Awaited<ReturnType<typeof inspectRepositoryAction>>;

function StateLine({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="grid gap-1 border-b border-border py-2 sm:grid-cols-[12rem_8rem_1fr]">
      <span className="text-sm">{label}</span>
      <span className={ok ? "meta text-green-600" : "meta text-destructive"}>{ok ? "PASS" : "CHECK"}</span>
      {detail && <span className="break-all text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

type ContentHealthData = ContentHealth;

export function RepositoryPanel({ initial, content }: { initial: { root: string; remote: string; branch: string; status: string; diffStat: string; diffCheck: { ok: boolean; output: string }; upstream: string | null; ahead: number; behind: number; instanceName: string; templateName: string; templateContractVersion: number }; content: ContentHealthData }) {
  const router = useRouter();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [diff, setDiff] = useState<{ stat: string; patch: string } | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [message, setMessage] = useState("content: update portfolio");
  const [busy, start] = useTransition();

  async function inspect() {
    start(async () => {
      const result = await inspectRepositoryAction();
      setHealth(result);
      if (!result.ok) toast.error(result.error);
    });
  }

  async function showDiff() {
    start(async () => {
      const result = await getRepositoryDiffAction();
      if (result.ok) setDiff(result.data);
      else toast.error(result.error);
    });
  }

  async function commit() {
    start(async () => {
      const result = await commitRepositoryAction(message);
      if (result.ok) {
        toast.success("Committed content and public assets.");
        setDiff(null);
      } else toast.error(result.error);
    });
  }

  async function push() {
    start(async () => {
      const result = await pushRepositoryAction();
      if (result.ok) toast.success("Pushed to origin.");
      else toast.error(result.error);
    });
  }

  async function fetchRemote() {
    start(async () => {
      const result = await fetchRepositoryRemoteAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSyncMessage(result.data.message);
      if (result.data.outcome === "updated" || result.data.outcome === "up-to-date") toast.success(result.data.message);
      else toast.warning(result.data.message);
      router.refresh();
    });
  }

  const healthData = health?.ok ? health.data : null;
  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <h2 className="meta">repository identity</h2>
        <div className="rounded-md border border-border p-4 text-sm">
          <p className="mb-2 font-medium">{initial.instanceName} <span className="meta ml-2">production</span></p>
          <p className="break-all font-mono">{initial.root}</p>
          <p className="mt-2 break-all text-xs text-muted-foreground">{initial.remote || "No origin remote"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Branch: {initial.branch || "detached HEAD"}</p>
          <p className="mt-3 text-xs text-muted-foreground">This panel inspects the configured website repository, not the editor repository.</p>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="meta">content health · read only</h2>
        {content.ok ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border p-4">
                <p className="meta text-muted-foreground">writeups</p>
                <p className="mt-1 font-display text-3xl font-bold">{content.inventory.writeups.total}</p>
                <p className="mt-1 text-xs text-muted-foreground">{content.inventory.writeups.published} published · {content.inventory.writeups.draft} draft</p>
              </div>
              <div className="rounded-md border border-border p-4">
                <p className="meta text-muted-foreground">projects</p>
                <p className="mt-1 font-display text-3xl font-bold">{content.inventory.projects.total}</p>
                <p className="mt-1 text-xs text-muted-foreground">{content.inventory.projects.withImage} with an image</p>
              </div>
              <div className="rounded-md border border-border p-4">
                <p className="meta text-muted-foreground">certificates</p>
                <p className="mt-1 font-display text-3xl font-bold">{content.inventory.achievements.total}</p>
                <p className="mt-1 text-xs text-muted-foreground">{content.inventory.achievements.withImage} image · {content.inventory.achievements.withDocument} document</p>
              </div>
            </div>
            <div className="rounded-md border border-border px-3">
              <StateLine
                label="Asset references"
                ok={content.assets.missing.length === 0}
                detail={content.assets.missing.length === 0 ? `All ${content.assets.referencedUploads} referenced uploads resolve to files on disk.` : `${content.assets.missing.length} reference(s) point at files that do not exist.`}
              />
              <StateLine
                label="Unreferenced uploads"
                ok={content.assets.orphaned.length === 0}
                detail={content.assets.orphaned.length === 0 ? `Every one of the ${content.assets.uploads} uploads is referenced by content.` : `${content.assets.orphaned.length} of ${content.assets.uploads} uploads (${formatBytes(content.assets.orphanedBytes)}) are not referenced by any content file.`}
              />
              <StateLine
                label="Draft writeups"
                ok={content.inventory.writeups.draft === 0}
                detail={content.inventory.writeups.draft === 0 ? "No drafts pending." : `${content.inventory.writeups.draft} draft(s) are saved but excluded from the published site.`}
              />
              <StateLine
                label="Upload storage"
                ok
                detail={`${content.assets.uploads} files · ${formatBytes(content.assets.uploadBytes)} · ${content.assets.external} external and ${content.assets.unmanaged} unmanaged URL(s) not inspected`}
              />
            </div>
            {content.assets.missing.length > 0 && (
              <details className="rounded-md border border-destructive/40 p-3">
                <summary className="cursor-pointer text-sm text-destructive">Broken references ({content.assets.missing.length})</summary>
                <ul className="mt-3 grid gap-2 text-xs">
                  {content.assets.missing.map((item) => (
                    <li key={item.url} className="break-all">
                      <span className="font-mono">{item.url}</span>
                      <span className="text-muted-foreground"> — {item.sources.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {content.assets.orphaned.length > 0 && (
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm">Unreferenced uploads ({content.assets.orphaned.length})</summary>
                <ul className="mt-3 grid gap-1 text-xs">
                  {content.assets.orphaned.map((item) => (
                    <li key={item.name} className="flex justify-between gap-3 break-all">
                      <span className="font-mono">{item.name}</span>
                      <span className="shrink-0 text-muted-foreground">{formatBytes(item.bytes)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">Nothing is deleted automatically. Remove files manually only after confirming they are unused.</p>
              </details>
            )}
            <p className="text-xs text-muted-foreground">Computed from the production working tree on each page load. No network calls, no writes.</p>
          </div>
        ) : (
          <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">Content inspection failed: {content.error}</p>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="meta">working tree</h2>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={fetchRemote}>Fetch remote</Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={showDiff}>Show diff</Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={inspect}>Run health check</Button>
          </div>
        </div>
        <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Remote tracking</p>
          <p className="mt-1 break-all">{initial.upstream ?? "No upstream branch configured"} · {initial.ahead} ahead · {initial.behind} behind</p>
          <p className="mt-2">Automatic fetch runs when the Editor server boots. Fetch remote checks origin now and fast-forwards only when the working tree is clean and the branch has not diverged.</p>
          {syncMessage && <p className="mt-2 text-foreground">Last manual fetch: {syncMessage}</p>}
        </div>
        <pre className="max-h-64 overflow-auto rounded-md border border-border p-3 font-mono text-xs">{initial.status || "Clean working tree"}</pre>
        <p className="text-xs text-muted-foreground">{initial.diffStat || "No unstaged diff."}</p>
      </section>

      {health && (
        <section className="grid gap-3">
          <h2 className="meta">repository doctor</h2>
          {!health.ok ? (
            <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{health.error}</p>
          ) : (
            <div className="rounded-md border border-border px-3">
              <StateLine label="Repository root" ok={healthData!.root === healthData!.expectedRoot} detail={healthData!.root} />
              <StateLine label="Expected remote" ok={healthData!.remoteMatches} detail={"Expected: " + healthData!.expectedRemote + " · Actual: " + healthData!.remote} />
              <StateLine label="Git object integrity" ok={healthData!.fsck.ok} detail={healthData!.fsck.output || "git fsck --full --strict returned no errors"} />
              <StateLine label="Content files" ok={healthData!.content.ok} detail={healthData!.content.output} />
              <StateLine label="Static build output" ok={healthData!.staticOutput.ok} detail={healthData!.staticOutput.output} />
              <StateLine label="Remote connectivity" ok={healthData!.remoteConnectivity.ok} detail={healthData!.remoteConnectivity.ok ? "origin is reachable" : healthData!.remoteConnectivity.output} />
              <StateLine label="Whitespace / patch" ok={healthData!.diffCheck.ok} detail={healthData!.diffCheck.output || "git diff --check passed"} />
              <StateLine label="Working tree" ok={!healthData!.status.split("\n").some((line) => line && !line.startsWith("##"))} detail={healthData!.status} />
            </div>
          )}
        </section>
      )}

      {diff && (
        <section className="grid gap-2">
          <h2 className="meta">git diff</h2>
          <pre className="max-h-[28rem] overflow-auto rounded-md border border-border p-3 font-mono text-xs">{diff.stat || "No diff"}</pre>
          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm">View patch</summary>
            <pre className="mt-3 max-h-[36rem] overflow-auto whitespace-pre-wrap break-all font-mono text-xs">{diff.patch || "No patch"}</pre>
          </details>
        </section>
      )}

      <section className="grid gap-3 border-t border-border pt-6">
        <h2 className="meta">explicit publishing actions</h2>
        <Field label="Commit message" name="commit-message">
          <Input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={160} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !initial.status.trim()} onClick={commit}>Commit content + assets</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={push}>Push to origin</Button>
        </div>
        <p className="text-xs text-muted-foreground">Commit stages only content/ and public/assets/. Push transmits the existing commits on the current branch. Neither action runs automatically on Save.</p>
      </section>
    </div>
  );
}
