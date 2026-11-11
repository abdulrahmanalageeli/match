import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../ios/App/App/Assets.xcassets/', import.meta.url));
for (const name of readdirSync(root).filter(name => name.endsWith('.appiconset'))) {
  const folder = join(root, name);
  const catalog = JSON.parse(readFileSync(join(folder, 'Contents.json'), 'utf8'));
  for (const entry of catalog.images) {
    if (!entry.filename) throw new Error(`${name}: missing icon filename`);
    const bytes = readFileSync(join(folder, entry.filename));
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${name}: expected PNG`);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), color = bytes[25];
    if (`${width}x${height}` !== entry.size || ![0, 2].includes(color)) throw new Error(`${name}: expected ${entry.size} opaque RGB/grayscale; found ${width}x${height}, color type ${color}`);
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      if (type === 'tRNS') throw new Error(`${name}: transparency is not allowed`);
      offset += length + 12;
    }
    console.log(`${name}: ${width}x${height}, opaque PNG ✓`);
  }
}
