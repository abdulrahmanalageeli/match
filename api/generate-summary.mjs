import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { responses } = req.body

  if (!responses || typeof responses !== "object") {
    return res.status(400).json({ error: "Invalid request body" })
  }

  try {
    let prompt = ""
    
    // Handle new survey data structure
    if (responses.answers) {
      // New survey format with answers object
      const surveyResponses = []
      const answers = responses.answers
      
      if (answers.gender) surveyResponses.push(`الجنس: ${answers.gender === 'male' ? 'ذكر' : 'أنثى'}`)
      if (answers.ageGroup) {
        const ageMap = {
          'under20': 'أقل من 20 سنة',
          '20-30': '20-30 سنة',
          '31-40': '31-40 سنة',
          '41-50': '41-50 سنة',
          'over50': 'أكبر من 50 سنة'
        }
        surveyResponses.push(`الفئة العمرية: ${ageMap[answers.ageGroup] || answers.ageGroup}`)
      }
      if (answers.participationGoal) {
        const goalMap = {
          'friendship': 'تكوين صداقات فقط',
          'romantic': 'البحث عن علاقة رومانسية جادة',
          'open': 'منفتح على الصداقة والعلاقة'
        }
        surveyResponses.push(`هدف المشاركة: ${goalMap[answers.participationGoal] || answers.participationGoal}`)
      }
      if (answers.educationLevel) {
        const eduMap = {
          'highschool': 'ثانوي أو أقل',
          'bachelor': 'بكالوريوس',
          'masters': 'ماجستير/دكتوراه أو أعلى'
        }
        surveyResponses.push(`المستوى التعليمي: ${eduMap[answers.educationLevel] || answers.educationLevel}`)
      }
      if (answers.coreValues && answers.coreValues.length > 0) {
        const valueMap = {
          'honesty': 'الأمانة',
          'ambition': 'الطموح',
          'independence': 'الاستقلالية',
          'familyLove': 'حب العائلة',
          'spirituality': 'الروحانية أو التدين',
          'openness': 'الانفتاح وتقبل الآخر',
          'emotionalStability': 'الاستقرار العاطفي',
          'humor': 'الحس الفكاهي'
        }
        const values = answers.coreValues.map(v => valueMap[v] || v).join('، ')
        surveyResponses.push(`القيم الجوهرية: ${values}`)
      }
      if (answers.mentalOpenness) {
        const opennessMap = {
          'traditional': 'تقليدي وملتزم دينيًا',
          'balanced': 'متوازن بين التقاليد والانفتاح',
          'fullyOpen': 'منفتح بالكامل'
        }
        surveyResponses.push(`الانفتاح الذهني: ${opennessMap[answers.mentalOpenness] || answers.mentalOpenness}`)
      }
      if (answers.weekendStyle) {
        const weekendMap = {
          'social': 'حضور فعاليات أو مقابلة أصدقاء',
          'quiet': 'الجلوس في المنزل أو بجو هادئ'
        }
        surveyResponses.push(`نمط العطلة: ${weekendMap[answers.weekendStyle] || answers.weekendStyle}`)
      }
      if (answers.thinkingStyle) {
        const thinkingMap = {
          'practical': 'يركز على الواقع والتفاصيل',
          'imaginative': 'يحب الخيال والرؤية المستقبلية'
        }
        surveyResponses.push(`طريقة التفكير: ${thinkingMap[answers.thinkingStyle] || answers.thinkingStyle}`)
      }
      if (answers.decisionMaking) {
        const decisionMap = {
          'logical': 'يعتمد على المنطق والعقل',
          'emotional': 'يعتمد على المشاعر والجانب الإنساني'
        }
        surveyResponses.push(`اتخاذ القرارات: ${decisionMap[answers.decisionMaking] || answers.decisionMaking}`)
      }
      if (answers.organizationStyle) {
        const orgMap = {
          'organized': 'يحب الجداول والخطط',
          'spontaneous': 'يحب العفوية والمرونة'
        }
        surveyResponses.push(`التنظيم: ${orgMap[answers.organizationStyle] || answers.organizationStyle}`)
      }
      if (answers.emotionalExpression) {
        const emotionMap = {
          'direct': 'صريح ومباشر',
          'reserved': 'كتوم ويحتاج وقت'
        }
        surveyResponses.push(`التعبير العاطفي: ${emotionMap[answers.emotionalExpression] || answers.emotionalExpression}`)
      }
      if (answers.adventureVsStability) {
        const adventureMap = {
          'adventure': 'يبحث عن التجربة والتجديد دائمًا',
          'stability': 'يفضّل الراحة والاستقرار'
        }
        surveyResponses.push(`المغامرة مقابل الاستقرار: ${adventureMap[answers.adventureVsStability] || answers.adventureVsStability}`)
      }
      if (answers.dailyActivity) {
        const activityMap = {
          'morning': 'صباحي',
          'night': 'ليلي'
        }
        surveyResponses.push(`النشاط اليومي: ${activityMap[answers.dailyActivity] || answers.dailyActivity}`)
      }
      if (answers.familyRelationship) {
        const familyMap = {
          'strong': 'قوية جدًا ويتوقع نفس الشيء من الطرف الآخر',
          'balanced': 'متوازنة',
          'independent': 'مستقلة ولا يتوقع مشاركة عائلية'
        }
        surveyResponses.push(`علاقة العائلة: ${familyMap[answers.familyRelationship] || answers.familyRelationship}`)
      }
      if (answers.childrenDesire) {
        const childrenMap = {
          'yes': 'يرغب في إنجاب أطفال',
          'maybe': 'ربما لاحقًا',
          'no': 'لا يرغب',
          'unsure': 'غير متأكد'
        }
        surveyResponses.push(`رغبة الإنجاب: ${childrenMap[answers.childrenDesire] || answers.childrenDesire}`)
      }
      if (answers.conflictResolution) {
        const conflictMap = {
          'direct': 'يواجه مباشرة وبهدوء',
          'time': 'يحتاج بعض الوقت ثم يناقش',
          'avoid': 'يتجنب المواجهة غالبًا'
        }
        surveyResponses.push(`حل الخلافات: ${conflictMap[answers.conflictResolution] || answers.conflictResolution}`)
      }
      if (answers.hobbies && answers.hobbies.length > 0) {
        const hobbyMap = {
          'reading': 'القراءة',
          'movies': 'الأفلام والمسلسلات',
          'sports': 'الرياضة',
          'gaming': 'ألعاب الفيديو',
          'travel': 'السفر',
          'nature': 'الطبيعة والكشتات',
          'cooking': 'الطبخ',
          'volunteering': 'التطوع والخدمة',
          'music': 'الموسيقى'
        }
        const hobbies = answers.hobbies.map(h => hobbyMap[h] || h).join('، ')
        surveyResponses.push(`الهوايات: ${hobbies}`)
      }
      if (answers.energyPattern) {
        const energyMap = {
          'energetic': 'نشيط ومتحرك',
          'calm': 'هادئ ومسترخٍ'
        }
        surveyResponses.push(`نمط الطاقة: ${energyMap[answers.energyPattern] || answers.energyPattern}`)
      }
      if (answers.dietaryPreferences) {
        surveyResponses.push(`النظام الغذائي: ${answers.dietaryPreferences}`)
      }
      if (answers.healthImportance) {
        const healthMap = {
          'veryImportant': 'مهمة جدًا',
          'moderate': 'معتدلة',
          'notImportant': 'غير مهمة'
        }
        surveyResponses.push(`أهمية الصحة: ${healthMap[answers.healthImportance] || answers.healthImportance}`)
      }
      if (answers.smokingAlcohol) {
        const smokingMap = {
          'noProblem': 'لا مشكلة',
          'lightAcceptable': 'مقبول إذا كان خفيف',
          'notAcceptable': 'لا يقبل إطلاقًا'
        }
        surveyResponses.push(`موقف التدخين/الكحول: ${smokingMap[answers.smokingAlcohol] || answers.smokingAlcohol}`)
      }
      if (answers.cleanlinessInterest) {
        const cleanMap = {
          'veryImportant': 'يحب النظام والنظافة دائمًا',
          'flexible': 'مرن وبعض الفوضى لا تزعجه',
          'notImportant': 'لا يهتم كثيرًا'
        }
        surveyResponses.push(`الاهتمام بالنظافة: ${cleanMap[answers.cleanlinessInterest] || answers.cleanlinessInterest}`)
      }
      if (answers.petsOpinion) {
        const petsMap = {
          'love': 'يحبها',
          'okay': 'لا مانع',
          'dislike': 'لا يحبها أو لديه حساسية'
        }
        surveyResponses.push(`رأي الحيوانات الأليفة: ${petsMap[answers.petsOpinion] || answers.petsOpinion}`)
      }
      if (answers.relationshipView) {
        const relationshipMap = {
          'stable': 'علاقة مستقرة وطويلة المدى مبنية على الالتزام والخصوصية',
          'flexible': 'علاقة مرنة يمكن أن تتطوّر تدريجيًا حسب الظروف',
          'individual': 'يؤمن بأن العلاقات تختلف من شخص لآخر ولا يضع نمطًا محددًا'
        }
        surveyResponses.push(`نظرة العلاقة: ${relationshipMap[answers.relationshipView] || answers.relationshipView}`)
      }
      if (answers.redLines && answers.redLines.length > 0) {
        surveyResponses.push(`الخطوط الحمراء: ${answers.redLines.join('، ')}`)
      }
      
      prompt = surveyResponses.map(response => `- ${response}`).join("\n")
    } else if (responses.gender || responses.ageGroup || responses.participationGoal) {
      // Old survey format (fallback)
      const surveyResponses = []
      
      if (responses.gender) surveyResponses.push(`الجنس: ${responses.gender === 'male' ? 'ذكر' : 'أنثى'}`)
      if (responses.ageGroup) {
        const ageMap = {
          'under20': 'أقل من 20 سنة',
          '20-30': '20-30 سنة',
          '31-40': '31-40 سنة',
          '41-50': '41-50 سنة',
          'over50': 'أكبر من 50 سنة'
        }
        surveyResponses.push(`الفئة العمرية: ${ageMap[responses.ageGroup] || responses.ageGroup}`)
      }
      if (responses.participationGoal) {
        const goalMap = {
          'friendship': 'تكوين صداقات فقط',
          'romantic': 'البحث عن علاقة رومانسية جادة',
          'open': 'منفتح على الصداقة والعلاقة'
        }
        surveyResponses.push(`هدف المشاركة: ${goalMap[responses.participationGoal] || responses.participationGoal}`)
      }
      if (responses.educationLevel) {
        const eduMap = {
          'highschool': 'ثانوي أو أقل',
          'bachelor': 'بكالوريوس',
          'masters': 'ماجستير/دكتوراه أو أعلى'
        }
        surveyResponses.push(`المستوى التعليمي: ${eduMap[responses.educationLevel] || responses.educationLevel}`)
      }
      if (responses.coreValues && responses.coreValues.length > 0) {
        const valueMap = {
          'honesty': 'الأمانة',
          'ambition': 'الطموح',
          'independence': 'الاستقلالية',
          'familyLove': 'حب العائلة',
          'spirituality': 'الروحانية أو التدين',
          'openness': 'الانفتاح وتقبل الآخر',
          'emotionalStability': 'الاستقرار العاطفي',
          'humor': 'الحس الفكاهي'
        }
        const values = responses.coreValues.map(v => valueMap[v] || v).join('، ')
        surveyResponses.push(`القيم الجوهرية: ${values}`)
      }
      if (responses.mentalOpenness) {
        const opennessMap = {
          'traditional': 'تقليدي وملتزم دينيًا',
          'balanced': 'متوازن بين التقاليد والانفتاح',
          'fullyOpen': 'منفتح بالكامل'
        }
        surveyResponses.push(`الانفتاح الذهني: ${opennessMap[responses.mentalOpenness] || responses.mentalOpenness}`)
      }
      if (responses.weekendStyle) {
        const weekendMap = {
          'social': 'حضور فعاليات أو مقابلة أصدقاء',
          'quiet': 'الجلوس في المنزل أو بجو هادئ'
        }
        surveyResponses.push(`نمط العطلة: ${weekendMap[responses.weekendStyle] || responses.weekendStyle}`)
      }
      if (responses.thinkingStyle) {
        const thinkingMap = {
          'practical': 'يركز على الواقع والتفاصيل',
          'imaginative': 'يحب الخيال والرؤية المستقبلية'
        }
        surveyResponses.push(`طريقة التفكير: ${thinkingMap[responses.thinkingStyle] || responses.thinkingStyle}`)
      }
      if (responses.decisionMaking) {
        const decisionMap = {
          'logical': 'يعتمد على المنطق والعقل',
          'emotional': 'يعتمد على المشاعر والجانب الإنساني'
        }
        surveyResponses.push(`اتخاذ القرارات: ${decisionMap[responses.decisionMaking] || responses.decisionMaking}`)
      }
      if (responses.organizationStyle) {
        const orgMap = {
          'organized': 'يحب الجداول والخطط',
          'spontaneous': 'يحب العفوية والمرونة'
        }
        surveyResponses.push(`التنظيم: ${orgMap[responses.organizationStyle] || responses.organizationStyle}`)
      }
      if (responses.emotionalExpression) {
        const emotionMap = {
          'direct': 'صريح ومباشر',
          'reserved': 'كتوم ويحتاج وقت'
        }
        surveyResponses.push(`التعبير العاطفي: ${emotionMap[responses.emotionalExpression] || responses.emotionalExpression}`)
      }
      if (responses.adventureVsStability) {
        const adventureMap = {
          'adventure': 'يبحث عن التجربة والتجديد دائمًا',
          'stability': 'يفضّل الراحة والاستقرار'
        }
        surveyResponses.push(`المغامرة مقابل الاستقرار: ${adventureMap[responses.adventureVsStability] || responses.adventureVsStability}`)
      }
      if (responses.dailyActivity) {
        const activityMap = {
          'morning': 'صباحي',
          'night': 'ليلي'
        }
        surveyResponses.push(`النشاط اليومي: ${activityMap[responses.dailyActivity] || responses.dailyActivity}`)
      }
      if (responses.familyRelationship) {
        const familyMap = {
          'strong': 'قوية جدًا ويتوقع نفس الشيء من الطرف الآخر',
          'balanced': 'متوازنة',
          'independent': 'مستقلة ولا يتوقع مشاركة عائلية'
        }
        surveyResponses.push(`علاقة العائلة: ${familyMap[responses.familyRelationship] || responses.familyRelationship}`)
      }
      if (responses.childrenDesire) {
        const childrenMap = {
          'yes': 'يرغب في إنجاب أطفال',
          'maybe': 'ربما لاحقًا',
          'no': 'لا يرغب',
          'unsure': 'غير متأكد'
        }
        surveyResponses.push(`رغبة الإنجاب: ${childrenMap[responses.childrenDesire] || responses.childrenDesire}`)
      }
      if (responses.conflictResolution) {
        const conflictMap = {
          'direct': 'يواجه مباشرة وبهدوء',
          'time': 'يحتاج بعض الوقت ثم يناقش',
          'avoid': 'يتجنب المواجهة غالبًا'
        }
        surveyResponses.push(`حل الخلافات: ${conflictMap[responses.conflictResolution] || responses.conflictResolution}`)
      }
      if (responses.hobbies && responses.hobbies.length > 0) {
        const hobbyMap = {
          'reading': 'القراءة',
          'movies': 'الأفلام والمسلسلات',
          'sports': 'الرياضة',
          'gaming': 'ألعاب الفيديو',
          'travel': 'السفر',
          'nature': 'الطبيعة والكشتات',
          'cooking': 'الطبخ',
          'volunteering': 'التطوع والخدمة',
          'music': 'الموسيقى'
        }
        const hobbies = responses.hobbies.map(h => hobbyMap[h] || h).join('، ')
        surveyResponses.push(`الهوايات: ${hobbies}`)
      }
      if (responses.energyPattern) {
        const energyMap = {
          'energetic': 'نشيط ومتحرك',
          'calm': 'هادئ ومسترخٍ'
        }
        surveyResponses.push(`نمط الطاقة: ${energyMap[responses.energyPattern] || responses.energyPattern}`)
      }
      if (responses.dietaryPreferences) {
        surveyResponses.push(`النظام الغذائي: ${responses.dietaryPreferences}`)
      }
      if (responses.healthImportance) {
        const healthMap = {
          'veryImportant': 'مهمة جدًا',
          'moderate': 'معتدلة',
          'notImportant': 'غير مهمة'
        }
        surveyResponses.push(`أهمية الصحة: ${healthMap[responses.healthImportance] || responses.healthImportance}`)
      }
      if (responses.smokingAlcohol) {
        const smokingMap = {
          'noProblem': 'لا مشكلة',
          'lightAcceptable': 'مقبول إذا كان خفيف',
          'notAcceptable': 'لا يقبل إطلاقًا'
        }
        surveyResponses.push(`موقف التدخين/الكحول: ${smokingMap[responses.smokingAlcohol] || responses.smokingAlcohol}`)
      }
      if (responses.cleanlinessInterest) {
        const cleanMap = {
          'veryImportant': 'يحب النظام والنظافة دائمًا',
          'flexible': 'مرن وبعض الفوضى لا تزعجه',
          'notImportant': 'لا يهتم كثيرًا'
        }
        surveyResponses.push(`الاهتمام بالنظافة: ${cleanMap[responses.cleanlinessInterest] || responses.cleanlinessInterest}`)
      }
      if (responses.petsOpinion) {
        const petsMap = {
          'love': 'يحبها',
          'okay': 'لا مانع',
          'dislike': 'لا يحبها أو لديه حساسية'
        }
        surveyResponses.push(`رأي الحيوانات الأليفة: ${petsMap[responses.petsOpinion] || responses.petsOpinion}`)
      }
      if (responses.relationshipView) {
        const relationshipMap = {
          'stable': 'علاقة مستقرة وطويلة المدى مبنية على الالتزام والخصوصية',
          'flexible': 'علاقة مرنة يمكن أن تتطوّر تدريجيًا حسب الظروف',
          'individual': 'يؤمن بأن العلاقات تختلف من شخص لآخر ولا يضع نمطًا محددًا'
        }
        surveyResponses.push(`نظرة العلاقة: ${relationshipMap[responses.relationshipView] || responses.relationshipView}`)
      }
      if (responses.redLines && responses.redLines.length > 0) {
        surveyResponses.push(`الخطوط الحمراء: ${responses.redLines.join('، ')}`)
      }
      
      prompt = surveyResponses.map(response => `- ${response}`).join("\n")
    } else {
      // Handle old form format
      prompt = Object.entries(responses)
      .map(([_, value]) => `- ${value}`)
      .join("\n")
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: [
        {
          role: "system",
          content: `
أنت مساعد ذكي يتكلم باللهجة السعودية العادية، وتكتب بصيغة المتكلم كأنك تكلّم الشخص مباشرة، لكن بأسلوب محترم وهادئ. لا تستخدم كلمات إنجليزية ولا لهجة مبالغ فيها، وخلّك واضح ومفهوم. هدفك إنك تلخّص شخصية الشخص هذا من خلال إجاباته، وتحاول توصّف له نفسه بشكل صادق، مختصر، وبدون مبالغة.

لا تكون رسمي بزيادة ولا كأنك صديق مقرّب، خلك بالنص. لازم ما تتعدى ٨٠ كلمة.
        `.trim(),
        },
        {
          role: "user",
          content: `هاذي الإجابات اللي كتبها:\n${prompt}`,
        },
      ],
    })

    const summary = completion.choices?.[0]?.message?.content?.trim()
    console.log("GPT Response:", summary)

    if (!summary) {
      return res.status(200).json({ summary: "ما طلع ملخص من GPT." })
    }

    return res.status(200).json({ summary })
  } catch (error) {
    console.error("GPT API Error:", error)
    return res.status(500).json({ error: error.message || "Unexpected error" })
  }
}
