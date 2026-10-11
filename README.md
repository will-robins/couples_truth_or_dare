# Tide & Tell

Tide & Tell is a private truth-or-dare game for two people on a phone. It runs for a set number of days on a trip. Each day, each player gets a morning truth, a daytime dare, and a night dare. Points add up, and points earn real-world coupons.

The app opens as a plain packing checklist. A PIN unlocks the game. Nothing about the game shows until you unlock it.

## First-time setup on each phone

1. Open the link.
2. In the "Add item…" box, type `##` and press **Add**. Choose a 4 to 8 digit PIN. The PIN is stored as a hash on that phone only.
3. One person finishes **Setup**: start date, number of days, Winner's Choice night, short last night, and whether day 1 starts in the afternoon. Then press **Start the game**.
4. Each phone picks a code name: **Coral** or **Riptide**. Only one phone can hold each name.

## Unlocking and hiding

- To unlock, type the PIN into "Add item…" and press Enter.
- A wrong entry is added as a normal list item. Nothing else happens.
- The game locks again when you tap **Lock**, when you switch apps, or after 2 minutes idle.

## How a day works

Each day has these cards:

- **Morning truth.** On day 1 with a late start, this is the **Afternoon truth**. From day 2, a **Pillow talk truth** is also added.
- **Daytime dare.** Always safe to do in public.
- **Night dare.**

Cards start face-down. Tap a card to turn it over.

- **Done** scores the card.
- **Skip** costs points and draws a forfeit. The forfeit must be done the same day. Mark it paid to clear it.
- **Not tonight** swaps a night dare once per night for free.
- After you clear all cards for the day, you unlock one wild card. A skipped card counts as cleared once its forfeit is marked paid.

**Winner's Choice** is on night 5 by default. The leader picks the night's dare. The other player says yes. The leader is decided by scores from before that day, so nothing you do that day can change it.

**The last night** is night 6 by default. It is a short, quiet dare for packing night.

## Points

| Card | Points |
|---|---|
| Flirty | 1 |
| Teasing | 2 |
| Naughty | 3 |
| Partner-written card | +1 |
| Skip | −2 |

Every 10 points earns one coupon. Coupons are kept in the Wallet tab. Tap a coupon to redeem it.

The day turns over at 4am, so a late night still counts for the day it started. Scores lock at 4am after the last day. Unspent coupons still count when you get home.

## Writing cards for each other

Open the **Write** tab. Pick a level and a type (truth or dare), then write the card. It goes into your partner's deck and shows up in their draws with "from" your code name. Daytime cards must be safe in public. Save the explicit ones for night.

## Sharing with your partner

The app is published as a private claude.ai Artifact. To sync both phones:

1. Open the artifact's share settings.
2. Share it with your partner as **Contributor**.

Your partner needs a claude.ai account that the artifact can be shared with.

If sharing is not possible, the app still works on each phone separately. It will not sync. A "Not syncing" note appears at the top of the screen to show this. Scores on one phone will not reach the other.

## Reusing it for a future trip

1. Open the **Setup** tab.
2. Change the start date, the number of days, or any other setting.
3. Press **Save setup**.

To start over, press **Reset game** in the Setup tab and confirm. This clears all draws, scores, and coupons. Cards you wrote for each other stay.

## For developers

- Edit `deck.json` for card content, or `template.html` for layout and behavior.
- Run `node build.mjs` to regenerate `index.html` from the template and deck.
- Run `node test/e2e.mjs` for the browser tests (Playwright).
