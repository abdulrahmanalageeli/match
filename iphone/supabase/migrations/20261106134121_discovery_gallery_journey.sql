-- Nisfayn only. Additive assessment, directory, mutual rewind and public profile gallery.
insert into marriage.assessment_versions values ('marriage-v2', $catalog${
  "version": "marriage-v2",
  "categories": [
    {
      "id": "values",
      "label": "قيم البيت ومسؤولياته",
      "weight": 25
    },
    {
      "id": "plans",
      "label": "الأطفال والسكن",
      "weight": 25
    },
    {
      "id": "lifestyle",
      "label": "إيقاع الحياة",
      "weight": 20
    },
    {
      "id": "communication",
      "label": "الحوار والاختلاف",
      "weight": 15
    },
    {
      "id": "personality",
      "label": "أسلوب التعارف",
      "weight": 10
    },
    {
      "id": "timing",
      "label": "توقيت الزواج",
      "weight": 5
    }
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
        {
          "code": "A",
          "self": "أرغب في الإنجاب",
          "partner": "يرغب في الإنجاب"
        },
        {
          "code": "B",
          "self": "لا أرغب في الإنجاب",
          "partner": "لا يرغب في الإنجاب"
        },
        {
          "code": "C",
          "self": "لم أحسم قراري بعد",
          "partner": "لم يحسم قراره بعد"
        }
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
        {
          "code": "A",
          "self": "أرغب في البقاء في مدينتي",
          "partner": "يرغب في البقاء في مدينته"
        },
        {
          "code": "B",
          "self": "يمكنني الانتقال إلى مدينة الشريك",
          "partner": "يمكنه الانتقال إلى مدينتي"
        },
        {
          "code": "C",
          "self": "يمكنني الانتقال إلى مدينة نتفق عليها",
          "partner": "يمكنه الانتقال إلى مدينة نتفق عليها"
        }
      ]
    },
    {
      "id": "wife_work",
      "partnerId": "partner_wife_work",
      "category": "plans",
      "title": "عمل الزوجة وطموحها",
      "selfPrompt": "ما موقفك من عمل الزوجة بعد الزواج؟",
      "partnerPrompt": "ما الموقف الذي تتمنى أن يشاركك فيه الطرف الآخر؟",
      "reason": "يتوافق موقفكما من عمل الزوجة بعد الزواج.",
      "discussion": "كيف تتصوران العمل والطموح المهني بعد الزواج، وما الذي يهم كل طرف؟",
      "hardAllowed": true,
      "options": [
        {
          "code": "A",
          "self": "أفضّل أن تعمل الزوجة",
          "partner": "يفضّل أن تعمل الزوجة"
        },
        {
          "code": "B",
          "self": "أفضّل ألّا تعمل الزوجة",
          "partner": "يفضّل ألّا تعمل الزوجة"
        },
        {
          "code": "C",
          "self": "مرن حسب ظروفنا واتفاقنا",
          "partner": "مرن حسب الظروف والاتفاق"
        }
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
        {
          "code": "A",
          "self": "خلال ستة أشهر",
          "partner": "خلال ستة أشهر"
        },
        {
          "code": "B",
          "self": "بعد ستة أشهر إلى سنة",
          "partner": "بعد ستة أشهر إلى سنة"
        },
        {
          "code": "C",
          "self": "بعد أكثر من سنة",
          "partner": "بعد أكثر من سنة"
        },
        {
          "code": "D",
          "self": "لم أحدد وقتًا بعد",
          "partner": "لم يحدد وقتًا بعد"
        }
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
        {
          "code": "A",
          "self": "أفضل أن نتشاور معًا أولًا",
          "partner": "نتشاور معًا أولًا"
        },
        {
          "code": "B",
          "self": "أستفيد من رأي الأهل من البداية",
          "partner": "يستفيد من رأي الأهل من البداية"
        },
        {
          "code": "C",
          "self": "أستشير الأهل عند الحاجة إلى خبرتهم",
          "partner": "يستشير الأهل عند الحاجة إلى خبرتهم"
        }
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
        {
          "code": "A",
          "self": "أضع ميزانية شهرية مفصّلة",
          "partner": "ميزانية شهرية مفصّلة"
        },
        {
          "code": "B",
          "self": "أحدّد سقفًا للمصاريف وأترك مساحة للتغيير",
          "partner": "سقف للمصاريف مع مساحة للتغيير"
        },
        {
          "code": "C",
          "self": "أناقش المصاريف الكبيرة وقت الحاجة",
          "partner": "مناقشة المصاريف الكبيرة وقت الحاجة"
        }
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
        {
          "code": "A",
          "self": "نتفق على مسؤوليات ثابتة",
          "partner": "الاتفاق على مسؤوليات ثابتة"
        },
        {
          "code": "B",
          "self": "نتبادل الأدوار بحسب وقت كل منا",
          "partner": "تبادل الأدوار بحسب الوقت المتاح"
        },
        {
          "code": "C",
          "self": "نتفق على خطة جديدة في بداية كل أسبوع",
          "partner": "تجديد الخطة في بداية كل أسبوع"
        }
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
        {
          "code": "A",
          "self": "أرتّب الوقت والمكان والتفاصيل مسبقًا",
          "partner": "يرتّب الوقت والمكان والتفاصيل مسبقًا"
        },
        {
          "code": "B",
          "self": "أحدّد الأساسيات وأترك التفاصيل لوقتها",
          "partner": "يحدّد الأساسيات ويترك التفاصيل لوقتها"
        },
        {
          "code": "C",
          "self": "أفضّل أن نقرّر في اليوم نفسه",
          "partner": "يفضّل القرار في اليوم نفسه"
        }
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
        {
          "code": "A",
          "self": "أرتاح في البيت معظم الوقت",
          "partner": "يرتاح في البيت معظم الوقت"
        },
        {
          "code": "B",
          "self": "أوازن بين زيارة ووقت هادئ",
          "partner": "يوازن بين الزيارات والهدوء"
        },
        {
          "code": "C",
          "self": "أستمتع بعدة لقاءات وزيارات",
          "partner": "يستمتع بعدة لقاءات وزيارات"
        }
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
        {
          "code": "A",
          "self": "أتفاعل عندما يبدأ الآخر",
          "partner": "يتفاعل عندما أبدأ"
        },
        {
          "code": "B",
          "self": "نتبادل المبادرة",
          "partner": "نتبادل المبادرة"
        },
        {
          "code": "C",
          "self": "أبادر بفتح الحديث",
          "partner": "يبادر بفتح الحديث"
        },
        {
          "code": "D",
          "self": "أبادر إذا طال الصمت",
          "partner": "يبادر إذا طال الصمت"
        }
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
        {
          "code": "A",
          "self": "مناقشة الحجج",
          "partner": "مناقشة الحجج"
        },
        {
          "code": "B",
          "self": "فهم أسباب الاختلاف",
          "partner": "فهم أسباب الاختلاف"
        },
        {
          "code": "C",
          "self": "تلطيف الأجواء بالمزاح",
          "partner": "تلطيف الأجواء بالمزاح"
        },
        {
          "code": "D",
          "self": "الانتقال إلى أرضية مشتركة",
          "partner": "الانتقال إلى أرضية مشتركة"
        }
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
        {
          "code": "A",
          "self": "أتحدث عمّا حدث في حينه",
          "partner": "يتحدث عمّا حدث في حينه"
        },
        {
          "code": "B",
          "self": "أطلب مهلة وأحدد وقتًا للعودة",
          "partner": "يطلب مهلة ويحدد وقتًا للعودة"
        },
        {
          "code": "C",
          "self": "أبدأ بلفتة لطيفة ثم أتحدث عمّا حدث",
          "partner": "يبدأ بلفتة لطيفة ثم يتحدث عمّا حدث"
        }
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
        {
          "code": "A",
          "self": "أتعمّق في فكرة واحدة من عدة زوايا",
          "partner": "يتعمّق في فكرة واحدة من عدة زوايا"
        },
        {
          "code": "B",
          "self": "أنتقل بين قصص وتجارب من الحياة",
          "partner": "ينتقل بين قصص وتجارب من الحياة"
        }
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
        {
          "code": "A",
          "self": "أشارك تفاصيل أكثر بالتدريج",
          "partner": "يشارك تفاصيل أكثر بالتدريج"
        },
        {
          "code": "B",
          "self": "أرتاح للتعبير الواضح عن الاهتمام",
          "partner": "يعبّر عن اهتمامه بوضوح"
        },
        {
          "code": "C",
          "self": "أحتاج إلى مساحة خاصة حتى مع القرب",
          "partner": "يحتاج إلى مساحة خاصة حتى مع القرب"
        }
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
        {
          "code": "A",
          "self": "أسأل عن الدوافع والمعاني",
          "partner": "يسأل عن الدوافع والمعاني"
        },
        {
          "code": "B",
          "self": "أشارك قصة تفتح باب الأسئلة",
          "partner": "يشارك قصة تفتح باب الأسئلة"
        },
        {
          "code": "C",
          "self": "أبدأ بتعليق خفيف أو مزحة",
          "partner": "يبدأ بتعليق خفيف أو مزحة"
        }
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
        {
          "code": "A",
          "self": "أبدأ بالمواضيع العامة",
          "partner": "يبدأ بالمواضيع العامة"
        },
        {
          "code": "B",
          "self": "أشارك رأيًا أو تجربة خفيفة",
          "partner": "يشارك رأيًا أو تجربة خفيفة"
        },
        {
          "code": "C",
          "self": "أشارك تفاصيل شخصية إذا ارتحت",
          "partner": "يشارك تفاصيل شخصية إذا ارتاح"
        }
      ]
    }
  ]
}
$catalog$::jsonb);
do $seed$ declare d jsonb; o record; begin
 select value into d from marriage.assessment_versions v,jsonb_array_elements(v.catalog->'dimensions') where v.id='marriage-v2' and value->>'id'='wife_work';
 insert into marriage.questions values ('wife_work',d->>'selfPrompt',100),('partner_wife_work',d->>'partnerPrompt',101);
 for o in select value,n from jsonb_array_elements(d->'options') with ordinality t(value,n) loop
 insert into marriage.question_options values ('wife_work',o.value->>'code',o.value->>'self',o.n),('partner_wife_work',o.value->>'code',o.value->>'partner',o.n);
 end loop;
 insert into marriage.fit_dimensions values ('wife_work','partner_wife_work','plans',16,true,d->>'reason');
