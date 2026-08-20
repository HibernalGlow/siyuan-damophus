import fs from 'fs';
import readline from 'readline';

async function main() {
  const tsvPath = 'D:/1Repo/Github/ComfyUI/Workflow/wild/tag_dict.tsv';
  const dict = new Map();

  console.log('Loading tag_dict.tsv...');
  if (fs.existsSync(tsvPath)) {
    const fileStream = fs.createReadStream(tsvPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const tag = parts[1].trim().toLowerCase().replace(/\s+/g, '_');
        const cn = parts[2].trim();
        if (cn) {
          dict.set(tag, cn);
        }
      }
    }
  }
  console.log('Loaded dict size:', dict.size);

  const artistDir = 'D:/1Repo/Github/ComfyUI/Workflow/wild/artist';
  const filesToRead = ['top.txt', 'best_artist.txt', 'nice_artist.txt', 'list.txt', 'ready.txt', 'try.txt'];

  const pools = {
    top: new Set(),
    best: new Set(),
    nice: new Set(),
    all: new Set(),
  };

  function cleanTag(raw) {
    let t = (raw || '').trim();
    if (!t || t.startsWith('//') || t.startsWith('#')) return null;
    t = t.replace(/^@/, '')
         .replace(/\\\(/g, '(')
         .replace(/\\\)/g, ')')
         .replace(/\s+/g, '_')
         .toLowerCase();
    return t;
  }

  for (const f of filesToRead) {
    const p = `${artistDir}/${f}`;
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf-8');
    const lines = content.split('\n');
    for (const l of lines) {
      const tag = cleanTag(l);
      if (tag) {
        pools.all.add(tag);
        if (f === 'top.txt') pools.top.add(tag);
        if (f === 'best_artist.txt') pools.best.add(tag);
        if (f === 'nice_artist.txt') pools.nice.add(tag);
      }
    }
  }

  // top_artists.json
  const jsonPath = `${artistDir}/top_artists.json`;
  if (fs.existsSync(jsonPath)) {
    const items = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    for (const it of items) {
      const tag = cleanTag(it.tag || it.slug);
      if (tag) {
        pools.top.add(tag);
        pools.all.add(tag);
        if (it.cnName && !dict.has(tag)) {
          dict.set(tag, it.cnName);
        }
      }
    }
  }

  console.log('Unique artists total:', pools.all.size);
  console.log('Top artists:', pools.top.size);
  console.log('Best artists:', pools.best.size);

  const formatList = (set) => {
    return Array.from(set).map(tag => {
      let zh = dict.get(tag) || dict.get(tag.replace(/_\(.*\)/, '')) || '';
      if (!zh) {
        const m = tag.match(/^([a-zA-Z0-9]+)_/);
        if (m && m[1].length > 1) {
          zh = m[1].charAt(0).toUpperCase() + m[1].slice(1) + ' (画师)';
        } else {
          zh = tag.charAt(0).toUpperCase() + tag.slice(1) + ' (画师)';
        }
      } else if (!zh.includes('画师') && !zh.includes('▲')) {
        zh = `${zh} (画师)`;
      }
      return { tag, zh };
    });
  };

  const topList = formatList(pools.top);
  const bestList = formatList(pools.best);
  const niceList = formatList(pools.nice);
  const allList = formatList(pools.all);

  fs.writeFileSync('src/lets-more-background/all_artists.json', JSON.stringify({
    top: topList,
    best: bestList,
    nice: niceList,
    all: allList,
  }, null, 2));

  console.log('Written to all_artists.json successfully!');
}

main().catch(console.error);
