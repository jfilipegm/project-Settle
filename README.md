# Settle

**Split bills. Settle up. Stay private.**

Split bills fairly, and later keep track of your own finances, all in your
browser. You scan a receipt or type in a bill's items, say who had what,
and Settle shows who owes what, down to the cent. There are no accounts and no server:
everything stays on your device.

## What works today

- **Split a bill.** Add the items (name, quantity, price) and the people
  sharing it. Assign each item to one or more people, equally or with
  custom shares. Add tax, a tip and a discount, as an amount or a
  percentage. You see each person's total, with a breakdown, and who owes
  the person who paid. The totals always add up to the bill total exactly,
  and leftover cents are shared out fairly across the whole bill. Copy the
  result as text to send it to your friends.
- **Scan a receipt.** Choose a photo or PDF of a receipt (JPEG, PNG, HEIC
  or PDF), take a photo on your phone, or drop the file on the page.
  Settle reads it on your device with PaddleOCR, an open-source
  text-recognition engine, then fills in the items for you. Portuguese
  and English receipts work best. When a Portuguese receipt has a fiscal
  QR code, its total, date and NIF are read from the code, which is
  exact. A store app's PDF receipt is read from its text, exactly, with
  no recognition at all. A **Receipt check** shows what was read,
  compares the items with the receipt's total as you edit them, and marks
  the lines it wasn't sure about. You review and fix the items, then split
  the bill as usual. If a receipt can't be read, you type the items in.

  **Measured on real receipts** (19 receipts from Portuguese shops and
  restaurants, read in a real browser, M2.5): about 8 in 10 receipt
  photos and screenshots come in with **no edit needed** (81–86 %), about
  96 % of the item lines are read at the right price, and a receipt
  with a wrong or missing price never shows "Matches": the check flags
  it instead.

  - **Photo advice.** While a receipt is being read, Settle checks the
    photo first: text too small, blurred, too dark or faint, cut off at
    an edge, or taken from too far away. It says what to do (move closer,
    hold the phone steady, find more light, include the whole receipt, or
    for an app receipt send the original image or its PDF), so you can
    cancel and take a better photo. It's advice only: the reading goes on.
  - **Review lines.** The check can show every line the reader found: the
    receipt image with a box over each line, coloured by what it was read
    as (an item, a discount, the total, a payment, an ignored line…), and
    the same lines as a list. Select a line to see its box and its item
    in the bill. A line read but left out can be added as an item, and so
    can a line the reader missed.
  - When the items don't add up to the receipt's total, you can't miss
    it: the result says so, and so does the copied text, and one click
    adds the missing difference as an item. If only part of a receipt was
    read, the check says how much. When no item could be read but the
    receipt has a fiscal QR code, its total comes in as one item to split
    as it is. And if the import left out lines at the bottom of the
    receipt to match its total, it lists them until you confirm they
    aren't items, or put them back.

  **Known limits:**
  - Reading takes time: about 6–8 seconds per receipt on a desktop
    computer, and longer on a phone (up to about 30 seconds). The first
    scan also downloads the reader (about 27 MB).
  - Small screenshots, where the whole receipt is shrunk to fit one image,
    can lose digits. Send the original image from the receipt app (for
    example as a document), or its PDF.
  - Crumpled, faded or blurred receipts, and lines on a fold of the
    paper, may be misread; the check shows the gap.

- **Region.** In Settings, choose how amounts are typed and shown:
  Portuguese, UK or US number format, and euros, pounds or US dollars. The
  default is Portuguese format in euros. Changing the currency only
  changes the symbol; nothing is converted.
- **Light and dark themes**, following your system or chosen by hand.
- **Phones and desktops.** The app is built for small screens first.

Personal finance dashboards and more are on the
[roadmap](docs/ROADMAP.md).

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

Everything runs in your browser. The bill you're editing, the receipt
check's summary and your Region setting are saved in your browser's
storage on this device only, so a refresh doesn't lose them. **New bill**
clears them. Nothing is sent anywhere.

**Receipts are read on your device and never uploaded.** Settle has no
server to send them to. The receipt image stays in memory while you
review it and is never saved, and so are the photo advice and the
reviewed lines. The first time you scan a receipt, your browser downloads
the reader (the PaddleOCR engine and its models, about 27 MB) from
Settle itself, not from anyone else, and keeps it for next time. A strict content security
policy stops the page from contacting any other site.

## Third-party licences

Receipt reading uses open-source libraries: PaddleOCR's models (through
ppu-paddle-ocr and ONNX Runtime Web), zxing-wasm, pdf.js and heic-to. heic-to, which opens HEIC photos in browsers that
can't, is licensed under the LGPL-3.0 and is shipped as its own,
unmodified file. Each library, its licence and its source are listed in
[`app/public/THIRD_PARTY_NOTICES.md`](app/public/THIRD_PARTY_NOTICES.md),
which the app also links from Settings.

## Roadmap and releases

- The plan, milestone by milestone: [`docs/ROADMAP.md`](docs/ROADMAP.md).
- Every change merged into `master` is published as a
  [GitHub Release](https://github.com/jfilipegm/project-Settle/releases). The
  version number follows the kind of change: a new feature raises the
  minor version, and any other change raises the patch version.
