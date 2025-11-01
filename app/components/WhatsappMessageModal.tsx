import React, { useState, useMemo } from 'react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import { Check, Copy, MessageSquare, X, Clock, Info, HelpCircle } from 'lucide-react';

interface WhatsappMessageModalProps {
  participant: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function WhatsappMessageModal({ participant, isOpen, onClose }: WhatsappMessageModalProps) {
  const [copied, setCopied] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [urgencyLevel, setUrgencyLevel] = useState<'normal' | 'semi-urgent' | 'urgent'>('normal');
  const [templateType, setTemplateType] = useState<'match' | 'early-match' | 'event-info' | 'faq-payment' | 'faq-location' | 'faq-timing' | 'reminder' | 'payment-reminder' | 'partner-info' | 'gender-confirmation'>('match');

  const message = useMemo(() => {
    if (!participant) return "";

    const name = participant.name || participant.survey_data?.name || `المشارك #${participant.assigned_number}`;
    const assignedNumber = participant.assigned_number;
    const secureToken = participant.secure_token;

    // Generate message based on template type
    switch (templateType) {
      case 'match':
        if (urgencyLevel === 'urgent') {
          // Urgent match message with 30-minute deadline
          return `⏰ *عاجل - التوافق الأعمى* ⏰\n\nالسلام عليكم *${name}*،\n\n✨ تم العثور على شريك متوافق معكم!\n\n⏰ *يرجى الرد خلال نصف ساعة*\nنظراً لمحدودية المقاعد، قد نحتاج لإعطاء الفرصة لمشارك آخر إذا لم نتلقى ردكم قريباً.\n\n💳 رسوم المشاركة: 45 ريال سعودي\n\n📋 *المطلوب منكم:*\n1️⃣ تحويل المبلغ خلال النصف ساعة القادمة\n2️⃣ إرسال صورة الإيصال بعد التحويل\n3️⃣ تأكيد حضوركم\n\n*طرق الدفع:*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN:\nSA2480000588608016007502\n\n⚠️ *ملاحظة:* لتأكيد حضوركم، يجب إتمام التحويل وإرسال صورة الإيصال خلال المدة المحددة.\n\n*تنبيه:* في حالة التأكيد ثم عدم الحضور أو الإلغاء، لا يمكن استرداد الرسوم.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n📅 التاريخ: السبت 1 نوفمبر 2025\n🕰️ الوقت: 7:30 مساءً\n⏱️ المدة: 60 دقيقة\n\n*يرجى الحضور قبل الموعد بـ 10 دقائق*\n\nمعلوماتكم للفعالية:\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🔗 رابط الدخول المباشر:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\n⏰ *يرجى الرد في أقرب وقت ممكن*\n\nنتطلع لحضوركم!\n\nفريق التوافق الأعمى`;
        } else if (urgencyLevel === 'semi-urgent') {
          // Semi-urgent match message with 2-hour deadline
          return `⚠️ *مهم - التوافق الأعمى* ⚠️\n\nالسلام عليكم *${name}*،\n\n🎯 *مهم:* تم العثور على شريك متوافق معكم!\n\n⏰ *يرجى الرد خلال ساعتين*\n⚡ المقاعد محدودة وقد تُعطى الفرصة لمشارك آخر إذا لم نتلقى ردكم\n\n💳 رسوم المشاركة: 45 ريال سعودي\n\n📋 *المطلوب منكم:*\n1️⃣ تحويل المبلغ خلال الساعتين القادمتين\n2️⃣ إرسال صورة الإيصال فوراً بعد التحويل\n3️⃣ تأكيد حضوركم\n\n*طرق الدفع:*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN:\nSA2480000588608016007502\n\n⚠️ *ملاحظة مهمة:* لتأكيد حضوركم، يجب إتمام التحويل وإرسال صورة الإيصال خلال المدة المحددة. في حالة عدم التحويل، سيتم إعطاء الفرصة لمشارك آخر.\n\n*تنبيه:* في حالة التأكيد ثم عدم الحضور أو الإلغاء، لا يمكن استرداد الرسوم.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n📅 التاريخ: السبت 1 نوفمبر 2025\n🕰️ الوقت: 7:30 مساءً\n⏱️ المدة: 60 دقيقة\n\n*يرجى الحضور قبل الموعد بـ 10 دقائق*\n\nمعلوماتكم للفعالية:\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🔗 رابط الدخول المباشر:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\n⏰ *تذكير: لديكم ساعتين للرد وتأكيد المشاركة*\n\nنتطلع لحضوركم!\n\nفريق التوافق الأعمى`;
        } else {
          // Regular match message with 24-hour deadline
          return `*التوافق الأعمى* ✨\n\nالسلام عليكم *${name}*،\n\n🚫 *تحذير:* إذا لم تتمكنوا من الحضور، يرجى إعلامنا فوراً.\n\nنسعد بإبلاغكم أنه تم العثور على شريك متوافق معكم من بين المشاركين.\n\n⏰ *يرجى تأكيد المشاركة خلال 24 ساعة*\n💳 رسوم المشاركة: 45 ريال سعودي\n\n⚠️ *ملاحظة مهمة:* لتأكيد حضوركم، يجب إتمام التحويل وإرسال صورة الإيصال. في حالة عدم التحويل خلال المدة المحددة، سيتم إعطاء الفرصة لمشارك آخر.\n\n*طرق الدفع:*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN:\nSA2480000588608016007502\n\nبعد إتمام التحويل، يرجى إرسال صورة الإيصال فوراً لتأكيد حجزكم.\n\n*تنبيه:* في حالة التأكيد ثم عدم الحضور أو الإلغاء، لا يمكن استرداد الرسوم.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n📅 التاريخ: السبت 1 نوفمبر 2025\n🕰️ الوقت: 7:30 مساءً\n⏱️ المدة: 60 دقيقة\n\n*يرجى الحضور قبل الموعد بـ 10 دقائق*\n\nمعلوماتكم للفعالية:\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🔗 رابط الدخول المباشر:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nنتطلع لحضوركم وتمنى لكم تجربة ممتعة.\n\nفريق التوافق الأعمى`;
        }

      case 'early-match':
        return `*التوافق الأعمى* ✨\n\nالسلام عليكم *${name}*،\n\n🎉 *أخبار رائعة!* تم العثور على شريك متوافق معكم!\n\n💳 *رسوم المشاركة:* 45 ريال سعودي\n\n📋 *للتأكيد:*\n1️⃣ حولوا المبلغ عبر إحدى الطرق أدناه\n2️⃣ أرسلوا صورة الإيصال\n3️⃣ انتظروا تأكيد الحجز منا\n\n*طرق الدفع:*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN:\nSA2480000588608016007502\n\n📅 *لديكم حتى يوم الجمعة لتأكيد المشاركة*\n\n⭐ *كلما أكدتم مشاركتكم مبكراً، كلما زادت موثوقيتكم وأولويتكم في الفعاليات القادمة*\n\n💡 *لماذا التأكيد المبكر مهم؟*\n• يضمن مقعدكم في الفعالية\n• يزيد من موثوقيتكم كمشارك\n• يساعدنا في التخطيط الأفضل للفعالية\n• يعطيكم أولوية في الفعاليات المستقبلية\n\n*تنبيه:* في حالة التأكيد ثم عدم الحضور أو الإلغاء، لا يمكن استرداد الرسوم.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n📅 التاريخ: السبت 1 نوفمبر 2025\n🕰️ الوقت: 7:30 مساءً\n⏱️ المدة: 60 دقيقة\n\n*يرجى الحضور قبل الموعد بـ 10 دقائق*\n\nمعلوماتكم للفعالية:\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🔗 رابط الدخول المباشر (للإستعمال خلال الفعالية):\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\n🌟 *نقدر التزامكم ونتطلع لمشاركتكم المبكرة!*\n\nفريق التوافق الأعمى`;

      case 'event-info':
        return `*التوافق الفكري* 📋\n\nالسلام عليكم *${name}*،\n\n🎯 *ما هو الهدف من هذه المنصة؟*\n\nمنصة التوافق الفكري هي منصة احترافية تهدف إلى ربط الأشخاص ذوي التفكير المتشابه والاهتمامات المتوافقة لبناء علاقات فكرية وثقافية هادفة. نحن لسنا منصة مواعدة، بل مساحة آمنة للتبادل الفكري والثقافي بين الأشخاص المتوافقين فكرياً وشخصياً.\n\n⏰ *كم تستغرق الجلسات؟*\n• الجلسات الجماعية: 30 دقيقة مع مجموعة من 4-6 أشخاص\n• الجلسات الفردية: 30 دقيقة كحد أدنى، لكن يمكنكما الاستمرار كما تشاءان\n\n✨ *ما الأنشطة المتوفرة؟*\n• للجلسات الفردية: أسئلة محفزة للحوار ومواضيع نقاش متنوعة\n• للجلسات الجماعية: 4 أنشطة تفاعلية مختلفة تشمل ألعاب كسر الجليد، أسئلة التعارف، وأنشطة بناء الفريق\n\n🔄 *هل سأتم مطابقتي مع نفس الأشخاص مرة أخرى؟*\nلا، لن يتم مطابقتك مع نفس الشخص في جلستين متتاليتين. نظامنا الذكي يضمن التنويع في المطابقات لتتيح لك فرصة التعرف على أكبر عدد من الأشخاص المتوافقين معك فكرياً.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n📅 التاريخ: السبت 1 نوفمبر 2025\n🕰️ الوقت: 7:30 مساءً\n\n🔗 رابط حسابك:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nنتطلع لمشاركتكم في هذه التجربة الفريدة!\n\nفريق التوافق الفكري`;

      case 'faq-payment':
        return `*التوافق الأعمى* 💳\n\nالسلام عليكم *${name}*،\n\n💰 *الأسئلة الشائعة - الدفع والرسوم*\n\n❓ *كم رسوم المشاركة؟*\n💳 45 ريال سعودي فقط\n\n❓ *طرق الدفع المتاحة؟*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN: SA2480000588608016007502\n\n❓ *متى يجب الدفع؟*\n⏰ خلال 24 ساعة من تأكيد المطابقة\n⚡ للرسائل العاجلة: خلال ساعة واحدة\n\n❓ *ماذا لو لم أدفع في الوقت المحدد؟*\n⚠️ سيتم إعطاء الفرصة لمشارك آخر\n🚫 لن تتمكن من حضور الفعالية\n\n❓ *هل يمكن استرداد الرسوم؟*\n✅ نعم، في حالة إلغاء الفعالية من طرفنا\n❌ لا، في حالة عدم الحضور أو الإلغاء من طرفك\n\n❓ *ماذا بعد الدفع؟*\n📸 أرسل صورة الإيصال فوراً\n✅ سنؤكد حجزك خلال ساعات قليلة\n📧 ستصلك تفاصيل إضافية قبل الفعالية\n\n❓ *هل الدفع آمن؟*\n🔒 جميع طرق الدفع آمنة ومضمونة\n🏦 حسابات بنكية رسمية مسجلة\n📱 STC Pay معتمد رسمياً\n\n❓ *ماذا لو واجهت مشكلة في الدفع؟*\n📞 تواصل معنا فوراً عبر الواتساب\n🕐 نحن متاحون للمساعدة 24/7\n\nرقم المشارك: *${assignedNumber}*\n\n🔗 رابط حسابك:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nفريق التوافق الأعمى`;

      case 'faq-location':
        return `*التوافق الأعمى* 📍\n\nالسلام عليكم *${name}*،\n\n🗺️ *الأسئلة الشائعة - الموقع والوصول*\n\n❓ *أين تقام الفعالية؟*\n📍 كوفي بلانيت - الدور الثاني\n🏢 مول أو مجمع تجاري (يرجى التأكد من الخريطة)\n\n❓ *كيف أصل للمكان؟*\n🗺️ خريطة جوجل: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n🚗 يمكن الوصول بالسيارة أو التاكسي\n🅿️ مواقف سيارات متاحة\n\n❓ *في أي دور؟*\n⬆️ الدور الثاني\n🛗 يوجد مصعد ودرج\n🔍 ابحث عن لافتة "التوافق الأعمى"\n\n❓ *متى يجب الوصول؟*\n⏰ قبل الموعد بـ 10 دقائق\n📅 السبت 1 نوفمبر 2025\n🕰️ الساعة 7:20 مساءً (للاستقبال)\n🎯 بداية الفعالية: 7:30 مساءً\n\n❓ *ماذا لو تأخرت؟*\n⚠️ يرجى الالتزام بالمواعيد\n📞 في حالة الطوارئ، تواصل معنا فوراً\n🚫 التأخير قد يؤثر على مشاركتك\n\n❓ *كيف أعرف المكان الصحيح؟*\n🏷️ ابحث عن لافتة "التوافق الأعمى"\n👥 ستجد فريق الاستقبال\n📱 أو اتصل بنا عند الوصول\n\n❓ *هل يوجد مواقف سيارات؟*\n🅿️ نعم، مواقف مجانية متاحة\n🚗 مساحة كافية للجميع\n🔒 مواقف آمنة ومراقبة\n\n❓ *ماذا لو لم أجد المكان؟*\n📞 اتصل بنا فوراً\n📍 سنرسل لك موقعنا المباشر\n👨‍💼 أو سنرسل شخص لاستقبالك\n\nرقم المشارك: *${assignedNumber}*\n\n🔗 رابط حسابك:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nفريق التوافق الأعمى`;

      case 'faq-timing':
        return `*التوافق الفكري* ⏰\n\nالسلام عليكم *${name}*،\n\n🕐 *الأسئلة الشائعة - التوقيت والجدول*\n\n❓ *متى تبدأ الفعالية؟*\n📅 السبت 1 نوفمبر 2025\n🕰️ الساعة 7:30 مساءً بالضبط\n⏰ يرجى الحضور 7:20 مساءً\n\n❓ *كم تستغرق الجلسات؟*\n• الجلسات الجماعية: 30 دقيقة مع مجموعة من 4-6 أشخاص\n• الجلسات الفردية: 30 دقيقة كحد أدنى، لكن يمكنكما الاستمرار كما تشاءان\n\n❓ *كيف يتم التوافق حسب العمر؟*\nيتم التوافق مع أشخاص قريبين من عمرك لضمان التجانس في مراحل الحياة والاهتمامات. الفارق العمري المسموح لا يتجاوز 5 سنوات إلا في حالات معينة.\n\n❓ *ماذا لو تأخرت؟*\n⚠️ التأخير يؤثر على تجربتك\n🚫 قد تفوت الجلسات الأولى\n📞 تواصل معنا فوراً إذا تأخرت\n\n❓ *هل يمكن المغادرة مبكراً؟*\n🚪 نعم، لكن لن تحصل على النتائج الكاملة\n⭐ ننصح بالبقاء للنهاية\n🎁 الأنشطة الجماعية ممتعة جداً\n\n❓ *متى تظهر النتائج؟*\n📊 في نهاية الفعالية\n📱 أو عبر الرابط الخاص بك لاحقاً\n✨ ستعرف من توافقت معهم\n\n❓ *ماذا بعد انتهاء الفعالية؟*\n📞 يمكنك التواصل مع من توافقت معهم\n📱 عبر المعلومات التي ستحصل عليها\n🤝 أو ترتيب لقاء آخر\n\nرقم المشارك: *${assignedNumber}*\n\n🔗 رابط حسابك:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nفريق التوافق الأعمى`;

      case 'reminder':
        return `*التوافق الأعمى* 🔔\n\nالسلام عليكم *${name}*،\n\n⏰ *تذكير مهم بموعد الفعالية*\n\n🗓️ *غداً السبت 1 نوفمبر 2025*\n🕰️ *الساعة 7:30 مساءً*\n📍 *كوفي بلانيت - الدور الثاني*\n\n✅ *تأكد من:*\n• وصولك قبل الموعد بـ 10 دقائق\n• إحضار هاتفك المحمول\n• ارتداء ملابس مريحة وأنيقة\n• إحضار هوية شخصية (اختياري)\n\n📱 *معلوماتك للفعالية:*\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🗺️ *الموقع:*\nhttps://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n🔗 *رابط حسابك:*\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\n💡 *نصائح للفعالية:*\n• كن طبيعياً ومسترخياً\n• استمع جيداً لشريكك\n• اطرح أسئلة مثيرة للاهتمام\n• استمتع بالتجربة\n\n❓ *أسئلة أو استفسارات؟*\n📞 تواصل معنا عبر الواتساب\n⚡ نحن متاحون للمساعدة\n\n🎉 *نتطلع لرؤيتك غداً!*\n\nفريق التوافق الأعمى`;

      case 'payment-reminder':
        return `*التوافق الأعمى* 💳\n\nالسلام عليكم *${name}*،\n\n⚠️ *تذكير مهم - الدفع المطلوب*\n\n🔴 *لم نستلم تحويلكم بعد!*\n\nنذكركم بأنه تم العثور على شريك متوافق معكم، ولكن لم يتم إتمام الدفع حتى الآن.\n\n⏰ *مهم جداً:* يرجى إتمام التحويل في أقرب وقت ممكن لتأكيد حجزكم.\n\n💳 *رسوم المشاركة:* 45 ريال سعودي\n\n⚠️ *تحذير:* في حالة عدم استلام التحويل قريباً، سيتم إعطاء الفرصة لمشارك آخر.\n\n🚨 *لماذا يجب الدفع الآن؟*\n• شريكك المتوافق ينتظر تأكيدك\n• المقاعد محدودة وقد تُعطى لآخرين\n• لضمان مشاركتك في الفعالية\n• لتجنب خسارة هذه الفرصة الفريدة\n\n*طرق الدفع السريعة:*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN:\nSA2480000588608016007502\n\n📸 *بعد التحويل:*\nأرسل صورة الإيصال فوراً عبر الواتساب لتأكيد حجزكم.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n📅 التاريخ: السبت 1 نوفمبر 2025\n🕰️ الوقت: 7:30 مساءً\n⏱️ المدة: 60 دقيقة\n\n📱 *معلوماتك:*\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🔗 رابط حسابك:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\n⚡ *يرجى التحويل وإرسال الإيصال في أقرب وقت!*\n\n🔥 لا تفوت هذه الفرصة!\n\nفريق التوافق الأعمى`;

      case 'partner-info':
        return `*التوافق الأعمى* 🔒\n\nالسلام عليكم *${name}*،\n\n*سياسة الخصوصية ومعلومات الشريك*\n\n*هل يمكنكم مشاركة معلومات عن شريكي؟*\n\nنعتذر، لا يمكننا مشاركة أي معلومات شخصية عن شريكك قبل اللقاء. هذا جزء أساسي من تجربة "التوافق الأعمى" التي تهدف إلى بناء علاقات فكرية وثقافية هادفة قائمة على التوافق الحقيقي.\n\n*طبيعة الفعالية:*\n\nهذه الفعالية مصممة لربط الأشخاص ذوي التفكير المتشابه والاهتمامات المتوافقة في بيئة احترافية آمنة. نحن نركز على التبادل الفكري والثقافي، وليس على المواعدة التقليدية. الهدف هو التعرف على أشخاص متوافقين معكم فكرياً وشخصياً لبناء علاقات ذات معنى.\n\n*فلسفة التوافق:*\n\nنظامنا يعتمد على التوافق الشخصي والفكري بغض النظر عن الهوية الشخصية، الجنسية، المظهر الخارجي، أو الخلفية الاجتماعية. نحن نؤمن بأن التوافق الحقيقي يتجاوز هذه العوامل السطحية.\n\n*منهجية المطابقة:*\n\nخوارزميتنا تبحث عن التوازن المثالي بين التشابه والتكامل. نحن لا نبحث عن التطابق الكامل (100% تشابه) ولا عن الاختلاف الكامل (100% تكامل)، بل عن المزيج الصحيح الذي يخلق علاقة متوازنة ومستدامة.\n\nالتشابه في القيم الأساسية والأهداف الحياتية يخلق أرضية مشتركة، بينما التكامل في الشخصيات وأساليب التفكير يضيف الثراء والنمو المتبادل.\n\n*ما نضمنه لكم:*\n\n• شريكك من نفس الفئة العمرية (الفارق لا يتجاوز 5 سنوات أعلى أو أقل)\n• توافق شخصي عالي بناءً على نوع الشخصية (MBTI)، أسلوب التواصل، القيم والاهتمامات، الأهداف الحياتية، والتوافق الفكري\n• احترام تفضيلاتك الشخصية (نفس الجنس أو جنس مختلف)\n• بيئة آمنة ومحترمة للجميع\n\n*لماذا نحافظ على السرية؟*\n\nالسرية تضمن تجربة حقيقية خالية من الأحكام المسبقة، وتتيح لكم التركيز على الجوهر والشخصية الحقيقية. كما تمنح الجميع فرصة عادلة متساوية وتحترم خصوصية جميع المشاركين.\n\nالدراسات تثبت أن اللقاءات "العمياء" تؤدي إلى تواصل أعمق وأكثر صدقاً، وتقييم أفضل للتوافق الحقيقي، مما ينتج عنه علاقات أقوى وأطول أمداً.\n\n*أسئلة شائعة:*\n\n**س: هل سأعرف اسم شريكي؟**\nج: نعم، خلال اللقاء ستتعرفون على بعضكم بشكل طبيعي وتتبادلون المعلومات كما تشاؤون.\n\n**س: هل يمكنني معرفة جنسية الشريك مسبقاً؟**\nج: نركز على التوافق الشخصي والفكري بغض النظر عن الجنسية أو الأصل.\n\n**س: ماذا لو لم أشعر بالتوافق مع الشريك؟**\nج: لا يوجد أي التزام بعد اللقاء. التجربة مصممة للتعارف واستكشاف التوافق فقط.\n\n**س: كيف تم اختيار شريكي؟**\nج: خوارزميتنا حللت إجاباتكم بعمق واختارت شريكاً متوافقاً معكم بنسبة عالية بناءً على معايير علمية مدروسة.\n\n*ثقوا بالعملية:*\n\nنحن نستخدم منهجية علمية متطورة لضمان أفضل مطابقة ممكنة. امنحوا التجربة فرصة حقيقية، وكونوا منفتحين على التعرف على شخص قد يكون متوافقاً معكم بطرق لم تتوقعوها.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\nالتاريخ: السبت 1 نوفمبر 2024\nالوقت: 7:30 مساءً\n\nرقم المشارك: *${assignedNumber}*\nرابط حسابك: https://match-omega.vercel.app/welcome?token=${secureToken}\n\nلأي استفسارات إضافية، نحن هنا للمساعدة.\n\nفريق التوافق الأعمى`;

      case 'gender-confirmation':
        return `السلام عليكم *${name}* 👋\n\nلاحظنا إنك اخترت "*أي جنس*" في تفضيلات المطابقة.\n\nبس حبينا نتأكد إن هذا اختيارك الصحيح؟ 🤔\n\nلو تبي تأكد أو تغير:\n• "نعم" - أوكي مع أي جنس\n• "ذكر" - ذكور فقط\n• "أنثى" - إناث فقط\n\nشكراً! 🙏`;

      default:
        return "";
    }
  }, [participant, urgencyLevel, templateType]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePhoneCopy = () => {
    if (participant?.phone_number) {
      navigator.clipboard.writeText(participant.phone_number);
      setPhoneCopied(true);
      setTimeout(() => setPhoneCopied(false), 2000);
    }
  };

  const openWhatsApp = () => {
    if (!participant?.phone_number) {
      alert('❌ لا يوجد رقم هاتف لهذا المشارك.');
      return;
    }
    
    const whatsappUrl = `https://wa.me/${participant.phone_number}`;
    window.open(whatsappUrl, '_blank');
  };

  if (!isOpen || !participant) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">رسالة واتساب للمشارك #${participant.assigned_number}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Phone Number Copy Field */}
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label className="text-sm font-medium text-slate-300 mb-2 block">رقم الهاتف</label>
                <div className="text-lg font-mono text-white bg-slate-700 px-3 py-2 rounded border">
                  {participant?.phone_number || 'غير متوفر'}
                </div>
              </div>
              <Button
                onClick={handlePhoneCopy}
                disabled={!participant?.phone_number}
                className="ml-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
              >
                {phoneCopied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {phoneCopied ? 'تم النسخ!' : 'نسخ'}
              </Button>
            </div>
          </div>

          {/* Template Selection */}
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
            <label className="text-sm font-medium text-slate-300 mb-3 block">نوع الرسالة</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTemplateType('match')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'match' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <MessageSquare className="w-4 h-4 mx-auto mb-1" />
                إشعار المطابقة
              </button>
              <button
                onClick={() => setTemplateType('early-match')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'early-match' 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <MessageSquare className="w-4 h-4 mx-auto mb-1" />
                إشعار مبكر
              </button>
              <button
                onClick={() => setTemplateType('event-info')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'event-info' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Info className="w-4 h-4 mx-auto mb-1" />
                شرح الفعالية
              </button>
              <button
                onClick={() => setTemplateType('faq-payment')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'faq-payment' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <HelpCircle className="w-4 h-4 mx-auto mb-1" />
                أسئلة الدفع
              </button>
              <button
                onClick={() => setTemplateType('faq-location')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'faq-location' 
                    ? 'bg-orange-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <HelpCircle className="w-4 h-4 mx-auto mb-1" />
                أسئلة الموقع
              </button>
              <button
                onClick={() => setTemplateType('faq-timing')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'faq-timing' 
                    ? 'bg-cyan-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Clock className="w-4 h-4 mx-auto mb-1" />
                أسئلة التوقيت
              </button>
              <button
                onClick={() => setTemplateType('reminder')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'reminder' 
                    ? 'bg-yellow-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Clock className="w-4 h-4 mx-auto mb-1" />
                تذكير الفعالية
              </button>
              <button
                onClick={() => setTemplateType('payment-reminder')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'payment-reminder' 
                    ? 'bg-red-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <MessageSquare className="w-4 h-4 mx-auto mb-1" />
                تذكير الدفع
              </button>
              <button
                onClick={() => setTemplateType('partner-info')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'partner-info' 
                    ? 'bg-pink-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <HelpCircle className="w-4 h-4 mx-auto mb-1" />
                معلومات الشريك
              </button>
              <button
                onClick={() => setTemplateType('gender-confirmation')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'gender-confirmation' 
                    ? 'bg-amber-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <HelpCircle className="w-4 h-4 mx-auto mb-1" />
                تأكيد الجنس
              </button>
            </div>
          </div>

          {/* Urgency Level - Only for match template */}
          {templateType === 'match' && (
            <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
              <label className="text-sm font-medium text-slate-300 mb-3 flex items-center">
                <Clock className="w-4 h-4 ml-2" />
                مستوى الاستعجال
              </label>
              <div className="space-y-3">
                {/* Normal - 24 hours */}
                <button
                  onClick={() => setUrgencyLevel('normal')}
                  className={`w-full p-3 rounded-lg text-right transition-all ${
                    urgencyLevel === 'normal'
                      ? 'bg-blue-600 border-2 border-blue-400 text-white'
                      : 'bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">📅 رسالة عادية</div>
                      <div className="text-xs mt-1 opacity-80">مهلة 24 ساعة للرد - نبرة احترافية</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ml-3 ${
                      urgencyLevel === 'normal' ? 'border-white' : 'border-slate-400'
                    }`}>
                      {urgencyLevel === 'normal' && <div className="w-3 h-3 rounded-full bg-white"></div>}
                    </div>
                  </div>
                </button>

                {/* Semi-urgent - 2 hours */}
                <button
                  onClick={() => setUrgencyLevel('semi-urgent')}
                  className={`w-full p-3 rounded-lg text-right transition-all ${
                    urgencyLevel === 'semi-urgent'
                      ? 'bg-orange-600 border-2 border-orange-400 text-white'
                      : 'bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">⚠️ رسالة شبه عاجلة</div>
                      <div className="text-xs mt-1 opacity-80">مهلة ساعتين للرد - نبرة مهمة</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ml-3 ${
                      urgencyLevel === 'semi-urgent' ? 'border-white' : 'border-slate-400'
                    }`}>
                      {urgencyLevel === 'semi-urgent' && <div className="w-3 h-3 rounded-full bg-white"></div>}
                    </div>
                  </div>
                </button>

                {/* Urgent - 1 hour */}
                <button
                  onClick={() => setUrgencyLevel('urgent')}
                  className={`w-full p-3 rounded-lg text-right transition-all ${
                    urgencyLevel === 'urgent'
                      ? 'bg-red-600 border-2 border-red-400 text-white'
                      : 'bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">🚨 رسالة عاجلة جداً</div>
                      <div className="text-xs mt-1 opacity-80">مهلة ساعة واحدة فقط - ضغط نفسي عالي</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ml-3 ${
                      urgencyLevel === 'urgent' ? 'border-white' : 'border-slate-400'
                    }`}>
                      {urgencyLevel === 'urgent' && <div className="w-3 h-3 rounded-full bg-white"></div>}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          <Textarea
            readOnly
            value={message}
            className="w-full h-80 bg-slate-800 border-slate-600 text-slate-200 text-sm resize-none focus:ring-blue-500 focus:border-blue-500"
            dir="rtl"
          />
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row gap-3 p-5 border-t border-slate-700">
          <Button onClick={handleCopy} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />} 
            {copied ? 'تم النسخ!' : 'نسخ الرسالة'}
          </Button>
          <Button onClick={openWhatsApp} className="w-full bg-green-600 hover:bg-green-700 text-white">
            <MessageSquare className="w-4 h-4 mr-2" />
            فتح في واتساب
          </Button>
        </div>
      </div>
    </div>
  );
}


