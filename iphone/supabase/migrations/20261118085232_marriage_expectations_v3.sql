-- Immutable questionnaire snapshot. Historical questions and answers keep their original codes.
insert into marriage.assessment_versions values ('marriage-v3', $catalog${
  "version": "marriage-v3",
  "categories": [
    {
      "id": "values",
      "label": "قيم البيت ومسؤولياته",
      "weight": 30
    },
    {
      "id": "plans",
      "label": "الأطفال والسكن",
      "weight": 30
    },
    {
      "id": "lifestyle",
      "label": "إيقاع الحياة",
      "weight": 10
    },
    {
      "id": "communication",
      "label": "الحوار والاختلاف",
      "weight": 12
    },
    {
      "id": "personality",
      "label": "أسلوب التعارف",
      "weight": 6
    },
    {
      "id": "timing",
      "label": "توقيت الزواج",
      "weight": 12
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
      "reason": "مدينتاكما واختيارات السكن تتيحان الاستقرار في مدينة مشتركة.",
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
      "id": "family_authority",
      "partnerId": "partner_family_authority",
      "category": "values",
      "title": "دور الأهل في القرار",
      "selfPrompt": "إذا اعترض الأهل على قرار كبير يخص بيتكم، كيف تحب تحسمونه؟",
      "partnerPrompt": "أي دور للأهل في قرار بيتكم تقدر تتقبله من شريكك؟",
      "reason": "يناسب تفضيل كل واحد منكما اختيار الآخر في موضوع دور الأهل في القرار.",
      "discussion": "إذا اعترض الأهل على قرار كبير يخص بيتكم، كيف تحب تحسمونه؟",
      "hardAllowed": true,
      "options": [
        {
          "code": "A",
          "self": "نسمع رأيهم والقرار الأخير بيننا",
          "partner": "نسمع رأيهم والقرار الأخير بيننا"
        },
        {
          "code": "B",
          "self": "نؤجل القرار إلى أن يوافق الأهل",
          "partner": "نؤجل القرار إلى أن يوافق الأهل"
        },
        {
          "code": "C",
          "self": "يختلف حسب القرار ونتفق على حدود تدخلهم",
          "partner": "يختلف حسب القرار ونتفق على حدود تدخلهم"
        }
      ]
    },
    {
      "id": "financial_provision",
      "partnerId": "partner_financial_provision",
      "category": "values",
      "title": "مصاريف البيت الأساسية",
      "selfPrompt": "لو كان لكل واحد منكم دخل، كيف تتصورون تغطية مصاريف البيت الأساسية؟",
      "partnerPrompt": "أي اتفاق على المصاريف الأساسية يناسبك من الطرف الآخر؟",
      "reason": "يناسب تفضيل كل واحد منكما اختيار الآخر في موضوع مصاريف البيت الأساسية.",
      "discussion": "لو كان لكل واحد منكم دخل، كيف تتصورون تغطية مصاريف البيت الأساسية؟",
      "hardAllowed": true,
      "options": [
        {
          "code": "A",
          "self": "يتكفّل الزوج بالمصاريف الأساسية",
          "partner": "يتكفّل الزوج بالمصاريف الأساسية"
        },
        {
          "code": "B",
          "self": "نتقاسمها بالنصف",
          "partner": "نتقاسمها بالنصف"
        },
        {
          "code": "C",
          "self": "يساهم كل واحد بنسبة من دخله",
          "partner": "يساهم كل واحد بنسبة من دخله"
        },
        {
          "code": "D",
          "self": "أقدر أتفق على أكثر من ترتيب",
          "partner": "أقدر أتفق على أكثر من ترتيب"
        }
      ]
    },
    {
      "id": "domestic_labor",
      "partnerId": "partner_domestic_labor",
      "category": "values",
      "title": "توزيع أعمال البيت",
      "selfPrompt": "في أسبوع عادي، كيف تتصور توزيع الطبخ والتنظيف وأعمال البيت؟",
      "partnerPrompt": "أي توزيع لأعمال البيت يناسبك لو فضّله الطرف الآخر؟",
      "reason": "يناسب تفضيل كل واحد منكما اختيار الآخر في موضوع توزيع أعمال البيت.",
      "discussion": "في أسبوع عادي، كيف تتصور توزيع الطبخ والتنظيف وأعمال البيت؟",
      "hardAllowed": true,
      "options": [
        {
          "code": "A",
          "self": "تكون أغلبها على الزوجة",
          "partner": "تكون أغلبها على الزوجة"
        },
        {
          "code": "B",
          "self": "نتقاسمها بحسب الوقت والقدرة",
          "partner": "نتقاسمها بحسب الوقت والقدرة"
        },
        {
          "code": "C",
          "self": "تكون أغلبها على الزوج",
          "partner": "تكون أغلبها على الزوج"
        },
        {
          "code": "D",
          "self": "يناسبني أكثر من ترتيب بالاتفاق",
          "partner": "يناسبني أكثر من ترتيب بالاتفاق"
        }
      ]
    },
    {
      "id": "housing_arrangement",
      "partnerId": "partner_housing_arrangement",
      "category": "plans",
      "title": "السكن مع الأهل أو باستقلال",
      "selfPrompt": "وقت الزواج، أي ترتيب سكن يناسبك فعليًا؟",
      "partnerPrompt": "أي ترتيب سكن تقدر تتقبله لو فضّله شريكك؟",
      "reason": "يناسب تفضيل كل واحد منكما اختيار الآخر في موضوع السكن مع الأهل أو باستقلال.",
      "discussion": "وقت الزواج، أي ترتيب سكن يناسبك فعليًا؟",
      "hardAllowed": true,
      "options": [
        {
          "code": "A",
          "self": "بيت مستقل من البداية",
          "partner": "بيت مستقل من البداية"
        },
        {
          "code": "B",
          "self": "السكن مع الأهل لفترة متفق عليها ثم نستقل",
          "partner": "السكن مع الأهل لفترة متفق عليها ثم نستقل"
        },
        {
          "code": "C",
          "self": "السكن مع الأهل على المدى الطويل",
          "partner": "السكن مع الأهل على المدى الطويل"
        },
        {
          "code": "D",
          "self": "ممكن أي ترتيب إذا اتفقنا على الخصوصية",
          "partner": "ممكن أي ترتيب إذا اتفقنا على الخصوصية"
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
      "id": "mixed_gatherings",
      "partnerId": "partner_mixed_gatherings",
      "category": "lifestyle",
      "title": "الجمعات المختلطة",
      "selfPrompt": "إذا جاك عزم على جمعة أصدقاء فيها رجال ونساء، وش تختار عادة؟",
      "partnerPrompt": "أي تصرّف من شريكك في هالجمعات ترتاح له؟",
      "reason": "يناسب تفضيل كل واحد منكما اختيار الآخر في موضوع الجمعات المختلطة.",
      "discussion": "إذا جاك عزم على جمعة أصدقاء فيها رجال ونساء، وش تختار عادة؟",
      "hardAllowed": true,
      "options": [
        {
          "code": "A",
          "self": "أعتذر عن هالجمعات",
          "partner": "يعتذر عن هالجمعات"
        },
        {
          "code": "B",
          "self": "أحضر حسب المناسبة ومَن بيكون موجود",
          "partner": "يقرّر حسب المناسبة ومَن بيكون موجود"
        },
        {
          "code": "C",
          "self": "غالبًا أحضر إذا ناسبتني العزيمة",
          "partner": "غالبًا يحضر إذا ناسبته العزيمة"
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
      "id": "faith_routine",
      "partnerId": "partner_faith_routine",
      "category": "values",
      "title": "الممارسة الدينية في البيت",
      "selfPrompt": "إذا اختلف روتين عبادتكم في البيت، وش تتوقع في يومكم العادي؟",
      "partnerPrompt": "أي توقع من الطرف الآخر بخصوص روتين العبادة يناسبك؟",
      "reason": "يناسب تفضيل كل واحد منكما اختيار الآخر في موضوع الممارسة الدينية في البيت.",
      "discussion": "إذا اختلف روتين عبادتكم في البيت، وش تتوقع في يومكم العادي؟",
      "hardAllowed": true,
      "options": [
        {
          "code": "A",
          "self": "كل واحد يرتب عبادته بنفسه",
          "partner": "كل واحد يرتب عبادته بنفسه"
        },
        {
          "code": "B",
          "self": "نذكّر بعض إذا طلب أحدنا",
          "partner": "نذكّر بعض إذا طلب أحدنا"
        },
        {
          "code": "C",
          "self": "أفضّل وقتًا معتادًا لعبادة نسويها معًا",
          "partner": "أفضّل وقتًا معتادًا لعبادة نسويها معًا"
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
      "id": "public_event_attendance",
      "partnerId": "partner_public_event_attendance",
      "category": "lifestyle",
      "title": "الحفلات والفعاليات الترفيهية",
      "selfPrompt": "لو فيه حفلة موسيقية ضمن فعاليات الموسم، ووقتها وتكلفتها يناسبونك، وش الأقرب لك؟",
      "partnerPrompt": "بعد الزواج، أي موقف من حضور هالنوع من الحفلات ترتاح له من شريكك؟",
      "reason": "اختيار كل واحد منكما بخصوص الحفلات يدخل ضمن ما يتقبّله الآخر.",
      "discussion": "لو واحد منكم وده يحضر حفلة والثاني يفضّل يعتذر، وش الترتيب اللي يريحكم؟",
      "hardAllowed": true,
      "options": [
        {
          "code": "A",
          "self": "أفضّل أعتذر عن هالنوع من الحفلات",
          "partner": "أرتاح مع شخص يفضّل يعتذر عنها"
        },
        {
          "code": "B",
          "self": "ممكن أحضر بعضها، على حسب المكان والأجواء",
          "partner": "يناسبني اللي يعتذر أو ينتقي بعضها حسب الأجواء"
        },
        {
          "code": "C",
          "self": "عادةً أتحمّس أحضر إذا أعجبني البرنامج",
          "partner": "يهمني يكون منفتح على حضور بعضها معي"
        },
        {
          "code": "D",
          "self": "إلى الآن ما حدّدت وش يناسبني",
          "partner": "مرتاح لاختياره، سواء حضر أو اعتذر"
        }
      ]
    },
    {
      "id": "parenting_approach",
      "partnerId": "partner_parenting_approach",
      "category": "values",
      "title": "التعامل مع الأطفال",
      "selfPrompt": "لو كسر طفل قاعدة اتفقتوا عليها، وش الأقرب لتصرفك؟",
      "partnerPrompt": "أي تصرف ترتاح له من الطرف الآخر في هالموقف؟",
      "reason": "يناسب تفضيل كل واحد منكما اختيار الآخر في موضوع التعامل مع الأطفال.",
      "discussion": "لو كسر طفل قاعدة اتفقتوا عليها، وش الأقرب لتصرفك؟",
      "hardAllowed": false,
      "options": [
        {
          "code": "A",
          "self": "أطبّق النتيجة اللي اتفقنا عليها ثم أسمع منه",
          "partner": "يطبّق النتيجة المتفق عليها ثم يسمع من الطفل"
        },
        {
          "code": "B",
          "self": "أسمع السبب أول وبعدها أحدد النتيجة",
          "partner": "يسمع السبب أول وبعدها يحدد النتيجة"
        },
        {
          "code": "C",
          "self": "أناقش معه كيف يصلح الموقف",
          "partner": "يناقش الطفل في طريقة إصلاح الموقف"
        },
        {
          "code": "D",
          "self": "أفضل نناقش التربية إذا صار الموضوع وارد",
          "partner": "يناسبني تأجيل نقاش التربية إلى حينه"
        }
      ]
    }
  ]
}$catalog$::jsonb);

do $seed$
declare c jsonb; d record; o record;
begin
 select catalog into strict c from marriage.assessment_versions where id='marriage-v3';
 update marriage.fit_categories t set weight=(j->>'weight')::smallint
 from jsonb_array_elements(c->'categories') j where t.code=j->>'id';
 -- Retired dimensions never allowed hard requirements. Their question rows remain readable.
 delete from marriage.fit_dimensions where code not in (select j->>'id' from jsonb_array_elements(c->'dimensions') j);
 update marriage.fit_dimensions set ordinal=ordinal+100;
 for d in select j,n from jsonb_array_elements(c->'dimensions') with ordinality x(j,n) loop
   insert into marriage.questions values(d.j->>'id',d.j->>'selfPrompt',200+d.n*2),(d.j->>'partnerId',d.j->>'partnerPrompt',201+d.n*2)
   on conflict(code) do update set label=excluded.label;
   for o in select j,n from jsonb_array_elements(d.j->'options') with ordinality x(j,n) loop
     insert into marriage.question_options values(d.j->>'id',o.j->>'code',o.j->>'self',o.n),(d.j->>'partnerId',o.j->>'code',o.j->>'partner',o.n)
     on conflict(question_code,code) do update set label=excluded.label;
   end loop;
   insert into marriage.fit_dimensions values(d.j->>'id',d.j->>'partnerId',d.j->>'category',d.n,(d.j->>'hardAllowed')::boolean,d.j->>'reason')
   on conflict(code) do update set ordinal=excluded.ordinal,category=excluded.category,reason=excluded.reason,hard_allowed=excluded.hard_allowed;
 end loop;
end $seed$;

CREATE OR REPLACE FUNCTION marriage.catalog()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select marriage.catalog_base() || jsonb_build_object('assessment',(select catalog from marriage.assessment_versions where id='marriage-v3'))
$function$;

do $versions$
declare proc regprocedure; original text; updated text;
begin
 foreach proc in array array['marriage.apply_profile_before_onboarding_consent(jsonb)'::regprocedure,'marriage.review_member(uuid, text)'::regprocedure] loop
  original:=pg_get_functiondef(proc);
  updated:=replace(original,'''marriage-v1'',''marriage-v2'')','''marriage-v1'',''marriage-v2'',''marriage-v3'')');
  if original=updated then raise exception 'Unexpected version check in %',proc; end if;
  if proc='marriage.apply_profile_before_onboarding_consent(jsonb)'::regprocedure then
    if strpos(updated,'if jsonb_array_length(choices)>3')=0 then raise exception 'Missing profile validation'; end if;
    updated:=replace(updated,'if jsonb_array_length(choices)>3',$older_client$
      -- A client can edit only the fields published in its questionnaire.
      if previous->>'assessmentVersion'='marriage-v3' and version in('marriage-v1','marriage-v2')
         and payload#>'{signupConsents,assessment}' is distinct from 'false'::jsonb then
        answers:=answers || coalesce((select jsonb_object_agg(old.key,old.value)
          from jsonb_each(coalesce(previous->'surveyAnswers','{}')) old
          where not exists(select 1 from marriage.assessment_versions v, jsonb_array_elements(v.catalog->'dimensions') d
            where v.id=version and old.key in(d->>'id',d->>'partnerId'))),'{}'::jsonb);
        hard:=(select coalesce(jsonb_agg(distinct id),'[]'::jsonb) from (
          select jsonb_array_elements_text(hard) as id union all
          select old.id from jsonb_array_elements_text(coalesce(previous->'hardRequirements','[]')) old(id)
           where not exists(select 1 from marriage.assessment_versions v, jsonb_array_elements(v.catalog->'dimensions') d
             where v.id=version and d->>'id'=old.id and (d->>'hardAllowed')::boolean)
        ) req);
        version:='marriage-v3';
      end if;
      if jsonb_array_length(choices)>3$older_client$);
  end if;
  execute updated;
 end loop;
end $versions$;

CREATE OR REPLACE FUNCTION marriage.compatible_before_basics(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select exists(
 select 1 from marriage.members x join marriage.profiles p on p.member_id=x.id join marriage.preferences xp on xp.member_id=x.id
 join marriage.members y on y.id=b join marriage.profiles q on q.member_id=y.id join marriage.preferences yp on yp.member_id=y.id
 where x.id=a and a<>b and x.review_status='approved' and y.review_status='approved'
 and not(x.paused or y.paused or x.suspended or y.suspended) and p.gender<>q.gender
 and not exists(select 1 from marriage.blocks z where (z.member_id=a and z.blocked_id=b) or (z.member_id=b and z.blocked_id=a))
 and p.age between 18 and 110 and q.age between 18 and 110)
$function$;

CREATE OR REPLACE FUNCTION marriage.compatible_before_exclusivity(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select marriage.compatible_before_basics(a,b)
$function$;

create function marriage.expectation_credit(dimension text, asker uuid, peer uuid, wanted text, observed text)
returns float8 language sql stable strict set search_path='' as $$
 select case
  when dimension='public_event_attendance' and observed='D' then null
  when dimension='public_event_attendance' then case
    when wanted='D' or wanted=observed
      or (wanted='B' and observed='A') or (wanted='C' and observed='B') then 1
    else 0 end
  when dimension='children_plan' and 'C' in(wanted,observed) then 0.5
  when dimension in('marriage_timeline','parenting_approach') and 'D' in(wanted,observed) then 0.5
  when dimension='wife_work' and wanted='C' or dimension in('domestic_labor','housing_arrangement','financial_provision') and wanted='D' then 1
  when dimension='wife_work' and observed='C' or dimension in('domestic_labor','housing_arrangement','financial_provision') and observed='D' then 0.5
  when marriage.preference_answer_fit(dimension,asker,peer,wanted,observed) then 1
  when dimension='marriage_timeline' and abs(ascii(wanted)-ascii(observed))=1 then 0.5
  else 0 end::float8
$$;
revoke all on function marriage.expectation_credit(text,uuid,uuid,text,text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION marriage.preferred_criteria(asker uuid, peer uuid)
 RETURNS TABLE(score double precision, covered integer, total integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with choices as(select marriage.criterion_fit(asker,peer,c.criterion,c.rule) as ok from marriage.partner_criteria c
  where member_id=asker and rule->>'mode' in('prefer','require') and not(criterion='children' and rule->>'target'='any'))
 select avg(ok::int)::float8,count(ok)::int,count(*)::int from choices
$function$;

CREATE OR REPLACE FUNCTION marriage.pair_fit_before_beena(a uuid, b uuid)
 RETURNS TABLE(fit jsonb, rank_value double precision, covered integer, shared integer, provisional boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with choices as materialized (
   select d.code,d.ordinal,d.category,
     ha.dimension is not null as hard_a,hb.dimension is not null as hard_b,marriage.expectation_credit(d.code,a,b,pa.option_code,sb.option_code) as ab,marriage.expectation_credit(d.code,b,a,pb.option_code,sa.option_code) as ba
   from marriage.fit_dimensions d
   left join marriage.fit_hard_requirements ha on ha.member_id=a and ha.dimension=d.code
   left join marriage.fit_hard_requirements hb on hb.member_id=b and hb.dimension=d.code
   left join marriage.member_answers sa on sa.member_id=a and sa.question_code=d.code
   left join marriage.member_answers sb on sb.member_id=b and sb.question_code=d.code
   left join marriage.member_answers pa on pa.member_id=a and pa.question_code=d.partner_code
   left join marriage.member_answers pb on pb.member_id=b and pb.question_code=d.partner_code
 ), categories as (
   select cat.code,cat.weight*case when aw.category is null then 1 else 2 end as wa,
     cat.weight*case when bw.category is null then 1 else 2 end as wb,
     avg(c.ab) as ab,avg(c.ba) as ba
   from marriage.fit_categories cat join choices c on c.category=cat.code
   left join marriage.fit_priorities aw on aw.member_id=a and aw.category=cat.code
   left join marriage.fit_priorities bw on bw.member_id=b and bw.category=cat.code
   group by cat.code,cat.weight,aw.category,bw.category
 ), directions as (
   select sum(ab*wa) as pa,sum(wa) filter(where ab is not null) as wa,
     sum(ba*wb) as pb,sum(wb) filter(where ba is not null) as wb from categories
 ), topics_penalty as (
   select min(case
     when (hard_a and ab=0) or (hard_b and ba=0) then 0.5
     when code in ('children_plan','family_authority','housing_arrangement','financial_provision','wife_work','domestic_labor','marriage_timeline','mixed_gatherings','faith_routine')
       and (ab=0 or ba=0) then 0.75
     when code in ('children_plan','marriage_timeline') and (ab=0.5 or ba=0.5) then 0.9
     else 1 end) as factor from choices
 ), practical as (
   select p.age not between yp.min_age and yp.max_age or q.age not between xp.min_age and xp.max_age as age_conflict,
     marriage.city_filter_key(cp.label) not in ('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه')
     and marriage.city_filter_key(cq.label) not in ('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه') as cities_known,
     marriage.city_filter_key(cp.label)<>marriage.city_filter_key(cq.label)
     and exists(select 1 from marriage.member_answers where member_id in(a,b) and question_code='residence_plan' and option_code='A' having count(*)=2) as immobile,
     exists(select 1 from marriage.member_answers where member_id in(a,b) and question_code='children_plan' and option_code in('A','B') having count(distinct option_code)=2) as children_conflict,
     exists(select 1 from marriage.partner_criteria r where r.member_id in(a,b) and r.rule->>'mode'='require'
       and marriage.criterion_fit(r.member_id,case when r.member_id=a then b else a end,r.criterion,r.rule) is false) as required_conflict
   from marriage.profiles p join marriage.preferences xp on xp.member_id=p.member_id left join marriage.cities cp on cp.id=p.city_id
   join marriage.profiles q on q.member_id=b join marriage.preferences yp on yp.member_id=b left join marriage.cities cq on cq.id=q.city_id
   where p.member_id=a
 ), scores as (
   select sqrt(coalesce((pa+coalesce(ca.score,0)*ca.covered*2)/nullif(wa+ca.covered*2,0),0)
            * coalesce((pb+coalesce(cb.score,0)*cb.covered*2)/nullif(wb+cb.covered*2,0),0))
     * least(t.factor,case when k.required_conflict then 0.5 else 1 end,case when k.age_conflict then 0.85 else 1 end,
        case when k.immobile and k.cities_known then 0.6 else 1 end,case when k.children_conflict then 0.75 else 1 end) as ratio,
     to_jsonb(array_remove(array[case when k.age_conflict then 'age_range' end,case when k.cities_known and k.immobile then 'relocation' end,
       case when k.children_conflict then 'children_intent' end,case when k.cities_known is not true then 'location_unknown' end,
       case when k.required_conflict then 'required_criterion' end],null)) as concerns,k.cities_known,
     ca.covered+cb.covered as criteria_covered,ca.total+cb.total as criteria_total
   from directions cross join topics_penalty t cross join practical k cross join marriage.preferred_criteria(a,b) ca cross join marriage.preferred_criteria(b,a) cb
 ), summary as (
   select count(*)::int as n,count(*) filter(where ab is not null and ba is not null)::int as c,
     count(distinct category) filter(where ab is not null and ba is not null) as category_count,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab=1 and ba=1),'[]') as strengths,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab is not null and ba is not null and not(ab=1 and ba=1)),'[]') as discussion,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab is null or ba is null),'[]') as missing
   from choices
 ), result as (
   select *,c<5 or category_count<3 or cities_known is not true or criteria_covered<criteria_total as tentative,
     c=n and n>0 and coalesce(cities_known,false) and criteria_covered=criteria_total and (select count(*)=2 from marriage.member_assessment where member_id in(a,b) and version='marriage-v3') as complete from summary cross join scores
 )
 select jsonb_build_object('version','marriage-v3','band',
     case when tentative then 'insufficient' when ratio>=0.75 then 'strong' when ratio>=0.45 then 'mixed' else 'explore' end,
     'practicalConcerns',concerns,'assessmentComplete',complete,'percentage',case when complete then floor(coalesce(ratio,0)*100+0.5)::int else null end,
     'criteria',jsonb_build_object('covered',criteria_covered,'total',criteria_total),
     'personality',marriage.personality_fit(a,b),'provisional',tentative,'covered',c,'total',n,'strengths',strengths,'discussion',discussion,'missing',missing),
   coalesce(ratio,0)*sqrt(c::float8/nullif(n,0)),c,
   (select count(*)::int from marriage.member_interests mine join marriage.member_interests peer using(interest_code)
     where mine.member_id=a and peer.member_id=b),tentative
 from result
$function$;

CREATE OR REPLACE FUNCTION marriage.preference_evidence(a uuid, b uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with answers as (
  select d.code,d.ordinal,d.category,
   sa.option_code as sa,sb.option_code as sb,pa.option_code as pa,pb.option_code as pb,
   osa.code is not null and osb.code is not null and opa.code is not null and opb.code is not null
   and not(d.code='public_event_attendance' and 'D' in(sa.option_code,sb.option_code)) as complete
  from marriage.fit_dimensions d
  left join marriage.member_answers sa on sa.member_id=a and sa.question_code=d.code
  left join marriage.member_answers sb on sb.member_id=b and sb.question_code=d.code
  left join marriage.member_answers pa on pa.member_id=a and pa.question_code=d.partner_code
  left join marriage.member_answers pb on pb.member_id=b and pb.question_code=d.partner_code
  left join marriage.question_options osa on osa.question_code=d.code and osa.code=sa.option_code
  left join marriage.question_options osb on osb.question_code=d.code and osb.code=sb.option_code
  left join marriage.question_options opa on opa.question_code=d.partner_code and opa.code=pa.option_code
  left join marriage.question_options opb on opb.question_code=d.partner_code and opb.code=pb.option_code
 ), topics as materialized (
  select code,ordinal,category,case
   when not complete then 'missing'
   when (marriage.expectation_credit(code,a,b,pa,sb)=1) and (marriage.expectation_credit(code,b,a,pb,sa)=1) then 'aligned'
   when least(marriage.expectation_credit(code,a,b,pa,sb),marriage.expectation_credit(code,b,a,pb,sa))=0.5 then 'conditional'
   when (marriage.expectation_credit(code,a,b,pa,sb)=1)<>(marriage.expectation_credit(code,b,a,pb,sa)=1) then 'one_sided'
   else 'different' end as status
  from answers
 ), categories as (
  select cat.code,cat.position,count(t.code) as total,
   count(t.code) filter(where t.status<>'missing') as covered,
   count(t.code) filter(where t.status='aligned') as aligned,
   count(t.code) filter(where t.status in('conditional','one_sided','different')) as discussion
  from marriage.fit_categories cat left join topics t on t.category=cat.code
  group by cat.code,cat.position
 ), criteria as (
  select marriage.criterion_fit(direction.asker,direction.peer,c.criterion,c.rule) as ok
  from (values(a,b),(b,a)) direction(asker,peer)
  join marriage.partner_criteria c on c.member_id=direction.asker
  where c.rule->>'mode' in('prefer','require') and not(c.criterion='children' and c.rule->>'target'='any')
 )
 select jsonb_build_object(
  'version','preference-evidence-v1','method','reciprocal-weighted-v3',
  'topics',coalesce((select jsonb_agg(jsonb_build_object('id',code,'status',status) order by ordinal) from topics),'[]'),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',code,'covered',covered,'total',total,
   'aligned',aligned,'discussion',discussion) order by position) from categories),'[]'),
  'criteria',(select jsonb_build_object('matched',count(*) filter(where ok is true),
   'different',count(*) filter(where ok is false),'missing',count(*) filter(where ok is null),'total',count(*)) from criteria)
 )
$function$;

-- Keep the previous completion predicate for existing stored interview documents.
alter function marriage.interview_required_complete(jsonb) rename to interview_required_complete_v2;
create function marriage.assessment_fields_v3() returns jsonb language sql immutable set search_path='' as $$
 select '{"preference:children_plan:self":["A","B","C"],"preference:children_plan:partner":["A","B","C"],"preference:residence_plan:self":["A","B","C"],"preference:residence_plan:partner":["A","B","C"],"preference:wife_work:self":["A","B","C"],"preference:wife_work:partner":["A","B","C"],"preference:marriage_timeline:self":["A","B","C","D"],"preference:marriage_timeline:partner":["A","B","C","D"],"preference:family_authority:self":["A","B","C"],"preference:family_authority:partner":["A","B","C"],"preference:financial_provision:self":["A","B","C","D"],"preference:financial_provision:partner":["A","B","C","D"],"preference:domestic_labor:self":["A","B","C","D"],"preference:domestic_labor:partner":["A","B","C","D"],"preference:housing_arrangement:self":["A","B","C","D"],"preference:housing_arrangement:partner":["A","B","C","D"],"preference:social_rhythm:self":["A","B","C"],"preference:social_rhythm:partner":["A","B","C"],"preference:mixed_gatherings:self":["A","B","C"],"preference:mixed_gatherings:partner":["A","B","C"],"preference:match_disagreement_style:self":["A","B","C","D"],"preference:match_disagreement_style:partner":["A","B","C","D"],"preference:repair_after_conflict:self":["A","B","C"],"preference:repair_after_conflict:partner":["A","B","C"],"preference:faith_routine:self":["A","B","C"],"preference:faith_routine:partner":["A","B","C"],"preference:closeness_pace:self":["A","B","C"],"preference:closeness_pace:partner":["A","B","C"],"preference:public_event_attendance:self":["A","B","C","D"],"preference:public_event_attendance:partner":["A","B","C","D"],"preference:parenting_approach:self":["A","B","C","D"],"preference:parenting_approach:partner":["A","B","C","D"],"personality:social_energy:self":["A","B","C","D","E"],"personality:initiative:self":["A","B","C","D","E"],"personality:depth:self":["A","B","C","D","E"],"personality:openness:self":["A","B","C","D","E"],"personality:closeness:self":["A","B","C","D","E"],"personality:reassurance:self":["A","B","C","D","E"],"personality:support:self":["A","B","C","D","E"],"personality:planning:self":["A","B","C","D","E"],"personality:novelty:self":["A","B","C","D","E"],"personality:conflict_pace:self":["A","B","C","D","E"],"personality:directness:self":["A","B","C","D","E"],"personality:quiet_comfort:self":["A","B","C","D","E"]}'::jsonb
$$;
create function marriage.interview_required_complete(items jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(items)='array' and jsonb_array_length(items)=44 and not exists(
  select 1 from jsonb_each(marriage.assessment_fields_v3()) f where not exists(
   select 1 from jsonb_array_elements(items) item where item->>'id'=f.key and item->'needsClarification'='false'::jsonb
     and item->'values'=jsonb_build_array(item#>>'{values,0}') and f.value ? (item#>>'{values,0}')))
$$;
revoke all on function marriage.assessment_fields_v3(),marriage.interview_required_complete(jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION marriage.interview_document_valid_before_profile_capture(doc jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$begin
 if not marriage.interview_document_valid_before_required(doc) then return false;end if;
 if doc->>'promptVersion' not in ('wudayn-interview-3','wudayn-interview-4') and jsonb_array_length(doc->'turns')>20 then return false;end if;
 if doc->>'promptVersion' in ('wudayn-interview-3','wudayn-interview-4') then
  if exists(select 1 from jsonb_array_elements(doc->'proposals') p where p->>'kind'='beena') then return false;end if;
  if doc->>'status'='confirmed' and not (case when doc->>'promptVersion'='wudayn-interview-4' then marriage.interview_required_complete(doc->'confirmed') else marriage.interview_required_complete_v2(doc->'confirmed') end) then return false;end if;
 end if;
 return true;
end $function$;

do $interview$
declare original text; updated text; lookup_start int; lookup_end int;
begin
 original:=pg_get_functiondef('marriage.interview_document_valid_before_required(jsonb)'::regprocedure);
 updated:=replace(original,'''wudayn-interview-2'',''wudayn-interview-3'')','''wudayn-interview-2'',''wudayn-interview-3'',''wudayn-interview-4'')');
 if updated=original then raise exception 'Unexpected interview version predicate'; end if;
 execute updated;
 original:=pg_get_functiondef('marriage.interview_document_valid_before_partner_defaults(jsonb)'::regprocedure);
 lookup_start:=strpos(original,'select value into field from jsonb_array_elements(');
 lookup_end:=strpos(original,'where value->>''id''=p->>''id'';')+length('where value->>''id''=p->>''id'';')-1;
 if lookup_start=0 or lookup_end<lookup_start then raise exception 'Unexpected context field lookup'; end if;
 updated:=substr(original,1,lookup_start-1)||
   'if doc->>''promptVersion''=''wudayn-interview-4'' then
      field:=jsonb_build_object(''values'',marriage.assessment_fields_v3()->(p->>''id''));
      if not (marriage.assessment_fields_v3() ? (p->>''id'')) then return false; end if;
    else '||substr(original,lookup_start,lookup_end-lookup_start+1)||' end if;'||substr(original,lookup_end+1);
 execute updated;
end $interview$;

CREATE OR REPLACE FUNCTION marriage.interview_document_valid(doc jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  arr text;
  item jsonb;
  sanitized jsonb := doc;
begin
  if jsonb_typeof(doc) is distinct from 'object' then return false; end if;

  foreach arr in array array['proposals','confirmed'] loop
    if jsonb_typeof(doc->arr) is distinct from 'array' then return false; end if;

    for item in select value from jsonb_array_elements(doc->arr) loop
      if doc->>'promptVersion'='wudayn-interview-4' and (
        item ? 'source' or not (marriage.assessment_fields_v3() ? (item->>'id'))
        or item->>'id' is distinct from concat_ws(':',item->>'kind',item->>'fieldId',item->>'side')
        or item->'values' is distinct from jsonb_build_array(item#>>'{values,0}')
        or not ((marriage.assessment_fields_v3()->(item->>'id')) ? (item#>>'{values,0}'))
      ) then return false; end if;
      if item ? 'source' and (
        item->>'source' is distinct from 'self_default'
        or item->>'side' is distinct from 'partner'
        or coalesce(item->>'kind','') not in ('preference','beena')
      ) then return false; end if;
    end loop;

    sanitized := jsonb_set(
      sanitized,
      array[arr],
      coalesce((
        select jsonb_agg(value - 'source')
        from jsonb_array_elements(doc->arr)
      ), '[]'::jsonb)
    );
  end loop;

  return marriage.interview_document_valid_before_partner_defaults(sanitized);
exception when others then
  return false;
end $function$;

CREATE OR REPLACE FUNCTION marriage.required_onboarding_answers(profile jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select profile#>'{signupConsents,assessment}'='true'::jsonb
 and not exists(select 1 from unnest(array['education','marriageIntent','lookingFor','lifeTogether','valuesStatement']) k where length(btrim(coalesce(profile->>k,'')))=0)
 and jsonb_typeof(profile->'marriageBasics')='object'
 and not exists(select 1 from unnest(array['heightCm','weightKg','preferredLanguage','languageOpenness','nationality','maritalStatus','polygynyPreference','childrenCount','smoking','marriageTimeline','meetingPreference']) k where length(btrim(coalesce(profile->'marriageBasics'->>k,'')))=0)
 and jsonb_typeof(profile#>'{marriageBasics,spokenLanguages}')='array' and jsonb_array_length(profile#>'{marriageBasics,spokenLanguages}')>0
 and jsonb_typeof(profile->'partnerCriteria')='object'
 and not exists(select 1 from unnest(array['sharedLanguage','height','weight','nationality','education','profession','maritalStatus','children','smoking']) k where coalesce(profile->'partnerCriteria'->k->>'mode','') not in ('any','prefer','require'))
 and jsonb_typeof(profile->'surveyAnswers')='object'
 and not exists(select 1 from unnest(array['children_plan','partner_children_plan','residence_plan','partner_residence_plan','wife_work','partner_wife_work','marriage_timeline','partner_marriage_timeline','family_authority','partner_family_authority','financial_provision','partner_financial_provision','domestic_labor','partner_domestic_labor','housing_arrangement','partner_housing_arrangement','social_rhythm','partner_social_rhythm','mixed_gatherings','partner_mixed_gatherings','match_disagreement_style','partner_match_disagreement_style','repair_after_conflict','partner_repair_after_conflict','faith_routine','partner_faith_routine','closeness_pace','partner_closeness_pace','public_event_attendance','partner_public_event_attendance','parenting_approach','partner_parenting_approach']) k where coalesce(profile->'surveyAnswers'->>k,'')='')
 and jsonb_typeof(profile->'personalityAnswers')='object'
 and not exists(select 1 from unnest(array['social_energy','initiative','depth','openness','closeness','reassurance','support','planning','novelty','conflict_pace','directness','quiet_comfort']) k where coalesce(profile->'personalityAnswers'->>k,'') not in ('A','B','C','D','E'));
$function$;

-- The trusted receipt RPC must recognize the same interview version as the client.
do $receipt$
declare original text; updated text;
begin
 original:=pg_get_functiondef('nisfayn_ai.attest_interview(uuid,text,bigint,text,text)'::regprocedure);
 updated:=replace(original,'s.document->>''promptVersion''<>''wudayn-interview-3''','s.document->>''promptVersion''<>''wudayn-interview-4''');
 if updated=original then raise exception 'Unexpected receipt version predicate'; end if;
 execute updated;
end $receipt$;
