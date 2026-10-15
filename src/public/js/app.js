// Progressive enhancement only.
//
// Everything on this site works with scripting disabled: forms are plain GET
// or POST, filters are server-rendered, and confirmations fall back to a
// dedicated confirmation page. This file makes a few interactions quicker.
//
// Loaded as an external file because the Content-Security-Policy allows no
// inline script.
'use strict';

/** Auto-submit a filter or sort form when a control changes. */
function enableAutoSubmit() {
  for (const form of document.querySelectorAll('form[data-autosubmit]')) {
    // With scripting available the explicit Apply button is redundant.
    for (const button of form.querySelectorAll('[data-autosubmit-hide]')) {
      button.hidden = true;
    }

    for (const control of form.querySelectorAll('select, input[type="checkbox"]')) {
      control.addEventListener('change', () => {
        // Changing a filter returns to the first page of results; keeping the
        // old page number would often land on an empty page.
        const page = form.querySelector('input[name="page"]');
        if (page) page.remove();
        form.submit();
      });
    }
  }
}

/**
 * Ask before a destructive action. The server re-checks and also offers a
 * confirmation page, so declining here is purely a convenience.
 */
function enableConfirmations() {
  for (const form of document.querySelectorAll('form[data-confirm]')) {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.dataset.confirm)) {
        event.preventDefault();
      }
    });
  }
}

/** Give the search box focus on the home page, where searching is the point. */
function focusHomeSearch() {
  const input = document.querySelector('[data-autofocus]');
  if (input && !input.value) input.focus();
}

/** Add an author input row on the book form, mirroring the first one. */
function enableRepeatableFields() {
  for (const container of document.querySelectorAll('[data-repeatable]')) {
    const addButton = container.querySelector('[data-repeatable-add]');
    const list = container.querySelector('[data-repeatable-list]');
    if (!addButton || !list) continue;

    addButton.hidden = false;
    addButton.addEventListener('click', () => {
      const rows = list.querySelectorAll('[data-repeatable-row]');
      const last = rows[rows.length - 1];
      if (!last) return;

      const clone = last.cloneNode(true);
      for (const input of clone.querySelectorAll('input')) {
        input.value = '';
        input.removeAttribute('id');
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
      for (const label of clone.querySelectorAll('label')) label.remove();
      for (const error of clone.querySelectorAll('.field__error')) error.remove();

      list.append(clone);
      clone.querySelector('input')?.focus();
    });
  }
}


/**
 * Update the results in place instead of loading a new page.
 *
 * Everything that changes what the results are — typing, applying filters,
 * switching between grid and list, paging — is the same operation: ask the
 * server for a URL and show the part that changed. Done as navigations, each
 * of those threw away the scroll position and put you back at the top, which
 * is a strange thing to happen when you tick a box halfway down the page.
 *
 * The page being fetched is exactly the page the link or form would have
 * loaded, so there is no second renderer to keep in step, and with scripting
 * off every one of them still works as a plain link or form.
 */
function enableLiveResults() {
  const target = document.querySelector('[data-live-results]');
  if (!target) return;

  let pending;
  let timer;

  const show = async (url, { keepScroll = true } = {}) => {
    // One request in flight: typing quickly otherwise lands results in
    // whatever order the server answers, which is not the order asked for.
    pending?.abort();
    pending = new AbortController();
    target.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(url, { signal: pending.signal });
      if (!response.ok) return;

      const fresh = new DOMParser()
        .parseFromString(await response.text(), 'text/html')
        .querySelector('[data-live-results]');
      if (!fresh) return;

      const before = window.scrollY;
      target.replaceChildren(...fresh.childNodes);
      if (keepScroll) window.scrollTo({ top: before });

      // The address bar follows, so a filtered page can still be shared,
      // reloaded, or reached with the back button.
      window.history.pushState({}, '', url);
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    } finally {
      target.setAttribute('aria-busy', 'false');
    }
  };

  const search = document.querySelector('form[data-live-search]');
  const input = search?.querySelector('input[type="search"]');
  const forms = [...document.querySelectorAll('form[data-live-search], form[data-live-form]')];

  /**
   * The URL for what is currently asked for.
   *
   * Built from every form at once, because the search box and the filter
   * panel are separate forms describing one question. Taken from either alone,
   * filtering would drop what was typed and typing would drop the filters —
   * and the filter panel's copy of the search term is whatever the server
   * rendered, which is stale the moment someone types.
   */
  const currentUrl = () => {
    const params = new URLSearchParams();
    for (const form of forms) {
      for (const [key, value] of new FormData(form)) {
        // Page: a changed filter returns to the first one, since keeping the
        // old number often lands on a page that no longer exists.
        if (key === 'q' || key === 'page' || value === '') continue;
        params.append(key, value);
      }
    }
    const typed = input?.value.trim();
    if (typed) params.set('q', typed);

    const query = params.toString();
    return query ? `${forms[0].action}?${query}` : forms[0].action;
  };

  if (input) {
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      // Long enough that a word typed at speed is one request, short enough
      // to feel like it is keeping up.
      timer = window.setTimeout(() => show(currentUrl()), 250);
    });
  }

  // Applying filters, and submitting the search with the button or Enter.
  for (const form of forms) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      window.clearTimeout(timer);
      show(currentUrl());
    });
  }

  // Switching view, sorting, paging. Delegated, because these links are
  // inside the region and are replaced every time it updates.
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[data-live-link]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

    event.preventDefault();
    // Paging is the one case where staying put is wrong: the new page starts
    // above where you are standing, so bring its top into view.
    const paging = link.hasAttribute('data-live-page');
    show(link.href, { keepScroll: !paging });
    if (paging) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  // The back button should undo a filter, not leave the page lying about
  // what it is showing.
  window.addEventListener('popstate', () => {
    show(window.location.href, { keepScroll: false });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  enableAutoSubmit();
  enableConfirmations();
  focusHomeSearch();
  enableRepeatableFields();
  enableLiveResults();
});
