import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: { rollupOptions: { input: { envelopes: "index.html", login: "login.html" } } },
  plugins: [
    tailwindcss(),
    {
      name: "budgie-inline-resource",
      async closeBundle() {
        let html = await readFile("dist/index.html", "utf8");
        const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)];
        // Vite's shared chunks require external imports; the dedicated library build
        // supplies a single standalone module for the resource.
        for (const match of scripts) html = html.replace(match[0], "");
        html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, "");
        await writeFile("dist/envelopes-shell.html", html);
      },
    },
  ],
});
