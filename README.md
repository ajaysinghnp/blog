# Blog Posts Repo

This is the public repo for the `/blog` for the `https://ajaysingh.com.np/` containing all the posts in the markdown folder automatically fetched and displayed on the site over the github API.

## Content Structure & Conventions

The `posts/` directory contains the blog content consumed by the portfolio application through the GitHub API.

The content structure is designed to remain readable and usable directly in GitHub and VS Code Markdown preview without relying on application-specific path aliases or custom Markdown extensions.

### Directory Naming

There are three types of directories under `posts/`:

| Pattern      | Meaning              |
| ------------ | -------------------- |
| `category/`  | Visible category     |
| `_category/` | Hidden category      |
| `@post/`     | Resource-backed post |

All logical category and post names must use lowercase kebab-case.

The leading `_` and `@` characters are structural markers and are not part of the logical category/post name.

Examples:

```text
posts/
├── tutorials/
├── web-development/
├── _drafts/
└── _internal/
```

`_drafts/` represents the `drafts` category, but the category itself is hidden from category listings. Its posts can still be discovered and rendered according to the application's rules.

A directory beginning with `@` represents a single post rather than a category:

```text
posts/
└── tutorials/
    └── @building-a-blog/
```

Here the post slug is `building-a-blog`.

### Standalone Posts

A post that does not require local resources can be represented by a single Markdown file directly inside a category:

```text
posts/
└── tutorials/
    └── getting-started.md
```

The filename is the post slug:

```text
getting-started.md
       ↓
slug: getting-started
```

Both `.md` and `.mdx` are supported.

```text
posts/
└── tutorials/
    ├── getting-started.md
    └── advanced-routing.mdx
```

Standalone posts should not contain local relative image references. Resource-backed posts should be used when a post needs files that belong to the post.

### Resource-Backed Posts

When a post needs images, diagrams, downloads, or other supporting files, use an `@post/` directory:

```text
posts/
└── tutorials/
    └── @building-a-blog/
        ├── article.md
        ├── architecture.png
        ├── workflow.svg
        └── downloads/
```

The `@` directory itself identifies the post, while the files inside it are resources belonging to that post.

Local Markdown image references are resolved relative to the `@post/` directory:

```md
![Architecture](./architecture.png)
```

The validator ensures that referenced local images exist and cannot escape the post directory through paths such as `../`.

External image URLs remain allowed:

```md
![Example](https://example.com/image.png)
```

### Resource-Backed Post Content File

Currently, an `@post/` directory must contain **exactly one** `.md` or `.mdx` content file.

The filename does not currently affect rendering. If there is only one Markdown file, it is automatically treated as the post content.

For example, this is valid:

```text
@building-a-blog/
├── article.md
└── architecture.png
```

This is also valid:

```text
@building-a-blog/
├── content.md
└── architecture.png
```

However, `article.md` is the **recommended convention** for resource-backed posts.

```text
@building-a-blog/
└── article.md
```

The reason for using `article.md` as the recommended convention is future-proofing. If multi-file Markdown composition is supported in the future, `article.md` can serve as the deterministic entry point.

### Multiple Markdown Files

Multiple `.md` or `.mdx` files inside an `@post/` directory are **not currently supported**.

For example:

```text
@building-a-blog/
├── introduction.md
├── architecture.md
└── conclusion.md
```

is currently invalid.

Plain Markdown does not provide a standard mechanism for automatically composing multiple Markdown files into one rendered document. Supporting this today would therefore require introducing a custom convention, preprocessor, or MDX-based composition mechanism.

That is intentionally not part of the current content model.

If multi-file composition is introduced later, the intended entry-point convention is:

```text
@building-a-blog/
├── article.md
├── introduction.md
├── architecture.md
└── conclusion.md
```

`article.md` would then be the entry document from which the other content is composed.

### Nested Categories

Categories may be nested to any depth:

```text
posts/
└── web-development/
    ├── nextjs/
    │   ├── app-router/
    │   │   └── routing-basics.md
    │   └── server-components.md
    └── css/
        └── modern-layouts.md
```

Each category directory follows the same naming rules.

Hidden categories can also be nested:

```text
posts/
└── _internal/
    ├── _drafts/
    │   └── experimental.md
    └── notes/
        └── development-notes.md
```

### Creating New Posts

The `new-post.mjs` script supports both normal and resource-backed posts.

A normal post:

```bash
pnpm new tutorials "Getting Started with Next.js"
```

creates:

```text
posts/
└── tutorials/
    └── getting-started-with-next-js.md
```

Nested categories are supported:

```bash
pnpm new tutorials/nextjs/app-router "Dynamic Routes"
```

creates:

```text
posts/
└── tutorials/
    └── nextjs/
        └── app-router/
            └── dynamic-routes.md
```

The generator creates missing category directories automatically. Existing directories are left untouched.

A resource-backed post can be created with `--resource`:

```bash
pnpm new tutorials/nextjs "Building a Blog" --resource
```

creates:

```text
posts/
└── tutorials/
    └── nextjs/
        └── @building-a-blog/
            └── article.md
```

Nested resource-backed posts work the same way:

```bash
pnpm new tutorials/nextjs/app-router "Dynamic Routes" --resource
```

creates:

```text
posts/
└── tutorials/
    └── nextjs/
        └── app-router/
            └── @dynamic-routes/
                └── article.md
```

The generator never overwrites an existing post file. If the target file already exists, creation fails rather than replacing the existing content.

### Naming Summary

The following conventions should be treated as canonical:

```text
posts/
├── category/                       # visible category
│   ├── post.md                     # standalone post
│   ├── post.mdx                    # standalone MDX post
│   │
│   ├── subcategory/                # nested category
│   │   └── post.md
│   │
│   ├── @resource-post/             # resource-backed post
│   │   ├── article.md              # recommended entry file
│   │   ├── image.png
│   │   └── assets/
│   │
│   └── _hidden-category/           # hidden category
│       └── post.md
```

The important distinction is:

* **File ending in `.md`/`.mdx`** → standalone post.
* **Directory beginning with `@`** → resource-backed post.
* **Directory beginning with `_`** → hidden category.
* **Other directory** → visible category.
* **Logical names** → lowercase kebab-case.
* **`article.md`** → recommended resource-backed post entry point, but not currently mandatory when it is the only Markdown file.
* **Multiple Markdown files inside a post directory** → not currently supported.

### Future Compatibility

The content repository deliberately avoids application-specific Markdown conventions.

The portfolio application retrieves content through the GitHub API and is responsible for interpreting the repository structure. Therefore, characters such as `_` and `@` are filesystem/content conventions rather than Next.js route conventions.

If the portfolio's content loader enforces kebab-case, it should validate the **logical name** after removing the structural prefix:

```text
@building-a-blog/
        ↓
building-a-blog
        ↓
kebab-case validation
```

and:

```text
_hidden/
   ↓
hidden
   ↓
kebab-case validation
```

This keeps the repository's naming rules consistent while allowing the structural prefixes to provide an unambiguous distinction between categories and post directories.
