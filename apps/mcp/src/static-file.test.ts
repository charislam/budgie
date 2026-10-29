import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { readStaticFile } from "./static-file";

it("reads public files and rejects traversal and symlink escapes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "budgie-static-"));
  const root = join(directory, "public");
  const read = (filename: string) =>
    Effect.runPromise(readStaticFile(root, filename).pipe(Effect.provide(NodeFileSystem.layer)));
  try {
    await mkdir(root);
    await mkdir(join(directory, "public-other"));
    await writeFile(join(root, "login.html"), "public");
    await writeFile(join(directory, "public-other", "secret.js"), "private");
    await symlink(join(root, "login.html"), join(root, "safe.html"));
    await symlink(join(directory, "public-other"), join(root, "assets"));
    expect(new TextDecoder().decode(await read("login.html"))).toBe("public");
    expect(new TextDecoder().decode(await read("safe.html"))).toBe("public");
    for (const filename of [
      "../public-other/secret.js",
      "assets/secret.js",
      join(directory, "public-other/secret.js"),
    ]) {
      await expect(read(filename)).rejects.toMatchObject({ _tag: "StaticFileError" });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
