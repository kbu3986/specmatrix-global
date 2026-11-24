import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

const rawBase = (process.env.PUBLIC_BASE_PATH || "").trim();
const base =
  rawBase && rawBase !== "/"
    ? `/${rawBase.replace(/^\/+|\/+$/g, "")}`
    : "/";

const rawSite = (process.env.PUBLIC_SITE_URL || "https://specmatrix.io")
  .trim()
  .replace(/\/+$/, "");
const siteOrigin = new URL(rawSite).origin;

export default defineConfig({
  site: siteOrigin,
  base,
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  compressHTML: true,
  vite: {
    plugins: [tailwindcss()],
  },
});
