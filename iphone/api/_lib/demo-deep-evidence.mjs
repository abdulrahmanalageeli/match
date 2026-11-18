import personas from '../../src/community/demoPersonas.json' with {type:'json'};
import questions from '../../src/compatibility/personality-catalog.json' with {type:'json'};

// Only fictional catalog entries can be selected by an API caller.
export function demoEvidence(id) {
 const persona=personas.find(item=>item.id===id);
 if(!persona)return null;
 const statements=persona.style.split('؛').map(text=>text.trim());
 const entries=questions.map(({id,prompt})=>{
  const statement=statements.find(text=>text.startsWith(prompt));
  if(!statement)throw Error('Invalid demo personality catalog');
  return {key:'personality:'+id,question:prompt,answer:statement.slice(prompt.length).trim()};
 });
 entries.push({key:'profile:bio',question:'كيف تصف حياتك اليومية؟',answer:persona.bio});
 return {entries};
}
