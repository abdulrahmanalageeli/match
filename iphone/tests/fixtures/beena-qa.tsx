import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {BeenaFields} from '../../src/beena/BeenaFields';
import {BeenaSummary} from '../../src/beena/BeenaSummary';
import {sharedBeenaStory,type BeenaProfile} from '../../src/beena/model';
import '../../src/design.css';
import '../../src/flows.css';
import '../../src/screens.css';
import '../../src/arrivalSurfaces.css';
import '../../src/typography.css';
if(import.meta.env.MODE!=='demo')throw Error('Use demo mode for this local fixture.');
function Preview(){
 const [value,setValue]=useState<BeenaProfile|null>(null);
 const shared=sharedBeenaStory(value);
 return <div className="phone-app"><main style={{height:"100svh",overflowY:"auto",maxWidth:390,margin:'auto',padding:16}}><BeenaFields value={value} onChange={setValue}/><hr/><h2>معاينة ما يظهر في الملف</h2>{shared?<BeenaSummary story={shared}/>:<p>لم تختر مشاركة إجابة.</p>}</main></div>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
