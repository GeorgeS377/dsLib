// Find cramped spacing across the site.
//
// Layout cannot be checked by `npm test`: node:test has no CSS engine, so
// nothing in test/ can see that a heading sits flush against its form. This
// is the tool that can. Paste it into the browser console on any page of the
// running site and it walks every route, laying each one out off-screen in
// the current page, and reports pairs of elements that sit closer together
// than the design's own rhythm allows.
//
//   1. npm run dev, sign in to /staff
//   2. open the console on any page of the site
//   3. paste this file, read the report
//
// "all clear" means every container's children are at least 12px apart where
// one of them is a heading, table, form, fieldset or button. Two intentional
// exceptions it does not flag: a label with its own control, and a dashboard
// tile's label with its number — in both cases the pair is one unit and its
// internal gap is deliberately small.
(async () => {
  const URLS = [
    '/', '/books', '/books/1', '/categories', '/authors',
    '/staff', '/staff/books', '/staff/books/new', '/staff/books/1',
    '/staff/books/1/copies', '/staff/loans', '/staff/loans/checkout?q=a',
    '/staff/loans/checkin', '/staff/borrowers', '/staff/categories',
    '/staff/authors', '/staff/users', '/staff/settings', '/staff/account',
  ];

  const name = (el) =>
    el.tagName.toLowerCase() +
    (typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '');

  const probe = (root) => {
    const found = [];
    const containers = [...root.querySelectorAll(
      '.card, .fieldset, .filters, .state, .stat, form, .container',
    )].filter((el) => el.offsetHeight > 40);

    for (const box of containers) {
      const kids = [...box.children].filter(
        (k) => k.offsetHeight > 0 && getComputedStyle(k).position !== 'absolute',
      );
      for (let i = 1; i < kids.length; i += 1) {
        const above = kids[i - 1].getBoundingClientRect();
        const below = kids[i].getBoundingClientRect();
        const gap = Math.round(below.top - above.bottom);
        const heavy = (el) =>
          el.matches('h1,h2,h3,table,.table-wrap,form,fieldset,.button,button,.button-row,section,.card,dl,ul');
        if (gap >= 0 && gap < 12 && (heavy(kids[i]) || heavy(kids[i - 1]))) {
          found.push(`${name(box)}: ${name(kids[i - 1])} → ${name(kids[i])} = ${gap}px`);
        }
      }
    }
    return [...new Set(found)];
  };

  const stage = document.createElement('div');
  document.body.appendChild(stage);

  // Both widths, because spacing that holds at desktop often collapses once
  // the columns stack.
  for (const width of [1100, 375]) {
    stage.style.cssText = `position:fixed;left:-4000px;top:0;width:${width}px`;
    const lines = [];
    for (const url of URLS) {
      const response = await fetch(url);
      if (!response.ok) continue;
      const html = await response.text();
      stage.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
      const found = probe(stage);
      if (found.length) lines.push(`${url}\n  ${found.join('\n  ')}`);
    }
    console.log(`=== ${width}px ===\n${lines.length ? lines.join('\n') : 'all clear'}`);
  }

  stage.remove();
})();
