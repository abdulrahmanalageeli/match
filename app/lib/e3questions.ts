// Shared question sets for Event3 round screens.
// Round 1 (same-gender) defaults to specialQuestions.
// Round 2 (opposite-gender) defaults to round1Questions.
// eventQuestions is the alternative set available for both rounds.

export interface QuestionItem {
  title: string
  question: string
  level: number
  levelTitle: string
  levelIcon: string
}

// ── Choice round (1-on-1 session — participant's choice) ──────────────────
export const choiceQuestions: QuestionItem[] = [
  // Level 1: The Spark 🔥
  { title: "رأي غير شعبي", question: "وش فيه قناعة عندك… تحس لو قلتها عند أغلب الناس اللي تعرفهم، غالبًا بيعترضون عليها؟ وليه متمسك فيها؟", level: 1, levelTitle: "المستوى الأول — الشرارة", levelIcon: "Flame" },
  { title: "حلم تغيّر", question: "فيه شي كنت تتمناه مرة زمان… واليوم ما عاد يهمك بنفس الطريقة؟ تحس هذا لأنك نضجت… ولا لأنك استسلمت؟", level: 1, levelTitle: "المستوى الأول — الشرارة", levelIcon: "Flame" },
  { title: "العلاقة القريبة", question: "وش شكل العلاقة القريبة المثالية بالنسبة لك؟ مو لازم تكون علاقة عاطفية… وش اللي يخلي شخص تحس فعلًا إنه قريب منك؟", level: 1, levelTitle: "المستوى الأول — الشرارة", levelIcon: "Flame" },
  { title: "موهبة ما تبين", question: "وش الشي اللي أنت شاطر فيه أكثر مما الناس تتوقع… بس غالبًا ما تتكلم عنه؟", level: 1, levelTitle: "المستوى الأول — الشرارة", levelIcon: "Flame" },
  // Level 2: The Core 🧭
  { title: "احتياج غير معلن", question: "وش الشي اللي تحتاجه من الأشخاص القريبين منك… لكن نادر تطلبه منهم بشكل مباشر؟ وليه؟", level: 2, levelTitle: "المستوى الثاني — الجوهر", levelIcon: "Compass" },
  { title: "مين ترتاح له؟", question: "تميل أكثر للأشخاص اللي يهدّونك ويعطونك راحة… ولا اللي يشعلون حماسك ويدفعونك للأمام؟ وبرأيك أي النوعين فعلًا يناسبك أكثر؟", level: 2, levelTitle: "المستوى الثاني — الجوهر", levelIcon: "Compass" },
  { title: "قيمة ما تتنازل عنها", question: "فيه قيمة عندك لو شخص قريب منك ما كان يؤمن فيها… تحس إنها بتضايقك مع الوقت حتى لو ما تكلمت؟ وش هي؟", level: 2, levelTitle: "المستوى الثاني — الجوهر", levelIcon: "Compass" },
  { title: "لحظة الثقة", question: "متى تعرف إنك فعلًا وثقت بشخص؟ فيه موقف أو لحظة معيّنة تحس بعدها إن الثقة خلاص ثبتت؟", level: 2, levelTitle: "المستوى الثاني — الجوهر", levelIcon: "Compass" },
  // Level 3: Sharing Experiences 💫
  { title: "علاقة غيّرتك", question: "احكِ لنا عن علاقة بحياتك—أي نوع كانت—غيّرت طريقتك في التعامل مع الناس بعدين. وش اللي تغيّر فيك؟", level: 3, levelTitle: "المستوى الثالث — مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "تعطي أكثر مما تاخذ", question: "وش الشي اللي دايم تعطيه في علاقاتك مع الناس… وتحس نادر يجيك بنفس القدر؟ وهل تصالحت مع هالشي؟", level: 3, levelTitle: "المستوى الثالث — مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "فكرة احتجت تنساها", question: "وش أصعب فكرة أو عادة كان لازم تتخلّى عنها عشان تصير علاقاتك مع الناس أفضل؟", level: 3, levelTitle: "المستوى الثالث — مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "فهم غير متوقع", question: "اذكر موقف فهمت فيه شخص بطريقة ما كنت تتوقعها أبد… وش اللي خلاك تغيّر نظرتك له؟", level: 3, levelTitle: "المستوى الثالث — مشاركة التجارب", levelIcon: "Sparkles" },
  // Level 4: Closing 🤝
  { title: "ذكرى اللقاء", question: "بعد لقائنا اليوم… وش الشي اللي تتمنى الشخص اللي قدامك يتذكره عن هالحوار؟", level: 4, levelTitle: "المستوى الرابع — ختام اللقاء", levelIcon: "Handshake" },
  { title: "شي فاجأك", question: "وش أكثر شي فاجأك في الشخص اللي قدامك اليوم؟", level: 4, levelTitle: "المستوى الرابع — ختام اللقاء", levelIcon: "Handshake" },
  { title: "عنوان الحوار", question: "لو توصف هالحوار بكلمة وحدة فقط… وش بتكون؟ وليه اخترتها؟", level: 4, levelTitle: "المستوى الرابع — ختام اللقاء", levelIcon: "Handshake" },
  { title: "شي نادر تقوله", question: "وش الشي اللي قلته اليوم… وعادة ما تقوله بسهولة للناس؟", level: 4, levelTitle: "المستوى الرابع — ختام اللقاء", levelIcon: "Handshake" },
]

// ── Same-gender default (Round 1) ──────────────────────────────────────────
export const specialQuestions: QuestionItem[] = [
  // Level 0: Quick Connect ⚡
  { title: "الشي اللي يدافع عنك", question: "فيه موضوع لو أحد هاجمه قدامك... تلقائيًا تلقى نفسك تدافع عنه؟ وش هو؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "زر الإعادة", question: "لو تقدر تعيش سنة من حياتك مرة ثانية بكل تفاصيلها... أي سنة تختار وليه؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "أزمة بسيطة", question: "وش المشكلة الصغيرة اللي تزعجك أكثر مما المفروض؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "قائمة الانتظار", question: "وش الشي اللي تقول من سنوات: (لازم أجربه يومًا ما) وما سويته للحين؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "نظام التشغيل", question: "أنت شخص يعيش بالتخطيط والجداول... ولا تمشي مع التيار وتشوف وين يوديك اليوم؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "الرأي المثير للجدل", question: "وش رأي عندك غالبًا يبدأ نقاشات طويلة مع أصحابك؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "شخصية أصحابك", question: "وش الدور اللي تلعبه غالبًا بين أصحابك؟ المنظم؟ المستشار؟ المهرج؟ المختفي؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  // Level 1: The Spark 🧊
  { title: "تغيير صغير", question: "وش عادة بسيطة غيرتها بحياتك وكان أثرها أكبر بكثير مما توقعت؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  { title: "إعجاب مهني", question: "وش وظيفة أو مجال تشوفه مثير للاهتمام حتى لو مستحيل تشتغل فيه؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  { title: "بطلك الشخصي", question: "مين شخص بحياتك تعجبك طريقته في العيش أكثر من إنجازاته؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  { title: "قرار ممتاز", question: "وش أفضل قرار اتخذته خلال آخر سنتين؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  // Level 2: The Core 🧭
  { title: "علامة النضج", question: "متى حسيت لأول مرة إنك فعلاً كبرت أو نضجت؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "الراحة الحقيقية", question: "وش الشي اللي إذا اختفى من حياتك لفترة تبدأ تحس إنك مو على طبيعتك؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "صفة تتمناها", question: "وش صفة تتمنى تكون موجودة فيك أكثر مما هي موجودة الآن؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "إعادة تعريف النجاح", question: "هل تعريفك للنجاح اليوم مختلف عن قبل خمس سنوات؟ وش تغير؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "نوع الأشخاص", question: "وش نوع الأشخاص اللي ترتاح لهم بسرعة حتى لو ما تعرفهم زين؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  // Level 3: Sharing Experiences 💫
  { title: "درس مكلف", question: "وش درس تعلمته بطريقة مؤلمة أو مكلفة شوي؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "موقف ضحكت عليه لاحقًا", question: "وش موقف كان مزعج وقتها لكن صار من أفضل السوالف بعد سنوات؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "مجازفة تستحق", question: "وش مخاطرة أخذتها وكانت من أفضل الأشياء اللي سويتها؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "فترة صعبة", question: "وش أكثر فترة شكّلت جزء كبير من شخصيتك الحالية؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "شي كنت مخطئ فيه", question: "وش فكرة أو قناعة كنت متمسك فيها بقوة ثم اكتشفت أنك كنت مخطئ؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  // Level 4: "What If?" 🤝
  { title: "تبادل المهارات", question: "لو لازم كل واحد يعلم الثاني شيء واحد يتقنه... وش الشي اللي بتعلمه؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
  { title: "مشروع مشترك", question: "لو اضطرينا نبدأ مشروع أو فعالية سوا بكرة... وش تتوقع يكون دور كل واحد فينا؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
  { title: "نوع الصداقة", question: "وش الشي اللي يخلي شخص يتحول من معرفة عابرة إلى صديق فعلاً بالنسبة لك؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
  { title: "سبب التطابق", question: "بعد هالحوار... وش تتوقع الشي اللي خلّى النظام يجمعكم في نفس المجموعة؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
]

// ── Opposite-gender default (Round 2) — Set 1 ─────────────────────────────
export const round1Questions: QuestionItem[] = [
  // Level 0: Quick Connect ⚡
  { title: "من أنا؟", question: "لو توصف نفسك بثلاث كلمات… وش بتكون؟ وليه اخترتها؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "الانسجام", question: "وش حركة/كلمة بسيطة تخليك ترتاح لشخص جديد بسرعة؟ وبالعكس… وش شي صغير لو سواه أحد ينفّرك؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "الطاقة", question: "وش موضوع لو فتحناه… تقعد تسولف فيه وتنسى الوقت؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "الويكند", question: "وش شكل الويكند المثالي عندك؟ بيت وهدوء، طلعة مع ناسك، ولا مغامرة خارج المدينة؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "الموسيقى", question: "وش آخر ٣ أغاني أو فنانين عندك على تكرار وما تملّ منهم؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "الانطباع العكسي", question: "وش الانطباع اللي الناس غالبًا ياخذونه عنك من أول مرة… بس أنت تحسّه مو دقيق؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "فن فاكت", question: "قل لنا Fun Fact عنك: موهبة غريبة، معلومة عنك، أو شي يسوي صدمة لطيفة.", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  // Level 1: The Spark 🧊
  { title: "يومك المثالي", question: "لو تعيش يوم مثالي… وش تسوي من أول ما تصحى لين تنام؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  { title: "حياة ثانية", question: "لو تشتغل شيء بعيد تمامًا عن تخصصك الحالي… وش بيكون؟ وليه تحسّه يناسبك؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  { title: "آخر مرة انتعشت", question: "اذكر آخر مرة حسّيت بطاقة وحماس قوي… وش كنت تسوي؟ ولحالك ولا مع أحد؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  { title: "شي أثّر عليك", question: "في كتاب/فيلم/مسلسل/وثائقي أثّر فيك السنة اللي راحت؟ وش هو؟ ووش اللي غيّره فيك؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  // Level 2: The Core 🧭
  { title: "مبدأ ما تتنازل عنه", question: "وش المبدأ اللي تمشي عليه وما تتنازل عنه مهما كان الموقف؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "الخط الأحمر", question: "وش عندك خط أحمر… الناس ممكن يشوفونه عادي، بس أنت لا؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "صفة تعجبك في الناس", question: "الأشخاص اللي تحترمهم بحياتك… وش الصفة المشتركة بينهم؟ وليه تهمّك هالصفة؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "الأثر اللي تبغاه", question: "لو الناس يتذكرونك بشي واحد… وش تبغاه يكون؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "موقف علّمك حدودك", question: "وش موقف خلاك تعرف حدودك فعلاً؟ وكيف تغيّرت بعده؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "فصل حياتك الآن", question: "لو حياتك كتاب… وش عنوان الفصل اللي أنت عايشه الحين؟ وليه هذا العنوان؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  // Level 3: Sharing Experiences 💫
  { title: "ذكرى غالية", question: "قل لنا ذكرى غالية عليك… وش اللي يخلّيها ما تروح من بالك؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "لحظة تغيّرت بعدها", question: "هل مرّت عليك لحظة/تجربة حسّيت بعدها إنك ما عاد صرت نفس الشخص؟ وش اللي تغيّر؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "فخر ما تتكلم عنه", question: "وش إنجاز أنت فخور فيه جدًا… بس نادرًا تتكلم عنه أو أحد ينتبه له؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "فكرة تغيّرت عندك", question: "وش فكرة كنت مؤمن فيها زمان… وبعدين تغيّرت نظرتك لها ١٨٠ درجة؟ وش السبب؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "شخص غيّر نظرتك", question: "فيه شخص غيّر نظرتك للعلاقات أو الصداقة بشكل كبير؟ وش اللي صار؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "جانب ما يعرفونه كثير", question: "شاركنا جانب فيك قليل يعرفونه… بس تحسّه جزء أساسي من شخصيتك.", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  // Level 4: "What If?" 🤝
  { title: "اختبار النوايا", question: "لو قلت كلمة بنية طيبة وانفهمت بالعكس… تشرح وتوضح؟ ولا تترك الموقف يعدّي؟ وليه؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
  { title: "أسلوب الدعم", question: "لو صديق قريب يمر بوقت صعب بسبب غلطة… أنت تميل تعطي حلول ونصايح؟ ولا تسمع وتطمن وتخفف؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
  { title: "اختلاف على مبدأ", question: "لو اكتشفت إن بينك وبين شريك الحوار اختلاف على نقطة مبدئية… هل تمشيها عشان العلاقة طيبة، ولا توقف وتناقشها؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
  { title: "ليش جمعكم الـAI؟", question: "بعد حوارنا… ليه تتوقع النظام/الـAI جمع بينكم؟ وش اللي لاحظته من تشابه أو تكامل بينكم؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
]

// ── Alternative set (Set 2) ────────────────────────────────────────────────
export const eventQuestions: QuestionItem[] = [
  // Level 0
  { title: "نوافذ العقل", question: "لو عقلك متصفح… كم تبويب (tab) مفتوح الحين؟ وعن إيش أغلبها؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "عدة تعديل المزاج", question: "وش عدّتك لتعديل المزاج؟ (أغنية/فيلم/نشاط) شي أول ما تسويه يحسّن يومك.", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "نقاش يومي", question: "وش نقاش بسيط عندك فيه رأي قوي وما تتنازل عنه؟ (زي الأناناس مع البيتزا، الاتصال ولا الرسايل)", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "طاقة المكان", question: "تفضّل قهوة زحمة وحيوية… ولا مكان هادي ورايق زي مكتبة؟ وليه؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "أسلوبك بالواتساب", question: "بثلاث كلمات… كيف يوصفونك أصحابك في رسايل الواتساب؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "مهارة ودّك فيها", question: "وش مهارة صغيرة وممتعة ودّك تتعلمها بس دايم تسوّف؟ (تصفير بالأصابع، خفة يد، لغة إشارة…)", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  { title: "مضيعة وقت؟", question: "وش شي الناس تشوفه ممتع… وأنت تحسّه مضيعة وقت ١٠٠٪؟", level: 0, levelTitle: "اتصال سريع", levelIcon: "Zap" },
  // Level 1
  { title: "رحلة غيّرتك", question: "سولف لنا عن رحلة/مغامرة—even لو بسيطة—غيّرت فيك شيء. وش تعلّمت منها؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  { title: "شخصية تلهمك", question: "مين شخصية (حقيقية أو خيالية) تلهمك؟ وش الصفة اللي شدتّك فيها؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  { title: "آخر امتنان", question: "وش آخر شي حسّيت بامتنان حقيقي تجاهه؟ (شخص/موقف/شي بسيط)", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  { title: "قرار خارج راحتك", question: "وش آخر قرار سويته وحسّيت إنه خارج منطقة راحتك؟ وكيف طلعت نتيجته؟", level: 1, levelTitle: "المستوى الأول: الشرارة", levelIcon: "Flame" },
  // Level 2
  { title: "بوصلة قراراتك", question: "إذا واجهت قرار صعب… وش اللي يرجّح عندك؟ حدسك، قيمك، نصيحة شخص تثق فيه، ولا التحليل والمنطق؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "تعريفك للنجاح", question: "كيف تعرّف النجاح عندك؟ منصب، راحة بال، علاقات قوية، إنجاز… ولا شي ثاني؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "أغلى من الفلوس", question: "وش أثمن شي بحياتك ما ينشرى بالفلوس؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  { title: "صفة ما تتحمّلها", question: "وش صفة إذا شفتها في شخص… يصير صعب عليك تثق فيه أو تكمل علاقتك معه؟", level: 2, levelTitle: "المستوى الثاني: الجوهر", levelIcon: "Compass" },
  // Level 3
  { title: "حكمت بسرعة", question: "اذكر مرة حكمت على شخص/موقف بسرعة… وبعدين اكتشفت إنك كنت غلطان تمامًا.", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "نصيحة فرقت معك", question: "وش أفضل نصيحة سمعتها وطبّقتها… وحسّيت فعلًا إنها غيّرت فيك شيء؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "شجاعة محد انتبه لها", question: "متى آخر مرة كنت شجاع—حتى لو ما أحد لاحظ؟ وش كان الموقف؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  { title: "شي يروقك دايم", question: "وش الشي اللي يرجّع لك الراحة/السعادة مهما كان يومك صعب؟", level: 3, levelTitle: "المستوى الثالث: مشاركة التجارب", levelIcon: "Sparkles" },
  // Level 4
  { title: "صديق أم حقيقة؟", question: "لو شخص قريب منك متحمس لشي (مشروع/فكرة/لبس) وأنت تشوفه مو حلو… تجامله ولا تكون صريح؟ وليه؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
  { title: "فرصة ثانية", question: "لو شخص خذلك قبل ورجع يعتذر ويطلب فرصة ثانية… هل قرارك يعتمد على نوع الغلطة؟ ولا على مكانته عندك؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
  { title: "يتغير ولا يكتشف نفسه؟", question: "برأيك… الشخص يتغير مع الوقت؟ ولا بس يكتشف نفسه الحقيقية أكثر؟ وليه؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
  { title: "انطباع الذكاء الاصطناعي", question: "بناءً على حوارنا، إيش الصفة اللي تتوقع إن الذكاء الاصطناعي ركز عليها لما قرر يجمعكم؟ وهل تتفقون مع هذا التوقع؟", level: 4, levelTitle: "المستوى الرابع: \"ماذا لو؟\"", levelIcon: "Handshake" },
]
