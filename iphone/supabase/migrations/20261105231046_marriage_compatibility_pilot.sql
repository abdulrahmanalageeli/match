-- A private, immutable catalogue snapshot ties answers and explanations to the questionnaire that produced them.
insert into marriage.consent_versions(version) values ('2026-11-06-assessment');
create table marriage.assessment_versions (
  id text primary key, catalog jsonb not null check (jsonb_typeof(catalog)='object')
);
create table marriage.fit_categories (
  code text primary key, weight smallint not null check(weight>0), position smallint not null unique
);
create table marriage.fit_dimensions (
  code text primary key references marriage.questions(code),
  partner_code text not null unique references marriage.questions(code),
  category text not null references marriage.fit_categories(code), ordinal smallint not null unique,
  hard_allowed boolean not null, reason text not null
);
create index fit_dimensions_category on marriage.fit_dimensions(category);
create table marriage.member_assessment (
  member_id uuid primary key references marriage.members(id) on delete cascade,
  version text not null references marriage.assessment_versions(id)
);
create index member_assessment_version on marriage.member_assessment(version);
create table marriage.fit_hard_requirements (
  member_id uuid not null references marriage.members(id) on delete cascade,
  dimension text not null references marriage.fit_dimensions(code), primary key(member_id,dimension)
);
create index fit_hard_dimension on marriage.fit_hard_requirements(dimension);
create table marriage.fit_priorities (
  member_id uuid not null references marriage.members(id) on delete cascade,
  category text not null references marriage.fit_categories(code), primary key(member_id,category)
);
create index fit_priority_category on marriage.fit_priorities(category);

