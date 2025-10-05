import React, { useState, useMemo } from 'react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Check, Copy, MessageSquare, X } from 'lucide-react';

interface WhatsappMessageModalProps {
  participant: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function WhatsappMessageModal({ participant, isOpen, onClose }: WhatsappMessageModalProps) {
  const [copied, setCopied] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);

  const message = useMemo(() => {
    if (!participant) return "";

    const name = participant.name || participant.survey_data?.name || `المشارك #${participant.assigned_number}`;
    const assignedNumber = participant.assigned_number;
    const secureToken = participant.secure_token;

    return `*التوافق الأعمى* ✨\n\nالسلام عليكم *${name}*،\n\n🎉 نسعد بإبلاغكم أنه تم العثور على شريك متوافق معكم من بين المشاركين.\n\n⏰ *يرجى تأكيد المشاركة خلال 24 ساعة*\n💳 رسوم المشاركة: 45 ريال سعودي\n\n⚠️ *ملاحظة مهمة:* لتأكيد حضوركم، يجب إتمام التحويل وإرسال صورة الإيصال. في حالة عدم التحويل خلال المدة المحددة، سيتم إعطاء الفرصة لمشارك آخر.\n\n💰 طرق الدفع:\n• STC Pay: 0560899666\n• مصرف الراجحي\n• اسم المستفيد: عبدالرحمن عبدالملك\n\n🏦 IBAN للنسخ:\nSA2480000588608016007502\n\n📄 بعد إتمام التحويل، يرجى إرسال صورة الإيصال فوراً لتأكيد حجزكم.\n\n🚫 *تنبيه:* في حالة التأكيد ثم عدم الحضور أو الإلغاء، لا يمكن استرداد الرسوم.\n\n📍 *تفاصيل الفعالية:*\nالمكان: كوفي بلانيت - الدور الثاني\nالعنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n📅 التاريخ: الخميس 9 يناير 2025\n🕰️ الوقت: 8:30 مساءً\n⏱️ المدة: 60 دقيقة\n\n🚶‍♂️ *يرجى الحضور قبل الموعد بـ 10 دقائق*\n\n👤 معلوماتكم للفعالية:\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n🔗 رابط الدخول المباشر:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\nنتطلع لحضوركم وتمنى لكم تجربة ممتعة. 🌟\n\nفريق التوافق الأعمى`;
  }, [participant]);

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
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${participant.phone_number}?text=${encodedMessage}`;
    
    // Debug logging
    console.log('Message length:', message.length);
    console.log('Encoded message length:', encodedMessage.length);
    console.log('Full URL length:', whatsappUrl.length);
    console.log('WhatsApp URL:', whatsappUrl);
    
    // Check if URL is too long
    if (whatsappUrl.length > 2000) {
      alert('⚠️ الرسالة طويلة جداً لواتساب. يرجى نسخ الرسالة يدوياً.');
      return;
    }
    
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
