import type { JSX } from "react";

import { LanguageSwitcher } from "../app/language-switcher.js";
import { useSessionState, useSignOut } from "../auth/use-session.js";
import { Screen } from "../ui/organisms/screen.js";
import { AccountPanel } from "./views/account-panel.js";

/**
 * # Container. Everything that belongs to YOU rather than to the inventory
 *
 * Who is signed in, what language the app speaks, and the way out. None of
 * those is a place to look for a thing, which is why they are not beside
 * Places and Things as a word: they are behind the avatar, which is the one
 * shape every product has already taught people means "this is about me".
 *
 * Two of the three used to live in the frame around every screen — the
 * username as a line of chrome across the top, and the language as two
 * permanently visible buttons in the bar. Both were drawn on every screen, for
 * ever, to say something somebody already knew or had decided once. They cost
 * a row of a phone and paid nothing back.
 *
 * It is a DESTINATION and not a menu on purpose. A tab gets the back gesture,
 * the navigator's focus handling and its screen-reader announcement for free,
 * which is a better story than anything a panel of this app's own could be
 * given — and this is a surface somebody arrives at, reads and leaves, rather
 * than a question being asked of them, which is what the sheets are for.
 */
export const AccountScreen = (): JSX.Element => {
  const state = useSessionState();
  const signOut = useSignOut();

  return (
    <Screen>
      <AccountPanel
        username={state.status === "known" ? (state.session?.user.username ?? null) : null}
        language={<LanguageSwitcher />}
        busy={signOut.isPending}
        onSignOut={() => {
          signOut.mutate();
        }}
      />
    </Screen>
  );
};
