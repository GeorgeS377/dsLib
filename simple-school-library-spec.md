# Simple School Library — Project Specification

## 1. Project goal

Build a **small, custom library-management website**.

The public website should let anyone browse and search the catalogue without creating an account. Librarians should have a secure staff area to manage the catalogue and library operations.

## 2. Main user types

### Public visitor / student
- No account or login required.
- Browse and search books.
- Open a book page to see its details and whether copies are available.
- Browse categories and authors.
- Use the website comfortably on phones, tablets, and computers.

### Librarian / administrator
- Sign in through a protected staff area.
- Add, edit, archive, and remove catalogue records as appropriate.
- Manage physical copies and their availability.
- Manage loans and returns if circulation is included in the first release.
- Manage categories-tags, authors, and other catalogue metadata.
- View a simple dashboard and basic reports. (Mostly Greek)

There should be no public student-account system in the initial version. Do not collect student information unless it is genuinely needed for a librarian-only circulation workflow and explicitly approved.

## 3. Public catalogue features

### Home page
- Clean, simple design suitable for a school library.
- Prominent search field.
- Recently added books or featured catalogue items.
- Quick links to browse all books and categories.
- Clear empty states when the catalogue has no items.

### Search and browse
- Search by title, author, ISBN, subject, and keywords.
- Case-insensitive search; handle partial matches.
- Filter by category, author, publication year, and availability.
- Sort by title, author, recently added, or publication year.
- Pagination for large catalogues.
- Useful message when no results match.
- Preserve filters and search terms when moving between result pages.

### Book details page
Show the information available for each item:
- Title
- Author(s)
- Cover image, when available
- ISBN
- Publisher
- Publication year
- Edition
- Category / subject
- Language
- Description / summary
- Shelf location or call number, if configured
- Number of copies and availability status

Do not display private borrower data on public pages. Availability should be derived from copy/loan records rather than manually typed text.

### Categories and authors
- Browse books by category or author.
- Each category/author page lists the matching books.
- Avoid duplicate categories and authors where possible.

## 4. Staff area

Create a separate staff route, such as `/admin` or `/staff`, protected by authentication. The exact route can be chosen during implementation.

### Dashboard
- Total catalogue titles
- Total physical copies
- Available copies
- Currently loaned copies, if loans are enabled
- Recently added or updated books
- Quick actions for adding a book and managing copies

### Catalogue management
Librarians should be able to:
- Create, view, edit, and archive catalogue records.
- Add and remove cover images safely.
- Validate ISBN and other fields when provided.
- Assign multiple authors and categories.
- Track multiple physical copies of the same title.
- Give each copy a unique copy identifier/barcode if desired.
- Set a shelf location or call number per copy when appropriate.
- See clear validation errors and confirmation messages.

Prefer archiving over permanent deletion when a record has loan history or related data. Prevent accidental destructive actions and show a confirmation before deleting or archiving.

### Copies and availability
A title is a catalogue record; a copy is an individual physical item. One title may have several copies.

Each copy should have:
- Unique internal ID
- Optional barcode / inventory number
- Optional shelf location
- Status, such as available, on loan, lost, or withdrawn
- Link to its catalogue title

Availability on the public website must be calculated from copy status and active loans.

### Loans and returns — scope decision
Design the data model so circulation can be added cleanly. If implementing it in the first version, staff should be able to:
- Check out a copy and record a due date.
- Record a return.
- See overdue loans.
- Prevent the same copy from being loaned to two people at once.
- View loan history only in the staff area.

**Important privacy default:** Do not create student accounts or expose borrower names publicly. Before building borrower records, ask for confirmation about what minimum information the library is allowed and required to keep. If circulation is not required yet, implement catalogue and copy management first and leave loans as a clearly documented next phase.

## 5. Authentication and security

- Public catalogue routes are readable without authentication.
- All staff-management routes and APIs require a valid staff session.
- Use a well-maintained authentication library or framework mechanism; never invent custom password cryptography.
- Store passwords using a modern password-hashing algorithm provided by the framework/library.
- Use secure, HTTP-only, SameSite cookies and CSRF protection where applicable.
- Rate-limit login attempts and avoid revealing whether a username exists.
- Validate and authorize every staff API operation on the server, not just in the UI.
- Protect against SQL injection, XSS, CSRF, insecure file uploads, and broken access control.
- Store secrets in environment variables or an appropriate secret store; never commit secrets.
- Do not expose database credentials or internal error traces to visitors.
- Provide a safe way to create the first administrator without shipping a default password.
- Include a logout action and session expiry.
- Do not expose the staff interface publicly without authentication, even if Nginx or a VPN also restricts access.

## 6. Technical approach

