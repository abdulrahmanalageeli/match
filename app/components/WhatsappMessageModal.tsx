import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import { Check, Copy, MessageSquare, X, Clock, Info, HelpCircle, Settings, FileText, Send } from 'lucide-react';

interface WhatsappMessageModalProps {
  participant: any;
  isOpen: boolean;
  onClose: () => void;
  cohostTheme?: boolean;
}

export default function WhatsappMessageModal({ participant, isOpen, onClose, cohostTheme = false }: WhatsappMessageModalProps) {
  const [copied, setCopied] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [twilioSending, setTwilioSending] = useState(false);
  const [twilioResult, setTwilioResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [urgencyLevel, setUrgencyLevel] = useState<'normal' | 'semi-urgent' | 'urgent'>('normal');
  const [templateType, setTemplateType] = useState<'match' | 'early-match' | 'early-reminder' | 'event-info' | 'faq-payment' | 'faq-location' | 'faq-timing' | 'reminder' | 'payment-reminder' | 'partner-info' | 'gender-confirmation' | 'survey-completion' | 'time-change'>('match');
  const [showCustomize, setShowCustomize] = useState(false);
  const [exportMode, setExportMode] = useState(false);

  // Persistence state
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null);

  // Customizable settings with sensible defaults
  const [config, setConfig] = useState({
    // Deadlines (minutes)
    normalDeadlineMin: 24 * 60,
    semiUrgentDeadlineMin: 120,
    urgentDeadlineMin: 60,
    // Prices
    earlyPrice: 45,
    latePrice: 65,
    latePriceSwitchLabel: 'الجمعة 3:00 مساءً',
    // Event details
    eventDateText: 'الأحد 16 نوفمبر 2025',
    eventTimeText: '8:15 مساءً',
    arrivalTimeText: '8:05 مساءً',
    locationName: 'كوفي بلانيت - الدور الثاني',
    mapUrl: 'https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA',
    // Payment
    stcPay: '0560899666',
    bankName: 'مصرف الراجحي: عبدالرحمن عبدالملك',
    iban: 'SA2480000588608016007502',
    // Formatting toggles
    includeEmojis: true,
    includeBold: true,
  });

  // Load WhatsApp config on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const load = async () => {
      setLoadingConfig(true);
      try {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-whatsapp-config' }),
        });
        const data = await res.json();
        if (!cancelled && res.ok && data?.success && data?.whatsapp_config) {
          setConfig((prev) => ({ ...prev, ...data.whatsapp_config }));
          setLastUpdatedAt(data.whatsapp_config_updated_at || null);
          setLastUpdatedBy(data.whatsapp_config_updated_by || null);
        } else if (!cancelled) {
          setLastUpdatedAt(null);
          setLastUpdatedBy(null);
        }
      } catch (e) {
        console.error('Failed to load WhatsApp config', e);
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen]);

  const sanitizeForExport = (text: string) => {
    // remove markdown bold markers and most emojis/symbols while keeping Arabic/English text and punctuation
    const noAsterisk = text.replace(/\*/g, '');
    // basic emoji filter using unicode ranges (approx)
    const noEmoji = noAsterisk.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
    // If this is the event reminder message, ensure policy note is present in export
    let result = noEmoji;
    try {
      if (
        text.includes('تذكير مهم بموعد الفعالية') &&
        !/(لا يوجد استرداد|لا استرداد|تأجيل)/.test(noEmoji)
      ) {
        // Insert policy before the participant info section if possible
        const injected = noEmoji.replace(/(\n+\s*معلوماتك للفعالية:)/, "\n\nمهم: لا يوجد استرداد أو تأجيل$1");
        if (injected !== noEmoji) {
          result = injected;
        } else {
          // Fallback: append at end
          result = noEmoji + "\n\nمهم: لا يوجد استرداد أو تأجيل";
        }
      }
    } catch (_) {
      // no-op safeguard
    }
    return result;
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-whatsapp-config', config, updated_by: 'admin_ui' }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setSaveSuccess(true);
        setLastUpdatedAt(data.whatsapp_config_updated_at || null);
        setLastUpdatedBy(data.whatsapp_config_updated_by || null);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        alert(data?.error || 'فشل حفظ الإعدادات');
      }
    } catch (e) {
      console.error('Save WhatsApp config error', e);
      alert('حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const message = useMemo(() => {
    if (!participant) return "";

    const name = participant.name || participant.survey_data?.name || `المشارك #${participant.assigned_number}`;
    const assignedNumber = participant.assigned_number;
    const secureToken = participant.secure_token;
    const d = config;
    const bold = (s: string) => (d.includeBold ? `*${s}*` : s);
    const e = (s: string) => (d.includeEmojis ? s : '');

    // Generate message based on template type via a builder function
    const build = () => {
      switch (templateType) {
      case 'match':
        if (urgencyLevel === 'urgent') {
          const deadlineMin = d.urgentDeadlineMin;
          return `${e('⏰ ')}${bold('عاجل - التوافق الأعمى')} ${e('⏰')}\n\nالسلام عليكم ${bold(name)}،\n\n${e('✨ ')}تم العثور على شريك متوافق معكم!\n\n${e('⏰ ')}${bold(`يرجى الرد خلال ${Math.round(deadlineMin/60) >= 1 ? `${Math.round(deadlineMin/60)} ساعة` : `${deadlineMin} دقيقة`}`)}\nنظراً لمحدودية المقاعد، قد نحتاج لإعطاء الفرصة لمشارك آخر إذا لم نتلقى ردكم قريباً.\n\n${e('💳 ')}رسوم المشاركة: ${d.earlyPrice} ريال سعودي\n\n${bold('المطلوب منكم:')}\n1️⃣ تحويل المبلغ خلال المدة المحددة\n2️⃣ إرسال صورة الإيصال بعد التحويل\n3️⃣ تأكيد حضوركم\n\n${bold('طرق الدفع:')}\n• STC Pay: ${d.stcPay}\n• ${d.bankName}\n• IBAN:\n${d.iban}\n\n${e('⚠️ ')}${bold('ملاحظة:')} لتأكيد حضوركم، يجب إتمام التحويل وإرسال صورة الإيصال خلال المدة المحددة.\n\n${e('⚠️ ')}${bold('مهم - سياسة الحضور:')}\n• لا استرداد للرسوم في حالة الإلغاء\n• الأولوية للمبكرين في الدفع — المقاعد محدودة وقد تفقدون فرصتكم بالتأخير\n• عدم الرد بنعم أو لا قبل الدفع سيؤدي لاستبعادكم من الفعالية الحالية\n• لكن نرحب بحضوركم حتى لو تأخرتم!\n• المهم إبلاغنا فوراً إذا لن تتمكنوا من الحضور\n\n${e('📍 ')}${bold('تفاصيل الفعالية:')}\nالمكان: ${d.locationName}\nالعنوان: ${d.mapUrl}\n\n${e('📅 ')}التاريخ: ${d.eventDateText}\n${e('🕰️ ')}الوقت: ${d.eventTimeText}\n${e('⏱️ ')}المدة: 60 دقيقة\n\n${bold('يرجى الحضور قبل الموعد بـ 10 دقائق')}\n\nمعلوماتكم للفعالية:\nرقم المشارك: ${bold(String(assignedNumber))}\nالرمز الخاص: ${bold(String(secureToken))}\n\n${e('🔗 ')}رابط الدخول المباشر:\nhttps://blindmatch.app/welcome?token=${secureToken}\n\n${e('⏰ ')}${bold('يرجى الرد في أقرب وقت ممكن')}\n\nنتطلع لحضوركم!\n\nفريق التوافق الأعمى`;
        } else if (urgencyLevel === 'semi-urgent') {
          const deadlineMin = d.semiUrgentDeadlineMin;
          return `${e('⚠️ ')}${bold('مهم - التوافق الأعمى')} ${e('⚠️')}\n\nالسلام عليكم ${bold(name)}،\n\n${e('🎯 ')}${bold('مهم:')} تم العثور على شريك متوافق معكم!\n\n${e('⏰ ')}${bold(`يرجى الرد خلال ${Math.round(deadlineMin/60) >= 1 ? `${Math.round(deadlineMin/60)} ساعة` : `${deadlineMin} دقيقة`}`)}\n⚡ المقاعد محدودة وقد تُعطى الفرصة لمشارك آخر إذا لم نتلقى ردكم\n\n${e('💳 ')}رسوم المشاركة: ${d.earlyPrice} ريال سعودي\n\n${bold('المطلوب منكم:')}\n1️⃣ تحويل المبلغ خلال المدة المحددة\n2️⃣ إرسال صورة الإيصال فوراً بعد التحويل\n3️⃣ تأكيد حضوركم\n\n${bold('طرق الدفع:')}\n• STC Pay: ${d.stcPay}\n• ${d.bankName}\n• IBAN:\n${d.iban}\n\n${e('⚠️ ')}${bold('ملاحظة مهمة:')} لتأكيد حضوركم، يجب إتمام التحويل وإرسال صورة الإيصال خلال المدة المحددة. في حالة عدم التحويل، سيتم إعطاء الفرصة لمشارك آخر.\n• الأولوية للمبكرين في الدفع — المقاعد محدودة وقد تفقدون فرصتكم بالتأخير\n• عدم الرد بنعم أو لا قبل الدفع سيؤدي لاستبعادكم من الفعالية الحالية\n\n${bold('تفاصيل الفعالية:')}\nالمكان: ${d.locationName}\nالعنوان: ${d.mapUrl}\n\n${e('📅 ')}التاريخ: ${d.eventDateText}\n${e('🕰️ ')}الوقت: ${d.eventTimeText}\n${e('⏱️ ')}المدة: 60 دقيقة\n\n${bold('يرجى الحضور قبل الموعد بـ 10 دقائق')}\n\nمعلوماتكم للفعالية:\nرقم المشارك: ${bold(String(assignedNumber))}\nالرمز الخاص: ${bold(String(secureToken))}\n\n${e('🔗 ')}رابط الدخول المباشر:\nhttps://blindmatch.app/welcome?token=${secureToken}\n\n${e('⏰ ')}${bold(`تذكير: لديكم ${Math.round(deadlineMin/60) >= 1 ? `${Math.round(deadlineMin/60)} ساعة` : `${deadlineMin} دقيقة`} للرد وتأكيد المشاركة`)}\n\nنتطلع لحضوركم!\n\nفريق التوافق الأعمى`;
        } else {
          // Regular match message (normal)
          return `${bold('التوافق الأعمى 4.0: اختيارك واختيارنا')} ${e('✨')}\n\nالسلام عليكم ${bold(name)}،\n\nنسعد بإبلاغكم أنه تم العثور على شريك متوافق معكم!\n\n📋 ${bold('تفاصيل الفعالية كاملة:')}\nhttps://meetu.ps/e/Q9zQM/Lh7Kd/i\n\n${e('⚡ ')}${bold('الأولوية للمبكرين في الدفع — المقاعد محدودة وقد تفقدون فرصتكم بالتأخير')}\n\n${e('💰 ')}${bold('رسوم المشاركة:')}\n🔸 ${d.earlyPrice} ريال (التسجيل قبل ${d.latePriceSwitchLabel})\n🔸 ${d.latePrice} ريال (التسجيل بعد ${d.latePriceSwitchLabel})\n\n${bold('طرق الدفع:')}\n✦ STC Pay: ${d.stcPay}\n✦ ${d.bankName}\n✦ IBAN: ${d.iban}\n\n${e('⚠️ ')}${bold('التأكيد يتم فقط بعد استلام التحويل والإيصال')}\n\n${e('📍 ')}${bold('تفاصيل الفعالية:')}\nالمكان: ${d.locationName}\nالتاريخ: ${d.eventDateText}\nالوقت: ${d.eventTimeText} (الحضور ${d.arrivalTimeText})\n\nالعنوان:\n${d.mapUrl}\n\n${e('⚠️ ')}${bold('مهم:')}\n✦ التأكيد بدون حضور سيؤدي لمنعكم من الفعاليات القادمة\n✦ لا استرداد للرسوم بعد التأكيد (حتى في حالة الإلغاء المسبق)\n✦ لا يمكن تأجيل دفع من فعاليه الى فعاليه اخرى\n✦ عدم الرد بنعم أو لا قبل الدفع سيؤدي لاستبعادكم من الفعالية الحالية\n\n${e('📱 ')}${bold('معلوماتكم:')}\nرقم المشارك: ${bold(String(assignedNumber))}\nالرمز: ${bold(String(secureToken))}\nالرابط:\nhttps://blindmatch.app/welcome?token=${secureToken}\n\nنتطلع لحضوركم!\n\nفريق التوافق الأعمى`;
        }

      case 'early-match':
        return `*التوافق الأعمى* ✨\n\nالسلام عليكم *${name}*،\n\n🎉 *أخبار رائعة!* تم العثور على شريك متوافق معكم!\n\n💳 *رسوم المشاركة:* 45 ريال سعودي\n\n📋 *للتأكيد:*\n1️⃣ حولوا المبلغ عبر إحدى الطرق أدناه\n2️⃣ أرسلوا صورة الإيصال\n3️⃣ انتظروا تأكيد الحجز منا\n\n*طرق الدفع:*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN:\nSA2480000588608016007502\n\n📅 *لديكم حتى يوم الجمعة لتأكيد المشاركة*\n\n⭐ *كلما أكدتم مشاركتكم مبكراً، كلما زادت موثوقيتكم وأولويتكم في الفعاليات القادمة*\n\n💡 *لماذا التأكيد المبكر مهم؟*\n• يضمن مقعدكم في الفعالية\n• يزيد من موثوقيتكم كمشارك\n• يساعدنا في التخطيط الأفضل للفعالية\n• يعطيكم أولوية في الفعاليات المستقبلية\n\n*تنبيه:* في حالة التأكيد ثم عدم الحضور أو الإلغاء، لا يمكن استرداد الرسوم.\n• الأولوية للمبكرين في الدفع — المقاعد محدودة وقد تفقدون فرصتكم بالتأخير\n• عدم الرد بنعم أو لا قبل الدفع سيؤدي لاستبعادكم من الفعالية الحالية\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n📅 التاريخ: الأحد 16 نوفمبر 2025\n🕰️ الوقت: 8:15 مساءً\n⏱️ المدة: 60 دقيقة\n\n*يرجى الحضور قبل الموعد بـ 10 دقائق*\n\nمعلوماتكم للفعالية:\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🔗 رابط الدخول المباشر (للإستعمال خلال الفعالية):\nhttps://blindmatch.app/welcome?token=${secureToken}\n\n🌟 *نقدر التزامكم ونتطلع لمشاركتكم المبكرة!*\n\nفريق التوافق الأعمى`;

      case 'event-info':
        return `*التوافق الفكري* 📋\n\nالسلام عليكم *${name}*،\n\n🎯 *ما هو الهدف من هذه المنصة؟*\n\nمنصة التوافق الفكري هي منصة احترافية تهدف إلى ربط الأشخاص ذوي التفكير المتشابه والاهتمامات المتوافقة لبناء علاقات فكرية وثقافية هادفة. نحن لسنا منصة مواعدة، بل مساحة آمنة للتبادل الفكري والثقافي بين الأشخاص المتوافقين فكرياً وشخصياً.\n\n⏰ *كم تستغرق الجلسات؟*\n• الجلسات الجماعية: 30 دقيقة مع مجموعة من 4-6 أشخاص\n• الجلسات الفردية: 30 دقيقة كحد أدنى، لكن يمكنكما الاستمرار كما تشاءان\n\n✨ *ما الأنشطة المتوفرة؟*\n• للجلسات الفردية: أسئلة محفزة للحوار ومواضيع نقاش متنوعة\n• للجلسات الجماعية: 4 أنشطة تفاعلية مختلفة تشمل ألعاب كسر الجليد، أسئلة التعارف، وأنشطة بناء الفريق\n\n🔄 *هل سأتم مطابقتي مع نفس الأشخاص مرة أخرى؟*\nلا، لن يتم مطابقتك مع نفس الشخص في جلستين متتاليتين. نظامنا الذكي يضمن التنويع في المطابقات لتتيح لك فرصة التعرف على أكبر عدد من الأشخاص المتوافقين معك فكرياً.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n📅 التاريخ: الأحد 16 نوفمبر 2025\n🕰️ الوقت: 8:15 مساءً\n\n🔗 رابط حسابك:\nhttps://blindmatch.app/welcome?token=${secureToken}\n\nنتطلع لمشاركتكم في هذه التجربة الفريدة!\n\nفريق التوافق الفكري`;

      case 'faq-payment':
        return `*التوافق الأعمى* 💳\n\nالسلام عليكم *${name}*،\n\n💰 *الأسئلة الشائعة - الدفع والرسوم*\n\n❓ *كم رسوم المشاركة؟*\n💳 45 ريال سعودي فقط\n\n❓ *طرق الدفع المتاحة؟*\n• STC Pay: 0560899666\n• مصرف الراجحي: عبدالرحمن عبدالملك\n• IBAN: SA2480000588608016007502\n\n❓ *متى يجب الدفع؟*\n⏰ خلال 24 ساعة من تأكيد المطابقة\n⚡ للرسائل العاجلة: خلال ساعة واحدة\n\n❓ *ماذا لو لم أدفع في الوقت المحدد؟*\n⚠️ سيتم إعطاء الفرصة لمشارك آخر\n🚫 لن تتمكن من حضور الفعالية\n\n❓ *هل يمكن استرداد الرسوم؟*\n✅ نعم، في حالة إلغاء الفعالية من طرفنا\n❌ لا، في حالة عدم الحضور أو الإلغاء من طرفك\n\n❓ *ماذا بعد الدفع؟*\n📸 أرسل صورة الإيصال فوراً\n✅ سنؤكد حجزك خلال ساعات قليلة\n📧 ستصلك تفاصيل إضافية قبل الفعالية\n\n❓ *هل الدفع آمن؟*\n🔒 جميع طرق الدفع آمنة ومضمونة\n🏦 حسابات بنكية رسمية مسجلة\n📱 STC Pay معتمد رسمياً\n\n❓ *ماذا لو واجهت مشكلة في الدفع؟*\n📞 تواصل معنا فوراً عبر الواتساب\n🕐 نحن متاحون للمساعدة 24/7\n\nرقم المشارك: *${assignedNumber}*\n\n🔗 رابط حسابك:\nhttps://blindmatch.app/welcome?token=${secureToken}\n\nفريق التوافق الأعمى`;

      case 'faq-location':
        return `*التوافق الأعمى* 📍\n\nالسلام عليكم *${name}*،\n\n🗺️ *الأسئلة الشائعة - الموقع والوصول*\n\n❓ *أين تقام الفعالية؟*\n📍 كوفي بلانيت - الدور الثاني\n🏢 مول أو مجمع تجاري (يرجى التأكد من الخريطة)\n\n❓ *كيف أصل للمكان؟*\n🗺️ خريطة جوجل: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n🚗 يمكن الوصول بالسيارة أو التاكسي\n🅿️ مواقف سيارات متاحة\n\n❓ *في أي دور؟*\n⬆️ الدور الثاني\n🛗 يوجد مصعد ودرج\n🔍 ابحث عن لافتة "التوافق الأعمى"\n\n❓ *متى يجب الوصول؟*\n⏰ قبل الموعد بـ 10 دقائق\n📅 الأحد 16 نوفمبر 2025\n🕰️ الساعة 8:05 مساءً (للاستقبال)\n🎯 بداية الفعالية: 8:15 مساءً\n\n❓ *ماذا لو تأخرت؟*\n⚠️ يرجى الالتزام بالمواعيد\n📞 في حالة الطوارئ، تواصل معنا فوراً\n🚫 التأخير قد يؤثر على مشاركتك\n\n❓ *كيف أعرف المكان الصحيح؟*\n🏷️ ابحث عن لافتة "التوافق الأعمى"\n👥 ستجد فريق الاستقبال\n📱 أو اتصل بنا عند الوصول\n\n❓ *هل يوجد مواقف سيارات؟*\n🅿️ نعم، مواقف مجانية متاحة\n🚗 مساحة كافية للجميع\n🔒 مواقف آمنة ومراقبة\n\n❓ *ماذا لو لم أجد المكان؟*\n📞 اتصل بنا فوراً\n📍 سنرسل لك موقعنا المباشر\n👨‍💼 أو سنرسل شخص لاستقبالك\n\nرقم المشارك: *${assignedNumber}*\n\n🔗 رابط حسابك:\nhttps://blindmatch.app/welcome?token=${secureToken}\n\nفريق التوافق الأعمى`;

      case 'faq-timing':
        return `*التوافق الفكري* ⏰\n\nالسلام عليكم *${name}*،\n\n🕐 *الأسئلة الشائعة - التوقيت والجدول*\n\n❓ *متى تبدأ الفعالية؟*\n📅 الأحد 16 نوفمبر 2025\n🕰️ الساعة 8:15 مساءً بالضبط\n⏰ يرجى الحضور 8:05 مساءً\n\n❓ *كم تستغرق الجلسات؟*\n• الجلسات الجماعية: 30 دقيقة مع مجموعة من 4-6 أشخاص\n• الجلسات الفردية: 30 دقيقة كحد أدنى، لكن يمكنكما الاستمرار كما تشاءان\n\n❓ *كيف يتم التوافق حسب العمر؟*\nيتم التوافق مع أشخاص قريبين من عمرك لضمان التجانس في مراحل الحياة والاهتمامات. الفارق العمري المسموح لا يتجاوز 5 سنوات إلا في حالات معينة.\n\n❓ *ماذا لو تأخرت؟*\n⚠️ التأخير يؤثر على تجربتك\n🚫 قد تفوت الجلسات الأولى\n📞 تواصل معنا فوراً إذا تأخرت\n\n❓ *هل يمكن المغادرة مبكراً؟*\n🚪 نعم، لكن لن تحصل على النتائج الكاملة\n⭐ ننصح بالبقاء للنهاية\n🎁 الأنشطة الجماعية ممتعة جداً\n\n❓ *متى تظهر النتائج؟*\n📊 في نهاية الفعالية\n📱 أو عبر الرابط الخاص بك لاحقاً\n✨ ستعرف من توافقت معهم\n\n❓ *ماذا بعد انتهاء الفعالية؟*\n📞 يمكنك التواصل مع من توافقت معهم\n📱 عبر المعلومات التي ستحصل عليها\n🤝 أو ترتيب لقاء آخر\n\nرقم المشارك: *${assignedNumber}*\n\n🔗 رابط حسابك:\nhttps://blindmatch.app/welcome?token=${secureToken}\n\nفريق التوافق الأعمى`;

      case 'reminder':
        return `${bold('التوافق الأعمى')} ${e('🔔')}\n\nالسلام عليكم ${bold(name)}،\n\n${e('⏰ ')}${bold('تذكير مهم بموعد الفعالية')}\n\n${e('🗓️ ')}${bold(`${config.eventDateText}`)}\n${e('🕰️ ')}${bold(`الساعة ${config.eventTimeText}`)}\n${e('📍 ')}${bold(config.locationName)}\n\n${e('⚠️ ')}${bold('الحضور المبكر إلزامي')}\nجلسات المجموعة تبدأ من بداية الفعالية — حضورك المبكر ضروري لتتمكن من مقابلة الجميع واختيار الأشخاص الذين تود الجلوس معهم في الجلسات الفردية لاحقاً. التأخير قد يحرمك من فرصة التعرف على كامل المشاركين.\n\n${bold('تأكد من:')}\n• وصولك قبل الموعد بـ 10 دقائق\n• إحضار هاتفك المحمول \n• مهم: في حال عدم الحضور, لا يوجد استرداد أو تأجيل\n\n${e('� ')}${bold('مهم قبل الفعالية:')}\nيرجى قراءة الشرح الكامل للفعالية من هذا الرابط لفهم كل التفاصيل قبل الحضور:\nhttps://blindmatch.app/event3\n\n${e('�📱 ')}${bold('معلوماتك للفعالية:')}\nرقم المشارك: ${bold(String(assignedNumber))}\nالرمز الخاص: ${bold(String(secureToken))}\n\n${e('🗺️ ')}${bold('الموقع:')}\n${config.mapUrl}\n\n${e('🔗 ')}${bold('رابط حسابك:')}\nhttps://blindmatch.app/welcome?token=${secureToken}\n\n${e('🎉 ')}${bold('نتطلع لرؤيتك في الفعالية!')}\n\nفريق التوافق الأعمى`;

      case 'payment-reminder':
        return `${bold('التوافق الأعمى')} ${e('💳')}

السلام عليكم ${bold(name)}،

${e('⚠️ ')}${bold('تذكير مهم - الدفع المطلوب')}

${e('🔴 ')}${bold('لم نستلم تحويلكم بعد!')}

نذكركم بأنه تم العثور على شريك متوافق معكم، ولكن لم يتم إتمام الدفع حتى الآن.

${e('⏰ ')}${bold('مهم جداً:')} يرجى إتمام التحويل في أقرب وقت ممكن لتأكيد حجزكم.

${e('💰 ')}${bold('رسوم المشاركة:')}
🔸 ${config.earlyPrice} ريال (التسجيل قبل ${config.latePriceSwitchLabel})
🔸 ${config.latePrice} ريال (التسجيل بعد ${config.latePriceSwitchLabel})

${e('⚠️ ')}${bold('تحذير:')} في حالة عدم استلام التحويل قريباً، سيتم إعطاء الفرصة لمشارك آخر.

${e('🚨 ')}${bold('لماذا يجب الدفع الآن؟')}
✦ شريكك المتوافق ينتظر تأكيدك
✦ المقاعد محدودة وقد تُعطى لآخرين
✦ لضمان مشاركتك في الفعالية
✦ لتجنب خسارة هذه الفرصة الفريدة
✦ توفير ${Math.max(config.latePrice - config.earlyPrice, 0)} ريال بالتأكيد قبل ${config.latePriceSwitchLabel}

${bold('طرق الدفع السريعة:')}
✦ STC Pay: ${config.stcPay}
✦ ${config.bankName}
✦ IBAN: ${config.iban}

${e('📸 ')}${bold('بعد التحويل:')}
أرسل صورة الإيصال فوراً عبر الواتساب لتأكيد حجزكم.

${e('⚠️ ')}${bold('مهم:')}
✦ التأكيد بدون حضور سيؤدي لمنعكم من الفعاليات القادمة
✦ لا استرداد للرسوم بعد التأكيد (حتى في حالة الإلغاء المسبق)
✦ لا يمكن تأجيل دفع من فعاليه الى فعاليه اخرى
✦ الأولوية للمبكرين في الدفع — المقاعد محدودة وقد تفقدون فرصتكم بالتأخير
✦ عدم الرد بنعم أو لا قبل الدفع سيؤدي لاستبعادكم من الفعالية الحالية

${e('📍 ')}${bold('تفاصيل الفعالية:')}
المكان: ${config.locationName}
التاريخ: ${config.eventDateText}
الوقت: ${config.eventTimeText} (الحضور ${config.arrivalTimeText})

العنوان:
${config.mapUrl}

${e('📱 ')}${bold('معلوماتك:')}
رقم المشارك: ${bold(String(assignedNumber))}
الرمز الخاص: ${bold(String(secureToken))}

رابط حسابك:
https://blindmatch.app/welcome?token=${secureToken}

${e('⚡ ')}${bold('يرجى التحويل وإرسال الإيصال في أقرب وقت!')}

${e('🔥 ')}لا تفوت هذه الفرصة!

فريق التوافق الأعمى`;

      case 'partner-info':
        return `*التوافق الأعمى* 🔒\n\nالسلام عليكم *${name}*،\n\n*سياسة الخصوصية ومعلومات الشريك*\n\n*هل يمكنكم مشاركة معلومات عن شريكي؟*\n\nنعتذر، لا يمكننا مشاركة أي معلومات شخصية عن شريكك قبل اللقاء. هذا جزء أساسي من تجربة "التوافق الأعمى" التي تهدف إلى بناء علاقات فكرية وثقافية هادفة قائمة على التوافق الحقيقي.\n\n*طبيعة الفعالية:*\n\nهذه الفعالية مصممة لربط الأشخاص ذوي التفكير المتشابه والاهتمامات المتوافقة في بيئة احترافية آمنة. نحن نركز على التبادل الفكري والثقافي، وليس على المواعدة التقليدية. الهدف هو التعرف على أشخاص متوافقين معكم فكرياً وشخصياً لبناء علاقات ذات معنى.\n\n*فلسفة التوافق:*\n\nنظامنا يعتمد على التوافق الشخصي والفكري بغض النظر عن الهوية الشخصية، الجنسية، المظهر الخارجي، أو الخلفية الاجتماعية. نحن نؤمن بأن التوافق الحقيقي يتجاوز هذه العوامل السطحية.\n\n*منهجية المطابقة:*\n\nخوارزميتنا تبحث عن التوازن المثالي بين التشابه والتكامل. نحن لا نبحث عن التطابق الكامل (100% تشابه) ولا عن الاختلاف الكامل (100% تكامل)، بل عن المزيج الصحيح الذي يخلق علاقة متوازنة ومستدامة.\n\nالتشابه في القيم الأساسية والأهداف الحياتية يخلق أرضية مشتركة، بينما التكامل في الشخصيات وأساليب التفكير يضيف الثراء والنمو المتبادل.\n\n*ما نضمنه لكم:*\n\n• شريكك من نفس الفئة العمرية (الفارق لا يتجاوز 5 سنوات أعلى أو أقل)\n• توافق شخصي عالي بناءً على نوع الشخصية (MBTI)، أسلوب التواصل، القيم والاهتمامات، الأهداف الحياتية، والتوافق الفكري\n• احترام تفضيلاتك الشخصية (نفس الجنس أو جنس مختلف)\n• بيئة آمنة ومحترمة للجميع\n\n*لماذا نحافظ على السرية؟*\n\nالسرية تضمن تجربة حقيقية خالية من الأحكام المسبقة، وتتيح لكم التركيز على الجوهر والشخصية الحقيقية. كما تمنح الجميع فرصة عادلة متساوية وتحترم خصوصية جميع المشاركين.\n\nالدراسات تثبت أن اللقاءات "العمياء" تؤدي إلى تواصل أعمق وأكثر صدقاً، وتقييم أفضل للتوافق الحقيقي، مما ينتج عنه علاقات أقوى وأطول أمداً.\n\n*أسئلة شائعة:*\n\n**س: هل سأعرف اسم شريكي؟**\nج: نعم، خلال اللقاء ستتعرفون على بعضكم بشكل طبيعي وتتبادلون المعلومات كما تشاؤون.\n\n**س: هل يمكنني معرفة جنسية الشريك مسبقاً؟**\nج: نركز على التوافق الشخصي والفكري بغض النظر عن الجنسية أو الأصل.\n\n**س: ماذا لو لم أشعر بالتوافق مع الشريك؟**\nج: لا يوجد أي التزام بعد اللقاء. التجربة مصممة للتعارف واستكشاف التوافق فقط.\n\n**س: كيف تم اختيار شريكي؟**\nج: خوارزميتنا حللت إجاباتكم بعمق واختارت شريكاً متوافقاً معكم بنسبة عالية بناءً على معايير علمية مدروسة.\n\n*ثقوا بالعملية:*\n\nنحن نستخدم منهجية علمية متطورة لضمان أفضل مطابقة ممكنة. امنحوا التجربة فرصة حقيقية، وكونوا منفتحين على التعرف على شخص قد يكون متوافقاً معكم بطرق لم تتوقعوها.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\nالتاريخ: السبت 1 نوفمبر 2024\nالوقت: 8:15 مساءً\n\nرقم المشارك: *${assignedNumber}*\nرابط حسابك: https://blindmatch.app/welcome?token=${secureToken}\n\nلأي استفسارات إضافية، نحن هنا للمساعدة.\n\nفريق التوافق الأعمى`;

      case 'gender-confirmation':
        return `السلام عليكم *${name}* 👋\n\nلاحظنا إنك اخترت "*أي جنس*" في تفضيلات المطابقة.\n\nبس حبينا نتأكد إن هذا اختيارك الصحيح؟ 🤔\n\nلو تبي تأكد أو تغير:\n• "نعم" - أوكي مع أي جنس\n• "ذكر" - ذكور فقط\n• "أنثى" - إناث فقط\n\nشكراً! 🙏`;

      case 'early-reminder':
        return `${bold('تذكير مبكر')} ${e('🔔')}\n\nالسلام عليكم ${bold(name)}،\n\n${bold('تذكير ودي:')} الأسعار المخفضة (${config.earlyPrice} ريال) سارية حتى ${config.latePriceSwitchLabel}.\nبعدها تصبح ${config.latePrice} ريال.\n\n${bold('للتأكيد الآن:')}\n• STC Pay: ${config.stcPay}\n• ${config.bankName}\n• IBAN: ${config.iban}\n\n${bold('تفاصيل الفعالية:')} ${config.eventDateText} - ${config.eventTimeText}\nالمكان: ${config.locationName}\nالعنوان: ${config.mapUrl}`;

      case 'survey-completion':
        return `${bold('إكمال الاستبيان للفعالية القادمة')} ${e('📝')}\n\nالسلام عليكم ${bold(name)}،\n\n${e('ℹ️ ')}لاحظنا أن لديك ${bold('بعض الأسئلة غير المكتملة')} في الاستبيان. لإتمام تسجيلك والانضمام للفعالية القادمة، يرجى تعبئة ما تبقى الآن.\n\n${e('🔗 ')}${bold('رابط الدخول المباشر إلى الاستبيان:')}\nhttps://blindmatch.app/welcome?token=${secureToken}&redo=1\n${e('✅ ')}يفتح الرابط الاستبيان مباشرة بدون نوافذ انتظار أو تأكيد.\n\n${e('🛑 ')}${bold('إيقاف التسجيل التلقائي:')}\nhttps://blindmatch.app/welcome?token=${secureToken}&disableauto=1\n\n${e('📱 ')}${bold('معلوماتك:')}\nرقم المشارك: ${bold(String(assignedNumber))}\nالرمز الخاص: ${bold(String(secureToken))}\n\n${e('⏰ ')}يفضل الإكمال اليوم لضمان إدراجك في الفعالية القادمة. إذا واجهت أي مشكلة، رد على هذه الرسالة وسنساعدك فوراً.\n\nفريق التوافق الأعمى`;

      case 'time-change':
        return `${bold('تحديث مهم بخصوص موعد الفعالية')} ${e('⏰')}\n\nالسلام عليكم ${bold(name)}،\n\nنود إبلاغكم بأنه تم ${bold('تغيير وقت الفعالية')} مراعاةً لظروف الصيام.\n\n${e('🕕 ')}${bold('الموعد السابق:')} 6:00 مساءً\n${e('🕢 ')}${bold('الموعد الجديد:')} 7:15 مساءً\n\n${e('📅 ')}${bold('التاريخ:')} ${config.eventDateText}\n${e('📍 ')}${bold('المكان:')} ${config.locationName}\n${e('🗺️ ')}${bold('الموقع:')}\n${config.mapUrl}\n\nيرجى اعتماد الموعد الجديد والحضور قبل البداية بـ 10 دقائق.\n\n${e('📱 ')}${bold('معلوماتك للفعالية:')}\nرقم المشارك: ${bold(String(assignedNumber))}\nالرمز الخاص: ${bold(String(secureToken))}\n\n${e('🔗 ')}${bold('رابط حسابك:')}\nhttps://blindmatch.app/welcome?token=${secureToken}\n\nشكراً لتفهمكم، ونتطلع لرؤيتكم في الموعد الجديد.\n\nفريق التوافق الأعمى`;

      default:
        return "";
      }
    };

    // After building the message, optionally append a disable-auto link safely (no duplication or URL mixing)
    const accountLink = `https://blindmatch.app/welcome?token=${secureToken}`;
    const disableLine = `${e('🛑 ')}${bold('إيقاف التسجيل التلقائي:')}` + "\n" + `${accountLink}&disableauto=1`;

    let msg = build();
    try {
      // If the message already includes a disable-auto section (by link or label), do nothing
      const hasDisable = /disableauto=1|إيقاف التسجيل التلقائي/.test(msg);
      if (!hasDisable) {
        // Append as a separate block at the end to avoid mutating existing URLs (e.g., ...&redo=1)
        msg = `${msg}\n\n${disableLine}`;
      }
    } catch (_) {}
    return msg;
  }, [participant, urgencyLevel, templateType, config]);

  const exportMessage = useMemo(() => sanitizeForExport(message), [message]);

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

  const handleSendTwilio = async () => {
    if (!participant?.phone_number) {
      setTwilioResult({ success: false, msg: 'لا يوجد رقم هاتف لهذا المشارك' });
      return;
    }
    setTwilioSending(true);
    setTwilioResult(null);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-twilio-whatsapp',
          to: participant.phone_number,
          message: exportMode ? exportMessage : message,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTwilioResult({ success: true, msg: `تم الإرسال! SID: ${data.message_sid}` });
      } else {
        setTwilioResult({ success: false, msg: data.error || 'فشل الإرسال' });
      }
    } catch (e: any) {
      setTwilioResult({ success: false, msg: e?.message || 'خطأ في الاتصال' });
    } finally {
      setTwilioSending(false);
    }
  };

  if (!isOpen || !participant) return null;

  return (
    <div className={`fixed inset-0 ${cohostTheme ? 'bg-rose-900/40' : 'bg-black/60'} backdrop-blur-sm z-50 flex items-center justify-center p-4`}>
      <div className={`${cohostTheme ? 'bg-gradient-to-br from-rose-950 via-slate-900 to-rose-950 border-4 border-rose-400/30 rounded-3xl' : 'bg-slate-900 border border-slate-700 rounded-2xl'} shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${cohostTheme ? 'border-rose-400/20' : 'border-slate-700'}`}>
          <h2 className="text-lg font-bold text-white">رسالة واتساب للمشارك #${participant.assigned_number}</h2>
          <button onClick={onClose} className={`p-2 rounded-full ${cohostTheme ? 'hover:bg-rose-900/40 text-rose-200' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowCustomize(v => !v)} className={`px-3 py-2 ${showCustomize ? 'bg-slate-700' : 'bg-slate-800 hover:bg-slate-700'}`}>
                <Settings className="w-4 h-4 mr-2" /> تخصيص
              </Button>
            </div>
            <label className="inline-flex items-center gap-2 text-slate-300">
              <Checkbox checked={exportMode} onCheckedChange={(v:any) => setExportMode(!!v)} />
              <span className="flex items-center"><FileText className="w-4 h-4 ml-2"/> وضع التصدير (نص صِرف)</span>
            </label>
          </div>

          {/* Customize Panel */}
          {showCustomize && (
            <div className={`rounded-lg p-4 space-y-4 ${cohostTheme ? 'bg-rose-900/30 border border-rose-400/30' : 'bg-slate-800 border border-slate-600'}`}>
              {/* Load/last-updated status */}
              {loadingConfig && (
                <div className="text-xs text-slate-400">جارٍ تحميل إعدادات الواتساب...</div>
              )}
              {!loadingConfig && (lastUpdatedAt || lastUpdatedBy) && (
                <div className="text-xs text-slate-400">
                  آخر تحديث: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : '-'} {lastUpdatedBy ? `بواسطة ${lastUpdatedBy}` : ''}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400">مهلة عادية (دقيقة)</label>
                  <input type="number" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2"
                    value={config.normalDeadlineMin}
                    onChange={e=>setConfig({...config, normalDeadlineMin: Math.max(1, Number(e.target.value||0))})}/>
                </div>
                <div>
                  <label className="text-xs text-slate-400">مهلة شبه عاجلة (دقيقة)</label>
                  <input type="number" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2"
                    value={config.semiUrgentDeadlineMin}
                    onChange={e=>setConfig({...config, semiUrgentDeadlineMin: Math.max(1, Number(e.target.value||0))})}/>
                </div>
                <div>
                  <label className="text-xs text-slate-400">مهلة عاجلة جداً (دقيقة)</label>
                  <input type="number" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2"
                    value={config.urgentDeadlineMin}
                    onChange={e=>setConfig({...config, urgentDeadlineMin: Math.max(1, Number(e.target.value||0))})}/>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400">سعر مبكر (ريال)</label>
                  <input type="number" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.earlyPrice}
                    onChange={e=>setConfig({...config, earlyPrice: Number(e.target.value||0)})}/>
                </div>
                <div>
                  <label className="text-xs text-slate-400">سعر متأخر (ريال)</label>
                  <input type="number" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.latePrice}
                    onChange={e=>setConfig({...config, latePrice: Number(e.target.value||0)})}/>
                </div>
                <div>
                  <label className="text-xs text-slate-400">موعد التحول للسعر المتأخر</label>
                  <input type="text" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.latePriceSwitchLabel}
                    onChange={e=>setConfig({...config, latePriceSwitchLabel: e.target.value})}/>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">التاريخ (نصي)</label>
                  <input type="text" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.eventDateText}
                    onChange={e=>setConfig({...config, eventDateText: e.target.value})}/>
                </div>
                <div>
                  <label className="text-xs text-slate-400">الوقت</label>
                  <input type="text" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.eventTimeText}
                    onChange={e=>setConfig({...config, eventTimeText: e.target.value})}/>
                </div>
                <div>
                  <label className="text-xs text-slate-400">وقت الحضور المقترح</label>
                  <input type="text" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.arrivalTimeText}
                    onChange={e=>setConfig({...config, arrivalTimeText: e.target.value})}/>
                </div>
                <div>
                  <label className="text-xs text-slate-400">المكان</label>
                  <input type="text" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.locationName}
                    onChange={e=>setConfig({...config, locationName: e.target.value})}/>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400">رابط الموقع (خرائط)</label>
                  <input type="text" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.mapUrl}
                    onChange={e=>setConfig({...config, mapUrl: e.target.value})}/>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400">STC Pay</label>
                  <input type="text" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.stcPay}
                    onChange={e=>setConfig({...config, stcPay: e.target.value})}/>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400">اسم البنك</label>
                  <input type="text" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.bankName}
                    onChange={e=>setConfig({...config, bankName: e.target.value})}/>
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs text-slate-400">IBAN</label>
                  <input type="text" className="w-full mt-1 bg-slate-700 text-white rounded px-2 py-2" value={config.iban}
                    onChange={e=>setConfig({...config, iban: e.target.value})}/>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <Checkbox checked={config.includeEmojis} onCheckedChange={(v:any)=>setConfig({...config, includeEmojis: !!v})}/>
                  تضمين الإيموجي
                </label>
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <Checkbox checked={config.includeBold} onCheckedChange={(v:any)=>setConfig({...config, includeBold: !!v})}/>
                  تنسيق عريض (Bold)
                </label>
                <Button
                  onClick={() => setConfig({
                    normalDeadlineMin: 24 * 60,
                    semiUrgentDeadlineMin: 120,
                    urgentDeadlineMin: 60,
                    earlyPrice: 45,
                    latePrice: 65,
                    latePriceSwitchLabel: 'الجمعة 3:00 مساءً',
                    eventDateText: 'الأحد 16 نوفمبر 2025',
                    eventTimeText: '8:15 مساءً',
                    arrivalTimeText: '8:05 مساءً',
                    locationName: 'كوفي بلانيت - الدور الثاني',
                    mapUrl: 'https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA',
                    stcPay: '0560899666',
                    bankName: 'مصرف الراجحي: عبدالرحمن عبدالملك',
                    iban: 'SA2480000588608016007502',
                    includeEmojis: true,
                    includeBold: true,
                  })}
                  className="bg-slate-700 hover:bg-slate-600">
                  استعادة الإفتراضيات
                </Button>
                <Button
                  onClick={handleSaveConfig}
                  disabled={saving || loadingConfig}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50">
                  {saving ? 'جارٍ الحفظ...' : (saveSuccess ? 'تم الحفظ ✅' : 'حفظ الإعدادات')}
                </Button>
              </div>
            </div>
          )}
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
                onClick={() => setTemplateType('early-reminder')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'early-reminder' 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Clock className="w-4 h-4 mx-auto mb-1" />
                تذكير مبكر
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
              <button
                onClick={() => setTemplateType('survey-completion')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'survey-completion' 
                    ? 'bg-teal-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <FileText className="w-4 h-4 mx-auto mb-1" />
                إكمال الاستبيان
              </button>
              <button
                onClick={() => setTemplateType('time-change')}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  templateType === 'time-change' 
                    ? 'bg-violet-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Clock className="w-4 h-4 mx-auto mb-1" />
                تغيير الموعد
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
                {/* Normal - 24 hours (modifiable) */}
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
                      <div className="text-xs mt-1 opacity-80">مهلة {Math.round(config.normalDeadlineMin/60)} ساعة للرد - نبرة احترافية</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ml-3 ${
                      urgencyLevel === 'normal' ? 'border-white' : 'border-slate-400'
                    }`}>
                      {urgencyLevel === 'normal' && <div className="w-3 h-3 rounded-full bg-white"></div>}
                    </div>
                  </div>
                </button>

                {/* Semi-urgent - configurable */}
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
                      <div className="text-xs mt-1 opacity-80">مهلة {Math.round(config.semiUrgentDeadlineMin/60)} ساعة للرد - نبرة مهمة</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ml-3 ${
                      urgencyLevel === 'semi-urgent' ? 'border-white' : 'border-slate-400'
                    }`}>
                      {urgencyLevel === 'semi-urgent' && <div className="w-3 h-3 rounded-full bg-white"></div>}
                    </div>
                  </div>
                </button>

                {/* Urgent - configurable */}
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
                      <div className="text-xs mt-1 opacity-80">مهلة {Math.round(config.urgentDeadlineMin/60)} ساعة فقط - ضغط نفسي عالي</div>
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

          {!exportMode && (
            <Textarea
              readOnly
              value={message}
              className="w-full h-80 bg-slate-800 border-slate-600 text-slate-200 text-sm resize-none focus:ring-blue-500 focus:border-blue-500"
              dir="rtl"
            />
          )}

          {exportMode && (
            <div className="space-y-2">
              <label className="text-sm text-slate-300">نص التصدير (Plain)</label>
              <Textarea
                readOnly
                value={exportMessage}
                className="w-full h-80 bg-slate-800 border-slate-600 text-slate-200 text-sm resize-none focus:ring-blue-500 focus:border-blue-500"
                dir="rtl"
              />
            </div>
          )}
        </div>

        {/* Twilio result feedback */}
        {twilioResult && (
          <div className={`mx-5 mb-3 p-3 rounded-lg text-sm ${twilioResult.success ? 'bg-green-900/40 text-green-300 border border-green-700' : 'bg-red-900/40 text-red-300 border border-red-700'}`}>
            {twilioResult.success ? '✅ ' : '❌ '}{twilioResult.msg}
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col sm:flex-row gap-3 p-5 border-t border-slate-700">
          <Button onClick={() => {
              navigator.clipboard.writeText(exportMode ? exportMessage : message);
              setCopied(true); setTimeout(()=>setCopied(false), 2000);
            }} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />} 
            {copied ? 'تم النسخ!' : (exportMode ? 'نسخ (تصدير)' : 'نسخ الرسالة')}
          </Button>
          <Button onClick={openWhatsApp} className="w-full bg-green-600 hover:bg-green-700 text-white">
            <MessageSquare className="w-4 h-4 mr-2" />
            فتح في واتساب
          </Button>
          <Button onClick={handleSendTwilio} disabled={twilioSending || !participant?.phone_number} className="w-full bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50">
            {twilioSending ? <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            {twilioSending ? 'جارٍ الإرسال...' : 'إرسال عبر Twilio'}
          </Button>
        </div>
      </div>
    </div>
  );
}


