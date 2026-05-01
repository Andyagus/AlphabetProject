import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/AlphabetProject/" : "./",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        demo: "web-demo/index.html",
      },
    },
  },
});
