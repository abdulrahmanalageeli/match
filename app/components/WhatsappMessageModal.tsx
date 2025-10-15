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
  const [isUrgent, setIsUrgent] = useState(false);
  const [templateType, setTemplateType] = useState<'match' | 'event-info' | 'faq-payment' | 'faq-location' | 'faq-timing' | 'reminder' | 'payment-reminder'>('match');

  const message = useMemo(() => {
    if (!participant) return "";

    const name = participant.name || participant.survey_data?.name || `المشارك #${participant.assigned_number}`;
    const assignedNumber = participant.assigned_number;
    const secureToken = participant.secure_token;

    // Generate message based on template type
    switch (templateType) {
      case 'match':
        if (isUrgent) {
          // Urgent match message with 1-hour deadline
          return `🚨 *عاجل - التوافق الأعمى* 🚨\n\nالسلام عليكم *${name}*،\n\n🔥 *عاجل جداً:* تم العثور على شريك متوافق معكم!\n\n⏰ *مهم للغاية: يجب الرد خلال ساعة واحدة فقط!*\n⚡ *إذا لم تردوا خلال 60 دقيقة، سيتم إعطاء الفرصة لمشارك آخر فوراً*\n\n🚨 *تحذير شديد:* هذه فرصة محدودة جداً ولن تتكرر!\n💳 رسوم المشاركة: 45 ريال سعودي\n\n⚠️ *إجراء فوري مطلوب:*\n1️⃣ احولوا المبلغ الآن فوراً\n2️⃣ ارسلوا صورة الإيصال خلال دقائق\n3️⃣ أكدوا حضوركم خلال الساعة\n\n*طرق الدفع السريعة:*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN:\nSA2480000588608016007502\n\n🔥 *لا تفوتوا هذه الفرصة الذهبية!*\nشريككم المتوافق ينتظر تأكيدكم الآن!\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n📅 التاريخ: الخميس 16 أكتوبر 2025\n🕰️ الوقت: 8:30 مساءً\n⏱️ المدة: 60 دقيقة\n\n*يرجى الحضور قبل الموعد بـ 10 دقائق*\n\nمعلوماتكم للفعالية:\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🔗 رابط الدخول المباشر:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\n⏰ *تذكير أخير: لديكم ساعة واحدة فقط للرد!*\n\nفريق التوافق الأعمى`;
        } else {
          // Regular match message with 24-hour deadline
          return `*التوافق الأعمى* ✨\n\nالسلام عليكم *${name}*،\n\nنسعد بإبلاغكم أنه تم العثور على شريك متوافق معكم من بين المشاركين.\n\n⏰ *يرجى تأكيد المشاركة خلال 24 ساعة*\n💳 رسوم المشاركة: 45 ريال سعودي\n\n⚠️ *ملاحظة مهمة:* لتأكيد حضوركم، يجب إتمام التحويل وإرسال صورة الإيصال. في حالة عدم التحويل خلال المدة المحددة، سيتم إعطاء الفرصة لمشارك آخر.\n\n*طرق الدفع:*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN:\nSA2480000588608016007502\n\nبعد إتمام التحويل، يرجى إرسال صورة الإيصال فوراً لتأكيد حجزكم.\n\n*تنبيه:* في حالة التأكيد ثم عدم الحضور أو الإلغاء، لا يمكن استرداد الرسوم.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n📅 التاريخ: الخميس 16 أكتوبر 2025\n🕰️ الوقت: 8:30 مساءً\n⏱️ المدة: 60 دقيقة\n\n*يرجى الحضور قبل الموعد بـ 10 دقائق*\n\nمعلوماتكم للفعالية:\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🔗 رابط الدخول المباشر:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nنتطلع لحضوركم وتمنى لكم تجربة ممتعة.\n\nفريق التوافق الأعمى`;
        }

      case 'event-info':
        return `*التوافق الأعمى* 📋\n\nالسلام عليكم *${name}*،\n\n🎯 *ما هو التوافق الأعمى؟*\n\nهو فعالية اجتماعية مبتكرة تهدف إلى ربط الأشخاص المتوافقين بناءً على الشخصية والاهتمامات المشتركة، وليس المظهر الخارجي فقط.\n\n✨ *كيف يعمل النظام؟*\n• تملأ استبيان شخصي مفصل\n• نظام ذكي يحلل إجاباتك\n• نجد لك الشريك الأكثر توافقاً معك\n• تلتقيان في بيئة مريحة ومنظمة\n\n🎪 *ما يميز فعاليتنا:*\n• تحليل علمي للشخصية (MBTI)\n• أسئلة محادثة مدروسة\n• بيئة آمنة ومحترمة\n• مدة محددة لكل جولة\n• أنشطة جماعية ممتعة\n\n⏱️ *جدول الفعالية:*\n• الاستقبال والترحيب (10 دقائق)\n• الجولة الأولى (7 دقائق)\n• الجولة الثانية (7 دقائق)\n• تقييم المطابقات (5 دقائق)\n• الأنشطة الجماعية (30 دقيقة)\n• إعلان النتائج (5 دقائق)\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n📅 التاريخ: الخميس 16 أكتوبر 2025\n🕰️ الوقت: 8:30 مساءً\n⏱️ المدة: 60 دقيقة\n\n🔗 رابط التسجيل:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nنتطلع لمشاركتكم في هذه التجربة الفريدة!\n\nفريق التوافق الأعمى`;

      case 'faq-payment':
        return `*التوافق الأعمى* 💳\n\nالسلام عليكم *${name}*،\n\n💰 *الأسئلة الشائعة - الدفع والرسوم*\n\n❓ *كم رسوم المشاركة؟*\n💳 45 ريال سعودي فقط\n\n❓ *طرق الدفع المتاحة؟*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN: SA2480000588608016007502\n\n❓ *متى يجب الدفع؟*\n⏰ خلال 24 ساعة من تأكيد المطابقة\n⚡ للرسائل العاجلة: خلال ساعة واحدة\n\n❓ *ماذا لو لم أدفع في الوقت المحدد؟*\n⚠️ سيتم إعطاء الفرصة لمشارك آخر\n🚫 لن تتمكن من حضور الفعالية\n\n❓ *هل يمكن استرداد الرسوم؟*\n✅ نعم، في حالة إلغاء الفعالية من طرفنا\n❌ لا، في حالة عدم الحضور أو الإلغاء من طرفك\n\n❓ *ماذا بعد الدفع؟*\n📸 أرسل صورة الإيصال فوراً\n✅ سنؤكد حجزك خلال ساعات قليلة\n📧 ستصلك تفاصيل إضافية قبل الفعالية\n\n❓ *هل الدفع آمن؟*\n🔒 جميع طرق الدفع آمنة ومضمونة\n🏦 حسابات بنكية رسمية مسجلة\n📱 STC Pay معتمد رسمياً\n\n❓ *ماذا لو واجهت مشكلة في الدفع؟*\n📞 تواصل معنا فوراً عبر الواتساب\n🕐 نحن متاحون للمساعدة 24/7\n\nرقم المشارك: *${assignedNumber}*\n\n🔗 رابط حسابك:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nفريق التوافق الأعمى`;

      case 'faq-location':
        return `*التوافق الأعمى* 📍\n\nالسلام عليكم *${name}*،\n\n🗺️ *الأسئلة الشائعة - الموقع والوصول*\n\n❓ *أين تقام الفعالية؟*\n📍 كوفي بلانيت - الدور الثاني\n🏢 مول أو مجمع تجاري (يرجى التأكد من الخريطة)\n\n❓ *كيف أصل للمكان؟*\n🗺️ خريطة جوجل: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n🚗 يمكن الوصول بالسيارة أو التاكسي\n🅿️ مواقف سيارات متاحة\n\n❓ *في أي دور؟*\n⬆️ الدور الثاني\n🛗 يوجد مصعد ودرج\n🔍 ابحث عن لافتة "التوافق الأعمى"\n\n❓ *متى يجب الوصول؟*\n⏰ قبل الموعد بـ 10 دقائق\n📅 الخميس 16 أكتوبر 2025\n🕰️ الساعة 8:20 مساءً (للاستقبال)\n🎯 بداية الفعالية: 8:30 مساءً\n\n❓ *ماذا لو تأخرت؟*\n⚠️ يرجى الالتزام بالمواعيد\n📞 في حالة الطوارئ، تواصل معنا فوراً\n🚫 التأخير قد يؤثر على مشاركتك\n\n❓ *كيف أعرف المكان الصحيح؟*\n🏷️ ابحث عن لافتة "التوافق الأعمى"\n👥 ستجد فريق الاستقبال\n📱 أو اتصل بنا عند الوصول\n\n❓ *هل يوجد مواقف سيارات؟*\n🅿️ نعم، مواقف مجانية متاحة\n🚗 مساحة كافية للجميع\n🔒 مواقف آمنة ومراقبة\n\n❓ *ماذا لو لم أجد المكان؟*\n📞 اتصل بنا فوراً\n📍 سنرسل لك موقعنا المباشر\n👨‍💼 أو سنرسل شخص لاستقبالك\n\nرقم المشارك: *${assignedNumber}*\n\n🔗 رابط حسابك:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nفريق التوافق الأعمى`;

      case 'faq-timing':
        return `*التوافق الأعمى* ⏰\n\nالسلام عليكم *${name}*،\n\n🕐 *الأسئلة الشائعة - التوقيت والجدول*\n\n❓ *متى تبدأ الفعالية؟*\n📅 الخميس 16 أكتوبر 2025\n🕰️ الساعة 8:30 مساءً بالضبط\n⏰ يرجى الحضور 8:20 مساءً\n\n❓ *كم تستغرق الفعالية؟*\n⏱️ 60 دقيقة إجمالية\n📊 مقسمة على عدة مراحل\n\n❓ *ما هو الجدول التفصيلي؟*\n🎪 الاستقبال والترحيب (10 دقائق)\n💬 الجولة الأولى (7 دقائق)\n🔄 انتقال بين الطاولات (3 دقائق)\n💬 الجولة الثانية (7 دقائق)\n📝 تقييم المطابقات (5 دقائق)\n🎮 الأنشطة الجماعية (30 دقائق)\n🎉 إعلان النتائج (5 دقائق)\n\n❓ *ماذا لو تأخرت؟*\n⚠️ التأخير يؤثر على تجربتك\n🚫 قد تفوت الجولة الأولى\n📞 تواصل معنا فوراً إذا تأخرت\n\n❓ *هل يمكن المغادرة مبكراً؟*\n🚪 نعم، لكن لن تحصل على النتائج\n⭐ ننصح بالبقاء للنهاية\n🎁 الأنشطة الجماعية ممتعة جداً\n\n❓ *متى تظهر النتائج؟*\n📊 في نهاية الفعالية (آخر 5 دقائق)\n📱 أو عبر الرابط الخاص بك لاحقاً\n✨ ستعرف من اختارك أيضاً\n\n❓ *ماذا بعد انتهاء الفعالية؟*\n📞 يمكنك التواصل مع من توافقت معهم\n📱 عبر المعلومات التي ستحصل عليها\n🤝 أو ترتيب لقاء آخر\n\n❓ *هل يوجد استراحة؟*\n☕ المشروبات متاحة طوال الوقت\n🍪 وجبات خفيفة مجانية\n🚻 دورات المياه متاحة\n\nرقم المشارك: *${assignedNumber}*\n\n🔗 رابط حسابك:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nفريق التوافق الأعمى`;

      case 'reminder':
        return `*التوافق الأعمى* 🔔\n\nالسلام عليكم *${name}*،\n\n⏰ *تذكير مهم بموعد الفعالية*\n\n🗓️ *غداً الخميس 16 أكتوبر 2025*\n🕰️ *الساعة 8:30 مساءً*\n📍 *كوفي بلانيت - الدور الثاني*\n\n✅ *تأكد من:*\n• وصولك قبل الموعد بـ 10 دقائق\n• إحضار هاتفك المحمول\n• ارتداء ملابس مريحة وأنيقة\n• إحضار هوية شخصية (اختياري)\n\n📱 *معلوماتك للفعالية:*\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🗺️ *الموقع:*\nhttps://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n🔗 *رابط حسابك:*\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\n💡 *نصائح للفعالية:*\n• كن طبيعياً ومسترخياً\n• استمع جيداً لشريكك\n• اطرح أسئلة مثيرة للاهتمام\n• استمتع بالتجربة\n\n❓ *أسئلة أو استفسارات؟*\n📞 تواصل معنا عبر الواتساب\n⚡ نحن متاحون للمساعدة\n\n🎉 *نتطلع لرؤيتك غداً!*\n\nفريق التوافق الأعمى`;

      case 'payment-reminder':
        return `*التوافق الأعمى* 💳\n\nالسلام عليكم *${name}*،\n\n⚠️ *تذكير مهم - الدفع المطلوب*\n\n🔴 *لم نستلم تحويلكم بعد!*\n\nنذكركم بأنه تم العثور على شريك متوافق معكم، ولكن لم يتم إتمام الدفع حتى الآن.\n\n⏰ *مهم جداً:* يرجى إتمام التحويل في أقرب وقت ممكن لتأكيد حجزكم.\n\n💳 *رسوم المشاركة:* 45 ريال سعودي\n\n⚠️ *تحذير:* في حالة عدم استلام التحويل قريباً، سيتم إعطاء الفرصة لمشارك آخر.\n\n🚨 *لماذا يجب الدفع الآن؟*\n• شريكك المتوافق ينتظر تأكيدك\n• المقاعد محدودة وقد تُعطى لآخرين\n• لضمان مشاركتك في الفعالية\n• لتجنب خسارة هذه الفرصة الفريدة\n\n*طرق الدفع السريعة:*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN:\nSA2480000588608016007502\n\n📸 *بعد التحويل:*\nأرسل صورة الإيصال فوراً عبر الواتساب لتأكيد حجزكم.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n📅 التاريخ: الخميس 16 أكتوبر 2025\n🕰️ الوقت: 8:30 مساءً\n⏱️ المدة: 60 دقيقة\n\n📱 *معلوماتك:*\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🔗 رابط حسابك:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\n⚡ *يرجى التحويل وإرسال الإيصال في أقرب وقت!*\n\n🔥 لا تفوت هذه الفرصة!\n\nفريق التوافق الأعمى`;

      default:
        return "";
    }
  }, [participant, isUrgent, templateType]);

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
            </div>
          </div>

          {/* Urgency Checkbox - Only for match template */}
          {templateType === 'match' && (
            <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
              <div className="flex items-center space-x-3 space-x-reverse">
                <Checkbox
                  id="urgent-checkbox"
                  checked={isUrgent}
                  onCheckedChange={(checked) => setIsUrgent(checked as boolean)}
                  className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                />
                <div className="flex-1">
                  <label 
                    htmlFor="urgent-checkbox" 
                    className="text-sm font-medium text-slate-200 cursor-pointer flex items-center"
                  >
                    <Clock className="w-4 h-4 ml-2 text-red-400" />
                    رسالة عاجلة - يجب الرد خلال ساعة واحدة فقط
                  </label>
                  <p className="text-xs text-slate-400 mt-1">
                    {isUrgent ? 
                      "🚨 سيتم إرسال رسالة عاجلة جداً مع مهلة ساعة واحدة فقط" : 
                      "📅 رسالة عادية مع مهلة 24 ساعة للرد"
                    }
                  </p>
                </div>
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