end $seed$;
-- Retain old versions on edits, accept the new questionnaire without changing prior answers.
do $upgrade$ declare def text; begin
 def:=pg_get_functiondef('marriage.apply_profile(jsonb)'::regprocedure);
 def:=replace(def,$q$payload->>'assessmentVersion'='marriage-v1'$q$,$q$payload->>'assessmentVersion' in('marriage-v1','marriage-v2')$q$);
 def:=replace(def,$q$version not in('legacy-v0','marriage-v1')$q$,$q$version not in('legacy-v0','marriage-v1','marriage-v2')$q$); execute def;
 def:=pg_get_functiondef('marriage.pair_fit(uuid,uuid)'::regprocedure);
 def:=replace(def,$q$version='marriage-v1'$q$,$q$version in('marriage-v1','marriage-v2')$q$);
 def:=replace(def,$q$'version','marriage-v1'$q$,$q$'version','marriage-v2'$q$); execute def;
 def:=pg_get_functiondef('marriage.catalog()'::regprocedure);execute replace(def,$q$id='marriage-v1'$q$,$q$id='marriage-v2'$q$);
 def:=pg_get_functiondef('marriage.review_member(uuid,text)'::regprocedure);execute replace(def,$q$v.version='marriage-v1'$q$,$q$v.version in('marriage-v1','marriage-v2')$q$);
