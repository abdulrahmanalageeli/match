import { useState, useEffect } from "react";
import { X, Save, Edit2, User, Phone, Calendar, MapPin, Heart, MessageSquare, Brain, Users, Star, Coffee, CheckCircle2, XCircle, Loader2, SlidersHorizontal, ArrowLeftRight, Shuffle } from "lucide-react";
import { toast } from "react-hot-toast";

interface ParticipantProfileModalProps {
  participant: any;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  cohostTheme?: boolean;
}

export default function ParticipantProfileModal({ participant, isOpen, onClose, onUpdate, cohostTheme = false }: ParticipantProfileModalProps) {
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [editedData, setEditedData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);

  useEffect(() => {
    if (participant && isOpen) {
      // Initialize edited data with participant's current values
      // Handle cases where survey_data might be NULL
      const surveyAnswers = participant.survey_data?.answers || {};
      
      setEditedData({
        name: participant.name || '',
        phone_number: participant.phone_number || '',
        age: participant.age || surveyAnswers.age || '',
        gender: participant.gender || surveyAnswers.gender || '',
        preferred_age_min: participant.preferred_age_min ?? surveyAnswers.preferred_age_min ?? '',
        preferred_age_max: participant.preferred_age_max ?? surveyAnswers.preferred_age_max ?? '',
        open_age_preference: participant.open_age_preference ?? surveyAnswers.open_age_preference ?? false,
        intent_goal: participant.intent_goal || surveyAnswers.intent_goal || '',
        open_intent_goal_mismatch: participant.open_intent_goal_mismatch ?? surveyAnswers.open_intent_goal_mismatch ?? false,
        humor_banter_style: participant.humor_banter_style || surveyAnswers.humor_banter_style || '',
        early_openness_comfort: participant.early_openness_comfort ?? surveyAnswers.early_openness_comfort ?? '',
        gender_preference: (() => {
          const raw = surveyAnswers.gender_preference;
          if (raw === 'opposite_gender' || raw === 'same_gender' || raw === 'any_gender') return raw;
          if (participant.same_gender_preference) return 'same_gender';
          if (participant.any_gender_preference) return 'any_gender';
          return 'opposite_gender';
        })(),
        ...surveyAnswers
      });
      setEditMode({});
      setMessageSent(!!participant.PAID);
    }
  }, [participant, isOpen]);

  if (!isOpen || !participant) return null;

  const handleWhatsAppClick = async () => {
    const raw = participant.phone_number || editedData.phone_number || '';
    const phone = raw.replace(/\D/g, '');
    if (phone) {
      window.open(`https://wa.me/${phone}`, '_blank');
    }
    if (!messageSent) {
      setMarkingSent(true);
      try {
        const response = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'toggle-message-status',
            participantNumber: participant.assigned_number,
            newStatus: true
          })
        });
        if (response.ok) {
          setMessageSent(true);
          toast.success('Marked as messaged');
          onUpdate();
        }
      } catch (e) {
        console.error('Error marking as sent:', e);
      } finally {
        setMarkingSent(false);
      }
    }
  };

  const toggleEdit = (field: string) => {
    setEditMode(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleFieldChange = (field: string, value: any) => {
    setEditedData((prev: any) => ({ ...prev, [field]: value }));
  };

  const saveField = async (field: string) => {
    setSaving(true);
    try {
      // Gender preference uses a separate API that also updates boolean columns
      if (field === 'gender_preference') {
        const response = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update-gender-preference",
            participantNumber: participant.assigned_number,
            genderPreference: editedData[field]
          })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          toast.success(`Updated ${field}`);
          toggleEdit(field);
          onUpdate();
        } else {
          toast.error(data.error || "Failed to update");
        }
        return;
      }

      const response = await fetch("/api/admin/update-participant-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantNumber: participant.assigned_number,
          field: field,
          value: editedData[field]
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        toast.success(`Updated ${field}`);
        toggleEdit(field);
        onUpdate();
      } else {
        toast.error(data.error || "Failed to update");
      }
    } catch (error) {
      console.error("Error updating field:", error);
      toast.error("Failed to update field");
    } finally {
      setSaving(false);
    }
  };

  const renderField = (label: string, field: string, icon: any, type: 'text' | 'number' | 'select' = 'text', options?: string[]) => {
    const Icon = icon;
    const isEditing = editMode[field];
    const value = editedData[field] || '';

    return (
      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-400" />
            <label className="text-sm font-semibold text-slate-300">{label}</label>
          </div>
          {!isEditing ? (
            <button
              onClick={() => toggleEdit(field)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4 text-slate-400 hover:text-white" />
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => saveField(field)}
                disabled={saving}
                className="p-1 hover:bg-green-500/20 rounded transition-colors disabled:opacity-50"
                title="Save"
              >
                <Save className="w-4 h-4 text-green-400" />
              </button>
              <button
                onClick={() => {
                  setEditedData((prev: any) => ({ ...prev, [field]: participant.survey_data?.answers?.[field] || participant[field] || '' }));
                  toggleEdit(field);
                }}
                className="p-1 hover:bg-red-500/20 rounded transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4 text-red-400" />
              </button>
            </div>
          )}
        </div>
        {isEditing ? (
          type === 'select' && options ? (
            <select
              value={value}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            >
              {options.map(opt => (
                <option key={opt} value={opt} style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={type}
              value={value}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              autoFocus
            />
          )
        ) : (
          <p className="text-white text-sm">{value || <span className="text-slate-500 italic">Not provided</span>}</p>
        )}
      </div>
    );
  };

  const renderToggleField = (label: string, field: string, icon: any) => {
    const Icon = icon;
    const isEditing = editMode[field];
    const value = editedData[field];
    const isTrue = value === true || value === 'true' || value === 1 || value === '1';

    return (
      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-400" />
            <label className="text-sm font-semibold text-slate-300">{label}</label>
          </div>
          {!isEditing ? (
            <button
              onClick={() => toggleEdit(field)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4 text-slate-400 hover:text-white" />
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => saveField(field)}
                disabled={saving}
                className="p-1 hover:bg-green-500/20 rounded transition-colors disabled:opacity-50"
                title="Save"
              >
                <Save className="w-4 h-4 text-green-400" />
              </button>
              <button
                onClick={() => {
                  setEditedData((prev: any) => ({ ...prev, [field]: participant[field] ?? false }));
                  toggleEdit(field);
                }}
                className="p-1 hover:bg-red-500/20 rounded transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4 text-red-400" />
              </button>
            </div>
          )}
        </div>
        {isEditing ? (
          <div className="flex gap-2">
            <button
              onClick={() => handleFieldChange(field, true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isTrue ? 'bg-green-500/30 text-green-200 border border-green-400/50' : 'bg-white/10 text-slate-300 border border-white/20 hover:bg-white/15'}`}
            >
              نعم
            </button>
            <button
              onClick={() => handleFieldChange(field, false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!isTrue ? 'bg-red-500/30 text-red-200 border border-red-400/50' : 'bg-white/10 text-slate-300 border border-white/20 hover:bg-white/15'}`}
            >
              لا
            </button>
          </div>
        ) : (
          <p className="text-white text-sm">{isTrue ? 'نعم' : 'لا'}</p>
        )}
      </div>
    );
  };

  const renderTextAreaField = (label: string, field: string, icon: any, maxLength?: number) => {
    const Icon = icon;
    const isEditing = editMode[field];
    const value = editedData[field] || '';

    return (
      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-400" />
            <label className="text-sm font-semibold text-slate-300">{label}</label>
          </div>
          {!isEditing ? (
            <button
              onClick={() => toggleEdit(field)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4 text-slate-400 hover:text-white" />
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => saveField(field)}
                disabled={saving}
                className="p-1 hover:bg-green-500/20 rounded transition-colors disabled:opacity-50"
                title="Save"
              >
                <Save className="w-4 h-4 text-green-400" />
              </button>
              <button
                onClick={() => {
                  setEditedData((prev: any) => ({ ...prev, [field]: participant.survey_data?.answers?.[field] || '' }));
                  toggleEdit(field);
                }}
                className="p-1 hover:bg-red-500/20 rounded transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4 text-red-400" />
              </button>
            </div>
          )}
        </div>
        {isEditing ? (
          <div>
            <textarea
              value={value}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              maxLength={maxLength}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 min-h-[100px]"
              autoFocus
            />
            {maxLength && (
              <div className="text-xs text-slate-400 mt-1 text-right">
                {value.length} / {maxLength}
              </div>
            )}
          </div>
        ) : (
          <p className="text-white text-sm whitespace-pre-wrap">{value || <span className="text-slate-500 italic">Not provided</span>}</p>
        )}
      </div>
    );
  };

  return (
    <div className={`fixed inset-0 ${cohostTheme ? 'bg-rose-900/40' : 'bg-black/60'} backdrop-blur-sm z-50 flex items-center justify-center p-4`} onClick={onClose}>
      <div 
        className={`${cohostTheme ? 'bg-gradient-to-br from-rose-950 via-slate-900 to-rose-950 rounded-3xl border-4 border-rose-400/30' : 'bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-white/20'} shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`border-b p-6 ${cohostTheme ? 'bg-gradient-to-r from-rose-600/20 to-pink-600/20 border-rose-400/20' : 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-white/10'}`}>
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-bold text-white">
                  Participant #{participant.assigned_number}
                </h2>
                {messageSent ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-400/40 text-green-300 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Messaged
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-400/40 text-red-300 text-xs font-semibold">
                    <XCircle className="w-3.5 h-3.5" />
                    Not Messaged
                  </span>
                )}
              </div>
              <p className="text-slate-300 mt-1">{participant.name || 'No name provided'}</p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={handleWhatsAppClick}
                disabled={markingSent}
                title={participant.phone_number ? `WhatsApp: ${participant.phone_number}` : 'No phone number'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-60 ${
                  messageSent
                    ? 'bg-green-500/20 text-green-300 border border-green-400/40 hover:bg-green-500/30'
                    : 'bg-green-600/30 text-green-200 border border-green-400/50 hover:bg-green-600/40'
                }`}
              >
                {markingSent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Phone className="w-4 h-4" />
                )}
                <span>WhatsApp</span>
              </button>
              <button
                onClick={onClose}
                className={`p-2 rounded-lg transition-colors ${cohostTheme ? 'hover:bg-rose-900/40' : 'hover:bg-white/10'}`}
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-120px)] p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-400" />
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderField('Name', 'name', User)}
              {renderField('Phone Number', 'phone_number', Phone)}
              {renderField('Age', 'age', Calendar, 'number')}
              {renderField('Gender', 'gender', Users, 'select', ['male', 'female'])}
            </div>
          </div>

          {/* MBTI Personality Type */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              Personality Assessment
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {renderField('MBTI 1', 'mbti_1', Brain, 'select', ['أ', 'ب'])}
              {renderField('MBTI 2', 'mbti_2', Brain, 'select', ['أ', 'ب'])}
              {renderField('MBTI 3', 'mbti_3', Brain, 'select', ['أ', 'ب'])}
              {renderField('MBTI 4', 'mbti_4', Brain, 'select', ['أ', 'ب'])}
            </div>
          </div>

          {/* Vibe Questions */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-400" />
              Vibe & Personality
            </h3>
            <div className="space-y-4">
              {renderTextAreaField('Weekend Activities', 'vibe_1', Coffee, 75)}
              {renderTextAreaField('Hobbies', 'vibe_2', Heart, 50)}
              {renderTextAreaField('Music Taste', 'vibe_3', Coffee, 50)}
              {renderField('Deep Conversations', 'vibe_4', MessageSquare, 'select', ['نعم', 'لا'])}
              {renderTextAreaField('How Friends Describe Me', 'vibe_5', Users, 100)}
              {renderTextAreaField('How I Describe Friends', 'vibe_6', Users, 100)}
            </div>
          </div>

          {/* Attachment Style */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5 text-pink-400" />
              Attachment Style
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {renderField('Attachment 1', 'attachment_1', Heart, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Attachment 2', 'attachment_2', Heart, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Attachment 3', 'attachment_3', Heart, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Attachment 4', 'attachment_4', Heart, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Attachment 5', 'attachment_5', Heart, 'select', ['أ', 'ب', 'ج', 'د'])}
            </div>
          </div>

          {/* Communication Style */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-green-400" />
              Communication Style
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {renderField('Communication 1', 'communication_1', MessageSquare, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Communication 2', 'communication_2', MessageSquare, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Communication 3', 'communication_3', MessageSquare, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Communication 4', 'communication_4', MessageSquare, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Communication 5', 'communication_5', MessageSquare, 'select', ['أ', 'ب', 'ج', 'د'])}
            </div>
          </div>

          {/* Core Values */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400" />
              Core Values
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {renderField('Core Value 1', 'core_values_1', Star, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Core Value 2', 'core_values_2', Star, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Core Value 3', 'core_values_3', Star, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Core Value 4', 'core_values_4', Star, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Core Value 5', 'core_values_5', Star, 'select', ['أ', 'ب', 'ج', 'د'])}
            </div>
          </div>

          {/* Lifestyle */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Coffee className="w-5 h-5 text-orange-400" />
              Lifestyle Preferences
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {renderField('Lifestyle 1', 'lifestyle_1', Coffee, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Lifestyle 2', 'lifestyle_2', Coffee, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Lifestyle 3', 'lifestyle_3', Coffee, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Lifestyle 4', 'lifestyle_4', Coffee, 'select', ['أ', 'ب', 'ج', 'د'])}
              {renderField('Lifestyle 5', 'lifestyle_5', Coffee, 'select', ['أ', 'ب', 'ج', 'د'])}
            </div>
          </div>

          {/* Matching Preferences */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
              Matching Preferences
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderField('Gender Preference', 'gender_preference', ArrowLeftRight, 'select', ['opposite_gender', 'same_gender', 'any_gender'])}
              {renderField('Intent Goal', 'intent_goal', Star, 'select', ['A', 'B', 'C'])}
              {renderField('Preferred Age (Min)', 'preferred_age_min', Calendar, 'number')}
              {renderField('Preferred Age (Max)', 'preferred_age_max', Calendar, 'number')}
              {renderField('Humor/Banter Style', 'humor_banter_style', MessageSquare, 'select', ['A', 'B', 'C', 'D'])}
              {renderField('Early Openness Comfort', 'early_openness_comfort', Heart, 'select', ['0', '1', '2', '3'])}
              {renderToggleField('Open Age Preference', 'open_age_preference', Shuffle)}
              {renderToggleField('Open to Intent Goal Mismatch', 'open_intent_goal_mismatch', Shuffle)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
