import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import { z } from "zod";

const AUTHORS_DIR = "authors";
const POSTS_DIR = "posts";
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const schema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().optional(),
  avatar: z.string().optional(),
  location: z.string().optional(),
  github: z.string().optional(),
  x: z.string().optional(),
  linkedin: z.string().optional(),
  website: z.url().optional(),
  email: z.email().optional(),
});

const errors = [];
const warnings = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);
const exists = (p) => stat(p).then(() => true, () => false);

async function markdownFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(full)));
    else if (/\.mdx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

const authors = [];

if (await exists(AUTHORS_DIR)) {
  for (const file of await readdir(AUTHORS_DIR)) {
    if (!file.endsWith(".md") || file.toLowerCase() === "readme.md") continue;

    const rel = path.join(AUTHORS_DIR, file);
    const id = file.slice(0, -3);

    if (!KEBAB.test(id)) fail(rel, "filename must be lowercase kebab-case");

    let parsed;
    try {
      parsed = matter(await readFile(rel, "utf8"));
    } catch (error) {
      fail(rel, `invalid frontmatter: ${error.message}`);
      continue;
    }

    const result = schema.safeParse(parsed.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        fail(rel, `${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }

    const meta = result.data;
    if (meta.id !== id) fail(rel, `id "${meta.id}" does not match filename "${id}"`);
    if (!parsed.content.trim()) warnings.push(`${rel}: bio is empty`);

    if (meta.avatar && !/^https?:\/\//i.test(meta.avatar)) {
      const file = path.join(AUTHORS_DIR, meta.avatar);
      if (path.relative(AUTHORS_DIR, file).startsWith("..")) {
        fail(rel, `avatar must stay inside ${AUTHORS_DIR}/: ${meta.avatar}`);
      } else if (!(await exists(file))) {
        fail(rel, `avatar not found: ${meta.avatar}`);
      }
    }

    authors.push(meta);
  }
}

// Posts may name an author by id, GitHub username or full name.
const known = new Set(
  authors.flatMap((a) => [a.id, a.github, a.name].filter(Boolean).map((v) => v.toLowerCase())),
);

for (const file of await markdownFiles(POSTS_DIR)) {
  let data;
  try {
    data = matter(await readFile(file, "utf8")).data;
  } catch {
    continue; // the main validator reports frontmatter problems
  }

  if (typeof data.author === "string" && !known.has(data.author.trim().toLowerCase())) {
    warnings.push(`${file}: author "${data.author}" has no file in ${AUTHORS_DIR}/ (shown as plain text)`);
  }
}

for (const warning of warnings) console.warn(`warning  ${warning}`);
for (const error of errors) console.error(`error    ${error}`);
console.log(`\nChecked ${authors.length} authors: ${errors.length} errors, ${warnings.length} warnings.`);
process.exitCode = errors.length ? 1 : 0;