"""Create the portable case study with deterministic ZIP timestamps and ordering."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent
files = [root / name for name in ('README.md', 'manifest.json', 'pair.json', 'source-retest.json',
                                       'original-review.png', 'pair-trials.png')]
files.extend(sorted(path for path in (root / 'pixels').rglob('*') if path.is_file()))
with ZipFile(root.parent / 'example-1.zip', 'w') as archive:
    for path in files:
        entry = ZipInfo('example-1/' + path.relative_to(root).as_posix())
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, path.read_bytes())
