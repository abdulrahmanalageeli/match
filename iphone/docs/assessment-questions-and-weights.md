# Current Wudayn questions and weights

The standard assessment has 32 practical answers and 15 personality answers. The two parenting answers are skipped only when the member explicitly reports zero existing children, selects no future children and requires a partner with no existing children. The shortened assessment has 30 practical answers and 15 personality answers. An unanswered criterion, «أفضل» or «لا يهمني» keeps both parenting questions. The existing criterion covers children of any age.

## Practical questions

| Topic | About you | About your partner | Baseline points per direction |
|---|---|---|---:|
| الأطفال | كيف تتصور موضوع الإنجاب بعد الزواج؟ | أي رغبة في الإنجاب تفضّلها لدى شريك الحياة؟ | 6.25 |
| مدينة السكن | ما المدن التي يمكنك أن تبني فيها حياتك الزوجية؟ | أي موقف من الانتقال يناسبك لدى شريك الحياة؟ | 6.25 |
| عمل الزوجة وطموحها | أي ترتيب للعمل بعد الزواج يناسب تصورك لحياة الزوجة المهنية؟ | ما الموقف الذي تتمنى أن يشاركك فيه الطرف الآخر؟ | 6.25 |
| موعد الخطوة الرسمية | متى يناسبك الانتقال إلى خطوة رسمية إذا وجدت الشخص المناسب؟ | ما توقيت أول خطوة رسمية الذي يناسبك لدى الطرف الآخر؟ | 6.25 |
| دور الأهل في القرار | إذا اعترض الأهل على قرار كبير يخص بيتكم، كيف تحب تحسمونه؟ | لو أراد الطرف الآخر إشراك أهله في قرار يخصّ بيتكما، وش الدور اللي يناسبك؟ | 6.25 |
| مصاريف البيت الأساسية | لو كان لكل واحد منكم دخل، كيف تتصورون تغطية مصاريف البيت الأساسية؟ | أي اتفاق على المصاريف الأساسية يناسبك من الطرف الآخر؟ | 6.25 |
| توزيع أعمال البيت | في أسبوع عادي، كيف تتصور توزيع الطبخ والتنظيف وأعمال البيت؟ | أي توزيع لأعمال البيت يناسبك لو فضّله الطرف الآخر؟ | 6.25 |
| السكن مع الأهل أو باستقلال | وقت الزواج، أي ترتيب سكن يناسبك فعليًا؟ | أي ترتيب سكن تقدر تتقبله لو فضّله شريكك؟ | 6.25 |
| الزيارات ووقت الراحة | بعد أسبوع مزدحم، كيف يناسبك تقضي وقتك بين الراحة والزيارات؟ | كيف يناسبك أن يوازن الطرف الآخر بين الزيارات ووقت الراحة؟ | 6.25 |
| حدود المناسبات والفعاليات | إذا دُعيت إلى مناسبة أو فعالية عامة، كيف تختار وش تحضر؟ | كيف تفضّل أن يختار شريكك المناسبات والفعاليات التي يحضرها؟ | 6.25 |
| عند احتدام النقاش | إذا احتدّ النقاش بينك وبين شخص قريب، وش الأقرب للي يصير معك عادة؟ | إذا احتدّ النقاش، أي استجابة تفضّلها من الطرف الآخر؟ | 6.25 |
| العودة بعد الزعل | بعد ما يهدأ الخلاف، وش أول خطوة عادةً تسويها عشان ترجعون للتفاهم؟ | كيف تفضّل أن يعود الطرف الآخر للحوار بعد الزعل؟ | 6.25 |
| الممارسة الدينية في البيت | إذا اختلف روتين عبادتكم في البيت، وش تتوقع في يومكم العادي؟ | أي توقع من الطرف الآخر بخصوص روتين العبادة يناسبك؟ | 6.25 |
| القرب والمساحة | عندما يزداد القرب بينكما، ما الذي يساعدك على الارتياح؟ | أي طريقة في بناء القرب ترتاح لها لدى الشريك؟ | 6.25 |
| الادخار والصرف | إذا جاءكم مبلغ إضافي غير متوقع، وش الأقرب لطريقتك؟ | أي طريقة في التعامل مع المال ترتاح لها عند شريكك؟ | 6.25 |
| التعامل مع الأطفال | لو كسر طفل قاعدة اتفقتوا عليها، وش الأقرب لتصرفك؟ | أي تصرف ترتاح له من الطرف الآخر في هالموقف؟ | 6.25 |

With all 16 topics scored, the category totals are قيم البيت ومسؤولياته 37.5, الأطفال والسكن 25.0, إيقاع الحياة 12.5, الحوار والاختلاف 12.5, أسلوب التعارف 6.25, توقيت الزواج 6.25. Each selected priority doubles that category’s topic weights in the member’s direction. An observed structured partner criterion contributes 2 points. The directional results are normalized over the evidence counted, and the practical percentage uses their geometric mean. Both members' age ranges apply to new introductions. Eligibility also enforces each member's explicitly marked requirements and the applicable geographic and marriage-structure rules. A required structured criterion needs a known match. An unanswered survey topic remains unresolved.

