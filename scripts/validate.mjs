import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { compile } from "@mdx-js/mdx";
import matter from "gray-matter";
import { z } from "zod";

const POSTS_DIR = "posts";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const RESERVED = new Set(["tag", "post", "api"]);

const POST_EXTENSIONS = new Set([".md", ".mdx"]);

const schema = z.strictObject({
  title: z.string().min(1),
  excerpt: z.string(),
  author: z.string().min(1),
  tags: z.array(z.string().min(1)),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date().optional(),
  published: z.boolean().optional(),
  slug: z.string().optional(),
});

const errors = [];
const warnings = [];

const fail = (file, message) => {
  errors.push(`${file}: ${message}`);
};

const warn = (file, message) => {
  warnings.push(`${file}: ${message}`);
};

const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  );

const isExternalTarget = (target) =>
  /^(?:https?:|data:|\/|#)/i.test(target);

async function checkImages(content, rel, postDir) {
  const imagePattern =
    /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  for (const [, rawTarget] of content.matchAll(imagePattern)) {
    const target = decodeURI(rawTarget.split(/[?#]/)[0]);

    if (isExternalTarget(target)) continue;

    if (!postDir) {
      fail(
        rel,
        `local image "${rawTarget}" is not allowed in a standalone post; ` +
        `use an @${path.basename(rel, path.extname(rel))}/ post directory`,
      );
      continue;
    }

    const file = path.resolve(postDir, target);
    const base = path.resolve(postDir);
    const relative = path.relative(base, file);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      fail(rel, `image must stay inside ${postDir}/: ${rawTarget}`);
      continue;
    }

    if (!(await exists(file))) {
      fail(
        rel,
        `image not found: ${rawTarget} (expected at ${path.relative(".", file)})`,
      );
    }
  }
}

async function checkPost(rel, postSlug, ext, postDir = null) {
  const { data, content } = matter(await readFile(rel, "utf8"));

  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fail(
        rel,
        `frontmatter ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      );
    }

    return;
  }

  const meta = parsed.data;

  if (meta.slug && meta.slug !== postSlug) {
    fail(
      rel,
      `slug "${meta.slug}" does not match post slug "${postSlug}"`,
    );
  }

  if (meta.updated_at && meta.updated_at < meta.created_at) {
    fail(rel, "updated_at is earlier than created_at");
  }

  if (meta.published !== false) {
    if (!meta.excerpt.trim()) {
      fail(rel, "excerpt is required for published posts");
    }

    if (meta.tags.length === 0) {
      fail(rel, "at least one tag is required for published posts");
    }
  }

  try {
    await compile(
      { value: content, path: rel },
      { format: ext === ".mdx" ? "mdx" : "md" },
    );
  } catch (error) {
    fail(rel, `does not compile: ${error.message}`);
  }

  await checkImages(content, rel, postDir);
}

const slugs = new Map();

function registerSlug(slug, rel) {
  if (slugs.has(slug)) {
    warn(rel, `slug also used in ${slugs.get(slug)}`);
  }

  slugs.set(slug, rel);
}

let posts = 0;

async function checkPostFile(rel, entry) {
  const ext = path.extname(entry.name);
  const slug = path.basename(entry.name, ext);

  if (!POST_EXTENSIONS.has(ext)) {
    fail(rel, "only .md and .mdx files are allowed");
    return;
  }

  if (!KEBAB.test(slug)) {
    fail(rel, "filename must be lowercase kebab-case");
    return;
  }

  registerSlug(slug, rel);

  posts += 1;

  await checkPost(rel, slug, ext);
}

async function checkPostDirectory(rel, entry) {
  const slug = entry.name.slice(1);

  if (!slug) {
    fail(rel, "post directory must contain a slug after @");
    return;
  }

  if (!KEBAB.test(slug)) {
    fail(rel, "post directory slug must be lowercase kebab-case");
    return;
  }

  registerSlug(slug, rel);

  const entries = await readdir(rel, { withFileTypes: true });

  const contentFiles = entries.filter(
    (item) =>
      item.isFile() && POST_EXTENSIONS.has(path.extname(item.name)),
  );

  if (contentFiles.length === 0) {
    fail(
      rel,
      "post directory must contain exactly one .md or .mdx content file",
    );
    return;
  }

  if (contentFiles.length > 1) {
    fail(
      rel,
      "multiple .md/.mdx files are not currently supported; " +
      "use a single article.md or article.mdx file",
    );
    return;
  }

  const contentFile = contentFiles[0];
  const contentPath = path.join(rel, contentFile.name);
  const ext = path.extname(contentFile.name);

  // `article.md` / `article.mdx` is the recommended convention.
  // A single content file with another name is also valid for now.
  if (contentFile.name !== "article.md" && contentFile.name !== "article.mdx") {
    warn(
      contentPath,
      "consider naming the content file article.md or article.mdx",
    );
  }

  posts += 1;

  await checkPost(contentPath, slug, ext, rel);
}

async function walkCategory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const rel = path.join(dir, entry.name);

    if (entry.isFile()) {
      await checkPostFile(rel, entry);
      continue;
    }

    if (!entry.isDirectory()) {
      fail(rel, "unsupported filesystem entry");
      continue;
    }

    // @foo/ is a post directory.
    if (entry.name.startsWith("@")) {
      await checkPostDirectory(rel, entry);
      continue;
    }

    // _foo/ is a hidden category.
    // foo/ is a visible category.
    const hidden = entry.name.startsWith("_");
    const categoryName = hidden ? entry.name.slice(1) : entry.name;

    if (!categoryName) {
      fail(rel, "category name cannot be empty");
      continue;
    }

    if (!KEBAB.test(categoryName)) {
      fail(
        rel,
        `category folder must be lowercase kebab-case${hidden ? " after the leading _" : ""
        }`,
      );
    }

    if (RESERVED.has(categoryName)) {
      fail(rel, `"${categoryName}" is a reserved category name`);
    }

    await walkCategory(rel);
  }
}

if (!(await exists(POSTS_DIR))) {
  fail(POSTS_DIR, "posts directory does not exist");
} else {
  await walkCategory(POSTS_DIR);
}

for (const warning of warnings) {
  console.warn(`warning  ${warning}`);
}

for (const error of errors) {
  console.error(`error    ${error}`);
}

console.log(
  `\nChecked ${posts} posts: ${errors.length} errors, ${warnings.length} warnings.`,
);

process.exitCode = errors.length ? 1 : 0;