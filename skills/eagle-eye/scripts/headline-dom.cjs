// These functions run in the inspected page. Reading DOM ranges preserves shaping across letters.
function discoverHeadlines({ scope, selector }) {
  const semantic = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
  const visible = (el) =>
    el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
    el.getBoundingClientRect().width > 0 &&
    el.getBoundingClientRect().height > 0 &&
    el.innerText?.trim();
  let nodes;
  if (selector) nodes = [...document.querySelectorAll(selector)].filter(visible);
  else {
    const semanticHeadings = [...document.querySelectorAll(semantic)].filter(visible);
    const primary = document.querySelector('main,[role="main"]') || document.body;
    const hasMainTitle = semanticHeadings.some(
      (h) => primary.contains(h) && h.matches('h1,[role="heading"][aria-level="1"]')
    );
    const bodySize = parseFloat(getComputedStyle(document.body).fontSize);
    const typeSize = (el) => parseFloat(getComputedStyle(el).fontSize);
    const display = [...document.body.querySelectorAll('p,div,span,strong,b,header,a')].filter((el) => {
      if (el.closest(semantic) || el.querySelector(semantic) || !visible(el)) return false;
      const text = el.innerText.trim();
      // A compact layout can have a 24–31px hero. Consider its strongest title
      // within main when the page has no semantic primary heading.
      const compactTitle =
        !hasMainTitle &&
        primary.contains(el) &&
        !el.closest('nav,aside,footer,button,[role="navigation"]') &&
        typeSize(el) >= Math.max(24, bodySize * 1.55);
      if (text.length > 240 || !text || (typeSize(el) < 32 && !compactTitle)) return false;
      return [...el.children].every(
        (child) =>
          ['inline', 'inline-block', 'contents'].includes(getComputedStyle(child).display) ||
          child.tagName === 'BR'
      );
    });
    const displayRoots = display.filter(
      (el) => !display.some((outer) => outer !== el && outer.contains(el))
    );
    const strongest = Math.max(
      0,
      ...displayRoots.filter((el) => primary.contains(el)).map(typeSize),
      ...semanticHeadings.filter((el) => primary.contains(el)).map(typeSize)
    );
    const displayTitles = displayRoots.filter((el) => typeSize(el) >= 32 || typeSize(el) >= strongest);
    nodes = [
      ...semanticHeadings.filter(
        (el) =>
          scope === 'all' ||
          el.matches('h1,[role="heading"][aria-level="1"]') ||
          parseFloat(getComputedStyle(el).fontSize) >= 32
      ),
      ...displayTitles
    ];
    nodes.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }
  return nodes.map((node) => {
    const parts = [];
    for (let el = node; el; el = el.parentElement) {
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        parts.unshift('#' + CSS.escape(el.id));
        break;
      }
      const siblings = [...(el.parentElement?.children || [el])].filter(
        (s) => s.localName === el.localName
      );
      parts.unshift(
        CSS.escape(el.localName) +
          (siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')' : '')
      );
    }
    return parts.join(' > ');
  });
}

function observeHeading(element) {
  const box = (rect) => ({
    x: rect.x + scrollX,
    y: rect.y + scrollY,
    width: rect.width,
    height: rect.height
  });
  const properties = [
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'font-stretch',
    'font-kerning',
    'font-optical-sizing',
    'font-variation-settings',
    'font-feature-settings',
    'font-variant-ligatures',
    'letter-spacing',
    'word-spacing',
    'line-height',
    'direction',
    'writing-mode',
    'text-transform',
    'color',
    'user-select'
  ];
  const stylesOf = (el) => {
    const style = getComputedStyle(el);
    return Object.fromEntries(properties.map((key) => [key, style.getPropertyValue(key)]));
  };
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const entries = [];
  let text = '';
  for (let node; (node = walker.nextNode());) {
    const range = document.createRange();
    range.selectNodeContents(node);
    if (
      !node.length ||
      !node.parentElement.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ||
      !range.getClientRects().length
    )
      continue;
    entries.push({
      node,
      start: text.length,
      end: text.length + node.length,
      styles: stylesOf(node.parentElement)
    });
    text += node.data;
  }
  const lang = element.closest('[lang]')?.lang || document.documentElement.lang || undefined;
  let segmenter;
  try {
    segmenter = new Intl.Segmenter(lang, { granularity: 'grapheme' });
  } catch {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  }
  const runs = entries.map(({ node, styles }) => ({ text: node.data, styles, graphemes: [] }));
  let run = 0;
  const lines = [];
  const headingStyles = stylesOf(element);
  const vertical = headingStyles['writing-mode'].startsWith('vertical');
  for (const { segment, index } of segmenter.segment(text)) {
    while (run < entries.length - 1 && index >= entries[run].end) run++;
    const end = index + segment.length;
    let last = run;
    while (last < entries.length - 1 && end > entries[last].end) last++;
    const range = document.createRange();
    range.setStart(entries[run].node, index - entries[run].start);
    range.setEnd(entries[last].node, end - entries[last].start);
    const rect = box(range.getBoundingClientRect());
    const glyph = { text: segment, start: index, end, box: rect };
    runs[run].graphemes.push(glyph);
    if (rect.width <= 0 || rect.height <= 0) continue;
    const center = vertical ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
    const half = (vertical ? rect.width : rect.height) / 2;
    let line = lines.find((l) => Math.abs(l.center - center) <= Math.min(l.half, half));
    if (!line) {
      line = { center, half, text: '', box: { ...rect } };
      lines.push(line);
    }
    line.text += segment;
    const x1 = Math.min(line.box.x, rect.x),
      y1 = Math.min(line.box.y, rect.y);
    const x2 = Math.max(line.box.x + line.box.width, rect.x + rect.width);
    const y2 = Math.max(line.box.y + line.box.height, rect.y + rect.height);
    line.box = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  const allStyles = getComputedStyle(element);
  const selectable =
    !!runs.length &&
    runs.every((r) => r.styles['user-select'] !== 'none') &&
    allStyles.userSelect !== 'none';
  return {
    text,
    renderedText: element.innerText,
    box: box(element.getBoundingClientRect()),
    lines: lines.map(({ text, box }) => ({ text, box })),
    styles: headingStyles,
    runs,
    selection: { text: range.toString(), selectable },
    lang: lang || '',
    direction: allStyles.direction
  };
}

module.exports = { discoverHeadlines, observeHeading };
