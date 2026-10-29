import { KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useReducer, type FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./styles.css";

type LoginState =
  | { status: "email"; email: string; message: string }
  | { status: "sending"; email: string; returnTo: "email" | "code" }
  | { status: "code"; email: string; message: string }
  | { status: "verifying"; email: string }
  | { status: "consent"; clientName: string; scopes: string; message: string }
  | { status: "deciding"; clientName: string; scopes: string };

type Action =
  | { type: "EMAIL_CHANGED"; email: string }
  | { type: "SEND_STARTED"; email: string; returnTo: "email" | "code" }
  | { type: "CODE_REQUESTED" }
  | { type: "VERIFY_STARTED" }
  | { type: "CONSENT_REQUIRED"; clientName: string; scopes: string }
  | { type: "CONSENT_STARTED" }
  | { type: "FAILED"; message: string };

type AuthPresentation = {
  title: string;
  description: string;
  icon: typeof Mail;
  submitLabel: string;
};
const emailPresentation: AuthPresentation = {
  title: "Sign in to Budgie",
  description: "Use a one-time email code. No password needed.",
  icon: Mail,
  submitLabel: "Send code",
};
const codePresentation: AuthPresentation = {
  title: "Check your email",
  description: "Use a one-time email code. No password needed.",
  icon: KeyRound,
  submitLabel: "Verify code",
};
const consentPresentation: AuthPresentation = {
  title: "Connect your account",
  description: "Choose whether to grant access to your envelopes.",
  icon: ShieldCheck,
  submitLabel: "Approve",
};
const presentationByState = {
  email: emailPresentation,
  sending: emailPresentation,
  code: codePresentation,
  verifying: codePresentation,
  consent: consentPresentation,
  deciding: consentPresentation,
} satisfies Record<LoginState["status"], AuthPresentation>;

const initialState: LoginState = { status: "email", email: "", message: "" };

function reducer(state: LoginState, action: Action): LoginState {
  switch (action.type) {
    case "EMAIL_CHANGED":
      return state.status === "email" ? { ...state, email: action.email } : state;
    case "SEND_STARTED":
      return { status: "sending", email: action.email, returnTo: action.returnTo };
    case "CODE_REQUESTED":
      if (state.status !== "sending") return state;
      return {
        status: "code",
        email: state.email,
        message: "Enter the code from your email. You can resend if it expires.",
      };
    case "VERIFY_STARTED":
      if (state.status !== "code") return state;
      return { status: "verifying", email: state.email };
    case "CONSENT_REQUIRED":
      return {
        status: "consent",
        clientName: action.clientName,
        scopes: action.scopes,
        message: "Review the access request.",
      };
    case "CONSENT_STARTED":
      if (state.status !== "consent") return state;
      return { status: "deciding", clientName: state.clientName, scopes: state.scopes };
    case "FAILED":
      switch (state.status) {
        case "sending":
          return state.returnTo === "code"
            ? { status: "code", email: state.email, message: action.message }
            : { status: "email", email: state.email, message: action.message };
        case "verifying":
          return { status: "code", email: state.email, message: action.message };
        case "deciding":
          return {
            status: "consent",
            clientName: state.clientName,
            scopes: state.scopes,
            message: action.message,
          };
        default:
          return state;
      }
  }
}

const client = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);
const authorizationId = new URL(location.href).searchParams.get("authorization_id");

function asError(error: unknown) {
  return error instanceof Error ? error : new Error("Please try again.");
}

function requestOtp(email: string) {
  return Effect.tryPromise({
    try: () => client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }),
    catch: asError,
  }).pipe(Effect.flatMap(({ error }) => (error ? Effect.fail(error) : Effect.void)));
}

function verifyOtp(email: string, code: string) {
  return Effect.tryPromise({
    try: () => client.auth.verifyOtp({ email, token: code, type: "email" }),
    catch: asError,
  }).pipe(
    Effect.flatMap(({ error }) => (error ? Effect.fail(error) : Effect.void)),
    Effect.flatMap(() =>
      authorizationId
        ? Effect.tryPromise({
            try: () => client.auth.oauth.getAuthorizationDetails(authorizationId),
            catch: asError,
          })
        : Effect.fail(new Error("Open this page from your MCP account connection.")),
    ),
    Effect.flatMap(({ data, error }) => (error ? Effect.fail(error) : Effect.succeed(data))),
  );
}

