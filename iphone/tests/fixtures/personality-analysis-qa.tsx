import {createRoot} from 'react-dom/client';
import {FitDetails} from '../../src/compatibility/FitDetails';
import {comparePreferences} from '../../src/compatibility/model';
import {personalityQuestions} from '../../src/compatibility/personality';
import '../../src/design.css';
import '../../src/motion.css';

const answers=Object.fromEntries(personalityQuestions.map(question=>[question.id,'D']));
const first={id:'qa-a',gender:'woman',age:27,city:'الرياض',preferredMinAge:25,preferredMaxAge:40,personalityVersion:'personality-v1',personalityAnswers:answers};
const second={...first,id:'qa-b',gender:'man',age:31,personalityAnswers:{...answers,initiative:'E',openness:'B',planning:'A',novelty:'B',conflict_pace:'B',quiet_comfort:'C'}};
const mode=new URLSearchParams(location.search).get('mode');
if(mode==='partial')delete second.personalityAnswers.planning;
const fit=comparePreferences(first,second)!.fit;
if(mode==='legacy'&&fit.personality){delete fit.personality.method;delete fit.personality.domains;delete fit.personality.distribution;}
createRoot(document.getElementById('root')!).render(<main style={{maxWidth:520,margin:'0 auto',padding:'24px 20px',background:'#fffdf9',minHeight:'100dvh'}}><p style={{fontSize:12,color:'#94737c'}}>نصفين · قراءة توضيحية لعضوين</p><FitDetails fit={fit}/></main>);