insert into marriage.assessment_versions values ('legacy-v0','{"version":"legacy-v0","questions":["conversation_initiative_preference","partner_conversation_initiative_preference","match_disagreement_style","partner_match_disagreement_style"]}');
insert into marriage.assessment_versions values ('marriage-v1', $catalog${
  "version": "marriage-v1",
  "categories": [
    {"id":"values","label":"قيم البيت ومسؤولياته","weight":25},
    {"id":"plans","label":"الأطفال والسكن","weight":25},
    {"id":"lifestyle","label":"إيقاع الحياة","weight":20},
    {"id":"communication","label":"الحوار والاختلاف","weight":15},
    {"id":"personality","label":"أسلوب التعارف","weight":10},
    {"id":"timing","label":"توقيت الزواج","weight":5}
  ],
  "dimensions": [
    {
      "id": "children_plan",
      "partnerId": "partner_children_plan",
      "category": "plans",
      "title": "الأطفال",
      "selfPrompt": "كيف تتصور موضوع الإنجاب بعد الزواج؟",
      "partnerPrompt": "أي رغبة في الإنجاب تفضّلها لدى شريك الحياة؟",
      "reason": "تنسجم رغبة كلٍّ منكما في الإنجاب مع ما يبحث عنه الطرف الآخر.",
      "discussion": "كيف تتصوران موضوع الإنجاب، ومتى تودان العودة إليه؟",
      "hardAllowed": true,
      "options": [
        {"code":"A","self":"أرغب في الإنجاب","partner":"يرغب في الإنجاب"},
        {"code":"B","self":"لا أرغب في الإنجاب","partner":"لا يرغب في الإنجاب"},
        {"code":"C","self":"لم أحسم قراري بعد","partner":"لم يحسم قراره بعد"}
      ]
    },
    {
      "id": "residence_plan",
      "partnerId": "partner_residence_plan",
      "category": "plans",
      "title": "مدينة السكن",
      "selfPrompt": "ما المدن التي يمكنك أن تبني فيها حياتك الزوجية؟",
      "partnerPrompt": "أي موقف من الانتقال يناسبك لدى شريك الحياة؟",
      "reason": "تتوافق اختياراتكما بشأن مرونة الانتقال إلى مدينة أخرى.",
      "discussion": "ما الخيارات الواقعية لمدينة السكن بالنسبة لكلٍّ منكما؟",
      "hardAllowed": true,
      "options": [
        {"code":"A","self":"أرغب في البقاء في مدينتي","partner":"يرغب في البقاء في مدينته"},
        {"code":"B","self":"يمكنني الانتقال إلى مدينة الشريك","partner":"يمكنه الانتقال إلى مدينتي"},
        {"code":"C","self":"يمكنني الانتقال إلى مدينة نتفق عليها","partner":"يمكنه الانتقال إلى مدينة نتفق عليها"}
      ]
    },
    {
      "id": "marriage_timeline",
      "partnerId": "partner_marriage_timeline",
      "category": "timing",
      "title": "موعد الخطوة الرسمية",
      "selfPrompt": "متى يناسبك الانتقال إلى خطوة رسمية إذا وجدت الشخص المناسب؟",
      "partnerPrompt": "ما التوقيت الذي يناسبك لدى الطرف الآخر؟",
      "reason": "التوقيت الذي ذكره كل منكما يناسب تفضيل الطرف الآخر.",
      "discussion": "ما المقصود بالخطوة الرسمية لكلٍّ منكما، وما الوقت المناسب لها؟",
      "hardAllowed": true,
      "options": [
        {"code":"A","self":"خلال ستة أشهر","partner":"خلال ستة أشهر"},
        {"code":"B","self":"بعد ستة أشهر إلى سنة","partner":"بعد ستة أشهر إلى سنة"},
        {"code":"C","self":"بعد أكثر من سنة","partner":"بعد أكثر من سنة"},
        {"code":"D","self":"لم أحدد وقتًا بعد","partner":"لم يحدد وقتًا بعد"}
      ]
    },
    {
      "id": "family_boundaries",
      "partnerId": "partner_family_boundaries",
      "category": "values",
      "title": "استشارة الأهل",
      "selfPrompt": "عند قرار يخص البيت، متى تطلب رأي الأهل؟",
      "partnerPrompt": "ما الأسلوب الذي ترتاح له لدى شريك الحياة؟",
      "reason": "تتوافق اختياراتكما بشأن دور الأهل في قرارات البيت.",
      "discussion": "ما القرارات التي تفضلان إبقاءها بينكما، ومتى تطلبان رأي الأهل؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"أفضل أن نتشاور معًا أولًا","partner":"نتشاور معًا أولًا"},
        {"code":"B","self":"أستفيد من رأي الأهل من البداية","partner":"يستفيد من رأي الأهل من البداية"},
        {"code":"C","self":"أستشير الأهل عند الحاجة إلى خبرتهم","partner":"يستشير الأهل عند الحاجة إلى خبرتهم"}
      ]
    },
    {
      "id": "shared_budget",
      "partnerId": "partner_shared_budget",
      "category": "values",
      "title": "ترتيب الميزانية",
      "selfPrompt": "كيف ترتّب مصاريف البيت المشتركة؟",
      "partnerPrompt": "أي طريقة لترتيب المصاريف تفضّلها لدى الشريك؟",
      "reason": "تنسجم طريقتكما المفضّلة في التخطيط لمصاريف البيت.",
      "discussion": "كيف تريدان الاتفاق على مصاريف البيت والقرارات المالية المشتركة؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"أضع ميزانية شهرية مفصّلة","partner":"ميزانية شهرية مفصّلة"},
        {"code":"B","self":"أحدّد سقفًا للمصاريف وأترك مساحة للتغيير","partner":"سقف للمصاريف مع مساحة للتغيير"},
        {"code":"C","self":"أناقش المصاريف الكبيرة وقت الحاجة","partner":"مناقشة المصاريف الكبيرة وقت الحاجة"}
      ]
    },
    {
      "id": "household_roles",
      "partnerId": "partner_household_roles",
      "category": "values",
      "title": "مسؤوليات البيت",
      "selfPrompt": "كيف تود توزيع أعمال البيت في أسبوع مزدحم؟",
      "partnerPrompt": "أي طريقة لتقاسم المسؤولية تفضّلها لدى الطرف الآخر؟",
      "reason": "يتوافق تصور كل منكما لتقاسم مسؤوليات البيت مع تفضيل الآخر.",
      "discussion": "كيف يتغيّر تقسيم الأعمال بينكما حين ينشغل أحدكما؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"نتفق على مسؤوليات ثابتة","partner":"الاتفاق على مسؤوليات ثابتة"},
        {"code":"B","self":"نتبادل الأدوار بحسب وقت كل منا","partner":"تبادل الأدوار بحسب الوقت المتاح"},
        {"code":"C","self":"نتفق على خطة جديدة في بداية كل أسبوع","partner":"تجديد الخطة في بداية كل أسبوع"}
      ]
    },
    {
      "id": "weekly_planning",
      "partnerId": "partner_weekly_planning",
      "category": "lifestyle",
      "title": "خطة نهاية الأسبوع",
      "selfPrompt": "إذا كان أمامكما يوم إجازة، كيف تود ترتيبه؟",
      "partnerPrompt": "أي أسلوب في تخطيط الإجازة يناسبك لدى الشريك؟",
      "reason": "يناسب أسلوب كل منكما في تخطيط الإجازة تفضيل الطرف الآخر.",
      "discussion": "أي جزء من الإجازة تودان التخطيط له، وأي جزء تتركانه لعفويته؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"أرتّب الوقت والمكان والتفاصيل مسبقًا","partner":"يرتّب الوقت والمكان والتفاصيل مسبقًا"},
        {"code":"B","self":"أحدّد الأساسيات وأترك التفاصيل لوقتها","partner":"يحدّد الأساسيات ويترك التفاصيل لوقتها"},
        {"code":"C","self":"أفضّل أن نقرّر في اليوم نفسه","partner":"يفضّل القرار في اليوم نفسه"}
      ]
    },
    {
      "id": "social_rhythm",
      "partnerId": "partner_social_rhythm",
      "category": "lifestyle",
      "title": "الزيارات ووقت الراحة",
      "selfPrompt": "بعد أسبوع مزدحم، أي إيقاع اجتماعي يريحك؟",
      "partnerPrompt": "أي إيقاع اجتماعي تفضّله لدى شريك الحياة؟",
      "reason": "تتوافق توقعاتكما بشأن الزيارات ووقت الراحة.",
      "discussion": "كيف توازنان بين الزيارات والوقت الخاص بكما؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"أرتاح في البيت معظم الوقت","partner":"يرتاح في البيت معظم الوقت"},
        {"code":"B","self":"أوازن بين زيارة ووقت هادئ","partner":"يوازن بين الزيارات والهدوء"},
        {"code":"C","self":"أستمتع بعدة لقاءات وزيارات","partner":"يستمتع بعدة لقاءات وزيارات"}
      ]
    },
    {
      "id": "conversation_initiative_preference",
      "partnerId": "partner_conversation_initiative_preference",
      "category": "communication",
      "title": "بداية الحديث",
      "selfPrompt": "كيف تتصرّف عادةً في بداية الحديث؟",
      "partnerPrompt": "أي أسلوب ترتاح له لدى الطرف الآخر عند بداية الحديث؟",
      "reason": "يتوافق أسلوب كلٍّ منكما في بدء الحديث مع تفضيل الطرف الآخر.",
      "discussion": "إذا ساد الصمت في بداية التعارف، كيف تحبان فتح الحديث؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"أتفاعل عندما يبدأ الآخر","partner":"يتفاعل عندما أبدأ"},
        {"code":"B","self":"نتبادل المبادرة","partner":"نتبادل المبادرة"},
        {"code":"C","self":"أبادر بفتح الحديث","partner":"يبادر بفتح الحديث"},
        {"code":"D","self":"أبادر إذا طال الصمت","partner":"يبادر إذا طال الصمت"}
      ]
    },
    {
      "id": "match_disagreement_style",
      "partnerId": "partner_match_disagreement_style",
      "category": "communication",
      "title": "عند الاختلاف",
      "selfPrompt": "ماذا تفضّل حين يختلف رأيك مع شخص آخر؟",
      "partnerPrompt": "أي أسلوب ترتاح له لدى الطرف الآخر عند الاختلاف؟",
      "reason": "تفضيل كلٍّ منكما عند الاختلاف ينسجم مع أسلوب الطرف الآخر.",
      "discussion": "حين تختلف وجهتا نظركما، كيف تحبان أن يبدأ النقاش؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"مناقشة الحجج","partner":"مناقشة الحجج"},
        {"code":"B","self":"فهم أسباب الاختلاف","partner":"فهم أسباب الاختلاف"},
        {"code":"C","self":"تلطيف الأجواء بالمزاح","partner":"تلطيف الأجواء بالمزاح"},
        {"code":"D","self":"الانتقال إلى أرضية مشتركة","partner":"الانتقال إلى أرضية مشتركة"}
      ]
    },
    {
      "id": "repair_after_conflict",
      "partnerId": "partner_repair_after_conflict",
      "category": "communication",
      "title": "العودة بعد الزعل",
      "selfPrompt": "بعد موقف أزعجكما، كيف تفتح باب الصلح؟",
      "partnerPrompt": "كيف تفضّل أن يعود الطرف الآخر للحوار بعد الزعل؟",
      "reason": "تناسب طريقة كل منكما في العودة للحوار ما يرتاح له الآخر.",
      "discussion": "إذا احتاج أحدكما وقتًا ليهدأ، كيف تتفقان على العودة إلى الحوار؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"أتحدث عمّا حدث في حينه","partner":"يتحدث عمّا حدث في حينه"},
        {"code":"B","self":"أطلب مهلة وأحدد وقتًا للعودة","partner":"يطلب مهلة ويحدد وقتًا للعودة"},
        {"code":"C","self":"أبدأ بلفتة لطيفة ثم أتحدث عمّا حدث","partner":"يبدأ بلفتة لطيفة ثم يتحدث عمّا حدث"}
      ]
    },
    {
      "id": "conversation_depth",
      "partnerId": "partner_conversation_depth",
      "category": "communication",
      "title": "شكل الحديث",
      "selfPrompt": "أي حديث يجعلك تسترسل وأنت تتعرّف إلى شخص جديد؟",
      "partnerPrompt": "أي أسلوب حديث تفضّله لدى الشريك؟",
      "reason": "يناسب شكل الحديث الذي وصفه كل منكما ما يفضّله الآخر.",
      "discussion": "هل تستمتعان أكثر بتفصيل فكرة واحدة أم بتبادل قصص من حياتكما؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"أتعمّق في فكرة واحدة من عدة زوايا","partner":"يتعمّق في فكرة واحدة من عدة زوايا"},
        {"code":"B","self":"أنتقل بين قصص وتجارب من الحياة","partner":"ينتقل بين قصص وتجارب من الحياة"}
      ]
    },
    {
      "id": "closeness_pace",
      "partnerId": "partner_closeness_pace",
      "category": "personality",
      "title": "القرب والمساحة",
      "selfPrompt": "عندما يزداد القرب بينكما، ما الذي يساعدك على الارتياح؟",
      "partnerPrompt": "أي طريقة في بناء القرب ترتاح لها لدى الشريك؟",
      "reason": "تنسجم طريقة كل منكما في بناء القرب مع ما يرتاح له الآخر.",
      "discussion": "ما الذي يساعد كلًا منكما على الشعور بالقرب مع الحفاظ على خصوصيته؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"أشارك تفاصيل أكثر بالتدريج","partner":"يشارك تفاصيل أكثر بالتدريج"},
        {"code":"B","self":"أرتاح للتعبير الواضح عن الاهتمام","partner":"يعبّر عن اهتمامه بوضوح"},
        {"code":"C","self":"أحتاج إلى مساحة خاصة حتى مع القرب","partner":"يحتاج إلى مساحة خاصة حتى مع القرب"}
      ]
    },
    {
      "id": "curiosity_style",
      "partnerId": "partner_curiosity_style",
      "category": "personality",
      "title": "فضول التعارف",
      "selfPrompt": "كيف يظهر فضولك عندما تتعرّف إلى شخص جديد؟",
      "partnerPrompt": "أي نوع من التفاعل يجذبك لدى الطرف الآخر؟",
      "reason": "يتوافق أسلوب كل منكما في إظهار الفضول مع ما يستمتع به الآخر.",
      "discussion": "ما السؤال أو القصة التي تجعل الحديث بينكما أسهل؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"أسأل عن الدوافع والمعاني","partner":"يسأل عن الدوافع والمعاني"},
        {"code":"B","self":"أشارك قصة تفتح باب الأسئلة","partner":"يشارك قصة تفتح باب الأسئلة"},
        {"code":"C","self":"أبدأ بتعليق خفيف أو مزحة","partner":"يبدأ بتعليق خفيف أو مزحة"}
      ]
    },
    {
      "id": "early_openness",
      "partnerId": "partner_early_openness",
      "category": "personality",
      "title": "خصوصية البدايات",
      "selfPrompt": "في أول حديث جاد، ما الذي ترتاح لمشاركته؟",
      "partnerPrompt": "أي قدر من المشاركة ترتاح له لدى الطرف الآخر في البداية؟",
      "reason": "يتوافق إيقاع مشاركة التفاصيل في بداية التعارف مع ما ذكره كل منكما.",
      "discussion": "ما المواضيع المريحة في البداية، وما الذي تودان تأجيله؟",
      "hardAllowed": false,
      "options": [
        {"code":"A","self":"أبدأ بالمواضيع العامة","partner":"يبدأ بالمواضيع العامة"},
        {"code":"B","self":"أشارك رأيًا أو تجربة خفيفة","partner":"يشارك رأيًا أو تجربة خفيفة"},
        {"code":"C","self":"أشارك تفاصيل شخصية إذا ارتحت","partner":"يشارك تفاصيل شخصية إذا ارتاح"}
      ]
    }
  ]
}$catalog$::jsonb);

