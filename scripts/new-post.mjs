import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const resource = args.includes("--resource");

const positional = args.filter((arg) => arg !== "--resource");

const [categoryPath, ...titleParts] = positional;
const title = titleParts.join(" ").trim();

if (!categoryPath || !title) {
  console.error(
    'Usage: pnpm new <category[/subcategory/...]> "Post title" [--resource]',
  );
  process.exit(1);
}

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Allow nested category paths while normalizing each segment independently.
const categorySegments = categoryPath
  .split(/[\\/]+/)
  .filter(Boolean)
  .map(slugify);

if (categorySegments.some((segment) => !segment)) {
  console.error("Category path contains an invalid or empty segment.");
  process.exit(1);
}

const categoryDir = path.join("posts", ...categorySegments);
const postSlug = slugify(title);

const dir = resource
  ? path.join(categoryDir, `@${postSlug}`)
  : categoryDir;

const file = resource
  ? path.join(dir, "article.md")
  : path.join(dir, `${postSlug}.md`);

await mkdir(dir, { recursive: true });

await writeFile(
  file,
  `---
title: ${JSON.stringify(title)}
excerpt: ""
author: Ajay Singh
tags: []
created_at: ${new Date().toISOString()}
published: false
---

Write here.
`,
  { flag: "wx" },
);

console.log(
  `Created ${file}. Fill in excerpt and tags, then remove "published: false" to publish.`,
);