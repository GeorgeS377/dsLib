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
 * Show results while someone types.
 *
 * The form still submits normally, and the page it submits to is the page
 * this updates — so with scripting off nothing is lost, and with scripting on
 * nothing new has to be learnt. It fetches the very page the form would have
 * loaded and swaps in the part that changed, which means there is no second
 * code path rendering results and no JSON endpoint to keep in step.
 *
 * Marked up as data-live-search on the form, pointing at data-live-results.
 */
function enableLiveSearch() {
  const form = document.querySelector('form[data-live-search]');
  const target = document.querySelector('[data-live-results]');
  if (!form || !target) return;

  const input = form.querySelector('input[type="search"]');
  if (!input) return;

  let pending;
  let timer;

  const run = async () => {
    const params = new URLSearchParams(new FormData(form));
    const url = `${form.action}${params.toString() ? '?' + params : ''}`;

    // One request in flight at a time: typing fast otherwise lands results in
    // whatever order the server answers, which is not the order they were
    // asked for.
    pending?.abort();
    pending = new AbortController();

    try {
      const response = await fetch(url, { signal: pending.signal });
      if (!response.ok) return;
      const markup = await response.text();
      const fresh = new DOMParser()
        .parseFromString(markup, 'text/html')
        .querySelector('[data-live-results]');
      if (fresh) {
        target.replaceChildren(...fresh.childNodes);
        target.setAttribute('aria-busy', 'false');
      }
      // The address bar follows, so the result of a search can be shared or
      // reloaded exactly as if the form had been submitted.
      window.history.replaceState({}, '', url);
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    }
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    target.setAttribute('aria-busy', 'true');
    // Long enough that a word typed at speed is one request, short enough to
    // feel like it is keeping up.
    timer = window.setTimeout(run, 250);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  enableAutoSubmit();
  enableConfirmations();
  focusHomeSearch();
  enableRepeatableFields();
  enableLiveSearch();
});
