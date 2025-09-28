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

  const message = useMemo(() => {
    if (!participant) return "";

    const name = participant.name || participant.survey_data?.name || `المشارك #${participant.assigned_number}`;
    const assignedNumber = participant.assigned_number;
    const secureToken = participant.secure_token;

    return `*التوافق الأعمى*\n\nحياك الله *${name}*!\n\n🎉 تم إيجاد شريك متوافق معك من بين المشاركين، واللقاء جاهز بانتظارك.\n\n📍 المكان: كوفي بلانيت\n‏https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA\n\n🗓️ التاريخ: السبت 4 اكتوبر\n🕒 الوقت: 8:00 مساءً – المدة 60 دقيقة\n\n⚠️ يرجى الالتزام بالوقت المحدد، فالتأخير قد يعني خسارة مقعدك.\n\n💳 رسوم المشاركة: 45 ريال (يرجى التأكيد اليوم لضمان مقعدكم)\nطرق الدفع:\nSTC Pay –\n0560899666\nAlrajhi – IBAN:\nSA2480000588608016007502\n👤 الاسم: عبدالرحمن عبدالملك\n\n📌 بعد التحويل، نرجو إرسال الإيصال لتأكيد حضورك.\n\nمعلوماتك (مهمة في الفعالية):\nرقم المتسابق: *${assignedNumber}*\nرقمك المميز (للدخول للفعالية, انسخه في الملاحظات): *${secureToken}*\n\n🔗 رابط الدخول المباشر للفعالية:\nhttps://match-omega.vercel.app/welcome?token=${secureToken}\n\n\nبانتظاركم!`;
  }, [participant]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openWhatsApp = () => {
    if (!participant?.phone_number) {
      alert('❌ لا يوجد رقم هاتف لهذا المشارك.');
      return;
    }
    const whatsappUrl = `https://wa.me/${participant.phone_number}?text=${encodeURIComponent(message)}`;
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
