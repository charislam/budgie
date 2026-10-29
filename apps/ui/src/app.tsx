import "./zod-config";
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useReducer, useRef, type FormEvent } from "react";
import { App, applyDocumentTheme } from "@modelcontextprotocol/ext-apps";
import * as Exit from "effect/Exit";
import * as Equal from "effect/Equal";
import * as Cache from "effect/Cache";
import * as Option from "effect/Option";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RefreshCw } from "lucide-react";
import {
  CreateResult,
  CreateInput,
  ListInput,
  ListResult,
  normalizeCreate,
  type Envelope,
  Sort,
} from "@budgie/domain";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { appendPage } from "./pagination";
import "./styles.css";

type Page = {
  pages: ReadonlyArray<ReadonlyArray<Envelope>>;
  sort: Sort;
  next: string | null;
  history: (string | null)[];
};

type ListRequest =
  | { status: "connecting" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string }
  | { status: "disconnected" };

type Creation =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "succeeded"; message: string }
  | { status: "failed"; message: string; field?: "name" | "description" };

type AppState = {
  page: Page;
  listRequest: ListRequest;
  creation: Creation;
};

type Action =
  | { type: "LIST_STARTED"; page: Page }
  | { type: "LIST_SUCCEEDED"; page: Page }
  | { type: "LIST_FAILED"; message: string }
  | { type: "DISCONNECTED" }
  | { type: "CREATE_STARTED" }
  | { type: "CREATE_SUCCEEDED"; message: string }
  | { type: "CREATE_FAILED"; message: string; field?: "name" | "description" };

class UiError extends Data.TaggedError("UiError")<{
  message: string;
  field?: "name" | "description";
  generation?: number;
  sort?: Sort;
  cursor?: string | null;
}> {}

const initialPage: Page = {
  pages: [],
  sort: "name_asc",
  next: null,
  history: [null],
};

const initialState: AppState = {
  page: initialPage,
  listRequest: { status: "connecting" },
  creation: { status: "idle" },
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LIST_STARTED":
      return { ...state, page: action.page, listRequest: { status: "loading" } };
    case "LIST_SUCCEEDED":
      return { ...state, page: action.page, listRequest: { status: "ready" } };
    case "LIST_FAILED":
      return { ...state, listRequest: { status: "error", message: action.message } };
    case "DISCONNECTED":
      return { ...state, listRequest: { status: "disconnected" } };
    case "CREATE_STARTED":
      return { ...state, creation: { status: "submitting" } };
    case "CREATE_SUCCEEDED":
      return { ...state, creation: { status: "succeeded", message: action.message } };
    case "CREATE_FAILED":
      return {
        ...state,
        creation: { status: "failed", message: action.message, field: action.field },
      };
  }
}

function listStatus(request: ListRequest, rowCount: number) {
  switch (request.status) {
    case "connecting":
      return "Connecting...";
    case "loading":
      return "Loading envelopes...";
    case "ready":
      return rowCount ? `${rowCount} envelopes` : "No envelopes yet.";
    case "error":
      return request.message;
    case "disconnected":
      return "Disconnected. Reopen Budgie to reconnect.";
  }
}

function uiError(error: unknown, fallback: string) {
  return new UiError({ message: error instanceof Error ? error.message : fallback });
}

function listEnvelopes(
  bridge: App,
  page: { sort: Sort; cursor: string | null; generation: number },
) {
  return Effect.tryPromise({
    try: () =>
      bridge.callServerTool({
        name: "list_envelopes",
        arguments: page,
      }),
    catch: (error) => uiError(error, "Unable to load envelopes."),
  }).pipe(
    Effect.flatMap((result) =>
      Schema.decodeUnknownEffect(ListResult)(result.structuredContent).pipe(
        Effect.mapError(() => new UiError({ message: "Unable to load envelopes." })),
        Effect.flatMap((data) =>
          data.ok
            ? Effect.succeed(data)
            : Effect.fail(
                new UiError({
                  message: data.error.message,
                  generation: data.generation,
                  sort: data.sort,
                  cursor: data.cursor,
                }),
              ),
        ),
      ),
    ),
    Effect.mapError((error) =>
      error.generation !== undefined ? error : new UiError({ message: error.message, ...page }),
    ),
  );
}