Choose a boring, well-supported stack that Claude Code can maintain confidently. First inspect the current repository and explain the proposed stack before creating the application. If there is no existing project, recommend a simple full-stack framework with:
- Server-side authentication and authorization
- A relational database such as PostgreSQL or MariaDB
- Database migrations
- Input validation
- Automated tests
- Responsive server-rendered pages or a modest frontend

Do not add microservices, Kubernetes, or unnecessary complexity. Keep the project easy to run, back up, update, and understand.

The app should run on the user's Ubuntu Server. Nginx can serve as the HTTPS reverse proxy. If another website or service already uses Nginx, preserve its existing configuration and make changes only after backing it up. Do not assume ports, domains, database setup, or deployment paths; inspect and confirm them first.

## 7. Visual design and accessibility

- Simple, modern, uncluttered design.
- Prioritize finding books quickly over decorative animations.
- Responsive layout for desktop and mobile.
- Readable typography, sufficient contrast, visible keyboard focus, labels for form fields, and useful error messages.
- Use semantic HTML and accessible controls.
- Provide loading, empty, success, and error states.
- Support Greek and English text, including Greek characters and accents.
- Use UTF-8 throughout.
- Keep the interface easy for non-technical librarians.

## 8. Data model — suggested starting point

Adapt this to the chosen framework and explain any changes.

- `StaffUser`: id, username/email, password hash or external-auth identifier, role, created/updated timestamps.
- `Book`: id, title, ISBN, publisher, publication year, edition, language, description, cover path, created/updated timestamps, archived timestamp.
- `Author`: id, name.
- `BookAuthor`: book id, author id.
- `Category`: id, name, optional description.
- `BookCategory`: book id, category id.
- `Copy`: id, book id, barcode/inventory number, shelf location, status, created timestamp.
- Optional `Borrower` and `Loan` tables only if circulation is approved. Keep borrower data private and collect the minimum necessary.

Use database constraints and indexes for common search fields and unique identifiers. Add migrations and seed only non-sensitive demo data. Never seed a real/default admin password.

## 9. Backups, operations, and maintenance

- Provide documented backup and restore commands for the database and uploaded cover images.
- Explain how to apply migrations safely.
- Log important staff actions without logging passwords, session tokens, or unnecessary borrower data.
- Provide a health-check endpoint that reveals no secrets.
- Include a `.env.example` with placeholder values only.
- Include a README with development setup, production deployment, update, backup, and restore instructions.
- Keep logs rotated and permissions restrictive.
- Do not expose the database port to the public internet.
- Use HTTPS in production.
- Document how to roll back a deployment or restore a backup.

## 10. Testing and acceptance criteria

The first release is ready when:
1. A visitor can browse the catalogue without logging in.
2. Search supports title, author, ISBN, and keyword queries.
3. Filters, sorting, pagination, and book-detail pages work.
4. A visitor cannot access staff pages or staff APIs without authentication.
5. An authenticated librarian can create and edit a title and manage its copies.
6. Copy availability shown publicly matches the database.
7. Validation prevents malformed input and duplicate identifiers.
8. Public pages never expose staff credentials, private borrower data, or internal error traces.
9. The layout works on both mobile and desktop.
10. Database migrations, backup/restore instructions, and automated tests are included.
11. Existing server services and Nginx sites remain untouched unless explicitly approved.

## 11. Build workflow for Claude Code

Follow this workflow and pause at important decision points:

1. **Inspect first:** Read the repository, README, existing configuration, and available runtime versions. If working on the server, use read-only commands first.
2. **Summarize findings:** Explain what already exists, the proposed architecture, and any unknowns.
3. **Ask only essential questions:** In particular, confirm whether loans/borrower records are required now, what domain will be used, and whether Greek-only or Greek-and-English UI is wanted.
4. **Plan in small phases:** Start with schema, public catalogue, staff authentication, catalogue/copy management, tests, and deployment documentation.
5. **Implement incrementally:** Keep changes small, run tests and linters, and explain the result of each phase.
6. **Protect existing systems:** Before changing Nginx, firewall rules, databases, or system services, show the proposed changes and obtain approval. Back up configuration files first.
7. **No destructive surprises:** Do not delete existing data, overwrite unrelated files, reset databases, expose services, or run destructive commands without explicit approval.
8. **Verify:** Test public access, staff authorization, search, copy availability, validation, and backup/restore procedures.
9. **Document:** Keep the README and `.env.example` aligned with the implementation.

## 12. Out of scope unless requested

Do not build these by default:
- Student registration or student login
- Public borrowing/reservation requests
- Online payments or fines
- Barcode scanner hardware integration
- Email/SMS notifications
- Multiple library branches
- Complex analytics
- External identity providers
- A Koha integration

Keep the first version small, secure, and genuinely usable. Ask before expanding scope.