end $upgrade$;

create function marriage.active_connections(target uuid) returns integer language sql stable set search_path='' as $$
 select (select count(*) from marriage.member_requests where status='accepted' and target in(requester_id,recipient_id))::int+
 (select count(*) from marriage.introductions i where target in(i.member_a,i.member_b) and i.closed_at is null
 and (select count(*) from marriage.introduction_decisions d where d.introduction_id=i.id)=2)::int
$$;
revoke all on function marriage.active_connections(uuid) from public,anon,authenticated;
create or replace function marriage.guard_conversation_capacity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'accepted' then return new; end if;
 if tg_op='UPDATE' then
  if old.status='accepted' then return new; end if;
  if old.created_at+interval '7 days'<=statement_timestamp() then raise exception 'انتهت مهلة هذا الطلب.'; end if;
 end if;
 perform marriage.lock_member_pair(new.requester_id,new.recipient_id);
 if marriage.active_connections(new.requester_id)>=2 or marriage.active_connections(new.recipient_id)>=2 then
 raise exception 'الحد الأقصى تعارفان متزامنان. أنهِ تعارفًا قبل قبول طلب جديد.'; end if;
 return new;
end $$;
create function marriage.guard_curated_capacity() returns trigger language plpgsql security definer set search_path='' as $$
declare i marriage.introductions; begin
 select * into i from marriage.introductions where id=new.introduction_id;
 perform marriage.lock_member_pair(i.member_a,i.member_b);
 if not exists(select 1 from marriage.introduction_decisions where introduction_id=i.id and member_id=new.member_id)
 and exists(select 1 from marriage.introduction_decisions where introduction_id=i.id and member_id<>new.member_id)
 and (marriage.active_connections(i.member_a)>=2 or marriage.active_connections(i.member_b)>=2) then
 raise exception 'الحد الأقصى تعارفان متزامنان.'; end if; return new;
