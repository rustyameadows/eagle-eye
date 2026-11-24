(() => {
  'use strict';
  const {report, pixels} = JSON.parse(document.getElementById('pixel-data').textContent);
  const get = id => document.getElementById(id);
  const number = new Intl.NumberFormat(undefined, {maximumFractionDigits: 3});
  const labels = ['Unchanged', 'Darker', 'Lighter', 'Equal brightness, changed color'];
  const stages = report.stages;
  const stageLabel = id => stages.find(s => s.id === id).label;
  const state = {profile: null, pair: null, frames: new Map(), map: null, x: 0, y: 0};

  function el(tag, text) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function option(select, value, label) {
    const entry = el('option', label);
    entry.value = value;
    select.append(entry);
  }

  // This table is independent of browser image decoding, display scaling, and canvas readback.
  function decode(encoded, count) {
    const packed = atob(encoded);
    const rgba = new Uint8ClampedArray(count * 4);
    let dest = 0;
    for (let i = 0; i < packed.length; i += 5) {
      const run = packed.charCodeAt(i) * 256 + packed.charCodeAt(i + 1);
      const r = packed.charCodeAt(i + 2), g = packed.charCodeAt(i + 3), b = packed.charCodeAt(i + 4);
      for (let n = 0; n < run; n++) {
        rgba[dest++] = r; rgba[dest++] = g; rgba[dest++] = b; rgba[dest++] = 255;
      }
    }
    if (dest !== rgba.length) throw Error('Incomplete pixel data');
    return rgba;
  }

  function classOf(dr, dg, db) {
    if (!dr && !dg && !db) return 0;
    const level = 2126 * dr + 7152 * dg + 722 * db;
    return level < 0 ? 1 : level > 0 ? 2 : 3;
  }

  function differenceFrame(left, right) {
    const result = new Uint8ClampedArray(left.length);
    for (let i = 0; i < left.length; i += 4) {
      const k = classOf(right[i]-left[i], right[i+1]-left[i+1], right[i+2]-left[i+2]);
      const rgb = report.palette[k];
      result[i] = rgb[0]; result[i+1] = rgb[1]; result[i+2] = rgb[2]; result[i+3] = 255;
    }
    return result;
  }

  function paint(canvas, data) {
    const {width, height} = state.profile;
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  }

  function download(path, name) {
    const a = el('a', name);
    a.href = path;
    a.download = path.split('/').pop();
    return a;
  }

  function setProfile() {
    const p = state.profile = report.profiles[Number(get('profile').value)];
    state.frames.clear();
    for (const s of stages) state.frames.set(s.id, decode(pixels[p.id][s.id], p.width * p.height));
    document.documentElement.style.setProperty('--frameWidth', (p.width / p.scale + 2) + 'px');
    get('conditions').textContent = p.label + ' · ' + p.width + ' × ' + p.height +
      ' native pixels · ' + number.format(p.width / p.scale) + ' × ' + number.format(p.height / p.scale) +
      ' CSS pixels at ' + p.scale + '× capture density.';
    get('comparison').replaceChildren();
    for (const [index, c] of p.comparisons.entries()) option(get('comparison'), index, stageLabel(c.from) + ' → ' + stageLabel(c.to));
    get('comparison').value = String(p.comparisons.length - 1);
    get('layer').replaceChildren();
    option(get('layer'), 'diff', 'Difference map');
    stages.forEach((s, i) => option(get('layer'), 'stage-' + i, s.label));
    get('region').replaceChildren();
    option(get('region'), '', 'Whole frame');
    p.regions.forEach((r, i) => option(get('region'), i, r.label));
    get('x').max = p.width - 1; get('y').max = p.height - 1;
    state.x = Math.floor(p.width / 2); state.y = Math.floor(p.height / 2);
    setComparison();
  }

  function setComparison() {
    const profile = state.profile;
    const pair = state.pair = profile.comparisons[Number(get('comparison').value)];
    state.map = differenceFrame(state.frames.get(pair.from), state.frames.get(pair.to));
    get('readings').replaceChildren();
    for (const stage of [pair.from, pair.to]) {
      const frame = el('div'), figure = el('figure'), canvas = el('canvas');
      frame.className = 'frame';
      canvas.setAttribute('aria-label', stageLabel(stage) + ' at captured CSS size');
      canvas.style.width = (profile.width / profile.scale) + 'px';
      paint(canvas, state.frames.get(stage));
      frame.append(canvas); figure.append(el('figcaption', stageLabel(stage)), frame);
      get('readings').append(figure);
    }
    const metrics = [['Total pixels','total'],['Unchanged','unchanged'],['Changed','changed'],
      ['Darker','darker'],['Lighter','lighter'],['Equal brightness, changed color','equalBrightness']];
    get('stats').replaceChildren();
    for (const [label, key] of metrics) {
      const block = el('div');
      block.append(el('b', number.format(pair.counts[key])), el('span', label));
      get('stats').append(block);
    }
    paint(get('overview'), state.map);
    get('overview').style.width = profile.width / profile.scale + 'px';
    const exports = get('exports');
    exports.replaceChildren(el('strong', 'PNG files'));
    for (const stage of stages) exports.append(download(profile.images[stage.id].file, stage.label));
    exports.append(download(pair.map, 'Difference map'));
    regionSummary();
    setLayer();
  }

  function regionSummary() {
    const region = state.pair.regions[Number(get('region').value)];
    if (get('region').value === '' || !region) {
      get('regional').textContent = 'Showing the full registered crop.';
      return;
    }
    get('regional').textContent = region.label + ' · ' + region.width + ' × ' + region.height +
      ' native pixels · ' + number.format(region.counts.changed) + ' changed, ' +
      number.format(region.counts.unchanged) + ' unchanged.';
  }

  function setLayer() {
    const layer = get('layer').value;
    const frame = layer === 'diff' ? state.map : state.frames.get(stages[Number(layer.slice(6))].id);
    const canvas = get('inspection');
    paint(canvas, frame);
    resizeZoom();
  }

  function resizeZoom() {
    const {width, height} = state.profile, zoom = Number(get('zoom').value);
    const canvas = get('inspection');
    canvas.style.width = width * zoom + 'px'; canvas.style.height = height * zoom + 'px';
    get('grid').style.backgroundSize = zoom + 'px ' + zoom + 'px';
    get('grid').hidden = zoom < 8;
    setPixel(state.x, state.y, true);
  }

  function setPixel(x, y, pan) {
    const profile = state.profile;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    state.x = Math.min(profile.width - 1, Math.max(0, Math.floor(x)));
    state.y = Math.min(profile.height - 1, Math.max(0, Math.floor(y)));
    const offset = 4 * (state.y * profile.width + state.x);
    const zoom = Number(get('zoom').value), marker = get('marker');
    marker.style.width = zoom + 'px'; marker.style.height = zoom + 'px';
    marker.style.transform = 'translate(' + state.x * zoom + 'px,' + state.y * zoom + 'px)';
    if (pan) {
      const port = get('viewport');
      const relativeX = state.x * zoom - port.scrollLeft, relativeY = state.y * zoom - port.scrollTop;
      if (relativeX < 0 || relativeX + zoom > port.clientWidth) port.scrollLeft = state.x * zoom - port.clientWidth / 2;
      if (relativeY < 0 || relativeY + zoom > port.clientHeight) port.scrollTop = state.y * zoom - port.clientHeight / 2;
    }
    get('x').value = state.x; get('y').value = state.y;
    const left = state.frames.get(state.pair.from), right = state.frames.get(state.pair.to);
    const deltas = [0,1,2].map(n => right[offset+n] - left[offset+n]);
    const signed = n => n > 0 ? '+' + n : String(n);
    let coords = 'Pixel (' + state.x + ', ' + state.y + ')';
    if (profile.origin) {
      const cssX = profile.origin.x + state.x / profile.scale;
      const cssY = profile.origin.y + state.y / profile.scale;
      coords += ' · viewport CSS (' + number.format(cssX) + ', ' + number.format(cssY) + ')';
    }
    get('selection').textContent = coords + ' · ' + labels[classOf(...deltas)] + ' · ΔRGB (' + deltas.map(signed).join(', ') + ')';
    get('values').replaceChildren();
    for (const s of stages) {
      const source = state.frames.get(s.id);
      const rgba = Array.from(source.subarray(offset, offset + 4));
      const sample = el('span'); sample.className = 'swatch'; sample.style.backgroundColor = 'rgb(' + rgba.slice(0,3).join(',') + ')';
      const item = el('li');
      item.append(sample, el('strong', s.label), el('code', 'RGBA(' + rgba.join(', ') + ')'));
      get('values').append(item);
    }
  }

  function pick(event, target) {
    const rect = target.getBoundingClientRect();
    setPixel((event.clientX - rect.left) * state.profile.width / rect.width,
      (event.clientY - rect.top) * state.profile.height / rect.height, true);
  }

  document.title = report.title + ' · Eagle Eye';
  get('title').textContent = report.title;
  report.profiles.forEach((p,i) => option(get('profile'), i, p.label));
  const requested = new URLSearchParams(location.search).get('profile');
  const initial = report.profiles.findIndex(p => p.id === requested);
  if (initial >= 0) get('profile').selectedIndex = initial;
  labels.forEach((name,i) => {
    const chip = el('span'), swatch = el('i');
    swatch.style.backgroundColor = 'rgb(' + report.palette[i].join(',') + ')';
    chip.append(swatch, document.createTextNode(name)); get('legend').append(chip);
  });
  get('profile').addEventListener('change', setProfile);
  get('comparison').addEventListener('change', setComparison);
  get('layer').addEventListener('change', setLayer);
  get('zoom').addEventListener('change', resizeZoom);
  get('region').addEventListener('change', () => {
    regionSummary();
    const key = get('region').value;
    if (key === '') return;
    const r = state.profile.regions[Number(key)];
    setPixel(r.x + r.width / 2, r.y + r.height / 2, true);
  });
  get('locate').addEventListener('click', () => setPixel(get('x').valueAsNumber, get('y').valueAsNumber, true));
  for (const id of ['x','y']) get(id).addEventListener('keydown', event => {
    if (event.key === 'Enter') setPixel(get('x').valueAsNumber, get('y').valueAsNumber, true);
  });
  get('overview').addEventListener('click', e => pick(e, get('overview')));
  get('inspection').addEventListener('click', e => {
    pick(e, get('inspection'));
    get('viewport').focus({preventScroll:true});
  });
  get('viewport').addEventListener('keydown', event => {
    const step = event.shiftKey ? 10 : 1;
    const delta = {ArrowRight:[step,0], ArrowLeft:[-step,0], ArrowUp:[0,-step], ArrowDown:[0,step]}[event.key];
    if (!delta) return;
    event.preventDefault();
    setPixel(state.x + delta[0], state.y + delta[1], true);
  });
  setProfile();
})();
