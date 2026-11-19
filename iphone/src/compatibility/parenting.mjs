export function parentingApplicable(surveyAnswers, childrenCount, partnerChildren) {
  return !(surveyAnswers?.children_plan === 'B' && childrenCount === 0 &&
    partnerChildren?.mode === 'require' && partnerChildren.target === 'none');
}

/** Only unanimous, resolved facts from the draft or approved profile choices can shorten a receipt. */
export function parentingContext(fields) {
  function confirmed(fieldId, value, mode) {
    const entries = fields.filter(field => field.fieldId === fieldId);
    return entries.length > 0 && entries.every(field => !field.needsClarification && !field.exclude &&
      field.mode === mode && field.values.length === 1 && field.values[0] === value);
  }
  return {
    childrenCount: confirmed('marriageBasics.childrenCount', '0', null) ? 0 : undefined,
    partnerChildren: confirmed('partnerCriteria.children', 'none', 'require') ? { mode: 'require', target: 'none' } : undefined,
  };
}