end $$;
revoke all on function marriage.guard_curated_capacity() from public,anon,authenticated;
create trigger curated_capacity before insert on marriage.introduction_decisions for each row execute function marriage.guard_curated_capacity();
-- Requests can originate from either surface; eligibility remains mutual and private.
create or replace function marriage.guard_week_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not marriage.compatible(new.requester_id,new.recipient_id) or not marriage.is_paid(new.requester_id) or not marriage.is_paid(new.recipient_id)
 or exists(select 1 from marriage.exclusive_members where member_id in(new.requester_id,new.recipient_id)) then raise exception 'هذا العضو غير متاح للتعارف.'; end if;
 if marriage.active_connections(new.requester_id)>=2 or marriage.active_connections(new.recipient_id)>=2 then raise exception 'الحد الأقصى تعارفان متزامنان. يمكنك العودة لاحقًا.'; end if;
 return new;
end $$;

alter function marriage.member_card(uuid,uuid) rename to member_card_before_directory;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_before_directory(viewer,subject)||jsonb_build_object('atCapacity',marriage.active_connections(subject)>=2,
 'viewerAtCapacity',marriage.active_connections(viewer)>=2,
 'connectionId',(select id from marriage.member_requests where viewer in(requester_id,recipient_id) and subject in(requester_id,recipient_id) and status in('pending','accepted')),
 'connectionStatus',(select status from marriage.member_requests where viewer in(requester_id,recipient_id) and subject in(requester_id,recipient_id) and status in('pending','accepted')))
$$;
revoke all on function marriage.member_card(uuid,uuid),marriage.member_card_before_directory(uuid,uuid) from public,anon,authenticated;

