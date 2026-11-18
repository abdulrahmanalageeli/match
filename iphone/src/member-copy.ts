import memberAr from './member-ar.json' with { type: 'json' };

export default memberAr;

const dayCount = new Intl.NumberFormat('ar-SA', {
  style: 'unit', unit: 'day', unitDisplay: 'long', numberingSystem: 'arab',
});

export function durationLabel(days?: number) {
  return days === undefined ? 'غير محددة' : dayCount.format(days);
}