do $seed$ declare catalog jsonb; d record; o record;
begin
 select v.catalog into strict catalog from marriage.assessment_versions v where id='marriage-v1';
 insert into marriage.fit_categories
 select elem->>'id',(elem->>'weight')::smallint,n::smallint
 from jsonb_array_elements(catalog->'categories') with ordinality as c(elem,n);
 for d in select elem,n from jsonb_array_elements(catalog->'dimensions') with ordinality as src(elem,n) loop
   insert into marriage.questions(code,label,position) values
     (d.elem->>'id',d.elem->>'selfPrompt',10+d.n*2),
     (d.elem->>'partnerId',d.elem->>'partnerPrompt',11+d.n*2)
   on conflict(code) do update set label=excluded.label;
   for o in select elem,n from jsonb_array_elements(d.elem->'options') with ordinality as opt(elem,n) loop
     insert into marriage.question_options values
       (d.elem->>'id',o.elem->>'code',o.elem->>'self',o.n),
       (d.elem->>'partnerId',o.elem->>'code',o.elem->>'partner',o.n)
     on conflict(question_code,code) do update set label=excluded.label;
   end loop;
   insert into marriage.fit_dimensions values (d.elem->>'id',d.elem->>'partnerId',d.elem->>'category',
     d.n,(d.elem->>'hardAllowed')::boolean,d.elem->>'reason');
 end loop;
end $seed$;

-- Preserve the subscription, moderation and block gates on every read. Already accepted
-- conversations survive questionnaire edits. A new request cannot obtain this exception.
create or replace function marriage.compatible(a uuid,b uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(
 select 1 from marriage.members x join marriage.profiles p on p.member_id=x.id join marriage.preferences xp on xp.member_id=x.id
 join marriage.members y on y.id=b join marriage.profiles q on q.member_id=y.id join marriage.preferences yp on yp.member_id=y.id
 where x.id=a and a<>b and x.review_status='approved' and y.review_status='approved'
 and not(x.paused or y.paused or x.suspended or y.suspended) and p.gender<>q.gender
 and not exists(select 1 from marriage.blocks z where (z.member_id=a and z.blocked_id=b) or (z.member_id=b and z.blocked_id=a))
 and (
   exists(select 1 from marriage.member_requests r where least(r.requester_id,r.recipient_id)=least(a,b)
     and greatest(r.requester_id,r.recipient_id)=greatest(a,b) and r.status='accepted')
   or exists(select 1 from marriage.introductions i join marriage.introduction_decisions da on da.introduction_id=i.id and da.member_id=a
     join marriage.introduction_decisions db on db.introduction_id=i.id and db.member_id=b where i.member_a=least(a,b)
     and i.member_b=greatest(a,b) and i.closed_at is null)
   or (p.age between yp.min_age and yp.max_age and q.age between xp.min_age and xp.max_age
     and (p.city_id=q.city_id or (select count(*)=2 from marriage.member_answers r where r.member_id in(a,b)
       and r.question_code='residence_plan' and r.option_code in('B','C')))
     and not exists (
       select 1 from marriage.fit_hard_requirements h join marriage.fit_dimensions d on d.code=h.dimension
       left join marriage.member_answers want on want.member_id=h.member_id and want.question_code=d.partner_code
       left join marriage.member_answers peer on peer.member_id=case when h.member_id=a then b else a end and peer.question_code=d.code
       where h.member_id in(a,b) and (want.option_code is null or peer.option_code is distinct from want.option_code)
     )
   )
 ))
$$;

-- Never disclose raw answer values or which person omitted an answer. A dimension can
-- support an explanation only when both self descriptions and both preferences exist.
create function marriage.pair_fit(a uuid,b uuid)
returns table(fit jsonb,rank_value double precision,covered integer,shared integer,provisional boolean)
language sql stable set search_path='' as $$
 with choices as materialized (
   select d.code,d.ordinal,d.category,pa.option_code=sb.option_code as ab,pb.option_code=sa.option_code as ba
   from marriage.fit_dimensions d
   left join marriage.member_answers sa on sa.member_id=a and sa.question_code=d.code
   left join marriage.member_answers sb on sb.member_id=b and sb.question_code=d.code
   left join marriage.member_answers pa on pa.member_id=a and pa.question_code=d.partner_code
   left join marriage.member_answers pb on pb.member_id=b and pb.question_code=d.partner_code
 ), categories as (
   select cat.code,cat.weight*case when aw.category is null then 1 else 2 end as wa,
     cat.weight*case when bw.category is null then 1 else 2 end as wb,
     avg((c.ab::integer)::float8) as ab,avg((c.ba::integer)::float8) as ba
   from marriage.fit_categories cat join choices c on c.category=cat.code
   left join marriage.fit_priorities aw on aw.member_id=a and aw.category=cat.code
   left join marriage.fit_priorities bw on bw.member_id=b and bw.category=cat.code
   group by cat.code,cat.weight,aw.category,bw.category
 ), scores as (
   select sqrt(sum(ab*wa)/nullif(sum(wa) filter(where ab is not null),0)
      *sum(ba*wb)/nullif(sum(wb) filter(where ba is not null),0)) as ratio from categories
 ), summary as (
   select count(*)::int as n,count(*) filter(where ab is not null and ba is not null)::int as c,
     count(distinct category) filter(where ab is not null and ba is not null) as category_count,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab and ba),'[]') as strengths,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab is not null and ba is not null and not(ab and ba)),'[]') as discussion,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab is null or ba is null),'[]') as missing
   from choices
 ), result as (
   select *,c<5 or category_count<3 as tentative from summary cross join scores
 )
 select jsonb_build_object('version','marriage-v1','band',
     case when tentative then 'insufficient' when ratio>=0.75 then 'strong' when ratio>=0.45 then 'mixed' else 'explore' end,
     'provisional',tentative,'covered',c,'total',n,'strengths',strengths,'discussion',discussion,'missing',missing),
   coalesce(ratio,0)*sqrt(c::float8/nullif(n,0)),c,
   (select count(*)::int from marriage.member_interests mine join marriage.member_interests peer using(interest_code)
     where mine.member_id=a and peer.member_id=b),tentative
 from result
