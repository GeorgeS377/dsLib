# Greek-aware suggestions, and a cover that survives a rejected form — design

## Intent and why

Two things George asked for after using the new book form.

**Suggestions do not understand Greek.** The search boxes do: typing
`ΒΊΟΣ ΚΑΙ ΠΟΛΙΤΕΊΑ`, `βιοσ και πολιτεια` or `Βίος και Πολιτεία` all find the
same book, because the server folds accents, case and final sigma (`ς`→`σ`)
before matching — verified against the live catalogue. The suggestion
dropdowns do not, and cannot: they are browser-native `<datalist>` elements,
and the browser does the matching itself against the literal accented text.
Typing `καζαντζακη` will never surface *Νίκος Καζαντζάκης*.

George's words: suggestions should accept `ΤΟ ΚΑΠΛΑΝΙ ΤΗΣ ΒΙΤΡΙΝΆΣ` or
`το καπλανι της βιτρινασ` as *Το καπλάνι της βιτρίνας*.

**A rejected form throws away the cover.** When the server refuses a book form
— a duplicate ISBN, an impossible year — it re-renders with everything the
librarian typed. The cover is the exception: browsers never re-populate a file
input (a page could otherwise pre-load a file off disk and steal it on submit),
so the file box comes back empty and the framing is gone, with nothing saying
so. The likely outcome is a title saved with no cover and nobody noticing.
`rerenderForm` even carries the comment "so nothing is lost", which stopped
being true when the cover moved into the main form.

## Goals

- A suggestion list matches on the same folded form the catalogue search uses:
  case, accents and final sigma all ignored.
- Every suggestion field behaves the same way — author names on the book form,
  reader name and class when lending, class on the readers page, language on
  the book form.
- A cover chosen before a rejected submit is still there afterwards, framing
  included, and is saved when the form finally goes through.
- The librarian can tell the cover survived, and can still replace or clear it.

## Non-goals

- Changing how the search boxes match. They are already correct.
- Fuzzy or phonetic matching, Greeklish (`kazantzakis` → `Καζαντζάκης`), or
  ranking by relevance. Substring on the folded text, nothing cleverer.
- Suggestions anywhere in the classic interface, which is being retired.
- Keeping a cover across anything but a rejected submit — not across a browser
  crash, a closed tab, or a session that ends.

## Anti-goals

- **A suggestion field that stops working without scripting.** Every one of
  these is a plain text input with a native `<datalist>` today; that must stay
  the fallback, accent-sensitive but functional.
- **A dropdown that only works with a mouse.** Keyboard and screen-reader
  behaviour is part of the feature, not a later polish.
- **Browser and server disagreeing about what a name folds to.** Two
  implementations of Greek folding that drift apart would make suggestions
  find things the search cannot, which is worse than no suggestions.
- **Cover files accumulating on disk** because a librarian abandoned a form.

## Constraints

- No new dependencies, no build step. Plain DOM JavaScript in
  `src/public/js/app.js`, which is served as-is.
- CSP: `style-src 'self'` with no `'unsafe-inline'`, `img-src 'self' data:`
  with no `blob:`. Classes only, no `style=` attributes.
- Greek-primary with an English toggle; both dictionaries stay in step.
- `src/lib/normalize.js` is the single authority on folding. It is server-side
  ESM and cannot be imported by the browser script.
- Covers are served publicly from `/covers/` by `@fastify/static`, under
  unguessable UUID filenames.

## The how, as decided

**Folding crosses to the browser as data, not as a second implementation.**
The server renders each suggestion with its folded form in a `data-fold`
attribute, computed by `normalize()`. The browser folds only the text being
typed, with a small function that mirrors the four steps. A test asserts the
two agree across a Greek sample, so drift fails the suite rather than
surfacing as mismatched suggestions.

**One shared combobox replaces all five datalists.** A single enhancement in
`app.js` upgrades any input carrying the agreed markup into an ARIA combobox:
type to filter on the folded text, arrows to move, Enter to choose, Escape to
dismiss. With scripting off the native `<datalist>` is what remains, so the
field still suggests, just accent-sensitively.

**A rejected cover is stored immediately and carried by path.** When the form
is refused, any cover that arrived is put through the existing
`storeCoverImage` — the same sniffing, crop, resize and re-encode as a saved
one — and the resulting filenames ride back in hidden fields, with the
thumbnail shown so the librarian can see it survived. The next submit adopts
those files unless a new file replaces them. The crop is already applied at
that point, so the framing is preserved without re-sending coordinates.

This trades a possible orphan for the librarian's work: a form abandoned after
a rejection leaves two unreferenced files in `covers/`. A maintenance script
deletes cover files no book refers to, old enough not to be mid-edit.

## Left to the builder

- The combobox's exact markup contract, and how the list is positioned and
  styled, so long as it is keyboard-operable and announced correctly.
- Whether the pending cover is cleared by a dedicated control or by choosing a
  different file, and the wording that tells the librarian it was kept.
- The age threshold for the orphan sweep, and whether it runs on a schedule or
  only by hand. Both Greek and English wording for anything new on screen.
