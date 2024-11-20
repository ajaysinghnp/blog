export const gitEnv =
  process.env.GITHUB_PAGES !== undefined && process.env.GITHUB_PAGES;
export const basepath = process.env.GITHUB_PAGES ? "/blog" : "";

export const navigation = [
  { name: "Resume", href: "/resume" },
  { name: "Projects", href: "/projects" },
  { name: "Blog", href: "/blog" },
  { name: "About", href: "/about" },
  { name: "Contact", href: "/contact" },
];
