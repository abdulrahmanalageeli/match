import type {PublicPerson} from './data';
import type {LunaPerson, LunaResults} from './lunaSearchClient';
export function lunaResultCard(person:PublicPerson, options:Pick<LunaResults['options'],'luna'|'lunaFields'>): LunaPerson;
