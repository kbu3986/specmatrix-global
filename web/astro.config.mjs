import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://specmatrix.io",
  output: "static",
  trailingSlash: "never",
  build: {
    format: "directory",
  },
  compressHTML: true,
  vite: {
    plugins: [tailwindcss()],
  },
});
