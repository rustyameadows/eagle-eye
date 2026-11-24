// Build a visual index from evidence captured during the eval.
const fs = require('node:fs/promises');
const path = require('node:path');
const groups = {
  'Journal and navigation': ['inbox', 'archive', 'record', 'settings'],
  'Collections and search': ['collections', 'collection-detail', 'search', 'search-empty'],
  'Classification and locations': ['tags', 'tag-detail', 'sites', 'site-detail'],
  'Measurements and scheduling': ['observations', 'observation-detail', 'calendar', 'itinerary'],
  'People and activity': ['team', 'member', 'activity', 'notifications'],
  'Entry, review and import': ['preferences', 'new-note', 'review', 'imports']
};
const html = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
async function main() {
  const [root] = process.argv.slice(2);
  if (!root) throw new Error('Usage: node build-atlas.cjs RUN-ROOT');
  const r = JSON.parse(await fs.readFile(path.join(root, 'baseline', 'report.json'), 'utf8'));
  const profiles = Object.keys(r.plan.profiles);
  const profile = profiles[0],
    subject = Object.values(groups).flat();
  const panels = Object.entries(groups)
    .map(
      ([group, ids]) =>
        '<section><h2>' +
        html(group) +
        '</h2><div class="grid">' +
        ids
          .map((id) => {
            const urls = {};
            for (const p of profiles) {
              const c = r.captures[p]?.[id];
              if (c?.file) urls[p] = 'baseline/' + c.file;
            }
            const name = id.replaceAll('-', ' '),
              src = urls[profile];
            return (
              '<figure data-sources="' +
              html(JSON.stringify(urls)) +
              '"><a href="' +
              html(src || '#') +
              '"><img loading="lazy" alt="' +
              html(name + ' capture') +
              '" ' +
              (src ? 'src="' + html(src) + '"' : 'hidden') +
              '><figcaption>' +
              html(name) +
              '</figcaption></a><p ' +
              (src ? 'hidden' : '') +
              '>Capture unavailable</p></figure>'
            );
          })
          .join('') +
        '</div></section>'
    )
    .join('');
  const document =
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fieldwork screen atlas</title><style>' +
    ':root{font:15px system-ui,sans-serif;color:#223831;background:#f7f7f1}body{max-width:1220px;margin:auto;padding:clamp(14px,4vw,48px)}h1,h2{font-family:Georgia,serif;font-weight:500}h1{font-size:clamp(32px,5vw,58px);margin:8px 0}h2{font-size:25px;border-bottom:1px solid #bfcbc2;padding:10px 0}p{line-height:1.5}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}figure{margin:0;min-width:0}figure img{width:100%;display:block;border:1px solid #c7d0c6;box-sizing:border-box}a{color:#205641}figcaption{padding:6px 0;text-transform:capitalize}select{font:inherit;padding:6px}header{margin-bottom:26px}@media(max-width:820px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:420px){.grid{grid-template-columns:1fr}}</style>' +
    '<header><p>Eagle Eye / Fieldwork eval</p><h1>Captured screens</h1><p>' +
    subject.length +
    ' static screens from the baseline run. Choose a viewport and open any capture at its original resolution.</p><label>Viewport <select id="profile">' +
    profiles
      .map(
        (p) =>
          '<option value="' +
          html(p) +
          '">' +
          html(p + ' · ' + r.plan.profiles[p].width + ' × ' + r.plan.profiles[p].height) +
          '</option>'
      )
      .join('') +
    '</select></label></header>' +
    panels +
    '<p><a href="baseline/index.html">Inspect paired measurements</a></p><script>document.querySelector("select").onchange=e=>{for(const f of document.querySelectorAll("figure")){const src=JSON.parse(f.dataset.sources)[e.target.value],i=f.querySelector("img"),a=f.querySelector("a");i.hidden=!src;f.querySelector("p").hidden=Boolean(src);if(src){i.src=src;a.href=src}else{a.removeAttribute("href");i.removeAttribute("src")}}};</script></html>';
  await fs.writeFile(path.join(root, 'atlas.html'), document);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
