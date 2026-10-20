---
title: "Optimizing a Next.js Docker Image for Production"
excerpt: "Build a leaner, faster, and more secure Next.js production image with Docker multi-stage builds, pnpm caching, BuildKit secrets, disabled telemetry, and production-focused configuration."
author: "Ajay Singh"
tags:
  - Next.js
  - Docker
  - DevOps
  - Performance
  - Security
created_at: "2026-10-20"
published: true
slug: "nextjs-docker-production-optimization"
---

# Optimizing a Next.js Docker Image for Production

Containerizing a Next.js application is straightforward. Building a container that is efficient to rebuild, secure to deploy, and optimized for production requires a little more planning.

A basic Dockerfile can install dependencies, build the application, and start the server. However, without the right structure, every deployment may spend unnecessary time reinstalling packages, rebuilding unchanged layers, or transferring development dependencies into the final image.

In this article, we'll explore how to improve a Next.js Docker workflow using multi-stage builds, pnpm, BuildKit caching, secure build-time secrets, and production-specific configuration.

## 1. Use a multi-stage Docker build

A multi-stage build separates dependency installation, application compilation, and runtime execution into distinct stages.

This separation provides several benefits:

- Build tools and temporary dependencies do not need to be included in the final image.
- Docker can reuse unchanged layers between builds.
- The runtime image contains only the files needed to run the application.
- Build-time configuration can remain separate from runtime configuration.

A practical structure consists of three stages:

1. **Dependencies:** Install the packages required by the application.
2. **Builder:** Compile the Next.js application.
3. **Runner:** Start the application with the minimum required files and permissions.

This structure is particularly useful for applications that are deployed repeatedly to a VPS, where build time and resource consumption directly affect the deployment workflow.

## 2. Cache pnpm dependencies effectively

Package installation is often one of the most expensive steps in a container build. Reinstalling dependencies when the application source changes wastes time and resources.

Docker's layer cache helps solve this problem. Copy the package manifests before copying the rest of the application.

For example:

```dockerfile
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
```

When `package.json` and `pnpm-lock.yaml` remain unchanged, Docker can reuse the dependency installation layer instead of executing the installation again.

However, this alone does not preserve pnpm's downloaded package store across every fresh build. BuildKit cache mounts provide an additional optimization.

```dockerfile
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
```

The cache mount allows pnpm to reuse downloaded packages even when the installation layer must be rebuilt. The exact cache target should match the package manager's configured store location.

For reliable dependency resolution, use the committed lockfile and `--frozen-lockfile`. This prevents the production build from silently changing the dependency graph.

### Keep the build context clean

A `.dockerignore` file prevents unnecessary files from being sent to the Docker builder.

```dockerignore
node_modules
.next
.git
.env
.env.*
!.env.example
npm-debug.log*
pnpm-debug.log*
```

Adjust these exclusions if your project intentionally needs any of these files during its build.

Excluding `.git`, local build artifacts, and host-installed dependencies reduces the build context and prevents irrelevant changes from invalidating Docker cache layers.

## 3. Disable Next.js telemetry explicitly

Next.js includes anonymous telemetry intended to help improve the framework. Production builds should have an explicit telemetry policy rather than relying on an implicit default.

Set the following environment variable in the Dockerfile:

```dockerfile
ENV NEXT_TELEMETRY_DISABLED=1
```

For example, declare it in the shared base stage so that subsequent stages inherit the setting:

```dockerfile
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
```

This disables Next.js telemetry during the build and in the resulting runtime image when the environment variable is inherited.

The important distinction is that **telemetry configuration is not the same as application analytics**. If the application includes its own analytics SDK or sends events to an external service, those integrations must be configured separately.

## 4. Handle secrets with Docker BuildKit

Applications sometimes need private package registry tokens or other credentials during dependency installation or compilation.

The tempting solution is to declare a build argument or environment variable containing the secret. However, ordinary Docker build arguments and image environment variables are not appropriate for sensitive credentials because their values can be exposed through build metadata, image configuration, or other inspection paths.

BuildKit provides secret mounts that expose credentials only to the specific build instruction that requires them.

For example, a private registry configuration can be mounted temporarily:

```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    pnpm install --frozen-lockfile
```

Build the image with the secret supplied separately:

```bash
docker build \
  --secret id=npmrc,src="$HOME/.npmrc" \
  -t my-nextjs-app:latest .
```

The secret mount is available during that instruction without being committed as an ordinary image layer.

Use the correct home directory and configuration path for the user running the package manager. For a non-root build user, the mount target may need to be adjusted.

### Keep build-time and runtime secrets separate

A secret used to download private dependencies is not necessarily a secret the running application needs.

Likewise, a variable required during `next build` is not automatically available when the container starts.

Next.js may inline certain public variables, particularly variables prefixed with `NEXT_PUBLIC_`, into browser-facing bundles. Never put private credentials in those variables.

A useful rule is to classify each variable as one of the following:

- **Build-time secret:** Used temporarily by the build process.
- **Build-time configuration:** Needed to generate the application.
- **Runtime configuration:** Supplied when the production container starts.
- **Public configuration:** Intentionally exposed to the browser.

This separation makes deployments easier to audit and reduces the risk of accidentally shipping credentials.

## 5. Optimize the final runtime image

A successful production build does not mean the final image needs the entire build environment.

For a Next.js application, the standalone output mode can substantially reduce the files required at runtime.