$$;

create or replace function marriage.match_reasons(a uuid,b uuid) returns jsonb language sql stable set search_path='' as $$
 with f as(select fit from marriage.pair_fit(a,b)), reasons as (
   select d.ordinal as position,d.reason as label from f cross join marriage.fit_dimensions d where (fit->'strengths') ? d.code
   union all select (100+i.position)::smallint,'اهتمام مشترك: '||i.label from marriage.member_interests mine
     join marriage.member_interests peer on peer.member_id=b and peer.interest_code=mine.interest_code
     join marriage.interests i on i.code=mine.interest_code where mine.member_id=a
 )
 select coalesce(jsonb_agg(label order by position),(select jsonb_build_array(
   case when p.age not between y.min_age and y.max_age or q.age not between x.min_age and x.max_age then
     'تتوفر تفاصيل أكثر عند استكمال تفضيلاتكما.'
   when p.city_id=q.city_id then 'تتوافق مدينتكما والفئة العمرية التي اختارها كلٌّ منكما.'
   when (select count(*)=2 from marriage.member_answers ans where ans.member_id in(a,b)
     and ans.question_code='residence_plan' and ans.option_code in('B','C'))
     then 'يتوافق عمركما مع التفضيلات التي اخترتماها، وذكرتما أن الانتقال ممكن.'
   else 'تتوفر تفاصيل أكثر عند استكمال تفضيلاتكما.' end)
   from marriage.profiles p join marriage.preferences x on x.member_id=p.member_id
   join marriage.profiles q on q.member_id=b join marriage.preferences y on y.member_id=b
   where p.member_id=a),'[]'::jsonb) from reasons
$$;

alter function marriage.member_card(uuid,uuid) rename to member_card_base;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_base(viewer,subject) || jsonb_build_object('fit',f.fit) from marriage.pair_fit(viewer,subject) f
$$;

alter function marriage.profile_json(uuid) rename to profile_json_base;
create function marriage.profile_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.profile_json_base(target) || jsonb_build_object(
  'assessmentVersion',coalesce((select version from marriage.member_assessment where member_id=target),'legacy-v0'),
  'hardRequirements',coalesce((select jsonb_agg(dimension order by dimension) from marriage.fit_hard_requirements where member_id=target),'[]'),
  'priorityCategories',coalesce((select jsonb_agg(category order by category) from marriage.fit_priorities where member_id=target),'[]'))
