# dsLib — second interface, designed from scratch

**Status:** design, awaiting approval. Nothing built yet.
**Date:** 2026-10-14

## Why

The library works. The interface is the problem, and mostly on the staff side.
George's words: the pages look *cluttered, not beginner-friendly, and not
responsive*.

The reason the staff side reads that way is a mismatch about who uses it. It is
built like an admin console — a catalogue section, a circulation section, a
borrowers section, each with its own list, filters and forms — which suits
someone who is in it daily. **The people actually using it are teachers taking
a shift in the library.** They use it a handful of times a term. They are not
being paid to learn a system; they have a student at the desk and one of four
jobs to do:

- lend a book
- take a book back
- add a book
- fix something about a book

An interface for that person should open by doing one of those jobs, not by
presenting a console and leaving them to work out which section it lives in.

This is an experiment. The existing interface stays exactly as it is and keeps
working; the new one is built alongside it so the two can be compared on the
same data, and so abandoning the new one costs nothing but deleting it.

## Goals

- A teacher who has never been shown the system can lend and return a book
  without being told where to go.
- Every screen works on a phone, not merely "doesn't break" — the common
  actions are reachable with a thumb.
- Plainer and less busy than the current one: fewer boxes, fewer competing
  controls, more space.
- Looks current without looking fashionable. George's reference point is "about
  2022": flat, square-ish, one accent colour, no gradients or glass.
- Runs beside the existing interface, switchable, with no change to data,
  routes, or what the system does.

## Non-goals

- No change to the database, the migrations, or any query beyond adding new
  read paths for new screens.
- No change to URLs. `/books/12` stays `/books/12` in both interfaces.
- No new features beyond the one noted below (combined staff search). This is
  about presentation, not scope.
- No client-side framework, no build step, no new runtime dependency. Same
  constraint as the original: server-rendered EJS, plain CSS, no bundler.
- The old interface is not touched, not refactored, not "gradually migrated".

## Anti-goals — what would make this a failure even if it shipped

- A teacher opens it and still has to ask where lending lives.
- It looks better in a screenshot and is slower to actually use.
- Two interfaces that have both half-rotted because changes have to be made
  twice. If the new one wins, the old one gets deleted; it does not linger.
- A phone layout that is the desktop one squeezed.

## Decisions George made

These came out of the mockup session and are settled.

1. **The staff home is a search box, not a menu.** One field at the top. The
   actions hang off the results rather than being a destination you navigate
   to first.
2. **That box searches books and readers together,** with results grouped under
   two headings. A teacher holding a book searches the title; a teacher chasing
   an overdue one has only the student's name. Both work from the same field,
   so there is nothing to learn about where to go.
3. **Top bar: product name and icon on the left, the signed-in person and sign
   out on the right.** (Carried over from the current interface, which already
   got this right.)
4. **Square panels, lightly rounded controls.** Lists, cards and panels have no
   corner radius; buttons and inputs get 4px so they read as pressable.
5. **Phone navigation is a bottom bar** — four items, icon and word, always
   visible. Not a hamburger: nothing a teacher needs should be behind a button
   that has to be discovered.
6. **Palette is George's house colours,** blue `#0086d4` and orange `#fb6222`,
   the pair he uses across his sites. **Blue leads:** it carries everything
   clickable. Orange is the brand mark, the active-page marker, and anything
   that needs attention — rare enough that it still registers when it appears.
   George asked for the lighter rather than darker blue.
7. **The public catalogue offers both a cover grid and a list, with a switch,**
   defaulting to the list. Most books have no cover image yet, so a grid today
   is a wall of grey placeholders; the switch means the design does not have to
   be redone once covers are added.

## Decisions I made, which George has not ruled on

Flagged so they can be overridden cheaply.

- **Contrast.** White text on `#0086d4` measures 3.9:1 and on `#fb6222` 3.1:1,
  against the 4.5:1 threshold for normal-size text. George asked for the
  lighter blue after I raised this, so: `#0086d4` is used as the fill of
  buttons (whose labels are 15px/600, where the shortfall is least likely to
  bite), and a darker `#0071b3` is used for link text inside running copy,
  where small text on white is the real readability risk. Orange is never used
  behind white text — it appears as a brand mark, a 2px active-tab rule, and as
  dark-on-pale badges (`#9a3a06` on `#feeee6`).
- **Type** is the system font stack, as now. No web font: it would be the
  project's first network-loaded asset and the first thing to break offline.
- **Dark mode stays**, with light as the default and an explicit toggle, matching
  the current behaviour and the cookie that already drives it.
- **The Greek/English toggle stays** where it is, top right.
- **Icons** reuse the existing inline SVG set (`src/views/partials/icon.ejs`)
  rather than a new one.
- **Spacing** follows the scale the current stylesheet already uses (4/8/12/16/
  24/32/48px), and the flow rules added on 2026-10-13 — things stacked inside a
  container are separated by default rather than pair by pair.

## One genuinely new capability

The combined staff search needs a query that the system does not have: one
search over books *and* borrowers, returning both kinds of result. Everything
else on the new screens is a rearrangement of data already queried.

This also resolves something George asked for separately and which the current
interface cannot do: **returning a book by searching for it.** Today check-in is
barcode-only, which fails for any copy that was never labelled. In the new
interface a return starts from the same search box as everything else.

