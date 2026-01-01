import { useState, useEffect } from "react";
import { X, Save, Edit2, User, Phone, Calendar, MapPin, Heart, MessageSquare, Brain, Users, Star, Coffee } from "lucide-react";
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
        ...surveyAnswers
      });
      setEditMode({});
    }
  }, [participant, isOpen]);

  if (!isOpen || !participant) return null;

  const toggleEdit = (field: string) => {
    setEditMode(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleFieldChange = (field: string, value: any) => {
    setEditedData((prev: any) => ({ ...prev, [field]: value }));
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
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                Participant #{participant.assigned_number}
              </h2>
              <p className="text-slate-300">{participant.name || 'No name provided'}</p>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${cohostTheme ? 'hover:bg-rose-900/40' : 'hover:bg-white/10'}`}
            >
              <X className="w-6 h-6 text-white" />
            </button>
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
        </div>
      </div>
    </div>
  );
}
