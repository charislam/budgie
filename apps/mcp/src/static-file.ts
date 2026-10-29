import { StaticFileError } from "@budgie/domain";
import { isAbsolute, relative, resolve, sep } from "node:path";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

// Resolve symlinks before checking the boundary, and read the resolved file.
export const readStaticFile = (root: string, filename: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.realPath(root);
    const target = yield* fs.realPath(resolve(directory, filename));
    const path = relative(directory, target);
    if (!path || isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) {
      return yield* Effect.fail(
        new StaticFileError({ cause: "Static file is outside the public directory" }),
      );
    }
    return yield* fs.readFile(target);
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof StaticFileError ? cause : new StaticFileError({ cause }),
    ),
  );
