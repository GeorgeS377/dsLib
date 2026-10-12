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

document.addEventListener('DOMContentLoaded', () => {
  enableAutoSubmit();
  enableConfirmations();
  focusHomeSearch();
  enableRepeatableFields();
});