$$;
alter function marriage.member_state(uuid) rename to member_state_base;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_base(target); peer uuid;
begin
 if result #>> '{introduction,id}' is not null then
   select case when member_a=target then member_b else member_a end into peer from marriage.introductions
   where id=(result #>> '{introduction,id}')::uuid;
   result:=jsonb_set(result,'{introduction,fit}',(select fit from marriage.pair_fit(target,peer)));
 end if;
 return result;
end $$;

alter function marriage.catalog() rename to catalog_base;
create function marriage.catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select marriage.catalog_base() || jsonb_build_object('assessment',(select catalog from marriage.assessment_versions where id='marriage-v1'))
$$;
revoke all on function marriage.catalog_base(),marriage.catalog() from public,anon,authenticated,service_role;
grant execute on function marriage.catalog() to authenticated;

create or replace function marriage.apply_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 me uuid:=marriage.require_member(); previous jsonb; normalized jsonb;
 choices jsonb; answers jsonb; hard jsonb; priorities jsonb; version text; city uuid;
 old_status text; is_suspended boolean; changed boolean; review_change boolean;
 private_keys text[]:=array['interestIds','surveyAnswers','hardRequirements','priorityCategories','assessmentVersion','preferredMinAge','preferredMaxAge'];
begin
 select review_status,suspended into strict old_status,is_suspended from marriage.members where id=me for update;
 if is_suspended then raise exception 'الحساب قيد مراجعة البلاغات.' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or payload->>'consentVersion' is distinct from
   (case when payload->>'assessmentVersion'='marriage-v1' then '2026-11-06-assessment' else '2026-11-05' end) then
   raise exception 'يلزم الاطّلاع على سياسة الخصوصية الحالية والموافقة عليها.' using errcode='22023';
 end if;
 previous:=marriage.profile_json(me);
 choices:=coalesce(payload->'interestIds',previous->'interestIds','[]');
 answers:=coalesce(payload->'surveyAnswers',previous->'surveyAnswers','{}');
 hard:=coalesce(payload->'hardRequirements',previous->'hardRequirements','[]');
 priorities:=coalesce(payload->'priorityCategories',previous->'priorityCategories','[]');
 version:=coalesce(payload->>'assessmentVersion',previous->>'assessmentVersion','legacy-v0');
 if version not in('legacy-v0','marriage-v1') or jsonb_typeof(choices)<>'array' or jsonb_typeof(answers)<>'object'
   or jsonb_typeof(hard)<>'array' or jsonb_typeof(priorities)<>'array' then
   raise exception 'تحقق من نسخة التقييم وتنسيق الإجابات.' using errcode='22023';
 end if;
 -- Clients predating the assessment know only the original two pairs. Preserve
 -- newer answers, settings and the newer version when such a client edits the profile.
 if payload->>'assessmentVersion' is null or payload->>'assessmentVersion'='legacy-v0' then
   if payload ? 'surveyAnswers' then
     if exists(select 1 from jsonb_object_keys(payload->'surveyAnswers') k where k not in(
       'conversation_initiative_preference','partner_conversation_initiative_preference','match_disagreement_style','partner_match_disagreement_style')) then
       raise exception 'حدّث التطبيق لتعديل نسخة التقييم.' using errcode='22023';
     end if;
     answers:=(coalesce(previous->'surveyAnswers','{}') - array['conversation_initiative_preference','partner_conversation_initiative_preference',
       'match_disagreement_style','partner_match_disagreement_style']) || answers;
   end if;
   version:=coalesce(previous->>'assessmentVersion','legacy-v0');
   hard:=coalesce(previous->'hardRequirements','[]');
   priorities:=coalesce(previous->'priorityCategories','[]');
 end if;
 if jsonb_array_length(choices)>3 or jsonb_array_length(priorities)>2
   or exists(select 1 from jsonb_array_elements(choices) c group by c having count(*)>1)
   or exists(select 1 from jsonb_array_elements(hard) c group by c having count(*)>1)
   or exists(select 1 from jsonb_array_elements(priorities) c group by c having count(*)>1)
   or exists(select 1 from jsonb_array_elements_text(choices) c(id) where not exists(select 1 from marriage.interests i where i.code=c.id))
   or exists(select 1 from jsonb_each(answers) v where jsonb_typeof(v.value)<>'string' or not exists(
     select 1 from marriage.question_options o where o.question_code=v.key and o.code=answers->>v.key))
   or exists(select 1 from jsonb_array_elements_text(priorities) c(id) where not exists(select 1 from marriage.fit_categories cat where cat.code=c.id))
   or exists(select 1 from jsonb_array_elements_text(hard) c(id) where not exists(
     select 1 from marriage.fit_dimensions d where d.code=c.id and d.hard_allowed and answers ? d.partner_code)) then
   raise exception 'تحقق من الاهتمامات والإجابات والأولويات وحدد تفضيلك قبل جعل الشرط أساسيًا.' using errcode='22023';
 end if;
 normalized:=jsonb_build_object('displayName',btrim(payload->>'displayName'),'age',(payload->>'age')::smallint,
  'gender',payload->>'gender','city',btrim(payload->>'city'),'profession',btrim(payload->>'profession'),
  'bio',btrim(payload->>'bio'),'contact',btrim(payload->>'contact'),'preferredMinAge',coalesce((payload->>'preferredMinAge')::smallint,18),
  'preferredMaxAge',coalesce((payload->>'preferredMaxAge')::smallint,110),'familyPreference',btrim(coalesce(payload->>'familyPreference','')),
  'interestIds',coalesce((select jsonb_agg(v order by v) from jsonb_array_elements_text(choices) v),'[]'::jsonb),'surveyAnswers',answers,
  'assessmentVersion',version,'hardRequirements',coalesce((select jsonb_agg(v order by v) from jsonb_array_elements_text(hard) v),'[]'),
  'priorityCategories',coalesce((select jsonb_agg(v order by v) from jsonb_array_elements_text(priorities) v),'[]'));
 changed:=previous is distinct from normalized;
 review_change:=(previous - private_keys) is distinct from (normalized - private_keys);
 if changed then
  insert into marriage.cities(label) values (normalized->>'city') on conflict(label) do nothing;
  select c.id into strict city from marriage.cities c where label=normalized->>'city';
  insert into marriage.profiles(member_id,display_name,age,gender,city_id,profession,bio)
   values(me,normalized->>'displayName',(normalized->>'age')::smallint,normalized->>'gender',city,normalized->>'profession',normalized->>'bio')
   on conflict(member_id) do update set display_name=excluded.display_name,age=excluded.age,gender=excluded.gender,city_id=excluded.city_id,
    profession=excluded.profession,bio=excluded.bio;
  insert into marriage.preferences values(me,(normalized->>'preferredMinAge')::smallint,(normalized->>'preferredMaxAge')::smallint,normalized->>'familyPreference')
   on conflict(member_id) do update set min_age=excluded.min_age,max_age=excluded.max_age,family_preference=excluded.family_preference;
  insert into marriage.contacts values(me,normalized->>'contact') on conflict(member_id) do update set contact_value=excluded.contact_value;
  delete from marriage.member_interests where member_id=me;
  insert into marriage.member_interests select me,v from jsonb_array_elements_text(choices) v;
  delete from marriage.member_answers where member_id=me;
  insert into marriage.member_answers select me,key,value from jsonb_each_text(answers);
  insert into marriage.member_assessment values(me,version) on conflict(member_id) do update set version=excluded.version;
  delete from marriage.fit_priorities where member_id=me;
  insert into marriage.fit_priorities select me,v from jsonb_array_elements_text(priorities) v;
  delete from marriage.fit_hard_requirements where member_id=me;
  insert into marriage.fit_hard_requirements select me,v from jsonb_array_elements_text(hard) v;
  update marriage.introductions i set closed_at=now() where closed_at is null and me in(member_a,member_b) and
    (review_change or not marriage.compatible(me,case when member_a=me then member_b else member_a end));
  if not review_change then
    update marriage.member_requests r set status='closed',updated_at=now()
    where r.status='pending' and me in(r.requester_id,r.recipient_id)
    and not marriage.compatible(me,case when r.requester_id=me then r.recipient_id else r.requester_id end);
  end if;
 end if;
 if review_change or old_status<>'approved' then
   update marriage.members set review_status='pending' where id=me;
   insert into marriage.reviews(member_id,action) values(me,'submit');
 end if;
 insert into marriage.consents(member_id,version) values(me,payload->>'consentVersion');
 return marriage.member_state(me);
end $$;

-- Approval requires the acknowledgement for the assessment actually on file.
create or replace function marriage.review_member(target uuid,action text) returns void
language plpgsql security definer set search_path='' as $$
declare m marriage.members; required_version text;
begin
 select * into strict m from marriage.members where id=target for update;
 if action='approve' then
   required_version:=case when exists(select 1 from marriage.member_assessment v
     where v.member_id=target and v.version='marriage-v1') then '2026-11-06-assessment' else '2026-11-05' end;
   if m.review_status<>'pending' or not exists(select 1 from marriage.consents c where c.member_id=target and c.version=required_version) then
     raise exception 'الطلب غير جاهز للمراجعة.' using errcode='22023';
   end if;
   update marriage.members set review_status='approved',suspended=false where id=target;
 elsif action='suspend' then
   update marriage.members set review_status=case when review_status='draft' then 'draft' else 'pending' end,suspended=true where id=target;
   update marriage.introductions set closed_at=now() where closed_at is null and target in(member_a,member_b);
 else raise exception 'قرار المراجعة غير صالح.' using errcode='22023'; end if;
 insert into marriage.reviews(member_id,action) values(target,action);
end $$;

-- A roster is minted once per Riyadh ISO week, independently of subsequent filters,
-- cursors, profile edits, blocking and new signups. A removed slot is never refilled.
create table marriage.weekly_batches (
  member_id uuid not null references marriage.members(id) on delete cascade, week_start date not null,
  primary key(member_id,week_start)
);
create table marriage.weekly_candidates (
  member_id uuid not null, week_start date not null, slot smallint not null check(slot between 1 and 5),
  candidate_id uuid not null references marriage.members(id) on delete cascade,
  primary key(member_id,week_start,slot), unique(member_id,week_start,candidate_id),
  foreign key(member_id,week_start) references marriage.weekly_batches(member_id,week_start) on delete cascade,
  check(member_id<>candidate_id)
);
create index weekly_candidates_peer on marriage.weekly_candidates(candidate_id);
create index weekly_candidates_last_seen on marriage.weekly_candidates(member_id,candidate_id,week_start desc);

create function marriage.current_week() returns date language sql stable set search_path='' as $$
 select date_trunc('week',timezone('Asia/Riyadh',statement_timestamp()))::date
$$;
create function marriage.ranked_week(target uuid,w date)
returns table(candidate_id uuid,slot smallint) language sql stable set search_path='' as $$
 with eligible as materialized (
   select p.member_id from marriage.profiles p where marriage.is_paid(target) and marriage.is_paid(p.member_id)
     and marriage.compatible(target,p.member_id)
     and not exists(select 1 from marriage.member_requests r where least(r.requester_id,r.recipient_id)=least(target,p.member_id)
       and greatest(r.requester_id,r.recipient_id)=greatest(target,p.member_id))
     and not exists(select 1 from marriage.introductions i where i.member_a=least(target,p.member_id) and i.member_b=greatest(target,p.member_id))
 ), top_five as (
   select e.member_id,score.provisional,score.rank_value,score.covered,score.shared,seen.last_week
   from eligible e cross join lateral marriage.pair_fit(target,e.member_id) score
   left join lateral(select max(h.week_start) last_week from marriage.weekly_candidates h
       where h.member_id=target and h.candidate_id=e.member_id and h.week_start<w) seen on true
   order by score.provisional,score.rank_value desc,score.covered desc,score.shared desc,seen.last_week nulls first,e.member_id limit 5
 )
 select member_id,(row_number() over(order by provisional,rank_value desc,covered desc,shared desc,last_week nulls first,member_id))::smallint
 from top_five
$$;
create function marriage.ensure_week(target uuid,w date) returns void language plpgsql volatile set search_path='' as $$
begin
 insert into marriage.weekly_batches(member_id,week_start) values(target,w) on conflict do nothing;
 if found then
   insert into marriage.weekly_candidates(member_id,week_start,slot,candidate_id)
   select target,w,r.slot,r.candidate_id from marriage.ranked_week(target,w) r;
 end if;
end $$;
create function marriage.on_week(target uuid,peer uuid,w date) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from marriage.weekly_candidates s where s.member_id=target and s.week_start=w and s.candidate_id=peer)
$$;
-- Staff can preview reciprocal availability without freezing thousands of members' rosters.
create function marriage.week_preview(target uuid,w date)
returns table(candidate_id uuid,slot smallint) language plpgsql stable set search_path='' as $$
begin
 if exists(select 1 from marriage.weekly_batches batch where batch.member_id=target and batch.week_start=w) then
   return query select s.candidate_id,s.slot from marriage.weekly_candidates s where s.member_id=target and s.week_start=w;
 else
   return query select s.candidate_id,s.slot from marriage.ranked_week(target,w) s;
 end if;
