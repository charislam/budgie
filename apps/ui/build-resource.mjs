import { build } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import tailwindcss from "@tailwindcss/vite";
await build({
  configFile: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [tailwindcss()],
  build: {
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: { entry: "src/app.tsx", formats: ["iife"], name: "Budgie", fileName: () => "resource.js" },
    rollupOptions: { output: { assetFileNames: "resource.[ext]" } },
  },
});
const code = await readFile("dist/resource.js", "utf8");
const css = await readFile("dist/resource.css", "utf8");
const shell = await readFile("dist/envelopes-shell.html", "utf8");
await writeFile(
  "dist/envelopes.html",
  shell
    .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, "")
    .replace("</head>", `<style>${css.replace(/<\/style/gi, "<\\/style")}</style></head>`)
    .replace(
      "</body>",
      () => `<script>${code.replace(/<\/script/gi, "<\\/script")}</script></body>`,
    ),
);

const listHtml = await readFile("dist/envelopes.html", "utf8");
await writeFile("dist/create-envelope.html", listHtml.replace("<body", '<body data-view="create"'));
