import base64, json, re
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
out = root / 'circle-dealbreakers/public'
assets = out / 'assets'
(assets / 'slides').mkdir(parents=True, exist_ok=True)
(assets / 'silhouettes').mkdir(parents=True, exist_ok=True)
content = json.loads((root/'tmp/pdfs/triage-content.json').read_text(encoding='utf-8'))
source = (root/'output/presentation/The_Circle_Timer.html').read_text(encoding='utf-8')
deck = json.loads(re.search(r'<script id="deck-data" type="application/json">(.*?)</script>', source, re.S).group(1))
silhouettes = json.loads((root/'output/imagegen/scenario-silhouettes/scenario-map.json').read_text(encoding='utf-8'))
slides = []
for item, rendered in zip(content, deck, strict=True):
    page = item['page']
    image = f'assets/slides/{page:02d}.webp'
    (out/image).write_bytes(base64.b64decode(rendered['image'].split(',',1)[1]))
    slide = {k: item[k] for k in ('kind','page','title','label','section','scenarioNumber','responseMode') if k in item}
    slide['id'] = item.get('id') or f'page-{page}'
    slide['image'] = image
    if slide['id'] in silhouettes:
        filename = silhouettes[slide['id']]['file']
        target = f'assets/silhouettes/{Path(filename).stem}.webp'
        img = Image.open(root/'output/imagegen/scenario-silhouettes'/filename)
        img.thumbnail((800,800))
        img.save(out/target,'WEBP',quality=88)
        slide['silhouette'] = target
    slides.append(slide)
(out/'slides.json').write_text(json.dumps(slides,ensure_ascii=False),encoding='utf-8')
print(f'Prepared {len(slides)} slides, {sum(s.get("responseMode")=="vote" for s in slides)} vote cards.')