## The screens

### Staff — home (`/staff`)

Top bar: icon + "Βιβλιοθήκη" left; signed-in name and a red "Έξοδος" right. On
wide screens the bar also carries the page links (Αναζήτηση, Κατάλογος,
Δανεισμοί, Αναγνώστες, Ρυθμίσεις), the active one marked with a 2px orange
rule. On a phone those five collapse to a four-item bottom bar; Ρυθμίσεις moves
under the account name.

Body: a single labelled field — "Βιβλίο ή μαθητής" — and a button. Nothing else
above the fold. Empty state below it is a short line, not a dashboard.

### Staff — search results

Two groups, each a plain bordered list, headed ΒΙΒΛΙΑ and ΑΝΑΓΝΩΣΤΕΣ, omitted
when empty.

A book row: small cover, title, author · shelf · barcode, an availability
count badge, and a primary action. The action is **Δανεισμός** when a copy is
free, and **Δείτε** when none is. A reader row: initials, name, class and how
many books they hold, with **Επιστροφή** when they hold any.

Lending and returning both continue from here. The multi-copy basket built on
2026-10-13 keeps working as it does now — the selection lives in the query
string — it simply starts from this search rather than a dedicated page.

**What each action does.** "Δανεισμός" on a book row puts that title's first
free copy into the lending basket and lands on the lend screen, where the
borrower is named — it does not lend on the spot, because nothing has been said
yet about who is taking it. "Επιστροφή" on a reader row opens that reader's page
showing their open loans with a Return beside each, because a reader may be
holding several books and only one of them is being handed back.

### Staff — the other pages

**Every staff page is converted**, not only the ones drawn above; the rest
(copies, categories, authors, users, account, and the confirmation pages) take
the shell and the shared list and form rules without needing their own layout.

Κατάλογος, Δανεισμοί, Αναγνώστες keep their current function — "Αναζήτηση" in
the nav is the combined box from the home; "Κατάλογος" is still the full book
list with its filters, sorting and "add a title". They get the new shell, the
new list styling, and a capped-width search field at the top (the current
full-bleed one is the specific thing George called out). Forms get the same
treatment: one column, labels above fields, submit set clearly apart.

**The phone top bar carries only the brand and the account initials.** Language
and theme are not desk-side decisions and do not deserve bar space on a narrow
screen; they move to the footer. The account initials link to the account page,
which is also the way to Ρυθμίσεις — so no part of the interface needs a
dropdown, which would be this project's first piece of required JavaScript.

### Public — catalogue

Search field, filter chips, then the results in either a cover grid or a list,
switched by a control at the top right of the results and remembered in a
cookie. **The list is the default.** A list row carries the cover thumbnail,
title, author, category and shelf, and the availability count. A grid cell
carries the cover, title, author and count.

### Public — book page

Keeps the shape it reached on 2026-10-13: title and authors, a count of
available copies rather than a per-copy table, shelf locations listed once
each, description. New shell and new styling only.

## How the two interfaces live side by side

- New templates go in `src/views/next/` mirroring the existing tree. Nothing in
  `src/views/` is edited.
- New stylesheet at `src/public/css/next.css`. The existing `app.css` is not
  touched.
- Which set renders is decided per-request: `?ui=next` or `?ui=classic` sets a
  long-lived cookie; the cookie decides thereafter. **Default stays classic**
  until George says otherwise, so nobody lands on the experiment by accident.
- Routes gain no branching logic of their own. The view name is resolved
  centrally — a small helper on the reply decorator that prefixes `next/` when
  the flag is on, falling back to the classic template if the new one does not
  exist yet. That fallback is what allows the redesign to land screen by screen
  instead of all at once.
- Every existing test keeps passing unchanged, because the default is unchanged.
  New tests cover the new screens and the flag itself.

## How much gets converted

**All of it — every staff page and every public page.** George was asked whether
a slice was enough to judge the experiment and said no: the comparison is only
fair if the new interface is complete enough to actually work a shift in.

## What is left to the builder

- The order the screens are converted in. Suggested: shell and stylesheet, then
  staff search (the point of the whole thing), then the staff lists and forms,
  then public. Each is independently shippable behind the flag.
- The exact markup of each component, within the visual rules above.
- Whether the combined search is one SQL query or two; it needs to return the
  two groups separately either way.
- How the bottom bar hides on wide screens (media query) and whether it needs a
  safe-area inset for iOS.
- Test strategy for the new screens, following the project's existing habit:
  behaviour, not markup. Note that spacing and layout remain unverifiable by
  `npm test` — `scripts/spacing-probe.js` is the tool for those. The new pages
  are expected to pass the existing structural accessibility suite on the same
  terms as the old ones: every control labelled, headings in order, no skipped
  levels, every table header scoped.

## Relationship to outstanding requests

George raised four things just before this session that the redesign touches:

| Request | Status under this design |
|---|---|
| Borrower search field is full-width and huge | Fixed by the capped search field in the new shell |
| Remove the "Για κάθε αναγνώστη τηρούνται…" note | **Not covered.** Still to do, in both interfaces |
| Loans page needs search, a full log, and sorting by date | **Not covered.** Needs its own pass |
| Can't return a book by searching for it | Resolved by the combined search |

The two uncovered items should be handled separately, in the classic interface,
since they are missing function rather than presentation.