The 6.25 points are an initial product choice. A category’s total follows from its number of topics. Recheck the totals whenever the catalog changes.

### Sensitivity to priority weighting

Run `node iphone/scripts/priority-sensitivity.mjs` from the repository root. The script enumerates every pair of distinct match-count patterns for one selected category, assuming 16 observed binary topic credits and no structured criteria. Reverse-direction fit is held constant and positive. Each pattern counts once, regardless of its frequency among real members.

| Selected practical category | Share at 1.5× | Share at 2× | Strict ordering reversals | Ties gained or lost |
|---|---:|---:|---:|---:|
| Household values and responsibilities | 47.4% | 54.5% | 47 / 2,926 | 177 |
| Children and housing | 33.3% | 40.0% | 22 / 2,080 | 127 |
| Lifestyle or communication, each | 17.6% | 22.2% | 0 / 990 | 49 |
| Getting-acquainted style or formal timing, each | 9.1% | 11.8% | 0 / 496 | 14 |

For example, one candidate meets six household expectations and three others. A second meets three household expectations and eight others. At 2× the first leads 68.2% to 63.6% in that direction. At 1.5× the second leads 65.8% to 63.2%. A pilot can present these trade-offs to consenting members and compare their own orderings with each rule.

Recommendation ranking also scales by the square root of practical topic coverage. If both members complete the separate optional Beena scenarios, its score applies a ranking multiplier from 0.95 to 1.05. Neither adjustment changes the displayed practical percentage.

Luna uses «هل ترغبين في العمل بعد الزواج؟» for the wife-employment self question when the member is a woman.

## Personality statements

The five response choices are «لا يشبهني إطلاقًا»، «لا يشبهني كثيرًا»، «يشبهني إلى حد ما»، «يشبهني»، and «يشبهني كثيرًا». Each statement contributes one third of its domain’s score on the five-point response scale. Reverse scoring turns 1 into 5, 2 into 4, and vice versa. The five domain scores contribute zero weight to practical matching.

| Domain | Statement | Scoring |
|---|---|---|
| التعامل مع الضغط | إذا صار شيء مزعج، أقدر أهدأ وأفكر قبل ما أتصرف. | Direct |
| التعامل مع الضغط | إذا ضغطتني أمور يومي، يستمر معي التوتر لفترة طويلة. | Reverse |
| التعامل مع الضغط | إذا واجهت مشكلة، أرجع لطبيعتي بعد وقت معقول. | Direct |
| التنظيم والوفاء بالالتزامات | إذا التزمت بشيء، أحرص أني أنفذه حتى لو انشغلت. | Direct |
| التنظيم والوفاء بالالتزامات | أرتب أموري المهمة قبل وقتها بدل ما أتركها لآخر لحظة. | Direct |
| التنظيم والوفاء بالالتزامات | أحيانًا أبدأ أشياء مهمة وما أكملها. | Reverse |
| مراعاة الآخرين | حتى إذا اختلفت مع شخص، أحاول أفهم وجهة نظره قبل ما أحكم. | Direct |
| مراعاة الآخرين | إذا أخطأت في حق شخص، أقدر أعترف بخطئي وأصلّح الموقف. | Direct |
| مراعاة الآخرين | وقت الزعل، ممكن أقول كلام أقسى مما أقصد. | Reverse |
| الطاقة الاجتماعية | وجودي مع مجموعة من الناس يعطيني طاقة. | Direct |
| الطاقة الاجتماعية | عادةً أبادر بالكلام مع أشخاص جدد. | Direct |
| الطاقة الاجتماعية | أفضل غالبًا الأجواء الهادئة على التجمعات الكبيرة. | Reverse |
| الانفتاح على التجربة | أستمتع بتجربة طرق أو أفكار جديدة حتى لو كانت مختلفة عن اللي تعودت عليه. | Direct |
| الانفتاح على التجربة | أحب أفهم وجهات نظر أو أفكار تختلف عن رأيي. | Direct |
| الانفتاح على التجربة | أفضل الأشياء المألوفة حتى لو كانت هناك طريقة جديدة ممكن تكون أفضل. | Reverse |

### Personality pilot

The instrument version and original A–E answers determine each 1–5 response, its scoring key and the domain mean. A missing or invalid item leaves its domain incomplete. Keep the three-item means descriptive and private.

With consented pilot responses, compare missingness and corrected item–total correlations for direct and reverse items. Examine whether `harsh_words` also loads on stress handling and whether `explore_views` also loads on consideration for others. Include `quiet_settings` in cognitive interviews with members who enjoy socialising in small groups. Assess wording effects, ordinal factor structure, test–retest stability and comparability across age and gender before revising items. Version any wording change.

For outcome validation, distinguish mutual continuation and progression to a formal step from voluntary reports of relationship satisfaction. Record the follow-up period and missing outcomes. Engagement alone cannot establish predictive validity.