end $$;
create or replace function marriage.operator_candidates(target uuid) returns table(member_id uuid,email text)
language sql stable security definer set search_path='' as $$
 select s.candidate_id,u.email::text from marriage.week_preview(target,marriage.current_week()) s
 join auth.users u on u.id=s.candidate_id
 where marriage.is_paid(target) and marriage.is_paid(s.candidate_id) and marriage.can_offer(target,s.candidate_id)
 and exists(select 1 from marriage.week_preview(s.candidate_id,marriage.current_week()) p where p.candidate_id=target)
 order by s.slot
$$;
create or replace function marriage.discover(min_age integer default null,max_age integer default null,
 interest text default null,after_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); w date:=marriage.current_week();
begin
 if coalesce(min_age,18)<18 or coalesce(max_age,110)>110 or coalesce(min_age,18)>coalesce(max_age,110) then
   raise exception 'تحقق من نطاق العمر.' using errcode='22023';
 end if;
 perform marriage.ensure_week(me,w);
 return (select coalesce(jsonb_agg(marriage.member_card(me,p.member_id) order by s.slot),'[]'::jsonb)
   from marriage.weekly_candidates s join marriage.profiles p on p.member_id=s.candidate_id
   where s.member_id=me and s.week_start=w and p.age between coalesce(min_age,18) and coalesce(max_age,110)
     and marriage.is_paid(s.candidate_id) and marriage.compatible(me,s.candidate_id)
     and (interest is null or exists(select 1 from marriage.member_interests i where i.member_id=s.candidate_id and i.interest_code=interest))
     and not exists(select 1 from marriage.member_requests r where least(r.requester_id,r.recipient_id)=least(me,s.candidate_id)
       and greatest(r.requester_id,r.recipient_id)=greatest(me,s.candidate_id))
     and not exists(select 1 from marriage.introductions i where i.member_a=least(me,s.candidate_id) and i.member_b=greatest(me,s.candidate_id))
     and (after_id is null or s.slot>(select prior.slot from marriage.weekly_candidates prior
       where prior.member_id=me and prior.week_start=w and prior.candidate_id=after_id)));
end $$;
create or replace function public.marriage_discover(min_age integer default null,max_age integer default null,
 interest text default null,after_id uuid default null) returns jsonb language sql volatile security invoker set search_path='' as $$
 select marriage.discover($1,$2,$3,$4)
$$;
create function marriage.guard_week_request() returns trigger language plpgsql security definer set search_path='' as $$
declare w date:=marriage.current_week();
begin
 perform marriage.ensure_week(new.requester_id,w);
 if not marriage.on_week(new.requester_id,new.recipient_id,w) then
   raise exception 'العضو غير متاح ضمن ترشيحات هذا الأسبوع.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger guard_week_request before insert on marriage.member_requests
 for each row execute function marriage.guard_week_request();

create function marriage.guard_week_introduction() returns trigger language plpgsql security definer set search_path='' as $$
declare w date:=marriage.current_week();
begin
 perform marriage.ensure_week(new.member_a,w);
 perform marriage.ensure_week(new.member_b,w);
 if not marriage.on_week(new.member_a,new.member_b,w) or not marriage.on_week(new.member_b,new.member_a,w) then
   raise exception 'ليس الطرفان ضمن ترشيحات هذا الأسبوع المتبادلة.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger guard_week_intro before insert on marriage.introductions
 for each row execute function marriage.guard_week_introduction();

do $security$ declare t text;
begin
 foreach t in array array['assessment_versions','fit_categories','fit_dimensions','member_assessment','fit_hard_requirements',
   'fit_priorities','weekly_batches','weekly_candidates'] loop
   execute format('alter table marriage.%I enable row level security',t);
   execute format('revoke all on marriage.%I from public,anon,authenticated,service_role',t);
 end loop;
end $security$;
revoke all on function marriage.pair_fit(uuid,uuid),marriage.member_card(uuid,uuid),marriage.member_card_base(uuid,uuid),
 marriage.profile_json(uuid),marriage.profile_json_base(uuid),marriage.member_state(uuid),marriage.member_state_base(uuid),
 marriage.current_week(),marriage.ranked_week(uuid,date),marriage.ensure_week(uuid,date),marriage.on_week(uuid,uuid,date),
 marriage.week_preview(uuid,date),marriage.guard_week_request(),marriage.guard_week_introduction()
 from public,anon,authenticated,service_role;