function createEnvelope(bridge: App, input: unknown, generation: number) {
  return normalizeCreate(input).pipe(
    Effect.flatMap((value) =>
      Effect.tryPromise({
        try: () =>
          bridge.callServerTool({
            name: "create_envelope",
            arguments: { name: value.name, description: value.description ?? "", generation },
          }),
        catch: (error) => uiError(error, "Creation was not confirmed. Try again."),
      }),
    ),
    Effect.flatMap((result) =>
      Schema.decodeUnknownEffect(CreateResult)(result.structuredContent).pipe(
        Effect.mapError(() => new UiError({ message: "Creation was not confirmed. Try again." })),
        Effect.flatMap((data) =>
          data.ok
            ? Effect.succeed(data)
            : Effect.fail(
                new UiError({
                  generation: data.generation,
                  message: data.error.message,
                  field:
                    data.error.field === "name" || data.error.field === "description"
                      ? data.error.field
                      : undefined,
                }),
              ),
        ),
      ),
    ),
    Effect.mapError(
      (error) =>
        new UiError({
          message: error.message,
          field: error.field === "name" || error.field === "description" ? error.field : undefined,
          generation: error._tag === "UiError" ? (error.generation ?? generation) : generation,
        }),
    ),
  );
}

const RequestKeySchema = Schema.Struct({
  generation: Schema.Number,
  sort: Sort,
  cursor: Schema.NullOr(Schema.String),
});
class RequestKey extends Data.Class<typeof RequestKeySchema.Type> {}
const decodeRequestKey = Schema.decodeUnknownOption(RequestKeySchema);
function matchesRequest(expected: RequestKey | null, response: unknown): boolean {
  const decoded = decodeRequestKey(response);
  return (
    expected !== null &&
    Option.isSome(decoded) &&
    Equal.equals(expected, new RequestKey(decoded.value))
  );
}

class PageKey extends Data.Class<{ sort: Sort; cursor: string | null }> {}

type ListData = Extract<typeof ListResult.Type, { ok: true }>;
function pageData({ generation: _generation, ...data }: ListData) {
  return data;
}
type CachedPage = ReturnType<typeof pageData>;
function makePageCache(bridge: App, expectedRequest: () => RequestKey | null) {
  return Effect.runSync(
    Cache.makeWith(
      (key: PageKey): Effect.Effect<CachedPage, UiError> =>
        Effect.gen(function* () {
          const request = expectedRequest();
          if (
            !request ||
            !Equal.equals(key, new PageKey({ sort: request.sort, cursor: request.cursor }))
          ) {
            return yield* Effect.fail(new UiError({ message: "Request is no longer current." }));
          }
          const data = yield* listEnvelopes(bridge, request);
          if (!matchesRequest(request, data)) {
            return yield* Effect.fail(
              new UiError({ message: "Response does not match the request.", ...request }),
            );
          }
          if (!matchesRequest(expectedRequest(), data)) {
            return yield* Effect.fail(
              new UiError({ message: "Request is no longer current.", ...request }),
            );
          }
          return pageData(data);
        }),
      { capacity: 100, timeToLive: (exit) => (Exit.isFailure(exit) ? 0 : "5 minutes") },
    ),
  );
}

