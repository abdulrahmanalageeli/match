import catalog from '../src/compatibility/catalog.json' with {type:'json'};

// Complete practical profiles, binary topic credits, one priority, no other criteria.
// Holding the reverse score and ranking modifiers constant preserves directional order.
console.log('Category | topics | share at 1x / 1.5x / 2x | strict order flips (1.5x vs 2x) | ties gained or lost | comparisons');
for (const category of catalog.categories) {
  const count = catalog.dimensions.filter(topic => topic.category === category.id).length;
  const other = catalog.dimensions.length - count;
  const patterns = [];
  for (let priorityMatches = 0; priorityMatches <= count; priorityMatches++) {
    for (let otherMatches = 0; otherMatches <= other; otherMatches++) {
      patterns.push({priorityMatches, otherMatches});
    }
  }
  let flips = 0, tiesChanged = 0, comparisons = 0;
  for (const [i, a] of patterns.entries()) {
    for (const b of patterns.slice(i + 1)) {
      const delta = weight => Math.sign(weight * (a.priorityMatches - b.priorityMatches) + a.otherMatches - b.otherMatches);
      const lower = delta(1.5), current = delta(2);
      comparisons++;
      if (lower * current < 0) flips++;
      else if (lower !== current) tiesChanged++;
    }
  }
  const shares = [1, 1.5, 2].map(weight => (100 * weight * count / (other + weight * count)).toFixed(1) + '%');
  console.log([category.id, count, shares.join(' / '), flips, tiesChanged, comparisons].join(' | '));
}
