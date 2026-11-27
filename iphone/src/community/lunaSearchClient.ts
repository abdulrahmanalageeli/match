import {Capacitor} from '@capacitor/core';
import {cloud, cloudConnection} from '../cloud';
import {marriageProjectUrl} from '../deployment';
import type {Filters, PublicPerson} from './data';

export type LunaPerson = Pick<PublicPerson, 'id' | 'alias' | 'portrait' | 'publicAvatar' | 'isDemo' | 'demoPhoto' | 'recommendationKind'> & {matchReasons?: string[]};
export type LunaResults = {options:Filters & {luna:unknown[];lunaFields:Record<string,unknown>};people:LunaPerson[]};
export async function searchWithLuna(userId:string, query:string, filters:Filters):Promise<LunaResults> {
  const session=(await cloud?.auth.getSession())?.data.session;
  if(!session || session.user.id!==userId) throw Error('سجّل الدخول مجددًا.');
  const native=Capacitor.isNativePlatform();
  if(native && cloudConnection.url!==marriageProjectUrl) throw Error('البحث غير مهيأ لهذه النسخة.');
  const endpoint=native?'https://nisfayn-preview.vercel.app/api/luna-search':'/api/luna-search';
  const response=await fetch(endpoint+(filters.mode==='recommended'?'?closeRecommendations=1':''),{
    method:'POST',headers:{'Content-Type':'application/json',Accept:'application/vnd.wudayn.search-cards+json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({query,filters}),signal:AbortSignal.timeout(55000),
  });
  const result=await response.json();
  if(!response.ok) throw Error(result.error || 'تعذّر البحث الآن.');
  return result;
}
