import currentCatalog from '../compatibility/catalog.json' with { type: 'json' };
import legacyCatalog from '../compatibility/catalog-v3.json' with { type: 'json' };
import { parentingApplicable } from '../compatibility/parenting.mjs';

const demoMen = [
  { alias:'فهد',age:32,city:'الرياض',occupation:'محلّل بيانات',education:'ماجستير علوم البيانات',
    bio:'دوامي في تحليل البيانات، وبعده أفصل بالمشي أو بكم صفحة من كتاب. الجمعة غالبًا غدا عند الوالدة. وإذا عندي يومين فاضية أحب أطلع مشوار بالسيارة وأوقف عند الأماكن اللي تعجبني.',
    lookingFor:'شريكة فضولية وواضحة، نتشارك الحديث والقرار دون استعجال القرب.',values:'الصدق من البداية، والوفاء بالوعود الصغيرة.',home:'مكتبة صغيرة وعشاء بلا هواتف، مع مساحة لعمل كل منا.',interests:['travel','reading'],traits:[2,2,5,3,3,2,3,5,3,2,4,5],currentTraits:'DADDBADDBBCEDDC',timeline:'within_3_months',meeting:'public_before_formal' },
  { alias:'سعود',age:30,city:'الرياض',occupation:'مهندس مدني',education:'بكالوريوس هندسة مدنية',
    bio:'أشتغل في مواقع المشاريع وأطلع من البيت قبل الزحمة. إذا رجعت بدري أطبخ، وحاليًا أحاول أضبط المرقوق مثل أبوي. غالبًا أرتّب الويكند من الخميس عشان ألحق أشوف أهلي وأرتاح.',
    lookingFor:'شريكة تهتم بالعائلة ولها شغفها الخاص؛ نتفق دون أن يفقد أحدنا صوته.',values:'وضوح المسؤوليات وصلة الأهل.',home:'روتين مريح أيام العمل، وطبخ مشترك في نهاية الأسبوع.',interests:['walking','cooking'],traits:[3,2,3,2,3,3,2,5,2,2,4,4],currentTraits:'DBEEEBCCCCBBBCC',timeline:'three_to_six_months',meeting:'family_before_formal' },
  { alias:'ياسر',age:29,city:'الرياض',occupation:'مصمم منتجات',education:'بكالوريوس تصميم',
    bio:'أصمم تطبيقات، ودايم معي كاميرا صغيرة. آخر مشروع شخصي لي كان تصوير محلات الحي من بدري. إذا طولت قدام الشاشة أطلع أمشي شوي وأرجع أروق.',
    lookingFor:'صداقة عميقة ونية واضحة، وحديث صريح عن الأمور الصعبة.',values:'اللطف والخصوصية ودعم الطموح.',home:'بيت فيه فن ونباتات، وخروجة عفوية بين حين وآخر.',interests:['photography','reading'],traits:[3,4,5,4,3,2,3,2,5,3,4,4],currentTraits:'CBDBCCDDBEEAEEA',timeline:'within_3_months',meeting:'public_before_formal',relocate:true },
  { alias:'مازن',age:34,city:'الرياض',occupation:'معلم',education:'بكالوريوس تربية',
    bio:'أدرّس متوسط، وإذا رجعت من المدرسة أحب آخذ لي ساعة هدوء. الويكند عندي يا غدا مع أهلي يا زيارة معرض. إذا سافرت، أول شيء أدور عليه متحف صغير أو مكان له قصة.',
    lookingFor:'شريكة حنونة وعملية، نبني الثقة على مهل.',values:'حسن الظن وتقدير وقت العائلة.',home:'قرب من الأهل مع وقت خاص لنا أسبوعيًا.',interests:['museums','travel'],traits:[4,3,3,4,4,4,4,4,2,2,3,4],currentTraits:'DDDEDBEDBDCCDCB',timeline:'when_ready',meeting:'family_before_formal' },
  { alias:'نواف',age:35,city:'الرياض',occupation:'باحث',education:'ماجستير إدارة',
    bio:'أشتغل في الأبحاث وأكتب قصص قصيرة على الجنب. ابني معي بعض أيام الأسبوع، وغالبًا نطلع نتمشى بعد العصر. أفضّل أتكلم عن ترتيب وقتي من بدري عشان تكون الصورة واضحة.',
    lookingFor:'شريكة مستقلة في رأيها تتقبل أن الأبوة جزء من حياتي.',values:'المساحة الشخصية والاعتذار عند الخطأ.',home:'أمسيات هادئة وترتيب يحترم مواعيد ابني وراحتنا.',interests:['creative_writing','walking'],traits:[1,2,5,2,2,3,2,4,3,1,4,5],currentTraits:'EADDCBEECABBECB',timeline:'over_a_year',meeting:'discuss_together',status:'divorced',childrenCount:1,children:'C' },
  { alias:'عبدالله',age:31,city:'المدينة المنورة',occupation:'صيدلي',education:'دكتور صيدلة',
    bio:'صيدلي في المدينة ودوامي مناوبات، فممكن أرد متأخر إذا كنت في الشفت. إذا اجتمعوا الشباب عندي غالبًا نطبخ ونجرب لعبة طاولة جديدة. الترتيب المسبق يسهّل علي الالتزام.',
    lookingFor:'شريكة نفهم ظروف عمل بعضنا ونعطي وقتنا المشترك أولوية.',values:'التعاون والثقة وطلب الاحتياج بوضوح.',home:'نقسم المسؤوليات وفق المناوبات ونحافظ على موعد أسبوعي.',interests:['board_games','cooking'],traits:[4,4,3,4,5,4,4,3,4,4,4,3],currentTraits:'CDBDCBDEBBBBDEC',timeline:'six_to_twelve_months',meeting:'public_before_formal',relocate:true },
  { alias:'عمر',age:27,city:'جدة',occupation:'مهندس برمجيات',education:'بكالوريوس علوم حاسب',
    bio:'أشتغل من البيت في جدة، وأطلع أمشي عند البحر إذا طولت قدام اللابتوب. أحب ألعاب الطاولة، وعادة أكون أهدأ واحد أول الجلسة. بالرسائل آخذ راحتي أسرع.',
    lookingFor:'شريكة تحترم الهدوء وتحب مشاركة هواية دون أن نتشابه في كل شيء.',values:'الخصوصية والاتفاق على وقت للشاشات.',home:'وقت للعمل وآخر لنا؛ ويمكنني الانتقال إن اتفقنا.',interests:['board_games','walking','reading'],traits:[1,1,4,2,2,2,1,4,4,1,3,5],currentTraits:'DBEEEBECAAAACEB',timeline:'six_to_twelve_months',meeting:'public_before_formal',relocate:true },
  { alias:'خالد',age:38,city:'الخبر',occupation:'مدير عمليات',education:'بكالوريوس إدارة أعمال',
    bio:'أنا من الخبر وأشتغل في العمليات. جزء كبير من يومي يدور حول بنتي ومدرستها. إذا نامت أطلع أمشي قريب من البيت أو أجهّز فطور بكرة. أميل للجلسات الصغيرة والكلام الواضح.',
    lookingFor:'شريكة نناقش معها شكل الأسرة والمسؤوليات من البداية.',values:'الاستقرار والصدق واحترام تجربة الآخر.',home:'بيت منتظم وقريب من مدرسة ابنتي، مع مساحة لاهتمامات الجميع.',interests:['walking','cooking'],traits:[2,3,3,2,3,2,2,5,1,3,5,4],currentTraits:'EBDDECDEDCCCDBB',timeline:'when_ready',meeting:'family_before_formal',status:'widowed',childrenCount:1,children:'C' },
  { alias:'راشد',age:26,city:'الرياض',occupation:'أخصائي تسويق',education:'بكالوريوس تسويق',
    bio:'أشتغل في التسويق وغالبًا عندي اقتراح لمشوار الويكند، حتى لو مجرد قهوة في حي جديد وتصوير. هذه الفترة أحاول أخلي يوم الجمعة للأهل وما أعبّي كل وقتي بالمواعيد.',
    lookingFor:'شريكة تتكلم بصراحة وتستمتع بالتجربة حتى عندما لا تكون مثالية.',values:'المبادرة والمرح واحترام الرفض.',home:'بيت يستقبل الأصدقاء أحيانًا، مع أيام هادئة نلتزم بها.',interests:['travel','photography'],traits:[5,5,1,4,5,4,5,1,5,4,4,1],currentTraits:'BDBBBDECCEEAEEA',timeline:'three_to_six_months',meeting:'public_before_formal' },
  { alias:'حسن',age:36,city:'الدمام',occupation:'محاسب',education:'بكالوريوس محاسبة',
    bio:'من أهل الدمام، وأشتغل في المحاسبة. الجمعة إذا فضيت أطوّل في الطبخ أو أكمّل كتاب تاريخ. لست سريعًا في مشاركة التفاصيل، لكنني ثابت في التواصل عندما أرتاح.',
    lookingFor:'شريكة ما تخطط للإنجاب، ونتفق سوا على المدينة والقرب من الأهل.',values:'الالتزام بالاتفاقات والعدل في المصاريف.',home:'ميزانية واضحة وزيارات عائلية نخطط لها مسبقًا.',interests:['reading','cooking'],traits:[2,1,4,1,3,3,2,5,2,2,4,5],currentTraits:'EAEEEBEDBABECEE',timeline:'within_3_months',meeting:'family_before_formal',relocate:true,children:'B' },
];
const demoWomen = [
  { alias:'سارة',age:29,city:'الرياض',occupation:'محللة بيانات',education:'ماجستير تحليل أعمال',
    bio:'أشتغل في تحليل البيانات وأهوى الروايات اللي تشدّني من أول فصل. أحيانًا أختار طلعة يوم واحد خارج الرياض مع أختي. هادئة في أول لقاء وبعدها أضحك وأتكلم أكثر.',
    lookingFor:'شريك فضولي وواضح نشارك الحديث والقرار.',values:'الصدق والخصوصية واحترام الطموح.',home:'وقت هادئ بعد العمل ورحلة نخطط لها معًا.',interests:['reading','travel'],traits:[2,2,5,3,3,3,2,4,4,2,4,5],currentTraits:'EAEDEAEDEBBECCB',timeline:'within_3_months',meeting:'public_before_formal' },
  { alias:'لولوة',age:28,city:'الرياض',occupation:'مهندسة مدنية',education:'بكالوريوس هندسة مدنية',
    bio:'أشتغل مهندسة مدنية. بعض الأسابيع أتنقل بين الموقع والمكتب، فالمشي بعد الدوام هو وقتي لنفسي. آخر وصفة جربتها خبز بالزعتر، وأهلي للحين يطلبونه كل جمعة.',
    lookingFor:'شريك يساند عملي ونكون سندًا لبعضنا في الأيام المزدحمة.',values:'وضوح المسؤوليات وتقدير الجهد.',home:'بيت عملي ودافئ، نقسم مهامه وفق الوقت المتاح.',interests:['walking','cooking'],traits:[3,3,3,3,4,3,4,5,3,3,4,4],currentTraits:'DDCEEAEDCBCCDDC',timeline:'three_to_six_months',meeting:'family_before_formal' },
  { alias:'نورة',age:27,city:'الرياض',occupation:'مصممة منتجات',education:'بكالوريوس تصميم',
    bio:'أصمّم منتجات وأحب أصوّر أشياء عادية مثل أبواب البيوت القديمة. الويكند اللي فات رحت معرض صغير في الرياض ورجعت بفكرة أشتغل عليها للحين. أحب أسمع كيف الناس تشوف الأشياء بشكل مختلف.',
    lookingFor:'شريك صريح يحترم الاختلاف ويستمتع بفضول الحياة.',values:'اللطف وحرية التعبير والخصوصية.',home:'ركن للرسم وكتب ونباتات، ووقت نجرب فيه شيئًا جديدًا.',interests:['photography','museums'],traits:[4,4,4,5,4,3,4,2,5,3,4,3],currentTraits:'CDBCCEDCDEEAEEA',timeline:'six_to_twelve_months',meeting:'public_before_formal',relocate:true },
  { alias:'أمل',age:31,city:'الرياض',occupation:'معلمة',education:'بكالوريوس تربية',
    bio:'أدرّس ابتدائي، وأفضل جمعة صغيرة عند أهلي على مناسبة كبيرة. أحب أسمع تفاصيل يوم الشخص القريب مني، وأحتاج شوي وقت عشان آخذ راحتي في الكلام.',
    lookingFor:'شريك حنون وعملي نتحدث معه عن المستقبل دون استعجال.',values:'المودة وحسن الظن وحفظ أسرار البيت.',home:'روتين دافئ وزيارات للأهل ووقت للقراءة.',interests:['reading','museums'],traits:[2,1,4,2,4,4,3,4,2,1,2,5],currentTraits:'EADDEBEDEAAECCB',timeline:'when_ready',meeting:'after_formal' },
  { alias:'هند',age:34,city:'الرياض',occupation:'باحثة',education:'دكتوراه علوم اجتماعية',
    bio:'أشتغل في البحث، وأحيانًا أقضي أمسية كاملة أكتب أو أراجع كتاب. أحب أطلع أمشي في مكان فيه شجر. يهمني يكون لنا وقت سوا، ووقت أقدر أركّز فيه على شغلي.',
    lookingFor:'شريك مستقل في رأيه يحترم المساحة الشخصية والحوار.',values:'الاحترام والوضوح والقدرة على مراجعة الرأي.',home:'أمسيات هادئة ومكتبة مشتركة واهتمامات يحتفظ بها كل منا.',interests:['creative_writing','walking'],traits:[1,2,5,2,1,1,2,4,4,2,5,5],currentTraits:'DDDEEDEEBBBEEEA',timeline:'over_a_year',meeting:'discuss_together',children:'C' },
  { alias:'منال',age:30,city:'الرياض',occupation:'صيدلانية',education:'دكتور صيدلة',
    bio:'صيدلانية ومناوباتي تتغير من أسبوع للثاني. إذا فضيت أجرّب وصفة أو ألعب مع أخواتي لعبة طاولة. أرتاح لما نتفق على وقت للمكالمة، خصوصًا في الأيام اللي أكون فيها بالمستشفى.',
    lookingFor:'شريك متعاون نضع احتياجاتنا في كلمات واضحة.',values:'الثقة والاهتمام اليومي واحترام الانشغال.',home:'نخطط لأسبوعنا معًا ونترك مساحة لتغيّر الدوام.',interests:['board_games','cooking'],traits:[4,3,3,4,4,4,5,3,3,4,4,3],currentTraits:'BCBDEBDCEEDCDEC',timeline:'six_to_twelve_months',meeting:'public_before_formal' },
  { alias:'ريم',age:25,city:'جدة',occupation:'كاتبة محتوى',education:'بكالوريوس لغة عربية',
    bio:'أكتب محتوى في جدة. بعد الدوام أحب أمشي على البحر، وأخلي الجوال في الشنطة إذا كنت مع أحد. في بداية التعارف أحب سؤال واحد حلو يفتح سالفة أكثر من أسئلة كثيرة ورا بعض.',
    lookingFor:'شريك صبور ومبادر يحترم هدوئي دون أن يفسّره ببرود.',values:'الصدق والرفق ومساحة للتعبير.',home:'وقت للكتابة وطقوس بسيطة نبتكرها معًا.',interests:['creative_writing','walking','reading'],traits:[1,1,5,3,3,4,2,2,4,1,1,5],currentTraits:'EAEBCDECEAADEEB',timeline:'six_to_twelve_months',meeting:'public_before_formal',relocate:true },
  { alias:'دانة',age:32,city:'الخبر',occupation:'مديرة مشاريع',education:'ماجستير إدارة مشاريع',
    bio:'أدير مشاريع في الخبر، وأحب أعرف من بدري إذا الويكند للأهل أو فيه سفرة قصيرة. آخر مرة لعبنا لعبة طاولة مع أخواني تحمست أكثر من اللازم. أقدّر اللي يقدر يضحك على الموقف معي.',
    lookingFor:'شريك واضح في قراراته ونستطيع الاختلاف معه باحترام.',values:'الالتزام والمساواة في سماع الرأي.',home:'خطط واقعية ومسؤوليات نتفق عليها ووقت للراحة.',interests:['travel','board_games'],traits:[5,5,3,3,3,2,3,5,4,5,5,2],currentTraits:'BDBEEBDECEEADEC',timeline:'three_to_six_months',meeting:'family_before_formal',relocate:true },
  { alias:'رغد',age:24,city:'أبها',occupation:'معلمة فنون',education:'بكالوريوس تربية فنية',
    bio:'أدرّس فنون في أبها. إذا الجو حلو أطلع أصوّر، وإذا أمطرت غالبًا أطبخ مع صديقاتي. أبادر بالكلام إذا ارتحت، وأفضّل الواحد يقول إنه مشغول على إنه يختفي.',
    lookingFor:'شريك لطيف وصريح ويحب أن نتشارك التجارب الجديدة.',values:'الاهتمام والمرح وقبول اختلاف الذوق.',home:'ألوان وطبخ وتجارب جديدة، مع وقت قريب من الأهل.',interests:['museums','cooking','photography'],traits:[5,5,2,5,5,5,5,1,5,4,3,1],currentTraits:'BCBCBDEDBEEAEEA',timeline:'over_a_year',meeting:'public_before_formal',relocate:true },
  { alias:'عبير',age:37,city:'الدمام',occupation:'أخصائية موارد بشرية',education:'بكالوريوس إدارة أعمال',
    bio:'أشتغل في الموارد البشرية، وعندي ولد في الابتدائي. الويكند غالبًا بين مشاويره وزيارة أهلي، وإذا فاض لي وقت أمسك كتاب. يهمني نتكلم بدري عن ترتيب الوقت مع الأولاد والأهل.',
    lookingFor:'شريك ناضج يتقبل مسؤولياتي ونبني معه ثقة بهدوء.',values:'الاحترام والثبات وعدم إدخال الأبناء في خلافات الكبار.',home:'بيت آمن ومنظم يحترم مواعيد ابني ووقت شريك حياتي.',interests:['reading','walking'],traits:[3,3,4,3,4,4,4,5,1,2,5,4],currentTraits:'DDDEEADEBCBCEBD',timeline:'when_ready',meeting:'family_before_formal',status:'divorced',childrenCount:1,children:'C' },
];

