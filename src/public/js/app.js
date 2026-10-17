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

      // A row that has already been upgraded brings the combobox markup with
      // it — the listbox, the live region, the ARIA wiring — but no
      // listeners, and a second element with the same id. Undo all of it and
      // upgrade the clone properly once it is in the document.
      for (const wrapper of clone.querySelectorAll('.suggest')) {
        const field = wrapper.querySelector('input');
        if (!field) continue;
        for (const attribute of [
          'role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant',
        ]) {
          field.removeAttribute(attribute);
        }
        wrapper.replaceWith(field);
      }

      for (const input of clone.querySelectorAll('input')) {
        input.value = '';
        input.removeAttribute('id');
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
      for (const label of clone.querySelectorAll('label')) label.remove();
      for (const error of clone.querySelectorAll('.field__error')) error.remove();

      list.append(clone);
      for (const field of clone.querySelectorAll('[data-suggest]')) upgradeSuggestField(field);
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

/**
 * Fold text the way the catalogue search does.
 *
 * Pasted verbatim from BROWSER_FOLD_SOURCE in src/lib/normalize.js, which is
 * the authority. This file is served to the browser as written -- no bundler,
 * no build step -- so it cannot import that module. test/normalize.test.js
 * runs both against the same Greek samples and test/suggestions.test.js checks
 * this copy still matches, so the two cannot drift apart unnoticed.
 */
function foldGreek(value) {
  if (value === null || value === undefined) return '';
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replaceAll('\u03c2', '\u03c3')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
}

/**
 * Suggest as you type, matching Greek the way the catalogue search does.
 *
 * A native <datalist> is matched by the browser against the literal accented
 * text, so "καζαντζακη" never reaches "Νίκος Καζαντζάκης" and the browser
 * will not be talked out of it. This replaces the list with one we filter
 * ourselves, on the folded form the server stamped onto each option.
 *
 * The datalist stays in the markup and stays wired to the field: with no
 * scripting none of this runs and the librarian still gets suggestions, just
 * accent-sensitive ones.
 */
function enableSuggestions() {
  for (const input of document.querySelectorAll('[data-suggest]')) {
    upgradeSuggestField(input);
  }
}

/**
 * Turn one field into a combobox over its datalist.
 *
 * Separate from the loop so a row added by the Add author button can be
 * upgraded too — cloning a row copies the markup this builds but none of its
 * listeners, which left the new field looking like a combobox and behaving
 * like nothing at all.
 */
let suggestCount = 0;

function upgradeSuggestField(input) {
  {
    // The list id survives in a data attribute: the `list` attribute itself
    // is removed below, and a cloned row needs to find its options again.
    const listId = input.getAttribute('list') || input.dataset.suggestList || '';
    const source = document.getElementById(listId);
    if (!source) return;
    input.dataset.suggestList = listId;

    const entries = [...source.options].map((option) => ({
      value: option.value,
      fold: option.dataset.fold || '',
      extra: option.dataset.extra || '',
    }));
    if (entries.length === 0) return;

    // Only now that the replacement is certain: without this the browser's
    // own datalist popup opens on top of ours — two dropdowns, different
    // keyboard behaviour, and the native one matching only text spelled
    // exactly. A field we bailed out on above keeps it and still suggests.
    input.removeAttribute('list');

    // The field the chosen option also fills in -- a reader's class.
    const fills = input.dataset.suggestFills
      ? document.getElementById(input.dataset.suggestFills)
      : null;

    const wrap = document.createElement('div');
    wrap.className = 'suggest';
    input.parentNode.insertBefore(wrap, input);
    wrap.append(input);

    const list = document.createElement('ul');
    list.className = 'suggest__list';
    suggestCount += 1;
    list.id = `suggest-list-${suggestCount}`;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.append(list);

    const status = document.createElement('p');
    status.className = 'visually-hidden';
    status.setAttribute('aria-live', 'polite');
    wrap.append(status);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('autocomplete', 'off');

    let matches = [];
    let active = -1;

    const close = () => {
      list.hidden = true;
      list.replaceChildren();
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      matches = [];
      active = -1;
    };

    const highlight = () => {
      [...list.children].forEach((row, index) => {
        const on = index === active;
        row.classList.toggle('is-active', on);
        row.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) {
          input.setAttribute('aria-activedescendant', row.id);
          row.scrollIntoView({ block: 'nearest' });
        }
      });
    };

    const choose = (entry) => {
      input.value = entry.value;
      // Never over something typed by hand: dataset.filled marks a value this
      // put there, so only its own guesses get replaced.
      if (fills && entry.extra && (!fills.value || fills.dataset.filled === 'yes')) {
        fills.value = entry.extra;
        fills.dataset.filled = 'yes';
      }
      close();
    };

    const open = () => {
      const typed = foldGreek(input.value);
      if (!typed) {
        close();
        return;
      }

      // Substring rather than prefix, so a surname finds a full name.
      matches = entries.filter((entry) => entry.fold.includes(typed)).slice(0, 50);
      // Said out loud for a screen reader, which cannot see the list appear.
      // One match or several is a different sentence in Greek, and only this
      // side knows which, so the server sent both forms.
      const template = matches.length === 1
        ? source.dataset.suggestCountOne
        : source.dataset.suggestCountOther;
      status.textContent = matches.length === 0
        ? (source.dataset.suggestNone || '')
        : (template || '{n}').replace('{n}', String(matches.length));

      if (matches.length === 0) {
        close();
        return;
      }

      list.replaceChildren(...matches.map((entry, index) => {
        const row = document.createElement('li');
        row.className = 'suggest__option';
        row.id = `${list.id}-${index}`;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', 'false');
        row.textContent = entry.extra ? `${entry.value} — ${entry.extra}` : entry.value;
        row.addEventListener('mousedown', (event) => {
          // mousedown, not click: blur would close the list first.
          event.preventDefault();
          choose(entry);
        });
        return row;
      }));

      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      active = -1;
      highlight();
    };

    input.addEventListener('input', open);
    input.addEventListener('focus', open);
    input.addEventListener('blur', () => { window.setTimeout(close, 120); });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key === 'Enter' && active >= 0 && matches[active]) {
        // Without this the form submits on the keystroke that was meant to
        // pick a name.
        event.preventDefault();
        choose(matches[active]);
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (list.hidden) {
        open();
        if (list.hidden) return;
      }
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + matches.length) % matches.length;
      highlight();
    });

    if (fills) {
      fills.addEventListener('input', () => { delete fills.dataset.filled; });
    }
  }
}

