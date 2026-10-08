import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { compile } from "@mdx-js/mdx";
import matter from "gray-matter";
import { z } from "zod";

const POSTS_DIR = "posts";
const ASSETS_DIR = "assets";
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(["tag", "post", "api"]); // URL segments the portfolio already uses

const schema = z.strictObject({
  title: z.string().min(1),
  excerpt: z.string(),
  author: z.string().min(1),
  tags: z.array(z.string().min(1)),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date().optional(),
  published: z.boolean().optional(),
  slug: z.string().optional(), // legacy field; must match the filename if present
});

const errors = [];
const warnings = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);
const exists = (p) => stat(p).then(() => true, () => false);

async function checkPost(rel, category, slug, ext) {
  const { data, content } = matter(await readFile(rel, "utf8"));

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fail(rel, `frontmatter ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return;
  }

  const meta = parsed.data;
  if (meta.slug && meta.slug !== slug) fail(rel, `slug "${meta.slug}" does not match filename`);
  if (meta.updated_at && meta.updated_at < meta.created_at) {
    fail(rel, "updated_at is earlier than created_at");
  }
  if (meta.published !== false) {
    if (!meta.excerpt.trim()) fail(rel, "excerpt is required for published posts");
    if (meta.tags.length === 0) fail(rel, "at least one tag is required for published posts");
  }

  try {
    await compile({ value: content, path: rel }, { format: ext === ".mdx" ? "mdx" : "md" });
  } catch (error) {
    fail(rel, `does not compile: ${error.message}`);
  }

  const assetBase = path.join(ASSETS_DIR, category, slug);

  for (const [, target] of content.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
    if (/^(https?:|data:|\/|#)/.test(target)) continue;

    const file = path.join(assetBase, decodeURI(target.split(/[?#]/)[0]));
    if (path.relative(assetBase, file).startsWith("..")) {
      fail(rel, `image must live in ${assetBase}/: ${target}`);
    } else if (!(await exists(file))) {
      fail(rel, `image not found: ${target} (expected in ${assetBase}/)`);
    }
  }
}

let posts = 0;
const slugs = new Map();

for (const entry of await readdir(POSTS_DIR, { withFileTypes: true })) {
  if (entry.name.startsWith(".")) continue;
  const dir = path.join(POSTS_DIR, entry.name);

  if (!entry.isDirectory()) {
    fail(dir, "posts must live inside a category folder");
    continue;
  }
  if (!KEBAB.test(entry.name)) fail(dir, "category folder must be lowercase kebab-case");
  if (RESERVED.has(entry.name)) fail(dir, `"${entry.name}" is a reserved category name`);

  for (const file of await readdir(dir, { withFileTypes: true })) {
    if (file.name.startsWith(".")) continue;
    const rel = path.join(dir, file.name);
    const ext = path.extname(file.name);

    if (!file.isFile()) {
      fail(rel, "nested folders are not supported");
      continue;
    }
    if (![".mdx", ".md"].includes(ext)) {
      fail(rel, "only .mdx and .md files are allowed");
      continue;
    }

    const slug = path.basename(file.name, ext);
    if (!KEBAB.test(slug)) fail(rel, "filename must be lowercase kebab-case");
    if (slugs.has(slug)) warnings.push(`${rel}: slug also used in ${slugs.get(slug)}`);
    slugs.set(slug, entry.name);

    posts += 1;
    await checkPost(rel, entry.name, slug, ext);
  }
}

for (const warning of warnings) console.warn(`warning  ${warning}`);
for (const error of errors) console.error(`error    ${error}`);
console.log(`\nChecked ${posts} posts: ${errors.length} errors, ${warnings.length} warnings.`);
process.exitCode = errors.length ? 1 : 0;