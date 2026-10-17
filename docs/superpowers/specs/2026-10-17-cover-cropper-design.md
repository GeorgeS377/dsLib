# Cover cropping, author suggestions, and redundant breadcrumbs — design

## Intent and why

Three complaints from George, walking the second interface on the real site.

**A cover cannot be added while creating a title.** The cover panel only renders
for a book that already exists, because it posts to `/staff/books/:id/cover` and
a title being created has no id. A librarian adding a book therefore saves it,
leaves, comes back, and uploads a cover as a second errand. This has been true
in both interfaces since the beginning; nobody closed it.

**A cover uploads exactly as supplied.** Whatever rectangle the photo happened
to be, that is the cover. George asked for what every site does for a profile
picture: a frame you drag the image around inside, and a zoom control.

**Some pages carry a blue link that does nothing new.** On the book form and on
a reader's page, the breadcrumb is a single link back to the list — the same
destination as the already-highlighted tab in the top bar.

While mapping the work, one further defect surfaced: the second interface's
"remove cover" button posts to `/staff/books/:id/cover/remove`, but the route is
`/staff/books/:id/cover/delete`. That button 404s today.

## Goals

- A cover can be chosen, framed, and saved in the same action that creates a title.
- Before saving, the image can be panned and zoomed inside a fixed cover-shaped
  frame, and what is inside the frame is what gets stored.
- Author fields on the book form suggest names already in the catalogue, the way
  the lending form suggests readers.
- The two breadcrumbs that duplicate the top bar are gone; the one that does not
  stays.
- "Remove cover" works in the second interface.

## Non-goals

- Rotation, straightening, filters, brightness — framing only.
- Changing the first (classic) interface beyond leaving it working. It is not
  getting new features.
- A cropper for any image other than a book cover. There is no other upload.
- Fetching cover art from an external service by ISBN.

## Anti-goals

Things that would make this a failure even if the feature worked:

- **Image bytes processed anywhere but the server.** Every cover today is
  decoded and re-encoded server-side, which is what strips EXIF (including GPS
  from a phone photo) and guarantees the bytes served are never the bytes
  uploaded. A cropper that uploads a canvas export would move that boundary.
- **A page that needs JavaScript to upload a cover.** Every form in this
  interface works with scripting off; the cropper is an enhancement, not a
  gate.
- **Relaxing the Content-Security-Policy.** `img-src` is `'self' data:`.
- **A cover failure that loses a title the librarian just typed in.**

## Constraints

- Node 24, Fastify 5, EJS, `node:sqlite`. Pure-JS dependency tree — no new
  dependency for this, and certainly no native one.
- CSP has no `'unsafe-inline'` for styles and no `blob:` in `img-src`. The
  cropper loads its preview through `FileReader.readAsDataURL`, which yields a
  `data:` URL the policy already permits. Styling is by class; no `style=`
  attributes.
- `@fastify/multipart` is registered with `attachFieldsToBody: 'keyValues'`,
  so files arrive as Buffers and `request.body` is populated before the CSRF
  preHandler runs. Verified by spike: repeated field names (several `authors`
  inputs, several `categories` checkboxes) arrive as arrays, and Greek text
  survives — so the book form can become multipart without changing how it is
  parsed or validated.
- Greek-primary, English toggle. Every new string needs both; a test already
  enforces key parity.

## The how, as decided

**Cropping happens on the server, from coordinates.** The browser uploads the
original file unchanged and adds four numbers — `crop_x`, `crop_y`, `crop_w`,
`crop_h`, in source pixels. The server crops to that rectangle, then resizes and
re-encodes as it does today. With scripting off no coordinates are sent and the
whole image is stored, exactly as now. This keeps one upload path and one place
where image bytes are decoded.

A crop rectangle that is malformed, or that does not overlap the image, is
ignored rather than refused — a stale hidden field should not stop a librarian
saving a cover. A rectangle that merely hangs over an edge is clamped to the
image.

**The frame is 2:3 portrait**, the common trade-paperback proportion, matching
the existing 600px display width at 600×900.

**Saving a title saves its cover.** The book form becomes multipart and carries
the cover field on both the new and the edit page, so one "Save" does
everything. The standalone `POST /staff/books/:id/cover` route stays, because
the classic interface and its tests use it. All three paths share one helper.
`fields` in the multipart limits rises from 20 to 60, because the book form's
checkboxes and author rows can exceed twenty; each field is still capped at
100 kB and still only one file is accepted.

If the title saves but the cover does not, the title is kept and the cover
error is shown. The reverse — losing typed metadata to a bad JPEG — is the
anti-goal above.

**Author suggestions** reuse the reader pattern exactly: a `<datalist>` rendered
into the page, `list=` on each author input, no network call. Rows cloned by the
"add author" button keep the attribute, since cloning is `cloneNode(true)`.

**Breadcrumbs** are removed from the book form and the reader page. The copies
page keeps its two-level trail (`Κατάλογος · <title>`), which the top bar cannot
reproduce.

## Left to the builder

- The exact pointer/drag and zoom mechanics of the cropper, and how the frame is
  drawn, so long as it is keyboard-reachable and respects reduced-motion.
- Whether the cropper's hidden inputs live beside the file input or elsewhere in
  the form.
- Wording of the new Greek and English strings, following the existing voice:
  what a Greek librarian would say out loud, not a translation of the English.
