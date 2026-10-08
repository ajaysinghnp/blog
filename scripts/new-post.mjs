import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [category, ...titleParts] = process.argv.slice(2);
const title = titleParts.join(" ").trim();

if (!category || !title) {
  console.error('Usage: pnpm new <category> "Post title"');
  process.exit(1);
}

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const dir = path.join("posts", slugify(category));
const file = path.join(dir, `${slugify(title)}.mdx`);

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

console.log(`Created ${file}. Fill in excerpt and tags, then remove "published: false" to publish.`);