function submitConsent(approve: boolean) {
  if (!authorizationId)
    return Effect.fail(new Error("Open this page from your MCP account connection."));
  return Effect.tryPromise({
    try: () =>
      approve
        ? client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true }),
    catch: asError,
  }).pipe(
    Effect.flatMap((result) =>
      result.error ? Effect.fail(result.error) : Effect.succeed(result.data.redirect_url),
    ),
  );
}

function Login() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const requestCode = (email: string, returnTo: "email" | "code") => {
    dispatch({ type: "SEND_STARTED", email, returnTo });
    void Effect.runPromise(
      requestOtp(email).pipe(
        Effect.match({
          onFailure: (error) => dispatch({ type: "FAILED", message: error.message }),
          onSuccess: () => dispatch({ type: "CODE_REQUESTED" }),
        }),
      ),
    );
  };

  const verify = (code: string) => {
    if (state.status !== "code") return;
    const { email } = state;
    dispatch({ type: "VERIFY_STARTED" });
    void Effect.runPromise(
      verifyOtp(email, code).pipe(
        Effect.match({
          onFailure: (error) => dispatch({ type: "FAILED", message: error.message }),
          onSuccess: (data) => {
            if ("redirect_url" in data) {
              location.assign(data.redirect_url);
              return;
            }
            dispatch({
              type: "CONSENT_REQUIRED",
              clientName: data.client.name,
              scopes: data.scope,
            });
          },
        }),
      ),
    );
  };

  const consent = (approve: boolean) => {
    if (state.status !== "consent" || !authorizationId) return;
    dispatch({ type: "CONSENT_STARTED" });
    void Effect.runPromise(
      submitConsent(approve).pipe(
        Effect.match({
          onFailure: (error) => dispatch({ type: "FAILED", message: error.message }),
          onSuccess: (redirectUrl) => location.assign(redirectUrl),
        }),
      ),
    );
  };

  const presentation = presentationByState[state.status];
  const Icon = presentation.icon;
  const isConsent = state.status === "consent" || state.status === "deciding";
  const isBusy =
    state.status === "sending" || state.status === "verifying" || state.status === "deciding";
  const message =
    state.status === "email" || state.status === "code" || state.status === "consent"
      ? state.message
      : "";

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2 font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          Budgie
        </div>
        <Card className="shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full border bg-muted/50">
              <Icon aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">{presentation.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{presentation.description}</p>
          </CardHeader>
          <CardContent>
            {message ? (
              <Alert className="mb-6 text-muted-foreground" role="status">
                {message}
              </Alert>
            ) : null}
            {isConsent ? (
              <section className="grid gap-5">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="font-medium break-words">{state.clientName}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Requested access</p>
                  <p className="mt-1 break-words text-sm">{state.scopes}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  This client can create and read your private envelopes.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Button disabled={isBusy} onClick={() => void consent(true)}>
                    {isBusy ? (
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Approve
                  </Button>
                  <Button variant="outline" disabled={isBusy} onClick={() => void consent(false)}>
                    Deny
                  </Button>
                </div>
              </section>
            ) : (
              <section>
                <form
                  className="grid gap-4"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    if (state.status === "code") {
                      void verify(String(form.get("code")));
                    } else if (state.status === "email") {
                      void requestCode(String(form.get("email")), "email");
                    }
                  }}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      readOnly={state.status !== "email" && state.status !== "sending"}
                      required
                      disabled={isBusy}
                      value={state.email}
                      onChange={(event) =>
                        dispatch({ type: "EMAIL_CHANGED", email: event.currentTarget.value })
                      }
                    />
                  </div>
                  {state.status === "code" || state.status === "verifying" ? (
                    <div className="grid gap-2">
                      <Label htmlFor="code">Email code</Label>
                      <Input
                        id="code"
                        name="code"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        autoFocus
                        placeholder="Enter your code"
                        className="text-center text-lg tracking-widest"
                        required
                        disabled={isBusy}
                      />
                    </div>
                  ) : null}
                  <Button className="w-full" disabled={isBusy}>
                    {isBusy ? (
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {presentation.submitLabel}
                  </Button>
                </form>
                {state.status === "code" ? (
                  <Button
                    className="mt-3 w-full"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => void requestCode(state.email, "code")}
                  >
                    Resend code
                  </Button>
                ) : null}
              </section>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

createRoot(document.querySelector("#app")!).render(<Login />);