-- Pilot defaults: invitations last a week; at most three mutually accepted chats per member.
-- Different hometowns can work when one member stays and the other can join them.
create function marriage.common_city_possible(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
  select count(*)=2 and coalesce(bool_or(r.option_code in('B','C')),false)
  from marriage.member_answers r where r.member_id in(a,b)
    and r.question_code='residence_plan' and r.option_code in('A','B','C')
$$;
revoke all on function marriage.common_city_possible(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function marriage.compatible(a uuid,b uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(
 select 1 from marriage.members x join marriage.profiles p on p.member_id=x.id join marriage.preferences xp on xp.member_id=x.id
 join marriage.members y on y.id=b join marriage.profiles q on q.member_id=y.id join marriage.preferences yp on yp.member_id=y.id
 where x.id=a and a<>b and x.review_status='approved' and y.review_status='approved'
 and not(x.paused or y.paused or x.suspended or y.suspended) and p.gender<>q.gender
 and not exists(select 1 from marriage.blocks z where (z.member_id=a and z.blocked_id=b) or (z.member_id=b and z.blocked_id=a))
 and (
   exists(select 1 from marriage.member_requests r where least(r.requester_id,r.recipient_id)=least(a,b)
     and greatest(r.requester_id,r.recipient_id)=greatest(a,b) and r.status='accepted')
   or exists(select 1 from marriage.introductions i join marriage.introduction_decisions da on da.introduction_id=i.id and da.member_id=a
     join marriage.introduction_decisions db on db.introduction_id=i.id and db.member_id=b where i.member_a=least(a,b)
     and i.member_b=greatest(a,b) and i.closed_at is null)
   or (p.age between yp.min_age and yp.max_age and q.age between xp.min_age and xp.max_age
     and (p.city_id=q.city_id or marriage.common_city_possible(a,b))
     and not exists (
       select 1 from marriage.fit_hard_requirements h join marriage.fit_dimensions d on d.code=h.dimension
       left join marriage.member_answers want on want.member_id=h.member_id and want.question_code=d.partner_code
       left join marriage.member_answers peer on peer.member_id=case when h.member_id=a then b else a end and peer.question_code=d.code
       where h.member_id in(a,b) and (want.option_code is null or peer.option_code is distinct from want.option_code)
     )
   )
 ))
$$;
create or replace function marriage.match_reasons(a uuid,b uuid) returns jsonb language sql stable set search_path='' as $$
 with f as(select fit from marriage.pair_fit(a,b)), reasons as (
   select d.ordinal as position,d.reason as label from f cross join marriage.fit_dimensions d where (fit->'strengths') ? d.code
   union all select (100+i.position)::smallint,'اهتمام مشترك: '||i.label from marriage.member_interests mine
     join marriage.member_interests peer on peer.member_id=b and peer.interest_code=mine.interest_code
     join marriage.interests i on i.code=mine.interest_code where mine.member_id=a
 )
 select coalesce(jsonb_agg(label order by position),(select jsonb_build_array(
   case when p.age not between y.min_age and y.max_age or q.age not between x.min_age and x.max_age then
     'تتوفر تفاصيل أكثر عند استكمال تفضيلاتكما.'
   when p.city_id=q.city_id then 'تتوافق مدينتكما والفئة العمرية التي اختارها كلٌّ منكما.'
   when marriage.common_city_possible(a,b)
     then 'يتوافق عمركما مع التفضيلات التي اخترتماها، وتتيح اختيارات السكن مدينة مشتركة.'
   else 'تتوفر تفاصيل أكثر عند استكمال تفضيلاتكما.' end)
   from marriage.profiles p join marriage.preferences x on x.member_id=p.member_id
   join marriage.profiles q on q.member_id=b join marriage.preferences y on y.member_id=b
   where p.member_id=a),'[]'::jsonb) from reasons
$$;
-- Both sign-in routes require a provider-confirmed address or phone and a live Auth session.
create or replace function marriage.require_member() returns uuid
language plpgsql stable set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if not exists(select 1 from auth.users u join marriage.members m on m.id=u.id
    join auth.sessions s on s.user_id=u.id
    where u.id=uid and ((nullif(u.email,'') is not null and u.email_confirmed_at is not null)
      or (nullif(u.phone,'') is not null and u.phone_confirmed_at is not null))
      and s.id=(auth.jwt()->>'session_id')::uuid and (s.not_after is null or s.not_after>now())) then
    raise exception 'يلزم تسجيل الدخول بحساب مؤكد.' using errcode='42501';
  end if;
  return uid;
end $$;
create index member_requests_pending_age on marriage.member_requests(created_at) where status='pending';
create function marriage.guard_conversation_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare participant uuid;
begin
  if new.status <> 'accepted' then return new; end if;
  if tg_op='UPDATE' then
    if old.status='accepted' then return new; end if;
    if old.created_at + interval '7 days' <= statement_timestamp() then
      raise exception 'انتهت مهلة هذا الطلب.' using errcode='P0001';
    end if;
  end if;
  perform marriage.lock_member_pair(new.requester_id,new.recipient_id);
  foreach participant in array array[new.requester_id,new.recipient_id] loop
    if (select count(*) from marriage.member_requests r where r.status='accepted'
        and participant in(r.requester_id,r.recipient_id) and r.id<>new.id) >= 3 then
      raise exception 'بلغ أحد الطرفين حد ثلاث محادثات مفتوحة. يمكن إغلاق محادثة قبل قبول طلب جديد.' using errcode='P0001';
    end if;
  end loop;
  return new;
end $$;
create trigger pilot_capacity before insert or update of status on marriage.member_requests
for each row execute function marriage.guard_conversation_capacity();

-- Expiration is enforced at acceptance and on access even when there is no scheduler.
create function marriage.expire_my_requests() returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
  update marriage.member_requests set status='closed',updated_at=statement_timestamp()
  where status='pending' and me in(requester_id,recipient_id) and created_at<=statement_timestamp()-interval '7 days';
end $$;
create or replace function public.marriage_inbox() returns jsonb language plpgsql security invoker set search_path='' as $$
begin perform marriage.expire_my_requests(); return marriage.inbox(); end $$;
create or replace function public.marriage_request(member_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
begin perform marriage.expire_my_requests(); return marriage.request_member($1); end $$;
revoke all on function marriage.guard_conversation_capacity(),marriage.expire_my_requests() from public,anon,authenticated;
grant execute on function marriage.expire_my_requests() to authenticated;

-- Each member can separately agree to the next step. A shared stage is reached only on two agreements.
create table marriage.stage_choices (
  request_id uuid not null references marriage.member_requests(id) on delete cascade,
  stage smallint not null check(stage in(1,2)),
  member_id uuid not null references marriage.members(id) on delete cascade,
  agreed_at timestamptz not null default clock_timestamp(),
  primary key(request_id,stage,member_id)
);
alter table marriage.stage_choices enable row level security;
revoke all on marriage.stage_choices from public,anon,authenticated;
create index stage_choices_member on marriage.stage_choices(member_id);
create function marriage.progress_peer(me uuid,thread_id uuid) returns uuid language plpgsql stable set search_path='' as $$
declare peer uuid;
begin
  select case when r.requester_id=me then r.recipient_id else r.requester_id end into peer
    from marriage.member_requests r where r.id=thread_id and me in(r.requester_id,r.recipient_id) and r.status='accepted';
  if peer is null or not marriage.is_paid(peer) or not marriage.compatible(me,peer) then
    raise exception 'المحادثة غير متاحة.' using errcode='42501';
  end if;
  return peer;
end $$;
create function marriage.progress_view(request_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid:=marriage.progress_peer(me,$1); current_stage integer;
begin
  select coalesce(max(s.stage),0) into current_stage from (
    select c.stage from marriage.stage_choices c where c.request_id=$1 group by c.stage having count(*)=2
  ) s;
  return jsonb_build_object('stage',current_stage,
    'mine',exists(select 1 from marriage.stage_choices c where c.request_id=$1 and c.stage=current_stage+1 and c.member_id=me),
    'peer',exists(select 1 from marriage.stage_choices c where c.request_id=$1 and c.stage=current_stage+1 and c.member_id=peer));
end $$;
create function marriage.set_next_step(request_id uuid,stage_number integer,agree boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid:=marriage.progress_peer(me,$1); current_stage integer; changed integer;
begin
  perform marriage.lock_member_pair(me,peer);
  perform marriage.progress_peer(me,$1);
  current_stage:=(marriage.progress_view($1)->>'stage')::integer;
  if $2 not in(1,2) or $2 is null or $3 is null then raise exception 'الخطوة غير متاحة.' using errcode='22023'; end if;
  if $2<=current_stage and $3 then return marriage.progress_view($1); end if;
  if $2<>current_stage+1 then raise exception 'أكملا الخطوة الحالية أولًا.' using errcode='22023'; end if;
  if $3 then
    insert into marriage.stage_choices values ($1,$2,me,clock_timestamp()) on conflict do nothing;
  else
    delete from marriage.stage_choices c where c.request_id=$1 and c.stage=$2 and c.member_id=me;
  end if;
  get diagnostics changed = row_count;
  if changed>0 then
    begin
      perform realtime.send('{}'::jsonb,'changed','marriage:member:'||me::text,true);
      perform realtime.send('{}'::jsonb,'changed','marriage:member:'||peer::text,true);
    exception when others then
      raise log 'Nisfayn progression notification deferred (SQLSTATE %)',sqlstate;
    end;
  end if;
  return marriage.progress_view($1);
end $$;
create function public.marriage_progress(request_id uuid) returns jsonb language sql stable security invoker set search_path=''
as $$select marriage.progress_view($1)$$;
create function public.marriage_next_step(request_id uuid,stage_number integer,agree boolean) returns jsonb language sql security invoker set search_path=''
as $$select marriage.set_next_step($1,$2,$3)$$;

-- Screen and share only the authenticated member's own contributions.
create function marriage.personal_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
  return jsonb_build_object('exportVersion',1,'exportedAt',statement_timestamp(),
    'account',(select jsonb_build_object('email',nullif(u.email,''),'phone',u.phone,'joinedAt',m.joined_at,'reviewStatus',m.review_status,'paused',m.paused)
       from marriage.members m join auth.users u on u.id=m.id where m.id=me),
    'profile',marriage.profile_json(me),
    'consents',coalesce((select jsonb_agg(jsonb_build_object('version',c.version,'recordedAt',c.recorded_at) order by c.recorded_at)
       from marriage.consents c where c.member_id=me),'[]'),
    'sentMessages',coalesce((select jsonb_agg(jsonb_build_object('sentAt',t.created_at,'body',t.body) order by t.created_at,t.id)
       from marriage.thread_messages t where t.sender_id=me),'[]'),
    'steps',coalesce((select jsonb_agg(jsonb_build_object('stage',s.stage,'agreedAt',s.agreed_at) order by s.agreed_at)
       from marriage.stage_choices s where s.member_id=me),'[]'));
end $$;
create function public.marriage_personal_data() returns jsonb language sql stable security invoker set search_path=''
as $$select marriage.personal_data()$$;
revoke all on function marriage.progress_peer(uuid,uuid),marriage.progress_view(uuid),marriage.set_next_step(uuid,integer,boolean),
 public.marriage_progress(uuid),public.marriage_next_step(uuid,integer,boolean),marriage.personal_data(),public.marriage_personal_data()
 from public,anon,authenticated;
grant execute on function marriage.progress_view(uuid),marriage.set_next_step(uuid,integer,boolean),
 public.marriage_progress(uuid),public.marriage_next_step(uuid,integer,boolean),marriage.personal_data(),public.marriage_personal_data() to authenticated;

-- Only daily aggregate counters are stored. No member keys, profile answers, messages or report text enter analytics.
create table marriage.pilot_counts (
  day date not null, event text not null, total bigint not null default 1, primary key(day,event)
);
alter table marriage.pilot_counts enable row level security;
revoke all on marriage.pilot_counts from public,anon,authenticated;
create function marriage.pilot_event() returns trigger language plpgsql security definer set search_path='' as $$
declare label text;
begin
  case tg_argv[0]
    when 'request' then
      if tg_op='INSERT' then label:='introduction_requested';
      elsif new.status='accepted' and old.status='pending' then label:='introduction_accepted';
      elsif old.status='accepted' and new.status<>old.status then label:='match_closed'; end if;
    when 'message' then
      if not exists(select 1 from marriage.thread_messages t where t.request_id=new.request_id and t.id<>new.id)
        then label:='first_message_sent'; end if;
    when 'step' then
      if (select count(*) from marriage.stage_choices c where c.request_id=new.request_id and c.stage=new.stage)=2
        then label:=case new.stage when 1 then 'serious_discussion_agreed' else 'formal_step_agreed' end; end if;
    when 'report' then label:='report_submitted';
    when 'block' then label:='user_blocked';
    when 'signup' then label:='signup_completed';
  end case;
  if label is not null then insert into marriage.pilot_counts(day,event) values((now() at time zone 'Asia/Riyadh')::date,label)
    on conflict(day,event) do update set total=marriage.pilot_counts.total+1; end if;
  return new;
end $$;
revoke all on function marriage.pilot_event() from public,anon,authenticated;
create trigger pilot_requests after insert or update of status on marriage.member_requests for each row execute function marriage.pilot_event('request');
create trigger pilot_messages after insert on marriage.thread_messages for each row execute function marriage.pilot_event('message');
create trigger pilot_steps after insert on marriage.stage_choices for each row execute function marriage.pilot_event('step');
create trigger pilot_reports after insert on marriage.reports for each row execute function marriage.pilot_event('report');
create trigger pilot_blocks after insert on marriage.blocks for each row execute function marriage.pilot_event('block');
create trigger pilot_signup after insert on marriage.members for each row execute function marriage.pilot_event('signup');
create function marriage.pilot_totals() returns table(day date,event text,total bigint)
language sql stable security definer set search_path='' as $$
  select p.day,p.event,p.total from marriage.pilot_counts p where p.day >= (now() at time zone 'Asia/Riyadh')::date-29 order by p.day,p.event
$$;
create function public.marriage_pilot_totals() returns table(day date,event text,total bigint)
language sql stable security invoker set search_path='' as $$select * from marriage.pilot_totals()$$;
revoke all on function marriage.pilot_totals(),public.marriage_pilot_totals() from public,anon,authenticated;
grant execute on function marriage.pilot_totals(),public.marriage_pilot_totals() to service_role;

-- Keep the cohort as it looked when a candidate was returned to a member. Later
-- profile edits must not change the model version or band attributed to that offer.
create table marriage.fit_observations (
  viewer_id uuid not null references marriage.members(id) on delete cascade,
  candidate_id uuid not null references marriage.members(id) on delete cascade,
  offer_week date not null,
  model_version text not null,
  fit_band text not null check(fit_band in('insufficient','strong','mixed','explore')),
  returned_at timestamptz not null default clock_timestamp(),
  opened_at timestamptz,
  request_id uuid unique references marriage.member_requests(id) on delete cascade,
  accepted_at timestamptz,
  formal_at timestamptz,
  primary key(viewer_id,offer_week,candidate_id),
  check(viewer_id<>candidate_id)
);
create index fit_observations_candidate on marriage.fit_observations(candidate_id);
create index fit_observations_cohort on marriage.fit_observations(offer_week,model_version,fit_band);
alter table marriage.fit_observations enable row level security;
revoke all on marriage.fit_observations from public,anon,authenticated,service_role;

create function marriage.present_week(min_age integer,max_age integer,interest text,after_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); cards jsonb;
begin
  cards:=marriage.discover($1,$2,$3,$4);
  insert into marriage.fit_observations(viewer_id,candidate_id,offer_week,model_version,fit_band)
    select me,(c->>'id')::uuid,marriage.current_week(),c#>>'{fit,version}',c#>>'{fit,band}'
    from jsonb_array_elements(cards) c
    on conflict(viewer_id,offer_week,candidate_id) do nothing;
  return cards;
end $$;
create or replace function public.marriage_discover(min_age integer default null,max_age integer default null,
 interest text default null,after_id uuid default null) returns jsonb language sql volatile security invoker set search_path=''
 as $$ select marriage.present_week($1,$2,$3,$4) $$;

create function marriage.note_profile_open(candidate_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();
begin
  update marriage.fit_observations o set opened_at=clock_timestamp()
    where o.viewer_id=me and o.offer_week=marriage.current_week() and o.candidate_id=$1 and o.opened_at is null;
end $$;
create function public.marriage_note_profile_open(candidate_id uuid) returns void
language sql security invoker set search_path='' as $$ select marriage.note_profile_open($1) $$;
revoke all on function marriage.present_week(integer,integer,text,uuid),marriage.note_profile_open(uuid),
 public.marriage_note_profile_open(uuid) from public,anon,authenticated;
grant execute on function marriage.present_week(integer,integer,text,uuid),marriage.note_profile_open(uuid),
 public.marriage_note_profile_open(uuid) to authenticated;

create function marriage.attribute_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    update marriage.fit_observations o set request_id=new.id
      where o.viewer_id=new.requester_id and o.candidate_id=new.recipient_id and o.offer_week=marriage.current_week();
  elsif old.status='pending' and new.status='accepted' then
    update marriage.fit_observations set accepted_at=clock_timestamp() where request_id=new.id;
  end if;
  return new;
end $$;
create trigger pilot_attribute_request after insert or update of status on marriage.member_requests
 for each row execute function marriage.attribute_request();
create function marriage.attribute_formal_step() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.stage=2 and (select count(*) from marriage.stage_choices c where c.request_id=new.request_id and c.stage=2)=2 then
    update marriage.fit_observations set formal_at=coalesce(formal_at,clock_timestamp()) where request_id=new.request_id;
  end if;
  return new;
end $$;
create trigger pilot_attribute_formal after insert on marriage.stage_choices for each row execute function marriage.attribute_formal_step();
revoke all on function marriage.attribute_request(),marriage.attribute_formal_step() from public,anon,authenticated;

create function marriage.fit_cohorts() returns table(offer_week date,version text,band text,returned bigint,opened bigint,
 requested bigint,accepted bigint,formal bigint) language sql stable security definer set search_path='' as $$
  select o.offer_week,o.model_version,o.fit_band,count(*),count(o.opened_at),count(o.request_id),count(o.accepted_at),count(o.formal_at)
    from marriage.fit_observations o where o.offer_week>=marriage.current_week()-84
    group by o.offer_week,o.model_version,o.fit_band order by o.offer_week,o.model_version,o.fit_band
$$;
create function public.marriage_fit_cohorts() returns table(offer_week date,version text,band text,returned bigint,opened bigint,
 requested bigint,accepted bigint,formal bigint) language sql stable security invoker set search_path='' as $$select * from marriage.fit_cohorts()$$;
revoke all on function marriage.fit_cohorts(),public.marriage_fit_cohorts() from public,anon,authenticated;
grant execute on function marriage.fit_cohorts(),public.marriage_fit_cohorts() to service_role;
