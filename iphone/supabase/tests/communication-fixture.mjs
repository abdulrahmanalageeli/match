// These suites exercise approved-member communication, not the intake workflow.
export async function seedCommunicationMember(db, member, gender) {
  await db.query("insert into marriage.cities(label) values('الرياض') on conflict(label) do nothing");
  const result = await db.query("insert into marriage.members(id,review_status) values($1,'approved') on conflict(id) do update set review_status='approved' returning app_account_token", [member.id]);
  await db.query("insert into marriage.profiles(member_id,display_name,age,gender,city_id,profession,bio) values($1,'عضو اختبار',29,$2,(select id from marriage.cities where label='الرياض'),'مهندس','ملف اختباري')", [member.id, gender]);
  await db.query("insert into marriage.preferences(member_id,min_age,max_age,family_preference) values($1,25,40,'')", [member.id]);
  return result.rows[0].app_account_token;
}

export async function signCommunicationAgreement(call, woman, man, request) {
  const proposal = await call(woman, 'public.marriage_agreement($1,$2,$3)', [request, 'propose', { days: 7, signed: true }]);
  await call(man, 'public.marriage_agreement($1,$2,$3)', [request, 'accept', { proposalId: proposal.proposalId, signed: true }]);
}