function CreateEnvelopeForm({
  creation,
  onSubmit,
}: {
  creation: Creation;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const fieldError = creation.status === "failed" ? creation : null;
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      {fieldError ? (
        <Alert variant="destructive" id="form-error">
          {fieldError.message}
        </Alert>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          aria-describedby={fieldError?.field === "name" ? "form-error" : undefined}
          aria-invalid={fieldError?.field === "name"}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          aria-describedby={fieldError?.field === "description" ? "form-error" : undefined}
          aria-invalid={fieldError?.field === "description"}
        />
      </div>
      <Button className="justify-self-start" disabled={creation.status === "submitting"}>
        {creation.status === "submitting" ? "Saving..." : "Create envelope"}
      </Button>
    </form>
  );
}

const createView = document.body.dataset.view === "create";

function BudgieApp() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bridgeRef = useRef<App | null>(null);
  if (!bridgeRef.current) bridgeRef.current = new App({ name: "Budgie", version: "0.1.0" }, {});
  const bridge = bridgeRef.current;
  const expectedList = useRef<RequestKey | null>(null);
  const cacheRef = useRef<ReturnType<typeof makePageCache> | null>(null);
  if (!cacheRef.current) cacheRef.current = makePageCache(bridge, () => expectedList.current);
  const pageCache = cacheRef.current;
  const generation = useRef(0);
  const expectedCreate = useRef<number | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadPage = useCallback(
    (page: Page) => {
      const request = new RequestKey({
        generation: ++generation.current,
        sort: page.sort,
        cursor: page.history.at(-1) ?? null,
      });
      expectedList.current = request;
      dispatch({ type: "LIST_STARTED", page });
      void Effect.runPromise(
        Effect.gen(function* () {
          const data = yield* Cache.get(
            pageCache,
            new PageKey({ sort: request.sort, cursor: request.cursor }),
          );
          return data;
        }).pipe(
          Effect.match({
            onFailure: (error) => {
              if (matchesRequest(expectedList.current, error)) {
                dispatch({ type: "LIST_FAILED", message: error.message });
              }
            },
            onSuccess: (data) => {
              if (expectedList.current !== null && Equal.equals(expectedList.current, request)) {
                dispatch({
                  type: "LIST_SUCCEEDED",
                  page: {
                    ...page,
                    pages: appendPage(page.pages, page.history.length, data.envelopes),
                    sort: data.sort,
                    next: data.next_cursor,
                  },
                });
              }
            },
          }),
        ),
      );
    },
    [pageCache],
  );

  const refresh = useCallback(() => {
    Effect.runSync(Cache.invalidateAll(pageCache));
    loadPage({ ...initialPage, sort: stateRef.current.page.sort });
  }, [loadPage, pageCache]);

  useEffect(() => {
    bridge.onhostcontextchanged = (context) => {
      if (context.theme) applyDocumentTheme(context.theme);
    };
    bridge.onteardown = async () => {
      generation.current++;
      expectedList.current = null;
      expectedCreate.current = null;
      dispatch({ type: "DISCONNECTED" });
      return {};
    };
    bridge.ontoolinput = (input) => {
      const args = input.arguments;
      if (Schema.is(ListInput)(args) && args.generation !== undefined) {
        if (args.generation <= generation.current) return;
        generation.current = args.generation;
        expectedList.current = new RequestKey({
          generation: args.generation,
          sort: args.sort ?? "name_asc",
          cursor: args.cursor ?? null,
        });
        expectedCreate.current = null;
      } else if (Schema.is(CreateInput)(args) && args.generation !== undefined) {
        if (args.generation <= generation.current) return;
        generation.current = args.generation;
        expectedCreate.current = args.generation;
        expectedList.current = null;
      }
    };
    bridge.ontoolresult = (result) => {
      const value = result.structuredContent;
      if (Schema.is(ListResult)(value) && !value.ok) {
        const expected = expectedList.current;
        if (matchesRequest(expected, value)) {
          dispatch({ type: "LIST_FAILED", message: value.error.message });
        }
        return;
      }
      if (Schema.is(ListResult)(value) && value.ok) {
        const expected = expectedList.current;
        if (!matchesRequest(expected, value)) return;
        const current = stateRef.current.page;
        if (current.sort !== value.sort || (current.history.at(-1) ?? null) !== value.cursor)
          return;
        Effect.runSync(
          Cache.set(
            pageCache,
            new PageKey({ sort: value.sort, cursor: value.cursor }),
            pageData(value),
          ),
        );
        dispatch({
          type: "LIST_SUCCEEDED",
          page: {
            pages: appendPage(current.pages, current.history.length, value.envelopes),
            sort: value.sort,
            next: value.next_cursor,
            history: current.history,
          },
        });
      } else if (
        Schema.is(CreateResult)(value) &&
        value.ok &&
        value.generation === expectedCreate.current
      ) {
        dispatch({ type: "CREATE_SUCCEEDED", message: `Saved ${value.envelope.name}.` });
        if (!createView) refresh();
      }
    };
  }, [bridge, refresh, pageCache, loadPage]);

  useEffect(() => {
    let active = true;
    void Effect.runPromise(
      Effect.tryPromise({
        try: () => bridge.connect(),
        catch: (error) => uiError(error, "Unable to connect."),
      }).pipe(
        Effect.match({
          onFailure: () => {
            if (active) dispatch({ type: "DISCONNECTED" });
          },
          onSuccess: () => {
            const theme = bridge.getHostContext()?.theme;
            if (theme) applyDocumentTheme(theme);
            if (active && !createView) loadPage(initialPage);
          },
        }),
      ),
    );

    return () => {
      active = false;
      generation.current++;
      expectedList.current = null;
      expectedCreate.current = null;
      void bridge.close();
    };
  }, [bridge, refresh, pageCache, loadPage]);

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stateRef.current.creation.status === "submitting") return;
    const form = event.currentTarget;
    const values = new FormData(form);
    expectedCreate.current = ++generation.current;
    dispatch({ type: "CREATE_STARTED" });
    void Effect.runPromise(
      createEnvelope(
        bridge,
        {
          name: values.get("name"),
          description: values.get("description"),
        },
        expectedCreate.current,
      ).pipe(
        Effect.match({
          onFailure: (error) => {
            if (error.generation !== expectedCreate.current) return;
            const field = error.field;
            const invalidField = field === "name" || field === "description" ? field : undefined;
            dispatch({ type: "CREATE_FAILED", message: error.message, field: invalidField });
            if (invalidField) {
              const element = form.elements.namedItem(invalidField);
              if (element instanceof HTMLElement) element.focus();
            }
          },
          onSuccess: (result) => {
            if (result.generation !== expectedCreate.current) return;
            const envelope = result.envelope;
            form.reset();
            dialogRef.current?.close();
            if (!createView) refresh();
            dispatch({ type: "CREATE_SUCCEEDED", message: `Saved ${envelope.name}.` });
          },
        }),
      ),
    );
  };

  const { page, listRequest, creation } = state;
  const pageNumber = page.history.length;
  const rows = page.pages[pageNumber - 1] ?? [];
  const busy = listRequest.status === "loading";
  if (createView)
    return (
      <main className="mx-auto max-w-xl p-4 sm:p-6">
        <h1 className="mb-6 text-2xl font-semibold">Create envelope</h1>
        {creation.status === "succeeded" ? (
          <Alert role="status" className="mb-4">
            {creation.message}
          </Alert>
        ) : null}
        <CreateEnvelopeForm creation={creation} onSubmit={create} />
      </main>
    );

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Envelopes</h1>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" onClick={() => dialogRef.current?.showModal()}>
          Create envelope
        </Button>
        <div className="grid gap-1">
          <Label htmlFor="sort">Sort</Label>
          <Select
            value={page.sort}
            onValueChange={(value) => {
              if (Schema.is(Sort)(value)) loadPage({ ...initialPage, sort: value });
            }}
          >
            <SelectTrigger id="sort" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">Name A-Z</SelectItem>
              <SelectItem value="name_desc">Name Z-A</SelectItem>
              <SelectItem value="created_asc">Oldest first</SelectItem>
              <SelectItem value="created_desc">Newest first</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" aria-label="Refresh envelopes" onClick={refresh} disabled={busy}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <p className="mt-4 text-sm text-muted-foreground" role="status">
        {listStatus(listRequest, rows.length)}
      </p>
      {creation.status === "succeeded" ? (
        <Alert
          className="mt-3 border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          {creation.message}
        </Alert>
      ) : null}

      <Card className="mt-4" aria-busy={busy}>
        <CardContent className="p-0">
          <Table className="min-w-[36rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.description ?? ""}</TableCell>
                  <TableCell>{new Date(row.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <nav className="mt-4 flex items-center gap-2" aria-label="Pagination">
        <Button
          variant="outline"
          type="button"
          disabled={busy || page.history.length < 2}
          onClick={() => {
            const history = stateRef.current.page.history.slice(0, -1);
            void loadPage({ ...stateRef.current.page, history });
          }}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite" aria-current="page">
          Page {pageNumber}
        </span>
        <Button
          variant="outline"
          type="button"
          disabled={busy || !page.next}
          onClick={() => {
            if (!stateRef.current.page.next) return;
            void loadPage({
              ...stateRef.current.page,
              history: [...stateRef.current.page.history, stateRef.current.page.next],
            });
          }}
        >
          Next
        </Button>
      </nav>

      <dialog
        ref={dialogRef}
        aria-labelledby="create-title"
        className="m-auto w-full max-w-xl rounded-lg border bg-background p-6 text-foreground backdrop:bg-black/50"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="create-title" className="text-lg font-semibold">
            Create envelope
          </h2>
          <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>
            Close
          </Button>
        </div>
        <CreateEnvelopeForm creation={creation} onSubmit={create} />
      </dialog>
    </main>
  );
}

createRoot(document.querySelector("#app")!).render(<BudgieApp />);
