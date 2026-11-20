import "server-only";

import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { repoPath, readRepoJson, readRepoText } from "@/lib/editor-repository";
import { parseArticleFile, type EditorAchievement, type EditorProfile, type EditorProject } from "@/lib/editor-content";
import { formatBytes } from "@/lib/format";

const WRITEUPS_DIR = "content/writeups";
const UPLOADS_DIR = "public/assets/uploads";
const UPLOADS_PREFIX = "/assets/uploads/";

/** A local asset reference found in content, with the files that mention it. */
type Reference = { url: string; sources: Set<string> };

export type ContentHealth =
  | {
      ok: true;
      generatedAt: string;
      inventory: {
        writeups: { total: number; published: number; draft: number };
        projects: { total: number; withImage: number };
        achievements: { total: number; withImage: number; withDocument: number };
      };
      assets: {
        uploads: number;
        uploadBytes: number;
        referencedUploads: number;
        orphaned: { name: string; bytes: number }[];
        orphanedBytes: number;
        missing: { url: string; sources: string[] }[];
        external: number;
        unmanaged: number;
      };
      issues: { label: string; detail: string }[];
    }
  | { ok: false; generatedAt: string; error: string };

function isExternal(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url) || url.startsWith("data:");
}

/** Collect every local asset URL mentioned by the managed content files. */
function collect(references: Map<string, Reference>, url: string | null | undefined, source: string) {
  if (!url) return;
  const trimmed = url.trim();
  if (!trimmed || isExternal(trimmed)) return;
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const existing = references.get(normalized);
  if (existing) existing.sources.add(source);
  else references.set(normalized, { url: normalized, sources: new Set([source]) });
}

/** Pull upload URLs embedded in Markdown/HTML bodies, not just structured fields. */
function collectFromBody(references: Map<string, Reference>, body: string, source: string) {
  for (const match of body.matchAll(/\/assets\/uploads\/[^\s)"'<>\\]+/g)) {
    collect(references, match[0], source);
  }
}

export async function contentHealth(): Promise<ContentHealth> {
  const generatedAt = new Date().toISOString();
  try {
    const references = new Map<string, Reference>();
    let external = 0;
    let unmanaged = 0;
    const noteExternal = (url: string | null | undefined) => {
      if (url && isExternal(url.trim())) external += 1;
    };

    // Writeups: structured attachments plus anything embedded in the body.
    const writeupNames = (await readdir(await repoPath(WRITEUPS_DIR)).catch(() => [] as string[]))
      .filter((name) => name.endsWith(".md"))
      .sort();
    let published = 0;
    let draft = 0;
    for (const name of writeupNames) {
      const article = parseArticleFile(await readRepoText(`${WRITEUPS_DIR}/${name}`), name);
      if (article.status === "published") published += 1;
      else draft += 1;
      const source = `writeups/${article.slug}`;
      for (const attachment of article.attachments) {
        collect(references, attachment.url, source);
        noteExternal(attachment.url);
      }
      collectFromBody(references, article.content, source);
    }

    const projects = await readRepoJson<EditorProject[]>("content/projects.json").catch(() => [] as EditorProject[]);
    for (const project of projects ?? []) {
      collect(references, project.imageUrl, `projects/${project.id}`);
      noteExternal(project.imageUrl);
    }

    const achievements = await readRepoJson<EditorAchievement[]>("content/achievements.json").catch(() => [] as EditorAchievement[]);
    for (const achievement of achievements ?? []) {
      const source = `achievements/${achievement.id}`;
      collect(references, achievement.imageUrl, source);
      collect(references, achievement.documentUrl, source);
      noteExternal(achievement.imageUrl);
      noteExternal(achievement.documentUrl);
    }

    const profile = await readRepoJson<EditorProfile>("content/profile.json").catch(() => null);
    if (profile) {
      collect(references, profile.profileImageUrl, "profile");
      noteExternal(profile.profileImageUrl);
    }

    // Inventory of files actually present in the managed uploads directory.
    const uploadNames = (await readdir(await repoPath(UPLOADS_DIR)).catch(() => [] as string[])).sort();
    const uploads = new Map<string, number>();
    let uploadBytes = 0;
    for (const name of uploadNames) {
      const info = await stat(path.join(await repoPath(UPLOADS_DIR), name)).catch(() => null);
      if (!info?.isFile()) continue;
      uploads.set(name, info.size);
      uploadBytes += info.size;
    }

    const referencedUploads = new Set<string>();
    const missing: { url: string; sources: string[] }[] = [];
    for (const reference of references.values()) {
      if (reference.url.startsWith(UPLOADS_PREFIX)) {
        const name = decodeURIComponent(reference.url.slice(UPLOADS_PREFIX.length));
        if (uploads.has(name)) referencedUploads.add(name);
        else missing.push({ url: reference.url, sources: [...reference.sources].sort() });
        continue;
      }
      // Anything outside public/assets/ (e.g. /profile.jpg) is beyond the
      // editor's managed roots, so it is counted but deliberately not inspected.
      unmanaged += 1;
    }

    const orphaned = [...uploads.entries()]
      .filter(([name]) => !referencedUploads.has(name))
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));

    const issues: { label: string; detail: string }[] = [];
    if (missing.length) {
      issues.push({
        label: `${missing.length} broken asset reference${missing.length === 1 ? "" : "s"}`,
        detail: missing.slice(0, 5).map((item) => `${item.url} (${item.sources.join(", ")})`).join("; "),
      });
    }
    if (orphaned.length) {
      issues.push({
        label: `${orphaned.length} unreferenced upload${orphaned.length === 1 ? "" : "s"}`,
        detail: `${formatBytes(orphaned.reduce((sum, item) => sum + item.bytes, 0))} of uploads no content file points at.`,
      });
    }
    if (draft) {
      issues.push({ label: `${draft} draft writeup${draft === 1 ? "" : "s"}`, detail: "Drafts are saved but excluded from the published site." });
    }

    return {
      ok: true,
      generatedAt,
      inventory: {
        writeups: { total: writeupNames.length, published, draft },
        projects: { total: (projects ?? []).length, withImage: (projects ?? []).filter((item) => Boolean(item.imageUrl)).length },
        achievements: {
          total: (achievements ?? []).length,
          withImage: (achievements ?? []).filter((item) => Boolean(item.imageUrl)).length,
          withDocument: (achievements ?? []).filter((item) => Boolean(item.documentUrl)).length,
        },
      },
      assets: {
        uploads: uploads.size,
        uploadBytes,
        referencedUploads: referencedUploads.size,
        orphaned,
        orphanedBytes: orphaned.reduce((sum, item) => sum + item.bytes, 0),
        missing: missing.sort((a, b) => a.url.localeCompare(b.url)),
        external,
        unmanaged,
      },
      issues,
    };
  } catch (error) {
    return { ok: false, generatedAt, error: error instanceof Error ? error.message : "Content inspection failed." };
  }
}