// This assessment measures behaviors, not MBTI categories. Fictional responses
// supply complete answers for each supported test assessment.
export function demoSurvey(seed, index, version) {
  const [social,,,openness,closeness,,,,novelty,conflict,directness] = seed.traits;
  const self = {
    children_plan: seed.children ?? 'A', residence_plan: seed.relocate ? 'C' : 'A', wife_work: index % 5 === 3 ? 'C' : 'A',
    marriage_timeline: seed.timeline === 'over_a_year' ? 'C' : seed.timeline === 'when_ready' ? 'D' : seed.timeline === 'six_to_twelve_months' ? 'B' : 'A',
    // Independent illustrative choices for fictional members.
    family_authority: 'ABC'[index % 3], financial_provision: 'ABCD'[index % 4],
    domestic_labor: 'BDA'[index % 3], housing_arrangement: 'ABD'[index % 3],
    social_boundaries: 'ABCD'[index % 4], conflict_response: 'ABBABDACAB'[index], money_management: 'ABBACABADC'[index],
    mixed_gatherings: 'BCA'[index % 3], faith_routine: 'CAB'[index % 3],
    public_event_attendance: 'BAC'[index % 3], parenting_approach: 'BADC'[index % 4],
    social_rhythm: social <= 2 ? 'A' : social === 3 ? 'B' : 'C',
    match_disagreement_style: directness === 5 ? 'A' : novelty === 5 && social >= 4 ? 'C' : index % 2 ? 'B' : 'D',
    repair_after_conflict: conflict >= 4 ? 'A' : conflict <= 2 ? 'B' : 'C',
    closeness_pace: closeness <= 2 ? 'C' : openness >= 4 ? 'B' : 'A',
  };
  const { dimensions } = version === currentCatalog.version ? currentCatalog : legacyCatalog;
  const current = version === currentCatalog.version;
  const parenting = parentingApplicable(self, seed.childrenCount ?? 0, seed.children === 'B' ? {mode:'require',target:'none'} : {mode:'any'});
  return Object.fromEntries(dimensions.flatMap(d => {
    if (current && d.id === 'parenting_approach' && !parenting) return [];
    const own = [d.id,self[d.id]];
    if (current && d.id === 'residence_plan') return [own];
    return [own,[d.partnerId,d.id === 'social_rhythm' && index % 3 === 1 ? 'B' : self[d.id]]];
  }));
}

export const demoAssessmentSeeds = [demoMen, demoWomen].flatMap((group, genderIndex) =>
  group.map((seed, index) => ({
    id: `${genderIndex ? 'w' : ''}p${String(index + 1).padStart(2, '0')}`,
    seed,
    index,
    genderIndex,
  })),
);
