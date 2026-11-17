/** Weighted sampling without replacement: paid visibility affects exposure,
 * never eligibility or compatibility percentages. Called only on eligible cards. */
export function shuffleWithVisibility<T extends {membershipTier?:string}>(people:readonly T[],random:()=>number=Math.random):T[] {
 return people.map((person,index)=>({person,index,key:-Math.log(Math.max(Number.EPSILON,Math.min(1-Number.EPSILON,random())))/(person.membershipTier==='seriousness'?2:1)}))
  .sort((a,b)=>a.key-b.key||a.index-b.index).map(item=>item.person);
}
