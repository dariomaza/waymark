import { FailureKind, failureKindOf } from "@ariadna/api-client";
import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useApi } from "../api/api-context.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { useSession, useSignOut } from "./use-session.js";
import { ROUTES } from "../app/routes.js";
import { useTranslate } from "../app/language-context.js";

/**
 * # The gate every screen but the login sits behind
 *
 * Two different things can be wrong with a session and they need different
 * answers.
 *
 * **There is no token.** Straight to the login screen, carrying where the
 * person was going. That is the whole of the scanned-label flow: a phone
 * opens `/u/<publicId>` from the stock camera, lands here with no session,
 * and must come back to that box — not to a home screen — once the password
 * is in.
 *
 * **There is a token and the API refuses it.** Sessions are revocable rows,
 * so a token can stop working at any moment (ADR 6). The client clears the
 * session the instant a 401 comes back, which lands on the first branch above.
 * Checking once on entry means that happens on a splash rather than halfway
 * through a delete.
 *
 * Being unable to REACH the API is neither. The session is not over because
 * the wifi is; the app opens on what it already had.
 */
export const RequireSession = (): JSX.Element => {
  const session = useSession();
  const location = useLocation();

  if (session === null) {
    return (
      <Navigate
        to={ROUTES.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <ConfirmedSession token={session.token} />;
};

const ConfirmedSession = ({ token }: { readonly token: string }): JSX.Element => {
  const t = useTranslate();

  const api = useApi();
  const signOut = useSignOut();

  const check = useQuery({
    // The token is part of the key so a fresh sign-in is a fresh question,
    // rather than the cached refusal of the token that came before it.
    queryKey: ["session", token],
    queryFn: async () => await api.me(),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (check.isPending) {
    return (
      <main className="screen screen--centred">
        <Loading label={t("shell.checkingSession")} />
      </main>
    );
  }

  if (check.isError && failureKindOf(check.error) !== FailureKind.OFFLINE) {
    return (
      <main className="screen screen--centred">
        <Callout
          tone="wrong"
          title={t("session.unconfirmed")}
          action={
            <>
              <Button
                tone="primary"
                onClick={() => {
                  void check.refetch();
                }}
              >
                {t("action.tryAgain")}
              </Button>
              <Button
                onClick={() => {
                  signOut.mutate();
                }}
              >
                {t("shell.signOut")}
              </Button>
            </>
          }
        >
          <p>{check.error.message}</p>
        </Callout>
      </main>
    );
  }

  // Offline counts as in: the app shell and everything already cached still
  // work, and each screen says for itself what it could not load.
  return <Outlet />;
};