/**
 * Frame a cover before it is uploaded.
 *
 * The browser decides *what* rectangle to keep; the server does the keeping.
 * Four hidden fields carry the rectangle in source pixels alongside the
 * original file, so the image is still decoded and re-encoded in exactly one
 * place — which is what strips EXIF and guarantees the bytes served are never
 * the bytes uploaded. Exporting the canvas would have moved that boundary into
 * the browser for no gain.
 *
 * With no scripting none of this runs, no coordinates are sent, and the whole
 * image uploads exactly as it did before.
 */
function enableCoverCropper() {
  for (const root of document.querySelectorAll('[data-cropper]')) {
    const file = root.querySelector('[data-cropper-file]');
    const stage = root.querySelector('[data-cropper-stage]');
    const canvas = root.querySelector('[data-cropper-canvas]');
    const zoomInput = root.querySelector('[data-cropper-zoom]');
    const fields = {
      x: root.querySelector('[data-cropper-x]'),
      y: root.querySelector('[data-cropper-y]'),
      w: root.querySelector('[data-cropper-w]'),
      h: root.querySelector('[data-cropper-h]'),
    };
    if (!file || !stage || !canvas || !zoomInput) continue;
    if (!Object.values(fields).every(Boolean)) continue;

    // A cover is taller than it is wide; 2:3 matches the stored display size.
    const frameW = 240;
    const frameH = 360;
    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = frameW * ratio;
    canvas.height = frameH * ratio;
    context.scale(ratio, ratio);

    let image = null;
    let zoom = 1;
    let ox = 0;
    let oy = 0;

    // How many canvas pixels one source pixel occupies. Starts at whatever
    // makes the image just cover the frame, so there is never a blank edge.
    const scale = () => Math.max(frameW / image.width, frameH / image.height) * zoom;

    const clamp = () => {
      const k = scale();
      ox = Math.min(0, Math.max(frameW - image.width * k, ox));
      oy = Math.min(0, Math.max(frameH - image.height * k, oy));
    };

    const publish = () => {
      const k = scale();
      fields.x.value = String(Math.max(0, Math.round(-ox / k)));
      fields.y.value = String(Math.max(0, Math.round(-oy / k)));
      fields.w.value = String(Math.round(frameW / k));
      fields.h.value = String(Math.round(frameH / k));
    };

    const draw = () => {
      if (!image) return;
      clamp();
      const k = scale();
      context.clearRect(0, 0, frameW, frameH);
      context.drawImage(image, ox, oy, image.width * k, image.height * k);
      publish();
    };

    const clear = () => {
      image = null;
      stage.hidden = true;
      canvas.removeAttribute('tabindex');
      for (const field of Object.values(fields)) field.value = '';
    };

    file.addEventListener('change', () => {
      const chosen = file.files && file.files[0];
      if (!chosen) {
        clear();
        return;
      }

      // A data: URL, not createObjectURL — the policy allows "img-src 'self'
      // data:" and has no blob:, so an object URL would simply not load.
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const loaded = new Image();
        loaded.addEventListener('load', () => {
          image = loaded;
          zoom = 1;
          zoomInput.value = '1';
          // Centre it, then let clamp() pull it back if it would show an edge.
          const k = Math.max(frameW / image.width, frameH / image.height);
          ox = (frameW - image.width * k) / 2;
          oy = (frameH - image.height * k) / 2;
          stage.hidden = false;
          // Focusable only once there is something to frame.
          canvas.setAttribute('tabindex', '0');
          draw();
        });
        loaded.addEventListener('error', clear);
        loaded.src = reader.result;
      });
      reader.addEventListener('error', clear);
      reader.readAsDataURL(chosen);
    });

    zoomInput.addEventListener('input', () => {
      if (!image) return;
      // Zoom about the middle of the frame, so the part being looked at is
      // the part that stays put.
      const before = scale();
      const cx = (frameW / 2 - ox) / before;
      const cy = (frameH / 2 - oy) / before;
      zoom = Number(zoomInput.value) || 1;
      const after = scale();
      ox = frameW / 2 - cx * after;
      oy = frameH / 2 - cy * after;
      draw();
    });

    let dragging = null;
    canvas.addEventListener('pointerdown', (event) => {
      if (!image) return;
      dragging = { x: event.clientX - ox, y: event.clientY - oy };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      ox = event.clientX - dragging.x;
      oy = event.clientY - dragging.y;
      draw();
    });
    for (const end of ['pointerup', 'pointercancel']) {
      canvas.addEventListener(end, () => { dragging = null; });
    }

    // Framing without a pointer.
    canvas.addEventListener('keydown', (event) => {
      if (!image) return;
      const step = event.shiftKey ? 20 : 5;
      const moves = {
        ArrowLeft: [step, 0], ArrowRight: [-step, 0],
        ArrowUp: [0, step], ArrowDown: [0, -step],
      };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      ox += move[0];
      oy += move[1];
      draw();
    });
  }
}

