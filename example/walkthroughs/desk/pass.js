// Keep the selected revision when following a real link between the two pages.
const pass = new URL(location.href).searchParams.get('pass');
if (pass === 'nav' || pass === 'type') {
  document.documentElement.dataset.pass = pass;
  for (const link of document.querySelectorAll('nav a')) {
    const target = new URL(link.href);
    target.searchParams.set('pass', pass);
    link.href = target.href;
  }
}
