# project-W

Split bills fairly, and later keep track of your own finances, all in your
browser. You type in a bill's items, say who had what, and project-W shows
who owes what, down to the cent. There are no accounts and no server:
everything stays on your device.

## What works today

- **Split a bill.** Add the items (name, quantity, price) and the people
  sharing it. Assign each item to one or more people, equally or with
  custom shares. Add tax, a tip and a discount, as an amount or a
  percentage. You see each person's total, with a breakdown, and who owes
  the person who paid. The totals always add up to the bill total exactly,
  and leftover cents are shared out fairly across the whole bill. Copy the
  result as text to send it to your friends.
- **Region.** In Settings, choose how amounts are typed and shown:
  Portuguese, UK or US number format, and euros, pounds or US dollars. The
  default is Portuguese format in euros. Changing the currency only
  changes the symbol; nothing is converted.
- **Light and dark themes**, following your system or chosen by hand.
- **Phones and desktops.** The app is built for small screens first.

Receipt photos, reading receipts automatically, and personal finance
dashboards are on the [roadmap](docs/ROADMAP.md).

## Try it

There's no hosted version yet. To run it on your computer, you need
Node.js and npm; the steps are in [`app/README.md`](app/README.md). In
short, from the `app/` folder:

```sh
npm ci
npm run dev
```

Then open the address it prints and choose **Split a bill**.

## Privacy

Everything runs in your browser. The bill you're editing and your Region
setting are saved in your browser's storage on this device only, so a
refresh doesn't lose them. **New bill** clears the saved bill. Nothing is
sent anywhere.

## Roadmap and releases

- The plan, milestone by milestone: [`docs/ROADMAP.md`](docs/ROADMAP.md).
- Every change merged into `master` is published as a
  [GitHub Release](https://github.com/jfilipegm/project-W/releases). The
  version number follows the kind of change: a new feature raises the
  minor version, and any other change raises the patch version.