create function marriage.browse(options jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); skip integer:=coalesce((options->>'offset')::integer,0); begin
 if skip<0 or skip>100000 or coalesce((options->>'minAge')::int,18)<18 or coalesce((options->>'maxAge')::int,110)>110 then raise exception 'تحقق من خيارات التصفية.'; end if;
 if exists(select 1 from marriage.exclusive_members where member_id=me) then return '[]'; end if;
 return (with eligible as materialized (
  select p.member_id,p.age, f.fit, f.rank_value from marriage.profiles p
  join marriage.cities c on c.id=p.city_id left join marriage.member_basics b on b.member_id=p.member_id
  cross join lateral marriage.pair_fit(me,p.member_id) f
  where p.member_id<>me and marriage.is_paid(p.member_id) and marriage.compatible(me,p.member_id)
   and not exists(select 1 from marriage.exclusive_members where member_id=p.member_id)
   and p.age between coalesce((options->>'minAge')::int,18) and coalesce((options->>'maxAge')::int,110)
   and (coalesce(options->>'city','')='' or c.label ilike '%'||left(options->>'city',80)||'%')
   and (coalesce(options->>'search','')='' or p.display_name ilike '%'||left(options->>'search',80)||'%' or p.profession ilike '%'||left(options->>'search',80)||'%')
   and (coalesce(options->>'interest','')='' or exists(select 1 from marriage.member_interests where member_id=p.member_id and interest_code=options->>'interest'))
   and (coalesce(options->>'maritalStatus','')='' or b.marital_status=options->>'maritalStatus')
   and (coalesce(options->>'smoking','')='' or b.smoking=options->>'smoking')
   and (coalesce(options->>'dressStyle','')='' or marriage.basics_json(p.member_id)->>'dressStyle'=options->>'dressStyle')
   and (coalesce(options->>'work','')='' or exists(select 1 from marriage.member_answers where member_id=p.member_id and question_code='wife_work' and option_code=options->>'work'))
   and (coalesce((options->>'availableOnly')::boolean,false)=false or marriage.active_connections(p.member_id)<2)
   and (coalesce((options->>'minFit')::int,0)=0 or (f.fit->>'percentage')::int >= (options->>'minFit')::int)
   and not exists(select 1 from marriage.member_requests r where me in(r.requester_id,r.recipient_id) and p.member_id in(r.requester_id,r.recipient_id) and r.status in('closed','cancelled','declined'))
   and not exists(select 1 from marriage.introductions i where i.member_a=least(me,p.member_id) and i.member_b=greatest(me,p.member_id))
 ), page as (select * from eligible order by
 case when options->>'sort'='youngest' then age end asc,
 case when options->>'sort'='oldest' then age end desc,
 rank_value desc,member_id limit 24 offset skip)
 select coalesce(jsonb_agg(marriage.member_card(me,member_id) order by
 case when options->>'sort'='youngest' then age end asc,case when options->>'sort'='oldest' then age end desc,rank_value desc,member_id),'[]') from page);
