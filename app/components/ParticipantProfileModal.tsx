import { useState, useEffect } from "react";
import { X, Save, Edit2, User, Phone, Calendar, MapPin, Heart, MessageSquare, Brain, Users, Star, Coffee, CheckCircle2, XCircle, Loader2, SlidersHorizontal, ArrowLeftRight, Shuffle } from "lucide-react";
import { toast } from "react-hot-toast";

interface ParticipantProfileModalProps {
  participant: any;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (participantNumber: number, updates: Record<string, any>) => void;
  cohostTheme?: boolean;
}

type SelectOption = string | { value: string; label: string };

const getParticipantValue = (participant: any, field: string) =>
  participant?.survey_data?.answers?.[field]
  ?? participant?.survey_data?.[field]
  ?? participant?.[field]
  ?? '';

const getGenderPreference = (participant: any) => {
  const raw = getParticipantValue(participant, 'gender_preference');
  if (raw === 'male' || raw === 'female' || raw === 'any') return raw;

  const gender = getParticipantValue(participant, 'gender');
  if (raw === 'same_gender') return gender || '';
  if (raw === 'opposite_gender') return gender === 'male' ? 'female' : gender === 'female' ? 'male' : '';
  if (raw === 'any_gender' || participant?.any_gender_preference) return 'any';
  if (participant?.same_gender_preference) return gender || '';
  return gender === 'male' ? 'female' : gender === 'female' ? 'male' : '';
};

const buildParticipantData = (participant: any) => {
  const surveyData = participant?.survey_data || {};
  const answers = surveyData.answers || {};
  const merged = { ...surveyData, ...participant, ...answers };

  return {
    ...merged,
    name: getParticipantValue(participant, 'name'),
    phone_number: getParticipantValue(participant, 'phone_number'),
    age: getParticipantValue(participant, 'age'),
    gender: getParticipantValue(participant, 'gender'),
    nationality: getParticipantValue(participant, 'nationality'),
    nationality_preference: getParticipantValue(participant, 'nationality_preference')
      || (participant?.prefer_same_nationality === true ? 'same' : participant?.prefer_same_nationality === false ? 'any' : ''),
    gender_preference: getGenderPreference(participant),
    age_flex_one_year: getParticipantValue(participant, 'age_flex_one_year') === true
      ? 'accept'
      : getParticipantValue(participant, 'age_flex_one_year') === false
        ? 'decline'
        : getParticipantValue(participant, 'age_flex_one_year'),
  };
};

const optionValue = (option: SelectOption) => typeof option === 'string' ? option : option.value;
const optionLabel = (option: SelectOption) => typeof option === 'string' ? option : option.label;

