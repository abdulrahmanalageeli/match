-- Roll out a new questionnaire without reinterpreting earlier answers.
insert into marriage.assessment_versions values ('marriage-v4',$catalog${
 "version": "marriage-v4",
 "categories": [
  {
   "id": "values",
   "label": "قيم البيت ومسؤولياته",
   "weight": 37.5
  },
  {
   "id": "plans",
   "label": "الأطفال والسكن",
   "weight": 25
  },
  {
   "id": "lifestyle",
   "label": "إيقاع الحياة",
   "weight": 12.5
  },
  {
   "id": "communication",
   "label": "الحوار والاختلاف",
   "weight": 12.5
  },
  {
   "id": "personality",
   "label": "أسلوب التعارف",
   "weight": 6.25
  },
  {
   "id": "timing",
   "label": "توقيت الزواج",
   "weight": 6.25
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
   "selfPrompt": "أي ترتيب للعمل بعد الزواج يناسب تصورك لحياة الزوجة المهنية؟",
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
   "partnerPrompt": "لو أراد الطرف الآخر إشراك أهله في قرار يخصّ بيتكما، وش الدور اللي يناسبك؟",
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
   "selfPrompt": "بعد أسبوع مزدحم، كيف يناسبك تقضي وقتك بين الراحة والزيارات؟",
   "partnerPrompt": "كيف يناسبك أن يوازن الطرف الآخر بين الزيارات ووقت الراحة؟",
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
   "id": "social_boundaries",
   "partnerId": "partner_social_boundaries",
   "category": "lifestyle",
   "title": "حدود المناسبات والفعاليات",
   "selfPrompt": "إذا دُعيت إلى مناسبة أو فعالية عامة، كيف تختار وش تحضر؟",
   "partnerPrompt": "كيف تفضّل أن يختار شريكك المناسبات والفعاليات التي يحضرها؟",
   "reason": "يناسب اختيار كل طرف ما يفضّله الآخر في موضوع حدود المناسبات والفعاليات.",
   "discussion": "كيف نتعامل مع دعوة يرتاح لها أحدنا ويتحفظ عليها الآخر؟",
   "hardAllowed": true,
   "options": [
    {
     "code": "A",
     "self": "أكتفي بالمناسبات العائلية الخاصة",
     "partner": "يكتفي بالمناسبات العائلية الخاصة"
    },
    {
     "code": "B",
     "self": "أحضر فعاليات عامة إذا وافقت حدودي الشخصية",
     "partner": "يختار الفعاليات العامة التي تناسب حدوده الشخصية"
    },
    {
     "code": "C",
     "self": "أرتاح لحضور معظم المناسبات والفعاليات العامة",
     "partner": "يرتاح لحضور معظم المناسبات والفعاليات العامة"
    },
    {
     "code": "D",
     "self": "أتفق مع الشريك بحسب المناسبة",
     "partner": "نتفق بحسب المناسبة"
    }
   ]
  },
  {
   "id": "conflict_response",
   "partnerId": "partner_conflict_response",
   "category": "communication",
   "title": "عند احتدام النقاش",
   "selfPrompt": "إذا احتدّ النقاش بينك وبين شخص قريب، وش الأقرب للي يصير معك عادة؟",
   "partnerPrompt": "إذا احتدّ النقاش، أي استجابة تفضّلها من الطرف الآخر؟",
   "reason": "يناسب اختيار كل طرف ما يفضّله الآخر في موضوع عند احتدام النقاش.",
   "discussion": "إذا احتدّ النقاش، كيف نعرف أن أحدنا يحتاج وقتًا، ومتى نرجع للموضوع؟",
   "hardAllowed": false,
   "options": [
    {
     "code": "A",
     "self": "أكمل النقاش وأحاول أوصل لحل بهدوء",
     "partner": "يكمل النقاش ويحاول الوصول لحل بهدوء"
    },
    {
     "code": "B",
     "self": "أطلب وقت أهدأ فيه وأرجع للنقاش بوقت واضح",
     "partner": "يطلب وقتًا للهدوء ويحدّد متى يرجع للنقاش"
    },
    {
     "code": "C",
     "self": "أميل أضغط عشان ينحسم الموضوع بسرعة",
     "partner": "يسعى لحسم الموضوع بسرعة حتى لو ضغط في النقاش"
    },
    {
     "code": "D",
     "self": "أميل أنسحب من الموضوع وما أحب أرجع له بسرعة",
     "partner": "ينسحب من الموضوع ويفضّل تأجيل الرجوع إليه"
    }
   ]
  },
  {
   "id": "repair_after_conflict",
   "partnerId": "partner_repair_after_conflict",
   "category": "communication",
   "title": "العودة بعد الزعل",
   "selfPrompt": "بعد ما يهدأ الخلاف، وش أول خطوة عادةً تسويها عشان ترجعون للتفاهم؟",
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
   "id": "money_management",
   "partnerId": "partner_money_management",
   "category": "values",
   "title": "الادخار والصرف",
   "selfPrompt": "إذا جاءكم مبلغ إضافي غير متوقع، وش الأقرب لطريقتك؟",
   "partnerPrompt": "أي طريقة في التعامل مع المال ترتاح لها عند شريكك؟",
   "reason": "يناسب اختيار كل طرف ما يفضّله الآخر في موضوع الادخار والصرف.",
   "discussion": "لو جاءنا مبلغ إضافي، كيف نوازن بين احتياجات اليوم وخطط المستقبل؟",
   "hardAllowed": false,
   "options": [
    {
     "code": "A",
     "self": "أفضّل ندّخر أغلبه للمستقبل",
     "partner": "يفضّل ادخار أغلبه للمستقبل"
    },
    {
     "code": "B",
     "self": "أوازن بين الادخار والاستمتاع بجزء منه",
     "partner": "يوازن بين الادخار والاستمتاع بجزء منه"
    },
    {
     "code": "C",
     "self": "أفضّل نستفيد منه الآن إذا ما عندنا التزامات مهمة",
     "partner": "يفضّل الاستفادة منه الآن إذا لم تكن هناك التزامات مهمة"
    },
    {
     "code": "D",
     "self": "يعتمد على وضعنا وقتها ونتفق عليه",
     "partner": "يناقش القرار بحسب وضعنا وقتها"
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
declare d record; o record;
begin
 for d in select j,n from marriage.assessment_versions v, jsonb_array_elements(v.catalog->'dimensions') with ordinality x(j,n)
   where v.id='marriage-v4' and not exists(select 1 from marriage.fit_dimensions f where f.code=j->>'id') loop
   insert into marriage.questions values(d.j->>'id',d.j->>'selfPrompt',300+d.n*2),(d.j->>'partnerId',d.j->>'partnerPrompt',301+d.n*2);
   for o in select j,n from jsonb_array_elements(d.j->'options') with ordinality x(j,n) loop
     insert into marriage.question_options values(d.j->>'id',o.j->>'code',o.j->>'self',o.n),(d.j->>'partnerId',o.j->>'code',o.j->>'partner',o.n);
   end loop;
   insert into marriage.fit_dimensions values(d.j->>'id',d.j->>'partnerId',d.j->>'category',100+d.n,(d.j->>'hardAllowed')::boolean,d.j->>'reason');
 end loop;
end $seed$;
insert into marriage.personality_questions values
 ('calm_before_acting',13),
 ('lasting_tension',14),
 ('stress_recovery',15),
 ('follow_through',16),
 ('prepare_early',17),
 ('unfinished_tasks',18),
 ('perspective_taking',19),
 ('make_amends',20),
 ('harsh_words',21),
 ('group_energy',22),
 ('start_conversation',23),
 ('quiet_settings',24),
 ('try_new_ideas',25),
 ('explore_views',26),
 ('prefer_familiar',27);

create function marriage.assessment_fields_v4() returns jsonb language sql immutable set search_path='' as $$
 select '{"preference:children_plan:self":["A","B","C"],"preference:children_plan:partner":["A","B","C"],"preference:residence_plan:self":["A","B","C"],"preference:residence_plan:partner":["A","B","C"],"preference:wife_work:self":["A","B","C"],"preference:wife_work:partner":["A","B","C"],"preference:marriage_timeline:self":["A","B","C","D"],"preference:marriage_timeline:partner":["A","B","C","D"],"preference:family_authority:self":["A","B","C"],"preference:family_authority:partner":["A","B","C"],"preference:financial_provision:self":["A","B","C","D"],"preference:financial_provision:partner":["A","B","C","D"],"preference:domestic_labor:self":["A","B","C","D"],"preference:domestic_labor:partner":["A","B","C","D"],"preference:housing_arrangement:self":["A","B","C","D"],"preference:housing_arrangement:partner":["A","B","C","D"],"preference:social_rhythm:self":["A","B","C"],"preference:social_rhythm:partner":["A","B","C"],"preference:social_boundaries:self":["A","B","C","D"],"preference:social_boundaries:partner":["A","B","C","D"],"preference:conflict_response:self":["A","B","C","D"],"preference:conflict_response:partner":["A","B","C","D"],"preference:repair_after_conflict:self":["A","B","C"],"preference:repair_after_conflict:partner":["A","B","C"],"preference:faith_routine:self":["A","B","C"],"preference:faith_routine:partner":["A","B","C"],"preference:closeness_pace:self":["A","B","C"],"preference:closeness_pace:partner":["A","B","C"],"preference:money_management:self":["A","B","C","D"],"preference:money_management:partner":["A","B","C","D"],"preference:parenting_approach:self":["A","B","C","D"],"preference:parenting_approach:partner":["A","B","C","D"],"personality:calm_before_acting:self":["A","B","C","D","E"],"personality:lasting_tension:self":["A","B","C","D","E"],"personality:stress_recovery:self":["A","B","C","D","E"],"personality:follow_through:self":["A","B","C","D","E"],"personality:prepare_early:self":["A","B","C","D","E"],"personality:unfinished_tasks:self":["A","B","C","D","E"],"personality:perspective_taking:self":["A","B","C","D","E"],"personality:make_amends:self":["A","B","C","D","E"],"personality:harsh_words:self":["A","B","C","D","E"],"personality:group_energy:self":["A","B","C","D","E"],"personality:start_conversation:self":["A","B","C","D","E"],"personality:quiet_settings:self":["A","B","C","D","E"],"personality:try_new_ideas:self":["A","B","C","D","E"],"personality:explore_views:self":["A","B","C","D","E"],"personality:prefer_familiar:self":["A","B","C","D","E"]}'::jsonb
$$;
revoke all on function marriage.assessment_fields_v4() from public,anon,authenticated,service_role;

create or replace function marriage.catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select marriage.catalog_base() || jsonb_build_object('assessment',catalog) from marriage.assessment_versions where id='marriage-v4'
$$;

-- Patch specific guarded points in the layered historical RPCs. Fail the migration on schema drift.
create function pg_temp.patch_assessment(proc regprocedure, needle text, replacement text) returns void
language plpgsql as $$
declare body text:=pg_get_functiondef(proc);
begin
 if strpos(body,needle)=0 then raise exception 'Unexpected definition of % (wanted %)',proc,left(needle,110); end if;
 execute replace(body,needle,replacement);
end $$;

alter function marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text) rename to normalize_marriage_extras_v1;
create function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if version is distinct from 'personality-v2' then return marriage.normalize_marriage_extras_v1(basics,criteria,personality,version); end if;
 if jsonb_typeof(personality) is distinct from 'object' or exists(select 1 from jsonb_each(personality) p
   where not coalesce((marriage.assessment_fields_v4()->('personality:'||p.key||':self')) ? (p.value#>>'{}'),false)) then
   raise exception 'Invalid personality-v2 answer' using errcode='22023';
 end if;
 return marriage.normalize_marriage_extras_v1(basics,criteria,'{}','personality-v1')
   || jsonb_build_object('personalityAnswers',personality,'personalityVersion',version);
end $$;
revoke all on function marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text) from public,anon,authenticated,service_role;

select pg_temp.patch_assessment('marriage.profile_json_before_appearance(uuid)',
 $s$'personalityVersion','personality-v1'$s$,
 $s$'personalityVersion',case when exists(select 1 from marriage.member_assessment where member_id=target and version='marriage-v4') then 'personality-v2' else 'personality-v1' end$s$);
select pg_temp.patch_assessment('marriage.apply_profile_before_onboarding_consent(jsonb)',
 $s$'marriage-v1','marriage-v2','marriage-v3')$s$, $s$'marriage-v1','marriage-v2','marriage-v3','marriage-v4')$s$);
select pg_temp.patch_assessment('marriage.review_member(uuid,text)',
 $s$'marriage-v1','marriage-v2','marriage-v3')$s$, $s$'marriage-v1','marriage-v2','marriage-v3','marriage-v4')$s$);
select pg_temp.patch_assessment('marriage.apply_profile_before_onboarding_consent(jsonb)',
 $s$if jsonb_array_length(choices)>3$s$,
 $s$if previous->>'assessmentVersion'='marriage-v4' and version<>'marriage-v4' then
    raise exception 'Update Wudayn to edit this assessment' using errcode='22023';
  end if;
  if (version='marriage-v4') is distinct from (extras->>'personalityVersion'='personality-v2') then
    raise exception 'Assessment and personality version mismatch' using errcode='22023';
  end if;
  if version<>'marriage-v4' and exists(select 1 from jsonb_object_keys(answers) k where regexp_replace(k,'^partner_','') in ('money_management','conflict_response','social_boundaries')) then
    raise exception 'Question does not belong to this assessment' using errcode='22023';
  end if;
  if version='marriage-v4' and (exists(select 1 from jsonb_each(answers) p
    where not coalesce((marriage.assessment_fields_v4()->('preference:'||regexp_replace(p.key,'^partner_','')||':'||
      case when starts_with(p.key,'partner_') then 'partner' else 'self' end)) ? (p.value#>>'{}'),false))
    or exists(select 1 from jsonb_array_elements_text(hard) k where not exists(select 1 from marriage.assessment_versions v,
      jsonb_array_elements(v.catalog->'dimensions') d where v.id=version and d->>'id'=k and (d->>'hardAllowed')::boolean))) then
    raise exception 'Invalid v4 preference' using errcode='22023';
  end if;
  if jsonb_array_length(choices)>3$s$);

create function marriage.interview_complete_v5(doc jsonb) returns boolean language sql immutable set search_path='' as $$
 with facts as (
  select value as p from jsonb_array_elements(doc->'profileContext')
  union all select value from jsonb_array_elements(doc->'profileConfirmed')
 ), applicable as (
  select jsonb_array_length(doc->'confirmed')=45
   and (doc->'confirmed') @> '[{"id":"preference:children_plan:self","values":["B"]}]'
   and coalesce((select bool_and(p @> '{"mode":null,"exclude":false}' and p->'values' is not distinct from '["0"]'::jsonb
    and p->'needsClarification' is distinct from 'true'::jsonb) from facts where p->>'fieldId'='marriageBasics.childrenCount'),false)
   and coalesce((select bool_and(p @> '{"mode":"require","exclude":false}' and p->'values' is not distinct from '["none"]'::jsonb
    and p->'needsClarification' is distinct from 'true'::jsonb) from facts where p->>'fieldId'='partnerCriteria.children'),false) as skip_parenting
 ), required as (
  select key,value from jsonb_each(marriage.assessment_fields_v4()),applicable
  where not(skip_parenting and key like 'preference:parenting_approach:%')
 )
 select jsonb_typeof(doc->'confirmed')='array' and jsonb_array_length(doc->'confirmed')=(select count(*) from required)
  and not exists(select 1 from required f where not exists(select 1 from jsonb_array_elements(doc->'confirmed') item
    where item->>'id'=f.key and item->'needsClarification'='false' and item->'values'=jsonb_build_array(item#>>'{values,0}')
      and f.value ? (item#>>'{values,0}')))
$$;
revoke all on function marriage.interview_complete_v5(jsonb) from public,anon,authenticated,service_role;
select pg_temp.patch_assessment('marriage.interview_document_valid_before_required(jsonb)',
 $s$'wudayn-interview-3','wudayn-interview-4')$s$, $s$'wudayn-interview-3','wudayn-interview-4','wudayn-interview-5')$s$);
select pg_temp.patch_assessment('marriage.interview_document_valid_before_required(jsonb)',
 $s$or p->>'fieldId' not in ('social_energy'$s$, $s$or doc->>'promptVersion'<>'wudayn-interview-5' and p->>'fieldId' not in ('social_energy'$s$);
select pg_temp.patch_assessment('marriage.interview_document_valid_before_profile_capture(jsonb)',
 $s$'wudayn-interview-3','wudayn-interview-4')$s$, $s$'wudayn-interview-3','wudayn-interview-4','wudayn-interview-5')$s$);
select pg_temp.patch_assessment('marriage.interview_document_valid_before_profile_capture(jsonb)',
 $s$case when doc->>'promptVersion'='wudayn-interview-4'$s$,
 $s$case when doc->>'promptVersion'='wudayn-interview-5' then marriage.interview_complete_v5(doc) when doc->>'promptVersion'='wudayn-interview-4'$s$);
select pg_temp.patch_assessment('marriage.interview_document_valid_before_partner_defaults(jsonb)',
 $s$jsonb_array_length(doc->'assessmentContext')>44$s$, $s$jsonb_array_length(doc->'assessmentContext')>(case when doc->>'promptVersion'='wudayn-interview-5' then 47 else 44 end)$s$);
select pg_temp.patch_assessment('marriage.interview_document_valid_before_partner_defaults(jsonb)',
 $s$if doc->>'promptVersion'='wudayn-interview-4' then$s$, $s$if doc->>'promptVersion'='wudayn-interview-5' then
 field:=jsonb_build_object('values',marriage.assessment_fields_v4()->(p->>'id'));
 if not (marriage.assessment_fields_v4() ? (p->>'id')) then return false; end if;
 elsif doc->>'promptVersion'='wudayn-interview-4' then$s$);
select pg_temp.patch_assessment('marriage.interview_document_valid(jsonb)',
 $s$if doc->>'promptVersion'='wudayn-interview-4' and ($s$, $s$if doc->>'promptVersion' in ('wudayn-interview-4','wudayn-interview-5') and ($s$);
select pg_temp.patch_assessment('marriage.interview_document_valid(jsonb)',
 $s$marriage.assessment_fields_v3()$s$, $s$(case when doc->>'promptVersion'='wudayn-interview-5' then marriage.assessment_fields_v4() else marriage.assessment_fields_v3() end)$s$);
select pg_temp.patch_assessment('nisfayn_ai.attest_interview(uuid,text,bigint,text,text)',
 $s$s.document->>'promptVersion'<>'wudayn-interview-4'$s$, $s$s.document->>'promptVersion' not in ('wudayn-interview-4','wudayn-interview-5')$s$);
select pg_temp.patch_assessment('nisfayn_ai.attest_interview(uuid,text,bigint,text,text)',
 $s$not marriage.interview_required_complete(s.document->'confirmed')$s$, $s$not (case when s.document->>'promptVersion'='wudayn-interview-5' then marriage.interview_complete_v5(s.document) else marriage.interview_required_complete(s.document->'confirmed') end)$s$);

-- Use the same base application requirements for both versions and validate each answer against its own catalog.
create function marriage.valid_required_v4_answers(profile jsonb) returns boolean language sql immutable set search_path='' as $$
 with required as (select key, value from jsonb_each(marriage.assessment_fields_v4())), actual as (
  select f.key,f.value,case when f.key like 'personality:%' then profile->'personalityAnswers'->>split_part(f.key,':',2)
   else profile->'surveyAnswers'->>((case when split_part(f.key,':',3)='partner' then 'partner_' else '' end)||split_part(f.key,':',2)) end as answer
  from required f
 )
 select profile->>'personalityVersion'='personality-v2' and not exists(select 1 from actual where not coalesce(value ? answer,false)
   and not (key like 'preference:parenting_approach:%' and answer is null and
    coalesce(profile#>>'{surveyAnswers,children_plan}'='B' and profile#>'{marriageBasics,childrenCount}'='0'::jsonb
      and profile#>'{partnerCriteria,children}' @> '{"mode":"require","target":"none"}',false)))
 and (profile->'surveyAnswers' ? 'parenting_approach')=(profile->'surveyAnswers' ? 'partner_parenting_approach')
$$;
revoke all on function marriage.valid_required_v4_answers(jsonb) from public,anon,authenticated,service_role;

do $rewrite$
declare body text:=pg_get_functiondef('marriage.required_onboarding_answers(jsonb)'::regprocedure);
begin
 if strpos(body,$s$and not exists(select 1 from unnest(array['children_plan'$s$)=0 then raise exception 'Unexpected required_onboarding_answers definition'; end if;
 body:=replace(body,$s$and not exists(select 1 from unnest(array['children_plan'$s$,$s$and case when profile->>'assessmentVersion'='marriage-v4' then marriage.valid_required_v4_answers(profile)
 else not exists(select 1 from unnest(array['children_plan'$s$);
 if strpos(body,$s$'D','E'));$s$)=0 then raise exception 'Unexpected required_onboarding_answers definition'; end if;
 body:=replace(body,$s$'D','E'));$s$,$s$'D','E')) end;$s$);
 execute body;
end $rewrite$;

-- Accounts already midway through registration can finish the questionnaire they started.
alter table marriage.members add column legacy_assessment_application boolean not null default false;
update marriage.members m set legacy_assessment_application=true where
 exists(select 1 from marriage.onboarding_drafts d where d.member_id=m.id and expires_at>now())
 or exists(select 1 from marriage.interview_sessions s where s.member_id=m.id and expires_at>now());
select pg_temp.patch_assessment('marriage.apply_profile_before_answer_provenance(jsonb)',
 $s$if marriage.required_onboarding_answers(payload) is not true$s$,
 $s$if payload->>'assessmentVersion' is distinct from 'marriage-v4' and not exists(
    select 1 from marriage.members where id=me and legacy_assessment_application) then
    raise exception 'Complete the current Wudayn assessment' using errcode='22023'; end if;
  if marriage.required_onboarding_answers(payload) is not true$s$);
select pg_temp.patch_assessment('marriage.apply_profile_before_answer_provenance(jsonb)',
 $s$where r.owner_key='member:'||me::text and s.expires_at>now()$s$,
 $s$where r.owner_key='member:'||me::text and s.expires_at>now() and
 ((payload->>'assessmentVersion'='marriage-v4')=(s.document->>'promptVersion'='wudayn-interview-5'))$s$);

-- The applicable version controls both the topics and their order. Keep retired rows for historical hard requirements.
create function marriage.pair_contract(a uuid,b uuid) returns text language sql stable set search_path='' as $$
 select case when exists(select 1 from marriage.member_assessment where member_id in(a,b) and version='marriage-v4')
 then 'marriage-v4' else 'marriage-v3' end
$$;
create function marriage.pair_dimensions(a uuid,b uuid) returns setof marriage.fit_dimensions language sql stable set search_path='' as $$
 select d.code,d.partner_code,d.category,item.n::smallint,d.hard_allowed,d.reason
 from marriage.assessment_versions v, jsonb_array_elements(v.catalog->'dimensions') with ordinality item(j,n)
 join marriage.fit_dimensions d on d.code=item.j->>'id'
 where v.id=marriage.pair_contract(a,b) and not (v.id='marriage-v4' and d.code='parenting_approach' and exists(
   select 1 from marriage.member_assessment ma join marriage.member_basics mb using(member_id)
   join marriage.member_answers c using(member_id)
   join marriage.partner_criteria pc using(member_id)
   where ma.member_id in(a,b) and ma.version='marriage-v4'
    and pc.criterion='children' and pc.rule @> '{"mode":"require","target":"none"}'
    and mb.children_count=0 and c.question_code='children_plan' and c.option_code='B'))
$$;
create function marriage.can_answer_topic(member uuid,topic text) returns boolean language sql stable set search_path='' as $$
 select topic not in ('money_management','conflict_response','social_boundaries') or exists(
  select 1 from marriage.member_assessment where member_id=member and version='marriage-v4')
$$;
revoke all on function marriage.can_answer_topic(uuid,text) from public,anon,authenticated,service_role;
create function marriage.strict_v4_conflict(asker uuid,peer uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from marriage.member_assessment where member_id=asker and version='marriage-v4') and (
  exists(select 1 from marriage.partner_criteria r where r.member_id=asker and r.rule->>'mode'='require'
   and marriage.criterion_fit(asker,peer,r.criterion,r.rule) is not true)
  or exists(select 1 from marriage.fit_hard_requirements r join marriage.pair_dimensions(asker,peer) d on d.code=r.dimension
   join marriage.member_answers w on w.member_id=asker and w.question_code=d.partner_code
   join marriage.member_answers o on o.member_id=peer and o.question_code=d.code
   where r.member_id=asker and marriage.can_answer_topic(peer,d.code) and d.hard_allowed and marriage.expectation_credit(d.code,asker,peer,w.option_code,o.option_code)=0))
$$;
revoke all on function marriage.pair_contract(uuid,uuid),marriage.pair_dimensions(uuid,uuid),marriage.strict_v4_conflict(uuid,uuid)
 from public,anon,authenticated,service_role;

select pg_temp.patch_assessment('marriage.compatible_before_basics(uuid,uuid)',
 $s$and q.age between 18 and 110)$s$,
 $s$and q.age between 18 and 110 and (marriage.pair_contract(a,b)='marriage-v3' or (
   (not exists(select 1 from marriage.member_assessment where member_id=b and version='marriage-v4') or p.age between yp.min_age and yp.max_age)
   and (not exists(select 1 from marriage.member_assessment where member_id=a and version='marriage-v4') or q.age between xp.min_age and xp.max_age)
   and not marriage.strict_v4_conflict(a,b) and not marriage.strict_v4_conflict(b,a))))$s$);
select pg_temp.patch_assessment('marriage.personality_fit(uuid,uuid)',
 $s$on y.member_id=b and y.question_code=q.code)$s$, $s$on y.member_id=b and y.question_code=q.code where q.ordinal<=12)$s$);
do $rewrite$
declare body text:=pg_get_functiondef('marriage.personality_fit(uuid,uuid)'::regprocedure);
begin
 if strpos(body,$s$select jsonb_build_object('version','personality-v1'$s$)=0 then raise exception 'Unexpected personality_fit definition'; end if;
 body:=replace(body,$s$select jsonb_build_object('version','personality-v1'$s$,$s$select case when marriage.pair_contract(a,b)='marriage-v4' then null else jsonb_build_object('version','personality-v1'$s$);
 if strpos(body,$s$from domains d)) from overall o$s$)=0 then raise exception 'Unexpected personality_fit definition'; end if;
 body:=replace(body,$s$from domains d)) from overall o$s$,$s$from domains d)) end from overall o$s$);
 execute body;
end $rewrite$;

select pg_temp.patch_assessment('marriage.pair_fit_before_beena(uuid,uuid)',
 $s$from marriage.fit_dimensions d$s$, $s$from marriage.pair_dimensions(a,b) d$s$);
select pg_temp.patch_assessment('marriage.preference_evidence(uuid,uuid)',
 $s$from marriage.fit_dimensions d$s$, $s$from marriage.pair_dimensions(a,b) d$s$);
select pg_temp.patch_assessment('marriage.preference_evidence(uuid,uuid)',
 $s$'method','reciprocal-weighted-v3'$s$, $s$'method',case when marriage.pair_contract(a,b)='marriage-v4' then 'reciprocal-weighted-v4' else 'reciprocal-weighted-v3' end$s$);

-- V4 uses equal topic contributions (6.25 per known topic); undecided parenthood gives no directional points or weight.
select pg_temp.patch_assessment('marriage.pair_fit_before_beena(uuid,uuid)',
 $s$cat.weight*case when aw.category$s$,
 $s$(case when marriage.pair_contract(a,b)='marriage-v4' then 6.25*count(c.ab) filter(where c.code<>'children_plan' or c.ab<>0.5) else cat.weight end)*case when aw.category$s$);
select pg_temp.patch_assessment('marriage.pair_fit_before_beena(uuid,uuid)',
 $s$cat.weight*case when bw.category$s$,
 $s$(case when marriage.pair_contract(a,b)='marriage-v4' then 6.25*count(c.ba) filter(where c.code<>'children_plan' or c.ba<>0.5) else cat.weight end)*case when bw.category$s$);
select pg_temp.patch_assessment('marriage.pair_fit_before_beena(uuid,uuid)',
 $s$avg(c.ab) as ab,avg(c.ba) as ba$s$,
 $s$avg(c.ab) filter(where c.code<>'children_plan' or c.ab<>0.5 or marriage.pair_contract(a,b)='marriage-v3') as ab,
 avg(c.ba) filter(where c.code<>'children_plan' or c.ba<>0.5 or marriage.pair_contract(a,b)='marriage-v3') as ba$s$);
do $rewrite$
declare body text:=pg_get_functiondef('marriage.pair_fit_before_beena(uuid,uuid)'::regprocedure);
begin
 if strpos(body,$s$* least(t.factor$s$)=0 then raise exception 'Unexpected pair_fit_before_beena definition'; end if;
 body:=replace(body,$s$* least(t.factor$s$,$s$* case when marriage.pair_contract(a,b)='marriage-v4' then 1 else least(t.factor$s$);
 if strpos(body,$s$k.children_conflict then 0.75 else 1 end) as ratio$s$)=0 then raise exception 'Unexpected pair_fit_before_beena definition'; end if;
 body:=replace(body,$s$k.children_conflict then 0.75 else 1 end) as ratio$s$,$s$k.children_conflict then 0.75 else 1 end) end as ratio$s$);
 execute body;
end $rewrite$;
select pg_temp.patch_assessment('marriage.pair_fit_before_beena(uuid,uuid)',
 $s$case when k.required_conflict then 'required_criterion' end]$s$,
 $s$case when k.required_conflict then 'required_criterion' end,
 case when marriage.strict_v4_conflict(a,b) or marriage.strict_v4_conflict(b,a) then 'strict_requirement' end]$s$);
select pg_temp.patch_assessment('marriage.pair_fit_before_beena(uuid,uuid)',
 $s$version='marriage-v3') as complete$s$, $s$version=marriage.pair_contract(a,b)) as complete$s$);
select pg_temp.patch_assessment('marriage.pair_fit_before_beena(uuid,uuid)',
 $s$'version','marriage-v3','band'$s$, $s$'version',marriage.pair_contract(a,b),'band'$s$);

-- A mixed-version pair may contribute only answers defined in that member's questionnaire.
do $mixed$
declare proc regprocedure; alias text; member text; code text; needle text;
begin
 foreach proc in array array['marriage.pair_fit_before_beena(uuid,uuid)'::regprocedure,'marriage.preference_evidence(uuid,uuid)'::regprocedure] loop
  foreach alias in array array['sa','sb','pa','pb'] loop
   member:=right(alias,1);
   code:=case when left(alias,1)='p' then 'd.partner_code' else 'd.code' end;
   needle:=format('join marriage.member_answers %s on %s.member_id=%s and %s.question_code=%s',alias,alias,member,alias,code);
   perform pg_temp.patch_assessment(proc,needle,needle||format(' and marriage.can_answer_topic(%s,d.code)',member));
  end loop;
 end loop;
end $mixed$;
select pg_temp.patch_assessment('marriage.pair_fit(uuid,uuid)',
 $s$select base.fit||jsonb_build_object$s$, $s$select (case when base.fit->>'version'='marriage-v4' then base.fit-'personality' else base.fit end)||jsonb_build_object$s$);
drop function pg_temp.patch_assessment(regprocedure,text,text);
