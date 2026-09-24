import type { JSX } from "react";

import { LanguageSwitcher } from "../app/language-switcher.js";
import { MachineTokensPanel } from "../auth/machine-tokens-panel.js";
import { PasskeysPanel } from "../auth/passkeys-panel.js";
import { useSession, useSignOut } from "../auth/use-session.js";
import { AccountPanel } from "./views/account-panel.js";

/**
 * # Container. Everything that belongs to YOU rather than to the inventory
 *
 * Who is signed in, the devices that can open this account, the keys handed to
 * programs, what language the app speaks, and the way out.
 *
 * ## It was a sheet behind an avatar in the top bar, and the argument for that
 * was not wrong
 *
 * It said: what is behind the avatar is a small GROUP OF CONTROLS rather than a
 * list of commands, so `role="menu"` was the wrong role and the language
 * switcher would have had to be rebuilt out of `menuitemradio` to fit it; and a
 * page of its own costs a navigation away from the inventory and back, plus one
 * more address in an origin with exactly one namespace to spend (ADR 16).
 *
 * Every sentence of that still holds, and it is overruled anyway, because it
 * weighed this client on its own. There are TWO clients on the owner's phone.
 * The other one has always made this a DESTINATION, and an account reached one
 * way here and another way there is precisely what he was looking at when he
 * said the two read as two products. His standing decision is that the phone's
 * shape wins (ADR 22), and this is that decision applied to the loudest
 * difference left on the screen.
 *
 * What the phone's shape buys is its own reasoning, unchanged: a destination
 * gets the back gesture, the router's focus handling and its announcement for
 * free, and this is a surface somebody arrives at, reads and leaves — rather
 * than a question being asked of them, which is what the sheets are for.
 *
 * The cost is the one the sheet's argument named, and it is now paid: one more
 * address, and a navigation there and back. Two taps either way, which is why
 * it was ever close.
 */
export const AccountScreen = (): JSX.Element => {
  const session = useSession();
  const signOut = useSignOut();

  return (
    <main className="screen">
      <AccountPanel
        username={session?.user.username ?? null}
        language={<LanguageSwitcher />}
        /*
         * The devices that can open this account (ADR 19), and the one panel
         * this client has and the phone does not. Handed in rather than reached
         * for, so the panel stays a thing that draws.
         */
        passkeys={<PasskeysPanel />}
        /*
         * Credentials for programs (ADR 18). Under the passkeys, because those
         * are about the person holding the phone and these are about programs —
         * this surface is ordered from "you" outwards.
         */
        machineTokens={<MachineTokensPanel />}
        busy={signOut.isPending}
        onSignOut={() => {
          signOut.mutate();
        }}
      />
    </main>
  );
};
