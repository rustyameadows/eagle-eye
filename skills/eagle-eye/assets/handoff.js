(() => {
  const sections = [...document.querySelectorAll('[data-slide]')];
  const player = document.querySelector('.player');
  const present = document.querySelector('#present');
  const previous = document.querySelector('#previous');
  const next = document.querySelector('#next');
  let current = 0;
  let presenting = false;
  let startingScroll = 0;

  document.querySelectorAll('.js-only').forEach(node => { node.hidden = false; });

  function show(index) {
    current = Math.max(0, Math.min(sections.length - 1, index));
    sections.forEach((section, i) => { section.hidden = i !== current; });
    document.querySelector('#progress').textContent = 'Slide ' + (current + 1) + ' of ' + sections.length;
    previous.disabled = current === 0;
    next.disabled = current === sections.length - 1;
    sections[current].querySelector('h1, h2').focus({preventScroll: true});
    window.scrollTo(0, 0);
  }

  function exit() {
    presenting = false;
    document.body.classList.remove('presenting');
    player.hidden = true;
    sections.forEach(section => { section.hidden = false; });
    present.focus({preventScroll: true});
    window.scrollTo(0, startingScroll);
  }

  present.addEventListener('click', () => {
    startingScroll = window.scrollY;
    const index = sections.findIndex(section => section.getBoundingClientRect().bottom > 80);
    presenting = true;
    document.body.classList.add('presenting');
    player.hidden = false;
    show(Math.max(0, index));
  });
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  document.querySelector('#exit').addEventListener('click', exit);
  document.addEventListener('keydown', event => {
    if (!presenting || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); exit(); return; }
    if (event.target.matches('input, select, textarea, [contenteditable]')) return;
    const targets = {ArrowRight: current + 1, PageDown: current + 1,
      ArrowLeft: current - 1, PageUp: current - 1, Home: 0, End: sections.length - 1};
    if (Object.hasOwn(targets, event.key)) {
      event.preventDefault();
      show(targets[event.key]);
    }
  });
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!presenting || !anchor) return;
    const section = document.getElementById(anchor.hash.slice(1));
    if (sections.includes(section)) {
      event.preventDefault();
      show(sections.indexOf(section));
    }
  });
  for (const button of document.querySelectorAll('[data-blend]')) {
    const tools = button.closest('.crop-tools');
    const crops = tools.nextElementSibling;
    const slider = tools.querySelector('input');
    const label = tools.querySelector('label');
    const output = tools.querySelector('output');
    button.addEventListener('click', () => {
      const active = crops.classList.toggle('blending');
      button.setAttribute('aria-pressed', String(active));
      label.hidden = !active;
    });
    slider.addEventListener('input', () => {
      crops.style.setProperty('--opacity', Number(slider.value) / 100);
      output.value = slider.value + '%';
    });
  }
})();
