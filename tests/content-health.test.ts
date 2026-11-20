import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contentHealth } from "@/lib/content-health";

let temporaryRoot: string | undefined;

const UPLOADS = ["used.png", "orphan.png", "body-embedded.png"];

async function makeContentRepo() {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "elaang-content-health-"));
  const root = temporaryRoot;
  await mkdir(path.join(root, ".git"));
  await mkdir(path.join(root, "content", "writeups"), { recursive: true });
  await mkdir(path.join(root, "public", "assets", "uploads"), { recursive: true });
  await writeFile(path.join(root, "portfolio.repo.json"), JSON.stringify({ schemaVersion: 1, role: "production", instanceName: "Health Test", templateName: "Portfolio Base", templateContractVersion: 1 }));
  vi.stubEnv("PORTFOLIO_REPO_PATH", root);

  // One published writeup with a structured attachment plus a body-embedded image.
  await writeFile(
    path.join(root, "content", "writeups", "published-one.md"),
    [
      "---",
      'slug: "published-one"',
      'title: "Published One"',
      'status: "published"',
      'attachments: [{"url":"/assets/uploads/used.png","name":"used.png","contentType":"image/png"}]',
      "---",
      "",
      "Body references ![inline](/assets/uploads/body-embedded.png) directly.",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "content", "writeups", "draft-one.md"),
    ["---", 'slug: "draft-one"', 'title: "Draft One"', 'status: "draft"', "---", "", "Draft body.", ""].join("\n"),
  );

  await writeFile(
    path.join(root, "content", "projects.json"),
    JSON.stringify([
      { id: "p1", title: "With image", imageUrl: "/assets/uploads/used.png", projectUrl: null, category: "tool", tags: [], description: "" },
      { id: "p2", title: "External image", imageUrl: "https://cdn.example.test/remote.png", projectUrl: null, category: "tool", tags: [], description: "" },
    ]),
  );
  await writeFile(
    path.join(root, "content", "achievements.json"),
    JSON.stringify([
      { id: "a1", title: "Cert", issuer: "Issuer", platform: null, description: "", imageUrl: "/assets/uploads/missing-cert.png", date: null, proofScore: null, documentUrl: "/assets/uploads/used.png" },
    ]),
  );
  await writeFile(path.join(root, "content", "profile.json"), JSON.stringify({ profileImageUrl: "/profile.jpg" }));
  await writeFile(path.join(root, "public", "profile.jpg"), "static-asset");

  for (const name of UPLOADS) await writeFile(path.join(root, "public", "assets", "uploads", name), name.repeat(4));
  return root;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("contentHealth", () => {
  it("counts writeups by status and summarises projects and certificates", async () => {
    await makeContentRepo();
    const health = await contentHealth();
    expect(health).toMatchObject({
      ok: true,
      inventory: {
        writeups: { total: 2, published: 1, draft: 1 },
        projects: { total: 2, withImage: 2 },
        achievements: { total: 1, withImage: 1, withDocument: 1 },
      },
    });
  });

  it("reports uploads no content file references, largest first", async () => {
    await makeContentRepo();
    const health = await contentHealth();
    if (!health.ok) throw new Error(health.error);
    expect(health.assets.uploads).toBe(3);
    expect(health.assets.orphaned.map((item) => item.name)).toEqual(["orphan.png"]);
    expect(health.assets.orphanedBytes).toBeGreaterThan(0);
  });

  it("resolves structured attachments and body-embedded upload URLs", async () => {
    await makeContentRepo();
    const health = await contentHealth();
    if (!health.ok) throw new Error(health.error);
    expect(health.assets.referencedUploads).toBe(2);
    expect(health.assets.orphaned.map((item) => item.name)).not.toContain("body-embedded.png");
  });

  it("flags referenced files that are absent and names their sources", async () => {
    await makeContentRepo();
    const health = await contentHealth();
    if (!health.ok) throw new Error(health.error);
    const missing = health.assets.missing.find((item) => item.url === "/assets/uploads/missing-cert.png");
    expect(missing).toBeDefined();
    expect(missing?.sources).toEqual(["achievements/a1"]);
  });

  it("counts references outside the managed roots without inspecting them", async () => {
    const root = await makeContentRepo();
    await rm(path.join(root, "public", "profile.jpg"));
    const health = await contentHealth();
    if (!health.ok) throw new Error(health.error);
    expect(health.assets.unmanaged).toBe(1);
    expect(health.assets.missing.map((item) => item.url)).not.toContain("/profile.jpg");
    expect(health.assets.orphaned.map((item) => item.name)).not.toContain("profile.jpg");
  });

  it("leaves external URLs alone and counts them", async () => {
    await makeContentRepo();
    const health = await contentHealth();
    if (!health.ok) throw new Error(health.error);
    expect(health.assets.external).toBe(1);
    expect(health.assets.missing.map((item) => item.url)).not.toContain("https://cdn.example.test/remote.png");
  });

  it("summarises actionable issues", async () => {
    await makeContentRepo();
    const health = await contentHealth();
    if (!health.ok) throw new Error(health.error);
    const labels = health.issues.map((issue) => issue.label);
    expect(labels).toContain("1 broken asset reference");
    expect(labels).toContain("1 unreferenced upload");
    expect(labels).toContain("1 draft writeup");
  });

  it("reports a clean tree when every upload is referenced and nothing is missing", async () => {
    const root = await makeContentRepo();
    await rm(path.join(root, "public", "assets", "uploads", "orphan.png"));
    await writeFile(
      path.join(root, "content", "achievements.json"),
      JSON.stringify([{ id: "a1", title: "Cert", issuer: "Issuer", platform: null, description: "", imageUrl: "/assets/uploads/used.png", date: null, proofScore: null, documentUrl: null }]),
    );
    await rm(path.join(root, "content", "writeups", "draft-one.md"));
    const health = await contentHealth();
    if (!health.ok) throw new Error(health.error);
    expect(health.assets.missing).toEqual([]);
    expect(health.assets.orphaned).toEqual([]);
    expect(health.issues).toEqual([]);
  });
});