Enable it in `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

Next.js generates a `.next/standalone` directory containing the server and the traced dependencies required to run it.

The runtime stage can then copy the standalone output rather than the entire development environment.

A typical runner stage looks like this:

```dockerfile
FROM node:24-alpine AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs \
    /app/.next/standalone ./

COPY --from=builder --chown=nextjs:nodejs \
    /app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs \
    /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

This example assumes that the build stage is named `builder`, the application uses the standalone output, and the `public` directory exists. Adapt the paths and stage names to the actual project.

Running as a non-root user also limits the privileges available to the application process if the container is compromised.

### Why standalone output matters

Without standalone output, a deployment may copy the full project, including files that are only useful during development or compilation.

With standalone output, Next.js traces the dependencies needed by the server. This generally produces a smaller runtime image, although the exact reduction depends on the application's dependencies and assets.

Verify that any files accessed dynamically at runtime are included in the final image. Static analysis cannot always detect files loaded through arbitrary paths or external scripts.

## 6. Understand Docker cache invalidation

Docker builds are organized around layers. When a layer changes, later layers may need to be rebuilt.

Consider this less efficient ordering:

```dockerfile
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
```

A small source-code change invalidates the broad `COPY` layer, which can force dependency installation to run again.

A more efficient sequence separates dependency manifests from application source:

```dockerfile
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
```

The principle is simple: **place stable inputs before frequently changing inputs**.

The package manifests change less often than application code, so Docker can retain the dependency layer across ordinary source updates.

BuildKit cache mounts take this one step further by preserving reusable package downloads outside the image layers themselves.

### Cache the right things

| Cache target | Purpose |
| --- | --- |
| Docker build layers | Reuse completed instructions when their inputs are unchanged |
| pnpm store | Reuse downloaded package content |
| Next.js build cache | Potentially reuse compiler and bundler work |
| Build context | Avoid unnecessary file transfers and cache invalidation |

Next.js build caching requires additional care. Its cache directory and the relevant BuildKit mount should be configured deliberately, especially when using different build environments or architectures.

A cache is an optimization, not a source of truth. Builds must still succeed when caches are empty, evicted, or unavailable.

## 7. Separate image building from deployment

A production workflow should make it clear which step builds the image and which step runs it.

A dedicated build script is useful when the project needs consistent image tags, BuildKit settings, or build arguments. A Compose file can then run the image and supply runtime environment configuration independently.

For example:

```yaml
services:
  web:
    image: my-nextjs-app:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
```

This Compose configuration assumes the image has already been built locally. An alternative is to add a `build` section when you want Compose to build the image directly.

Keep runtime secrets in a protected environment file or a dedicated secrets-management system. Avoid committing production `.env` files to version control.

For deployment workflows, separating these responsibilities makes it easier to rebuild an image without changing runtime configuration and to restart a container without recompiling the application.

## 8. Production improvements worth considering

Once the Dockerfile is structured correctly, several additional practices can improve reliability.

### Pin and update dependencies deliberately

Use a committed lockfile, a supported Node.js release, and a controlled dependency-update process. Prefer a deliberate base-image update over pulling an unpredictable new environment during every deployment.

For stronger reproducibility, consider pinning the base image by digest and updating it through an automated review process.

### Use health checks where appropriate

A health check can help the deployment platform determine whether the application is responding. Configure one that matches your actual application and container environment; a health check should not depend on a utility that is absent from the final image.

### Avoid running development commands in production

The production container should execute the generated server rather than a development command such as `next dev`.

Likewise, avoid installing optional development tooling in the runtime stage unless the application genuinely requires it.

### Monitor image size and build time

Optimization should be measurable. Track build duration, image size, deployment duration, and resource consumption before and after changing the Dockerfile.

A smaller image is not automatically a faster build, and a faster build is not necessarily a more secure one. Evaluate these goals independently.

### Keep the final image minimal, not fragile

Do not remove files solely because they appear unnecessary. Native modules, runtime assets, certificates, dynamically loaded files, and image-processing libraries can have runtime requirements that are not obvious from the Dockerfile.

Test the final image itself, rather than assuming that a successful builder stage guarantees a working production container.

## 9. Verify the production build

Before deploying the updated image, verify the build and runtime behavior.

A practical checklist:

- [ ] The dependency installation uses the committed lockfile.
- [ ] Docker reuses dependency layers when manifests are unchanged.
- [ ] BuildKit package-cache mounts work across subsequent builds.
- [ ] Private credentials are mounted as secrets rather than baked into the image.
- [ ] Next.js telemetry is explicitly disabled.
- [ ] The application uses standalone output where appropriate.
- [ ] The runtime stage excludes unnecessary development dependencies.
- [ ] The application runs as a non-root user.
- [ ] Required static assets and runtime configuration are present.
- [ ] The container starts successfully and serves the expected routes.
- [ ] Runtime secrets are supplied securely.
- [ ] The image and application are tested after deployment.

It is also worth inspecting the final image configuration and build logs for accidental secret exposure, particularly when changing a previously established build pipeline.

## Conclusion

A production-ready Next.js Docker image is not just a successful `docker build`. It is a repeatable build process that avoids unnecessary work, keeps sensitive values out of the image, separates compilation from runtime execution, and remains reliable when caches are unavailable.

The most valuable improvements are often straightforward: order Docker layers carefully, cache pnpm downloads with BuildKit, disable Next.js telemetry explicitly, use temporary secret mounts, and keep the runtime image focused on what the application actually needs.

These practices make the deployment pipeline easier to maintain and provide a solid foundation for running Next.js applications on a VPS or other container platform.