end $$;
create function public.marriage_browse(options jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select marriage.browse($1)$$;
revoke all on function marriage.browse(jsonb),public.marriage_browse(jsonb) from public,anon;
grant execute on function marriage.browse(jsonb),public.marriage_browse(jsonb) to authenticated;
-- Directory profile visits use the same compatibility and privacy gate, not weekly membership.
do $$ declare def text; begin
def:=pg_get_functiondef('marriage.note_profile_open(uuid)'::regprocedure);
def:=regexp_replace(def,' if not exists\(select 1 from marriage.fit_observations[\s\S]*?then return; end if;','');execute def;
end $$;

create table marriage.journey_rewinds(request_id uuid primary key references marriage.member_requests(id) on delete cascade,
 stage integer not null check(stage in(1,2)), proposer uuid references marriage.members(id), changed_at timestamptz not null default now());
alter table marriage.journey_rewinds enable row level security;
revoke all on marriage.journey_rewinds from public,anon,authenticated;
alter function marriage.progress_view(uuid) rename to progress_before_rewind;
create function marriage.progress_view(request_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); p jsonb; r marriage.journey_rewinds; begin
 p:=marriage.progress_before_rewind($1);select * into r from marriage.journey_rewinds where journey_rewinds.request_id=$1;
 return p||jsonb_build_object('rewindMine',coalesce(r.proposer=me,false),'rewindPeer',coalesce(r.proposer<>me,false))||
 case when r.changed_at is not null then jsonb_build_object('updatedAt',greatest(r.changed_at,(p->>'updatedAt')::timestamptz)) else '{}'::jsonb end;
end $$;
create function marriage.rewind_step(request_id uuid,expected_stage integer,agree boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid:=marriage.progress_peer(me,$1); p jsonb; r marriage.journey_rewinds; begin
 perform marriage.lock_member_pair(me,peer);perform marriage.progress_peer(me,$1);p:=marriage.progress_view($1);
 if expected_stage is null or agree is null or expected_stage not in(1,2) or (p->>'stage')::int<>expected_stage then raise exception 'تغيّرت المرحلة. حدّث المسار وحاول مجددًا.'; end if;
 select * into r from marriage.journey_rewinds where journey_rewinds.request_id=$1;
 if not agree then
  update marriage.journey_rewinds set proposer=null,changed_at=clock_timestamp() where journey_rewinds.request_id=$1;
 elsif r.proposer=peer and r.stage=expected_stage then
  delete from marriage.stage_choices where stage_choices.request_id=$1 and stage>=expected_stage;
  if expected_stage=1 then delete from marriage.exclusive_members where exclusive_members.request_id=$1;delete from marriage.exclusive_consents where exclusive_consents.request_id=$1;end if;
  update marriage.journey_rewinds set proposer=null,changed_at=clock_timestamp() where journey_rewinds.request_id=$1;
 else
  delete from marriage.stage_choices where stage_choices.request_id=$1 and stage>expected_stage;
  insert into marriage.journey_rewinds values($1,expected_stage,me,clock_timestamp()) on conflict on constraint journey_rewinds_pkey do update set stage=excluded.stage,proposer=excluded.proposer,changed_at=excluded.changed_at;
 end if;
 perform realtime.send('{}','changed','marriage:member:'||me::text,true);perform realtime.send('{}','changed','marriage:member:'||peer::text,true);
 return marriage.progress_view($1);
end $$;
create function public.marriage_rewind_step(request_id uuid,expected_stage integer,agree boolean) returns jsonb language sql security invoker set search_path='' as $$select marriage.rewind_step($1,$2,$3)$$;
revoke all on function marriage.progress_before_rewind(uuid),marriage.progress_view(uuid),marriage.rewind_step(uuid,integer,boolean),public.marriage_rewind_step(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function marriage.progress_view(uuid),marriage.rewind_step(uuid,integer,boolean),public.marriage_rewind_step(uuid,integer,boolean) to authenticated;
-- A forward action invalidates any pending rewind, under the same pair lock.
alter function marriage.set_next_step(uuid,integer,boolean,boolean) rename to next_step_before_rewind;
create function marriage.set_next_step(request_id uuid,stage_number integer,agree boolean,exclusive_consent boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid:=marriage.progress_peer(me,$1);begin
 perform marriage.lock_member_pair(me,peer);
 update marriage.journey_rewinds set proposer=null,changed_at=clock_timestamp() where journey_rewinds.request_id=$1 and proposer is not null;
 return marriage.next_step_before_rewind($1,$2,$3,$4);
end $$;
revoke all on function marriage.next_step_before_rewind(uuid,integer,boolean,boolean),marriage.set_next_step(uuid,integer,boolean,boolean) from public,anon,authenticated;
grant execute on function marriage.set_next_step(uuid,integer,boolean,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('nisfayn-profile-gallery','nisfayn-profile-gallery',false,3145728,array['image/jpeg']);
create table marriage.profile_gallery(id uuid primary key default gen_random_uuid(),member_id uuid not null references marriage.members(id) on delete cascade,
 path text not null unique,ready boolean not null default false,created_at timestamptz not null default now());
create index profile_gallery_owner on marriage.profile_gallery(member_id);
alter table marriage.profile_gallery enable row level security;
revoke all on marriage.profile_gallery from public,anon,authenticated;
create function marriage.gallery_access(target uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 if me=target then return true;end if;
 perform marriage.require_discovery_member();return marriage.is_paid(target) and marriage.compatible(me,target);
end $$;
create function marriage.gallery_storage(object_name text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();p marriage.profile_gallery; begin
 select * into p from marriage.profile_gallery where path=object_name;
 return p.id is not null and case when writing then p.member_id=me and not p.ready and p.created_at>now()-interval '15 minutes'
 else p.member_id=me or p.ready and marriage.gallery_access(p.member_id) end;
end $$;
create policy gallery_upload on storage.objects for insert to authenticated with check(bucket_id='nisfayn-profile-gallery' and storage.allow_only_operation('object.upload') and marriage.gallery_storage(name,true));
create policy gallery_download on storage.objects for select to authenticated using(bucket_id='nisfayn-profile-gallery' and (
 storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info']) and marriage.gallery_storage(name,false)
 or storage.allow_any_operation(array['object.delete','object.delete_many']) and split_part(name,'/',1)=auth.uid()::text));
create policy gallery_delete on storage.objects for delete to authenticated using(bucket_id='nisfayn-profile-gallery' and storage.allow_any_operation(array['object.delete','object.delete_many']) and split_part(name,'/',1)=auth.uid()::text);
create function marriage.gallery(action text,photo_id uuid default null,subject uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); target uuid:=coalesce(subject,me); pid uuid:=gen_random_uuid();p marriage.profile_gallery;begin
 if action='list' then
  if not marriage.gallery_access(target) then raise exception 'الصور غير متاحة.' using errcode='42501';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'path',path) order by created_at,id) from marriage.profile_gallery where member_id=target and ready),'[]');
 end if;
 if target<>me then raise exception 'لا يمكنك تعديل صور عضو آخر.' using errcode='42501';end if;
 perform 1 from marriage.members where id=me for update;
 if action='prepare' then
  if (select count(*) from marriage.profile_gallery where member_id=me and (ready or created_at>now()-interval '15 minutes'))>=3 then raise exception 'يمكنك إضافة ثلاث صور فقط.';end if;
  insert into marriage.profile_gallery(id,member_id,path) values(pid,me,me::text||'/'||pid::text||'.jpg') returning * into p;
 elsif action='commit' then
  select * into p from marriage.profile_gallery where id=photo_id and member_id=me;
  if p.id is null or (not p.ready and p.created_at<=now()-interval '15 minutes') then raise exception 'انتهت مهلة رفع الصورة.';end if;
  if not exists(select 1 from storage.objects where bucket_id='nisfayn-profile-gallery' and name=p.path and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 3145728) then raise exception 'لم يكتمل رفع الصورة.';end if;
  update marriage.profile_gallery set ready=true where id=p.id;
 elsif action='remove' then delete from marriage.profile_gallery where id=photo_id and member_id=me returning * into p;
 else raise exception 'إجراء غير متاح.';end if;
 return jsonb_build_object('id',p.id,'path',p.path);
end $$;
create function public.marriage_gallery(action text,photo_id uuid default null,subject uuid default null) returns jsonb language sql security invoker set search_path='' as $$select marriage.gallery($1,$2,$3)$$;
revoke all on function marriage.gallery_access(uuid),marriage.gallery_storage(text,boolean),marriage.gallery(text,uuid,uuid),public.marriage_gallery(text,uuid,uuid) from public,anon,authenticated;
grant execute on function marriage.gallery_storage(text,boolean),marriage.gallery(text,uuid,uuid),public.marriage_gallery(text,uuid,uuid) to authenticated;

-- Private pair testing: images stay in private Storage and never in the public profile payload.
create table nisfayn_test.profile_gallery(id uuid primary key default gen_random_uuid(),actor text not null check(actor in('reham','abdulrahman')),
 path text not null unique,ready boolean not null default false,created_at timestamptz not null default now());
create index test_gallery_actor on nisfayn_test.profile_gallery(actor);
alter table nisfayn_test.profile_gallery enable row level security;
revoke all on nisfayn_test.profile_gallery from public,anon,authenticated,service_role;
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_directory;
revoke all on function nisfayn_test.rpc_before_directory(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;peer text;d jsonb;p nisfayn_test.profile_gallery;pid uuid:=gen_random_uuid();target text;stage int;begin
 if action not in('rewind','step','close','reset','gallery_list','gallery_prepare','gallery_commit','gallery_remove','gallery_url') then return nisfayn_test.rpc_before_directory(action,session_token,payload);end if;
 select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if who is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501';end if;
 peer:=case when who='reham' then 'abdulrahman' else 'reham' end;
 select data into d from nisfayn_test.room where id for update;
 if action in('step','close','reset') then
  update nisfayn_test.room set data=data-'rewind' where id;
  return nisfayn_test.rpc_before_directory(action,session_token,payload);
 elsif action='rewind' then
  stage:=(payload->>'stage')::int;
  if d->'matched' is distinct from 'true'::jsonb or stage is null or stage not in(1,2) or stage<>(d->>'stage')::int or payload->>'agree' not in('true','false') then raise exception 'تغيّرت المرحلة. حدّث المسار وحاول مجددًا.';end if;
  if payload->'agree'='false'::jsonb then d:=d-'rewind';
  elsif d#>>'{rewind,actor}'=peer and (d#>>'{rewind,stage}')::int=stage then
   d:=(d-'rewind')||jsonb_build_object('stage',stage-1,'agree','{}'::jsonb);
   if stage=1 then d:=d||'{"exclusive":false,"exclusiveConsent":{}}'::jsonb;end if;
  else d:=d||jsonb_build_object('rewind',jsonb_build_object('actor',who,'stage',stage),'agree','{}'::jsonb);end if;
  d:=d||jsonb_build_object('journeyUpdatedAt',clock_timestamp());update nisfayn_test.room set data=d where id;
  return d||jsonb_build_object('actor',who);
 end if;
 target:=coalesce(payload->>'subject',who);
 if target not in(who,peer) or (target<>who and d->'matched' is distinct from 'true'::jsonb) then raise exception 'الصور غير متاحة.' using errcode='42501';end if;
 if action='gallery_list' then return coalesce((select jsonb_agg(jsonb_build_object('id',id) order by created_at,id) from nisfayn_test.profile_gallery where actor=target and ready),'[]');end if;
 if action='gallery_url' then
  select * into p from nisfayn_test.profile_gallery where id=(payload->>'id')::uuid and ready and (actor=who or actor=peer and d->'matched'='true'::jsonb);
  if p.id is null then raise exception 'الصورة غير متاحة.' using errcode='42501';end if;
 elsif action='gallery_prepare' then
  if (select count(*) from nisfayn_test.profile_gallery where actor=who and (ready or created_at>now()-interval '15 minutes'))>=3 then raise exception 'يمكنك إضافة ثلاث صور فقط.';end if;
  insert into nisfayn_test.profile_gallery(id,actor,path) values(pid,who,'test/'||who||'/'||pid::text||'.jpg') returning * into p;
 elsif action='gallery_commit' then
  select * into p from nisfayn_test.profile_gallery where id=(payload->>'id')::uuid and actor=who;
  if p.id is null or (not p.ready and p.created_at<=now()-interval '15 minutes') then raise exception 'انتهت مهلة رفع الصورة.';end if;
  if not exists(select 1 from storage.objects where bucket_id='nisfayn-profile-gallery' and name=p.path) then raise exception 'لم يكتمل رفع الصورة.';end if;
  update nisfayn_test.profile_gallery set ready=true where id=p.id;
 elsif action='gallery_remove' then delete from nisfayn_test.profile_gallery where id=(payload->>'id')::uuid and actor=who returning * into p;
 end if;
 return jsonb_build_object('id',p.id,'path',p.path);
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;

-- Revocation is immediate; failed Storage deletion and abandoned uploads are retried by maintenance.
create table marriage.gallery_cleanup(path text primary key,queued_at timestamptz not null default now());
alter table marriage.gallery_cleanup enable row level security;
revoke all on marriage.gallery_cleanup from public,anon,authenticated,service_role;
create function marriage.queue_gallery_cleanup() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into marriage.gallery_cleanup(path) values(old.path) on conflict do nothing;return old;
end $$;
revoke all on function marriage.queue_gallery_cleanup() from public,anon,authenticated,service_role;
create trigger gallery_cleanup before delete on marriage.profile_gallery for each row execute function marriage.queue_gallery_cleanup();
create trigger gallery_cleanup before delete on nisfayn_test.profile_gallery for each row execute function marriage.queue_gallery_cleanup();
create function marriage.gallery_cleanup_batch() returns jsonb language plpgsql security definer set search_path='' as $$begin
 delete from marriage.profile_gallery where not ready and created_at<now()-interval '15 minutes';
 delete from nisfayn_test.profile_gallery where not ready and created_at<now()-interval '15 minutes';
 return coalesce((select jsonb_agg(path) from (select path from marriage.gallery_cleanup order by queued_at limit 100) q),'[]');
end $$;
create function marriage.gallery_cleanup_done(paths text[]) returns void language sql security definer set search_path='' as $$delete from marriage.gallery_cleanup where path=any(paths)$$;
create function public.marriage_gallery_cleanup_batch() returns jsonb language sql security invoker set search_path='' as $$select marriage.gallery_cleanup_batch()$$;
create function public.marriage_gallery_cleanup_done(paths text[]) returns void language sql security invoker set search_path='' as $$select marriage.gallery_cleanup_done($1)$$;
revoke all on function marriage.gallery_cleanup_batch(),marriage.gallery_cleanup_done(text[]),public.marriage_gallery_cleanup_batch(),public.marriage_gallery_cleanup_done(text[]) from public,anon,authenticated,service_role;
grant execute on function marriage.gallery_cleanup_batch(),marriage.gallery_cleanup_done(text[]),public.marriage_gallery_cleanup_batch(),public.marriage_gallery_cleanup_done(text[]) to service_role;