/**
 * Let someone see the password they are typing.
 *
 * Mistyping something you cannot see is the commonest reason a sign-in
 * fails, and here it costs a lockout after five tries. On the account forms
 * it is worse: the password has to be typed twice and matched, by somebody
 * who will not be the one using it.
 *
 * The control ships hidden and is un-hidden here, because with no scripting
 * there is nothing to toggle and a button that does nothing is worse than no
 * button. The field goes back to type="password" on submit, so a revealed
 * password is never what the browser offers to remember.
 */
function enablePasswordReveal() {
  for (const input of document.querySelectorAll('input[data-reveal]')) {
    const toggle = input.parentNode?.querySelector('[data-reveal-toggle]');
    if (!toggle) continue;

    const wrap = document.createElement('div');
    wrap.className = 'reveal';
    input.parentNode.insertBefore(wrap, input);
    wrap.append(input, toggle);
    toggle.hidden = false;

    const showIcon = toggle.querySelector('[data-reveal-icon-show]');
    const hideIcon = toggle.querySelector('[data-reveal-icon-hide]');

    const setShown = (shown) => {
      input.type = shown ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', shown ? 'true' : 'false');
      toggle.setAttribute(
        'aria-label',
        shown ? toggle.dataset.labelHide : toggle.dataset.labelShow,
      );
      if (showIcon) showIcon.hidden = shown;
      if (hideIcon) hideIcon.hidden = !shown;
    };

    setShown(false);
    toggle.addEventListener('click', () => setShown(input.type === 'password'));

    // Never submit with the password on screen: the field would be a text
    // input, which some browsers treat differently when offering to save it.
    input.form?.addEventListener('submit', () => setShown(false));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  enableAutoSubmit();
  enableConfirmations();
  focusHomeSearch();
  enableRepeatableFields();
  enableLiveResults();
  enableSuggestions();
  enableCoverCropper();
  enablePasswordReveal();
});