export default function ParticipantProfileModal({ participant, isOpen, onClose, onUpdate, cohostTheme = false }: ParticipantProfileModalProps) {
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [editedData, setEditedData] = useState<any>({});
  const [originalData, setOriginalData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);

  useEffect(() => {
    if (participant && isOpen) {
      const initialData = buildParticipantData(participant);
      setEditedData(initialData);
      setOriginalData(initialData);
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
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          setMessageSent(true);
          toast.success('Marked as messaged');
          onUpdate(participant.assigned_number, data.updates || { PAID: true });
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

  const cancelEdit = (field: string) => {
    setEditedData((prev: any) => ({ ...prev, [field]: originalData[field] ?? '' }));
    toggleEdit(field);
  };

  const finishSave = (field: string, updates: Record<string, any>) => {
    setOriginalData((prev: any) => ({ ...prev, [field]: editedData[field] }));
    toast.success(`Updated ${field}`);
    toggleEdit(field);
    onUpdate(participant.assigned_number, updates);
  };

  const saveField = async (field: string) => {
    setSaving(true);
    try {
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
        finishSave(field, data.updates || { [field]: data.value });
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

  const renderField = (label: string, field: string, icon: any, type: 'text' | 'number' | 'select' = 'text', options?: SelectOption[]) => {
    const Icon = icon;
    const isEditing = editMode[field];
    const value = editedData[field] ?? '';
    const selectedOption = options?.find(option => optionValue(option) === String(value));
    const displayValue = selectedOption ? optionLabel(selectedOption) : value;

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
                onClick={() => cancelEdit(field)}
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
              <option value="" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Not provided</option>
              {options.map(opt => (
                <option key={optionValue(opt)} value={optionValue(opt)} style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>
                  {optionLabel(opt)}
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
          <p className="text-white text-sm">{displayValue !== '' ? displayValue : <span className="text-slate-500 italic">Not provided</span>}</p>
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
                onClick={() => cancelEdit(field)}
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
    const value = editedData[field] ?? '';

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
                onClick={() => cancelEdit(field)}
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

  const renderMultiSelectField = (label: string, field: string, icon: any, options: SelectOption[], maxSelections = 2) => {
    const Icon = icon;
    const isEditing = editMode[field];
    const selected: string[] = Array.isArray(editedData[field]) ? editedData[field] : [];
    const labels = selected.map(value => optionLabel(options.find(option => optionValue(option) === value) || value));

    const toggleSelection = (value: string) => {
      const next = selected.includes(value)
        ? selected.filter(item => item !== value)
        : selected.length < maxSelections ? [...selected, value] : selected;
      handleFieldChange(field, next);
    };

    return (
      <div className="bg-white/5 rounded-xl p-4 border border-white/10 md:col-span-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-400" />
            <label className="text-sm font-semibold text-slate-300">{label}</label>
          </div>
          {!isEditing ? (
            <button onClick={() => toggleEdit(field)} className="p-1 hover:bg-white/10 rounded transition-colors" title="Edit">
              <Edit2 className="w-4 h-4 text-slate-400 hover:text-white" />
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => saveField(field)}
                disabled={saving || selected.length !== maxSelections}
                className="p-1 hover:bg-green-500/20 rounded transition-colors disabled:opacity-50"
                title={`Save (${maxSelections} selections required)`}
              >
                <Save className="w-4 h-4 text-green-400" />
              </button>
              <button onClick={() => cancelEdit(field)} className="p-1 hover:bg-red-500/20 rounded transition-colors" title="Cancel">
                <X className="w-4 h-4 text-red-400" />
              </button>
            </div>
          )}
        </div>
        {isEditing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {options.map(option => {
              const value = optionValue(option);
              const checked = selected.includes(value);
              return (
                <label key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${checked ? 'bg-blue-500/20 border-blue-400/50 text-blue-100' : 'bg-white/5 border-white/10 text-slate-300'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSelection(value)} className="accent-blue-500" />
                  {optionLabel(option)}
                </label>
              );
            })}
            <p className="text-xs text-slate-400 sm:col-span-2">Select exactly {maxSelections}. Selected: {selected.length}</p>
          </div>
        ) : (
          <p className="text-white text-sm">{labels.length ? labels.join('، ') : <span className="text-slate-500 italic">Not provided</span>}</p>
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
              {renderField('Nationality', 'nationality', MapPin)}
              {renderField('Nationality Preference', 'nationality_preference', MapPin, 'select', [
                { value: 'same', label: 'أفضل نفس الجنسية' },
                { value: 'any', label: 'لا يفرق؛ الأهم التوافق' },
              ])}
            </div>
          </div>

          {/* New compatibility questions */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
              New Compatibility Questions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderField('Age Flexibility (±1 year)', 'age_flex_one_year', Calendar, 'select', [
                { value: 'accept', label: 'نعم، أقبل التوسيع سنة' },
                { value: 'decline', label: 'لا، التزموا بالمدى' },
                { value: 'not_applicable', label: 'غير منطبق' },
              ])}
              {renderField('Disagreement Style', 'match_disagreement_style', MessageSquare, 'select', [
                { value: 'A', label: 'A — نكمل النقاش ونحاول الإقناع' },
                { value: 'B', label: 'B — أفهم وجهة نظره حتى لو اختلفنا' },
                { value: 'C', label: 'C — نمزح وننتقل لموضوع آخر' },
                { value: 'D', label: 'D — نبحث عن شيء نتفق عليه' },
              ])}
              {renderField('Similarity Preference', 'match_similarity_preference', Users, 'select', [
                { value: 'A', label: 'A — أفضل التشابه' },
                { value: 'B', label: 'B — أفضل الاختلاف والتجارب الجديدة' },
                { value: 'C', label: 'C — تشابه بالأساسيات واختلاف بالتفاصيل' },
                { value: 'D', label: 'D — لا يفرق إذا كان الحوار ممتعًا' },
              ])}
              {renderField('Conversation Initiative Preference', 'conversation_initiative_preference', MessageSquare, 'select', [
                { value: 'A', label: 'A — الطرف الآخر يقود الحوار' },
                { value: 'B', label: 'B — المبادرة متبادلة' },
                { value: 'C', label: 'C — أنا أبادر' },
                { value: 'D', label: 'D — أتأقلم حسب الشخص' },
              ])}
              {renderTextAreaField('Current Curiosity', 'match_current_curiosity', Brain, 150)}
              {renderMultiSelectField('Current Focus (choose 2)', 'match_current_focus', Star, [
                { value: 'study', label: 'الدراسة والتعلّم' },
                { value: 'career', label: 'الوظيفة والمسار المهني' },
                { value: 'business', label: 'مشروع أو بزنس' },
                { value: 'family_social', label: 'العائلة والعلاقات الاجتماعية' },
                { value: 'health_fitness', label: 'الرياضة والصحة' },
                { value: 'creative', label: 'الفن أو المحتوى أو الإبداع' },
                { value: 'travel_experiences', label: 'السفر والتجارب الجديدة' },
                { value: 'self_growth', label: 'تطوير الذات أو تغيير شخصي' },
                { value: 'other', label: 'شيء آخر' },
              ])}
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

          {/* Interaction Synergy */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              Interaction Synergy
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderField('Conversational Role', 'conversational_role', MessageSquare, 'select', [
                { value: 'A', label: 'A — المبادر' }, { value: 'B', label: 'B — المتفاعل' }, { value: 'C', label: 'C — المستمع' },
              ])}
              {renderField('Conversation Depth', 'conversation_depth_pref', Brain, 'select', [
                { value: 'A', label: 'A — سوالف عميقة وتحليلية' }, { value: 'B', label: 'B — سوالف واقعية وملموسة' },
              ])}
              {renderField('Social Battery', 'social_battery', Users, 'select', [
                { value: 'A', label: 'A — تزيد مع الناس' }, { value: 'B', label: 'B — تقل وأحتاج هدوءًا' },
              ])}
              {renderField('Humor Subtype', 'humor_subtype', Coffee, 'select', [
                { value: 'A', label: 'A — الذبات وسرعة الرد' }, { value: 'B', label: 'B — المواقف العفوية' }, { value: 'C', label: 'C — القصص والسرد' },
              ])}
              {renderField('Curiosity Style', 'curiosity_style', Brain, 'select', [
                { value: 'A', label: 'A — أحب أن يسألني بعمق' }, { value: 'B', label: 'B — أحب أن أسأل وأكتشف' }, { value: 'C', label: 'C — أخذ وعطاء سريع ومزح' },
              ])}
              {renderField('Silence Comfort', 'silence_comfort', MessageSquare, 'select', [
                { value: 'A', label: 'A — أقلق وأكسر الصمت' }, { value: 'B', label: 'B — مرتاح مع الهدوء' },
              ])}
            </div>
          </div>

          {/* Vibe Questions */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-400" />
              Vibe & Personality
            </h3>
            <div className="space-y-4">
              {renderTextAreaField('Weekend Activities', 'vibe_1', Coffee)}
              {renderTextAreaField('Hobbies', 'vibe_2', Heart, 100)}
              {renderTextAreaField('Music Taste', 'vibe_3', Coffee, 100)}
              {renderField('Deep Conversations', 'vibe_4', MessageSquare, 'select', ['نعم', 'لا', 'أحياناً'])}
              {renderTextAreaField('How Friends Describe Me', 'vibe_5', Users, 150)}
              {renderTextAreaField('How I Describe Friends', 'vibe_6', Users)}
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
              {renderField('Gender Preference', 'gender_preference', ArrowLeftRight, 'select', [
                { value: 'male', label: 'male' }, { value: 'female', label: 'female' }, { value: 'any', label: 'any' },
              ])}
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
