import { useState, useEffect } from "react"
import toast, { Toaster } from 'react-hot-toast'
import {
  UserRound,
  QrCode,
  Trash2,
  Table2,
  LockKeyhole,
  RefreshCcw,
  LayoutDashboard,
  Loader2,
  Activity,
  Users,
  Settings,
  Eye,
  Copy,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Search,
  Filter,
  BarChart3,
  Shield,
  LogOut,
  Plus,
  Minus,
  Clock,
  CheckSquare,
  Square,
  X,
  MessageSquare,
  Ban,
  FileText
} from "lucide-react"
import ParticipantResultsModal from "~/components/ParticipantResultsModal"
import GroupAssignmentsModal from "~/components/GroupAssignmentsModal"
import WhatsappMessageModal from '~/components/WhatsappMessageModal';

export default function AdminPage() {
  const [password, setPassword] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [participants, setParticipants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [qrParticipant, setQrParticipant] = useState<any | null>(null)
  const [detailParticipant, setDetailParticipant] = useState<any | null>(null)
  const [manualNumber, setManualNumber] = useState<number | null>(null)
  const [currentPhase, setCurrentPhase] = useState("form")
  const [searchTerm, setSearchTerm] = useState("")
  const [showEligibleOnly, setShowEligibleOnly] = useState(false)
  const [genderFilter, setGenderFilter] = useState("all") // "all", "male", "female"
  const [paymentFilter, setPaymentFilter] = useState("all") // "all", "paid", "unpaid", "done"
  const [whatsappFilter, setWhatsappFilter] = useState("all") // "all", "sent", "not_sent"
  const [copied, setCopied] = useState(false)
  const [selectedParticipants, setSelectedParticipants] = useState<Set<number>>(new Set())
  const [announcement, setAnnouncement] = useState("")
  const [announcementType, setAnnouncementType] = useState("info")
  const [currentAnnouncement, setCurrentAnnouncement] = useState<any>(null)
  const [emergencyPaused, setEmergencyPaused] = useState(false)
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [waitingCount, setWaitingCount] = useState(0)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [participantStats, setParticipantStats] = useState<any>(null)
  const [currentRounds, setCurrentRounds] = useState(2)
  const [optimalRounds, setOptimalRounds] = useState(2)
  const [globalTimerActive, setGlobalTimerActive] = useState(false)
  const [globalTimerRemaining, setGlobalTimerRemaining] = useState(0)
  const [globalTimerRound, setGlobalTimerRound] = useState(1)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [resultsVisible, setResultsVisible] = useState(true)
  const [currentEventId, setCurrentEventId] = useState(1)
  const [maxEventId, setMaxEventId] = useState(1)
  const [registrationEnabled, setRegistrationEnabled] = useState(true)
  const [eventFinished, setEventFinished] = useState(false)
  
  const [showResultsModal, setShowResultsModal] = useState(false)
  const [participantResults, setParticipantResults] = useState<any[]>([])
  const [matchType, setMatchType] = useState<"ai" | "no-ai" | "group">("ai")
  const [totalMatches, setTotalMatches] = useState(0)
  const [calculatedPairs, setCalculatedPairs] = useState<any[]>([])
  const [lastMatchParams, setLastMatchParams] = useState<{matchResults: any[], totalMatches: number, type: "ai" | "no-ai" | "group", calculatedPairs: any[]} | null>(null)
  const [isFromCache, setIsFromCache] = useState(false)
  
  // Persistent Results State
  const [availableSessions, setAvailableSessions] = useState<any[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentSessionInfo, setCurrentSessionInfo] = useState<any>(null)
  const [showSessionHistory, setShowSessionHistory] = useState(false)
  
  // Excluded pairs management
  const [excludedPairs, setExcludedPairs] = useState<Array<{id: string, participant1_number: number, participant2_number: number, created_at: string, reason: string}>>([])
  const [newExcludedPair, setNewExcludedPair] = useState({participant1: '', participant2: ''})
  
  // Excluded participants management
  const [excludedParticipants, setExcludedParticipants] = useState<Array<{id: string, participant_number: number, created_at: string, reason: string, is_banned?: boolean}>>([])
  const [newExcludedParticipant, setNewExcludedParticipant] = useState('')
  const [banPermanently, setBanPermanently] = useState(false)
  
  // Manual match management
  const [newManualMatch, setNewManualMatch] = useState({participant1: '', participant2: ''})
  const [bypassEligibility, setBypassEligibility] = useState(false)
  
  // Group assignments modal state
  const [showGroupAssignmentsModal, setShowGroupAssignmentsModal] = useState(false)
  const [groupAssignments, setGroupAssignments] = useState<any[]>([])
  const [totalGroups, setTotalGroups] = useState(0)
  const [totalGroupParticipants, setTotalGroupParticipants] = useState(0)

  // WhatsApp message modal state
  const [whatsappParticipant, setWhatsappParticipant] = useState<any | null>(null);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  
  // Excel export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportTemplateType, setExportTemplateType] = useState<'match' | 'payment-reminder'>('match');
  
  // Status update state
  const [updatingStatus, setUpdatingStatus] = useState<{participantNumber: number, type: 'message' | 'payment'} | null>(null);

  const STATIC_PASSWORD = "soulmatch2025"
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "soulmatch2025"

  // Function to generate WhatsApp message for a participant
  const generateWhatsAppMessage = (participant: any, templateType: 'match' | 'payment-reminder' = 'match') => {
    const name = participant.name || participant.survey_data?.name || `المشارك #${participant.assigned_number}`;
    const assignedNumber = participant.assigned_number;
    const secureToken = participant.secure_token;

    if (templateType === 'payment-reminder') {
      return `*التوافق الأعمى* 💳

السلام عليكم *${name}*،

⚠️ *تذكير مهم - الدفع المطلوب*

🔴 *لم نستلم تحويلكم بعد!*

نذكركم بأنه تم العثور على شريك متوافق معكم، ولكن لم يتم إتمام الدفع حتى الآن.

⏰ *مهم جداً:* يرجى إتمام التحويل في أقرب وقت ممكن لتأكيد حجزكم.

💳 *رسوم المشاركة:* 45 ريال سعودي

⚠️ *تحذير:* في حالة عدم استلام التحويل قريباً، سيتم إعطاء الفرصة لمشارك آخر.

🚨 *لماذا يجب الدفع الآن؟*
• شريكك المتوافق ينتظر تأكيدك
• المقاعد محدودة وقد تُعطى لآخرين
• لضمان مشاركتك في الفعالية
• لتجنب خسارة هذه الفرصة الفريدة

*طرق الدفع السريعة:*
• STC Pay: 0560899666
• مصرف الراجحي: عبدالرحمن عبدالملك
• IBAN:
SA2480000588608016007502

📸 *بعد التحويل:*
أرسل صورة الإيصال فوراً عبر الواتساب لتأكيد حجزكم.

📍 *تفاصيل الفعالية:*
المكان: كوفي بلانيت - الدور الثاني
العنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA

📅 التاريخ: الخميس 16 أكتوبر 2025
🕰️ الوقت: 8:30 مساءً
⏱️ المدة: 60 دقيقة

📱 *معلوماتك:*
رقم المشارك: *${assignedNumber}*
الرمز الخاص: *${secureToken}*

🔗 رابط حسابك:
https://match-omega.vercel.app/welcome?token=${secureToken}

⚡ *يرجى التحويل وإرسال الإيصال في أقرب وقت!*

🔥 لا تفوت هذه الفرصة!

فريق التوافق الأعمى`;
    }

    return `*التوافق الأعمى* ✨

السلام عليكم *${name}*،

نسعد بإبلاغكم أنه تم العثور على شريك متوافق معكم من بين المشاركين.

⏰ *يرجى تأكيد المشاركة خلال 24 ساعة*
💳 رسوم المشاركة: 45 ريال سعودي

⚠️ *ملاحظة مهمة:* لتأكيد حضوركم، يجب إتمام التحويل وإرسال صورة الإيصال. في حالة عدم التحويل خلال المدة المحددة، سيتم إعطاء الفرصة لمشارك آخر.

*طرق الدفع:*
• STC Pay: 0560899666
• مصرف الراجحي: عبدالرحمن عبدالملك
• IBAN:
SA2480000588608016007502

بعد إتمام التحويل، يرجى إرسال صورة الإيصال فوراً لتأكيد حجزكم.

*تنبيه:* في حالة التأكيد ثم عدم الحضور أو الإلغاء، لا يمكن استرداد الرسوم.

📍 *تفاصيل الفعالية:*
المكان: كوفي بلانيت - الدور الثاني
العنوان: https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA

📅 التاريخ: الخميس 16 أكتوبر 2025
🕰️ الوقت: 8:30 مساءً
⏱️ المدة: 60 دقيقة

*يرجى الحضور قبل الموعد بـ 10 دقائق*

معلوماتكم للفعالية:
رقم المشارك: *${assignedNumber}*
الرمز الخاص: *${secureToken}*

🔗 رابط الدخول المباشر:
https://match-omega.vercel.app/welcome?token=${secureToken}

نتطلع لحضوركم وتمنى لكم تجربة ممتعة.

فريق التوافق الأعمى`;
  }

  // Function to export selected participants to Excel/CSV
  const exportToExcel = async () => {
    if (selectedParticipants.size === 0) {
      toast.error('يرجى اختيار مشاركين أولاً');
      return;
    }

    setIsExporting(true);
    
    try {
      // Get selected participants data
      const selectedData = participants.filter(p => selectedParticipants.has(p.assigned_number));
      
      // Create CSV content
      const headers = ['Contact number', 'Name', 'Message 1', 'Message 2'];
      const csvContent = [
        headers.join(','),
        ...selectedData.map(participant => {
          const name = participant.name || participant.survey_data?.name || `المشارك #${participant.assigned_number}`;
          const phone = participant.phone_number || '';
          const message1 = generateWhatsAppMessage(participant, exportTemplateType).replace(/"/g, '""'); // Escape quotes for CSV
          const message2 = ''; // Empty as requested
          
          return [
            `"${phone}"`,
            `"${name}"`,
            `"${message1}"`,
            `"${message2}"`
          ].join(',');
        })
      ].join('\n');

      // Create and download file
      const templateName = exportTemplateType === 'payment-reminder' ? 'payment_reminder' : 'match_notification';
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for proper UTF-8
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `whatsapp_${templateName}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Mark selected participants as "message sent" (PAID = true)
      await markParticipantsAsMessageSent(Array.from(selectedParticipants));
      
      const templateLabel = exportTemplateType === 'payment-reminder' ? 'تذكير الدفع' : 'إشعار المطابقة';
      toast.success(`تم تصدير ${selectedData.length} مشارك بنجاح (${templateLabel}) وتم تحديث حالة الرسائل!`);
      
      // Refresh participants list to show updated status
      fetchParticipants();
      
    } catch (error) {
      console.error('Export error:', error);
      toast.error('حدث خطأ أثناء التصدير');
    } finally {
      setIsExporting(false);
    }
  }

  // Function to mark participants as message sent
  const markParticipantsAsMessageSent = async (participantNumbers: number[]) => {
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "mark-messages-sent",
          participantNumbers: participantNumbers
        })
      });
      
      const data = await response.json();
      if (!response.ok) {
        console.error("Error marking messages as sent:", data.error);
      } else {
        console.log(`✅ Marked ${participantNumbers.length} participants as message sent`);
      }
    } catch (error) {
      console.error("Error marking messages as sent:", error);
    }
  }

  // Function to toggle message sent status
  const toggleMessageSentStatus = async (participantNumber: number, currentStatus: boolean) => {
    setUpdatingStatus({participantNumber, type: 'message'});
    
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "toggle-message-status",
          participantNumber: participantNumber,
          newStatus: !currentStatus
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        // Refresh participants list to show updated status
        fetchParticipants();
      } else {
        toast.error(`خطأ في تحديث حالة الرسالة: ${data.error}`);
      }
    } catch (error) {
      console.error("Error toggling message status:", error);
      toast.error('حدث خطأ في تحديث حالة الرسالة');
    } finally {
      setUpdatingStatus(null);
    }
  }

  // Function to toggle payment status
  const togglePaymentStatus = async (participantNumber: number, currentStatus: boolean) => {
    setUpdatingStatus({participantNumber, type: 'payment'});
    
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "toggle-payment-status",
          participantNumber: participantNumber,
          newStatus: !currentStatus
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        // Refresh participants list to show updated status
        fetchParticipants();
      } else {
        toast.error(`خطأ في تحديث حالة الدفع: ${data.error}`);
      }
    } catch (error) {
      console.error("Error toggling payment status:", error);
      toast.error('حدث خطأ في تحديث حالة الدفع');
    } finally {
      setUpdatingStatus(null);
    }
  }

  // Function to load available sessions
const loadAvailableSessions = async () => {
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "get-admin-results",
        eventId: currentEventId,
        includeInactive: false
      }),
    })
    const data = await res.json()
    if (res.ok && data.success) {
      setAvailableSessions(data.sessions || [])
      console.log(`📊 Loaded ${data.sessions?.length || 0} available sessions`)
    }
  } catch (error) {
    console.error("Error loading available sessions:", error)
  }
}

// Function to load latest results automatically
const loadLatestResults = async (matchType: "individual" | "group") => {
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "get-latest-admin-results",
        eventId: currentEventId,
        matchType: matchType
      }),
    })
    const data = await res.json()
    
    if (res.ok && data.success && data.session) {
      console.log(`🔄 Auto-loading latest ${matchType} results: ${data.session.session_id}`)
      await loadSessionResults(data.session)
      return true
    }
    return false
  } catch (error) {
    console.error("Error loading latest results:", error)
    return false
  }
}

// Function to load fresh data from database (for post-swap refreshes)
const loadFreshDatabaseResults = async (matchType: "individual" | "group") => {
  try {
    console.log(`🔄 Loading fresh ${matchType} results from database for event ${currentEventId}`)
    
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "get-fresh-results",
        event_id: currentEventId,
        match_type: matchType
      }),
    })
    
    const data = await res.json()
    
    if (res.ok && data.success) {
      console.log(`✅ Loaded fresh ${matchType} results: ${data.results?.length || 0} matches`)
      console.log(`📋 Participant names included:`, data.participantNames ? Object.keys(data.participantNames).length : 0)
      
      // Clear session info since this is fresh data, not a cached session
      setCurrentSessionId(null)
      setCurrentSessionInfo(null)
      setIsFromCache(false)
      
      await showParticipantResults(
        data.results || [], 
        data.results?.length || 0, 
        matchType === 'group' ? 'group' : 'ai',
        data.calculatedPairs || [],
        data.participantNames || {} // Pass participant names directly
      )
      
      return true
    } else {
      console.error("Failed to load fresh results:", data.error)
      return false
    }
  } catch (error) {
    console.error("Error loading fresh results:", error)
    return false
  }
}

// Function to load specific session results
const loadSessionResults = async (session: any) => {
  try {
    setCurrentSessionId(session.session_id)
    setCurrentSessionInfo({
      created_at: session.created_at,
      generation_type: session.generation_type,
      generation_duration_ms: session.generation_duration_ms,
      cache_hit_rate: session.cache_hit_rate,
      ai_calls_made: session.ai_calls_made
    })
    setMatchType(session.match_type === 'group' ? 'group' : (session.generation_type === 'no-ai' ? 'no-ai' : 'ai'))
    setTotalMatches(session.total_matches || 0)
    setCalculatedPairs(session.calculated_pairs || [])
    setIsFromCache(true)
    
    // Process participant results from stored data
    if (session.match_results && session.match_results.length > 0) {
      await showParticipantResults(
        session.match_results, 
        session.total_matches, 
        session.match_type === 'group' ? 'group' : (session.generation_type === 'no-ai' ? 'no-ai' : 'ai'),
        session.calculated_pairs || []
      )
    }
    
    console.log(`✅ Loaded session: ${session.session_id}`)
  } catch (error) {
    console.error("Error loading session results:", error)
  }
}

const fetchParticipants = async () => {
  setLoading(true)
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "participants" }),
    })
    const data = await res.json()
    setParticipants(data.participants || [])
      
      // Also fetch current event state
      const stateRes = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-event-state" }),
      })
      const stateData = await stateRes.json()
      setCurrentPhase(stateData.phase)
      setCurrentAnnouncement({
        message: stateData.announcement,
        type: stateData.announcement_type,
        time: stateData.announcement_time
      })
      setEmergencyPaused(stateData.emergency_paused)
      setCurrentRounds(stateData.total_rounds || 2)
      
      // Update global timer state
      setGlobalTimerActive(stateData.global_timer_active || false)
      setGlobalTimerRound(stateData.global_timer_round || 1)
      
      if (stateData.global_timer_active && stateData.global_timer_start_time) {
        const startTime = new Date(stateData.global_timer_start_time).getTime()
        const now = new Date().getTime()
        const elapsed = Math.floor((now - startTime) / 1000)
        const remaining = Math.max(0, (stateData.global_timer_duration || 1800) - elapsed)
        setGlobalTimerRemaining(remaining)
      }
      
      // Fetch participant stats
      const statsRes = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-participant-stats" }),
      })
      const statsData = await statsRes.json()
      setParticipantStats(statsData)
      setWaitingCount(statsData.waiting_count || 0)
      setTotalParticipants(statsData.total_participants || 0)
      
      // Calculate optimal rounds based on participant count
      calculateOptimalRounds(data.participants?.length || 0)
      
      // Fetch results visibility state
      const visibilityRes = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-results-visibility" }),
      })
      const visibilityData = await visibilityRes.json()
      setResultsVisible(visibilityData.visible !== false) // Default to true if not set
      
      // Fetch maximum event ID
      const eventRes = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-max-event-id" }),
      })
      const eventData = await eventRes.json()
      if (eventData.max_event_id) {
        setMaxEventId(eventData.max_event_id)
      }

      // Fetch current event ID
      const currentEventRes = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-current-event-id" }),
      })
      const currentEventData = await currentEventRes.json()
      const fetchedEventId = currentEventData.current_event_id || 1
      if (currentEventData.current_event_id) {
        setCurrentEventId(currentEventData.current_event_id)
      }
      
      // Fetch registration enabled state
      const regRes = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-registration-enabled" }),
      })
      const regData = await regRes.json()
      setRegistrationEnabled(regData.enabled !== false) // Default to true if not set
      
      // Fetch event finished state - use the fetched event ID directly, not state
      const eventFinishedRes = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-event-finished", event_id: fetchedEventId }),
      })
      const eventFinishedData = await eventFinishedRes.json()
      setEventFinished(eventFinishedData.finished === true) // Default to false (ongoing) if not set
      
      // Auto-load available sessions and latest results (only on initial load)
      if (availableSessions.length === 0) {
        await loadAvailableSessions()
        
        // Try to auto-load latest individual results if none are currently loaded
        if (!showResultsModal && participantResults.length === 0) {
          const hasIndividualResults = await loadLatestResults("individual")
          if (!hasIndividualResults) {
            // If no individual results, try group results
            await loadLatestResults("group")
          }
        }
      }
      
    } catch (err) {
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  const calculateOptimalRounds = (participantCount: number) => {
    if (participantCount <= 0) {
      setOptimalRounds(2)
      return
    }
    
    // Calculate optimal rounds to minimize repeats
    // For n participants, we can have at most n/2 unique pairs per round
    // We want to maximize unique pairs across all rounds
    const maxPairsPerRound = Math.floor(participantCount / 2)
    const totalPossiblePairs = (participantCount * (participantCount - 1)) / 2
    
    // Calculate how many rounds we can have before we need repeats
    const optimalRounds = Math.floor(totalPossiblePairs / maxPairsPerRound)
    
    // Ensure at least 2 rounds and at most 6 rounds
    const clampedRounds = Math.max(2, Math.min(6, optimalRounds))
    setOptimalRounds(clampedRounds)
  }

  const toggleResultsVisibility = async () => {
    try {
      const newVisibility = !resultsVisible
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "set-results-visibility", 
          visible: newVisibility 
        }),
      })
      
      if (res.ok) {
        setResultsVisible(newVisibility)
        toast.success(`Results are now ${newVisibility ? 'visible' : 'hidden'} to participants`)
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error("API Error:", errorData)
        toast.error(`Failed to update results visibility: ${errorData.error || 'Unknown error'}`)
      }
    } catch (err) {
      console.error("Error toggling results visibility:", err)
      toast.error("Error updating results visibility")
    }
  }

  const toggleRegistration = async () => {
    try {
      const newEnabled = !registrationEnabled
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "set-registration-enabled", 
          enabled: newEnabled 
        }),
      })
      
      if (res.ok) {
        setRegistrationEnabled(newEnabled)
        toast.success(`Registration is now ${newEnabled ? 'enabled' : 'disabled'}`)
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error("API Error:", errorData)
        toast.error(`Failed to update registration status: ${errorData.error || 'Unknown error'}`)
      }
    } catch (err) {
      console.error("Error toggling registration:", err)
      toast.error("Error updating registration status")
    }
  }

  const toggleEventFinished = async () => {
    try {
      const newFinished = !eventFinished
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "set-event-finished", 
          event_id: currentEventId,
          finished: newFinished 
        }),
      })
      
      if (res.ok) {
        setEventFinished(newFinished)
        toast.success(`Event ${currentEventId} is now marked as ${newFinished ? 'finished' : 'ongoing'}`)
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error("API Error:", errorData)
        toast.error(`Failed to update event status: ${errorData.error || 'Unknown error'}`)
      }
    } catch (err) {
      console.error("Error toggling event finished:", err)
      toast.error("Error updating event status")
    }
  }

  const prepareForNextEvent = async () => {
    try {
      if (!confirm(`⚠️ Prepare for Next Event?\n\nThis will:\n• Set all participants' signup_for_next_event to FALSE\n• Set all participants' PAID and PAID_DONE to FALSE\n• Reset payment status for all participants\n\nThis action cannot be undone. Continue?`)) {
        return
      }

      setLoading(true)
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "prepare-next-event"
        }),
      })
      
      const data = await res.json()
      
      if (res.ok) {
        toast.success(`Successfully prepared for next event! Updated ${data.updatedCount} participants. All participants are now ready for the next event cycle.`)
        fetchParticipants() // Refresh the participants list
      } else {
        console.error("API Error:", data)
        toast.error(`Failed to prepare for next event: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Network error:", error)
      toast.error("Network error occurred")
    } finally {
      setLoading(false)
    }
  }

  const updateCurrentEventId = async (newEventId: number) => {
    try {
      if (newEventId < 1) {
        toast.error("Event ID must be at least 1")
        return
      }

      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "set-current-event-id", 
          event_id: newEventId
        }),
      })
      
      if (res.ok) {
        setCurrentEventId(newEventId)
        setMaxEventId(Math.max(maxEventId, newEventId))
        toast.success(`Current event ID set to ${newEventId}. New participants will be assigned to Event ${newEventId}`)
        
        // Refresh event finished state for the new event
        const eventFinishedRes = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-event-finished", event_id: newEventId }),
        })
        const eventFinishedData = await eventFinishedRes.json()
        setEventFinished(eventFinishedData.finished === true) // Default to false (ongoing) for new events
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error("API Error:", errorData)
        toast.error(`Failed to update current event ID: ${errorData.error || 'Unknown error'}`)
      }
    } catch (err) {
      console.error("Error updating current event ID:", err)
      toast.error("Error updating current event ID")
    }
  }

  const updateRounds = async (newRounds: number) => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-total-rounds",
          total_rounds: newRounds
        }),
      })
      
      if (res.ok) {
        setCurrentRounds(newRounds)
        toast.success(`Rounds updated to ${newRounds}`)
        fetchParticipants()
      } else {
        const data = await res.json()
        toast.error("Failed to update rounds: " + (data.error || "Unknown error"))
      }
    } catch (err) {
      console.error("Error updating rounds:", err)
      toast.error("Failed to update rounds")
    }
  }

  const deleteParticipant = async (assigned_number: number) => {
    if (!confirm(`Are you sure you want to delete participant #${assigned_number}?`)) return
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", assigned_number }),
    })
    fetchParticipants()
  }



  const openMatrix = () => {
    window.open("/matrix", "_blank", "width=1000,height=800")
  }

  const login = () => {
    if (password === STATIC_PASSWORD) {
      localStorage.setItem("admin", "authenticated")
      setAuthenticated(true)
      fetchParticipants()
    } else {
      toast.error("Wrong password.")
    }
  }

  const logout = () => {
    localStorage.removeItem("admin")
    setAuthenticated(false)
    setPassword("")
  }

  useEffect(() => {
    if (localStorage.getItem("admin") === "authenticated") {
      setAuthenticated(true)
      fetchParticipants()
      fetchExcludedPairs()
      fetchExcludedParticipants()
    }
  }, [])

  // Real-time clock update
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(clockInterval)
  }, [])

  // Update global timer countdown
  useEffect(() => {
    if (globalTimerActive && globalTimerRemaining > 0) {
      console.log(`⏰ Admin: Starting countdown from ${globalTimerRemaining}s`)
      
      const timerInterval = setInterval(() => {
        setGlobalTimerRemaining(prev => {
          const newValue = Math.max(0, prev - 1)
          if (newValue <= 0) {
            console.log("⏰ Admin: Timer expired locally")
            // Timer expired, refresh to get latest state
            fetchParticipants()
          }
          return newValue
        })
      }, 1000)

      return () => {
        console.log("⏰ Admin: Clearing countdown interval")
        clearInterval(timerInterval)
      }
    }
  }, [globalTimerActive, globalTimerRemaining]) // Add globalTimerRemaining back to dependencies

  const updatePhase = async (phase: string) => {
    console.log(`🔄 Admin: Updating phase to ${phase}`);
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-phase",
        match_id: "00000000-0000-0000-0000-000000000000",
        phase,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error(`❌ Admin: Failed to update phase to ${phase}:`, data.error);
      toast.error("Error: " + data.error)
    } else {
      console.log(`✅ Admin: Successfully updated phase to ${phase}`);
      setCurrentPhase(phase)
      toast.success("Phase updated to " + phase + ". All players will instantly transition from ANY state they're in!")
    }
  }

  const startGlobalTimer = async (round: number) => {
    console.log(`🚀 Admin: Starting global timer for round ${round}`)
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start-global-timer",
          match_id: "00000000-0000-0000-0000-000000000000",
          round: round,
          duration: 1800 // 30 minutes
        }),
      })
      const data = await res.json()
      console.log("🔄 Start timer response:", data)
      
      if (!res.ok) {
        console.error("❌ Error starting timer:", data.error)
        toast.error("Error starting timer: " + data.error)
      } else {
        console.log("✅ Timer started successfully")
        setGlobalTimerActive(true)
        setGlobalTimerRound(round)
        setGlobalTimerRemaining(1800) // Set initial remaining time
        toast.success(`Global timer started for ${round === 0 ? 'Group Phase' : `Round ${round}`}! 30 minutes timer is now active for all participants.`)
        
        // Refresh to get updated state
        setTimeout(() => fetchParticipants(), 500)
      }
    } catch (error) {
      console.error("❌ Network error starting timer:", error)
      toast.error("Network error starting timer")
    }
  }

  const endGlobalTimer = async () => {
    console.log("🛑 Admin: Ending global timer")
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end-global-timer",
          match_id: "00000000-0000-0000-0000-000000000000"
        }),
      })
      const data = await res.json()
      console.log("🔄 End timer response:", data)
      
      if (!res.ok) {
        console.error("❌ Error ending timer:", data.error)
        toast.error("Error ending timer: " + data.error)
      } else {
        console.log("✅ Timer ended successfully")
        setGlobalTimerActive(false)
        setGlobalTimerRemaining(0)
        toast.success("Global timer ended! All participants will see feedback form.")
        
        // Refresh to get updated state
        setTimeout(() => fetchParticipants(), 500)
      }
    } catch (error) {
      console.error("❌ Network error ending timer:", error)
      toast.error("Network error ending timer")
    }
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleParticipantSelection = (assignedNumber: number) => {
    const newSelected = new Set(selectedParticipants)
    if (newSelected.has(assignedNumber)) {
      newSelected.delete(assignedNumber)
    } else {
      newSelected.add(assignedNumber)
    }
    setSelectedParticipants(newSelected)
  }

  const fetchExcludedPairs = async () => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-excluded-pairs" }),
      })
      const data = await res.json()
      if (res.ok) {
        setExcludedPairs(data.excludedPairs || [])
      } else {
        console.error("Failed to fetch excluded pairs:", data.error)
      }
    } catch (error) {
      console.error("Error fetching excluded pairs:", error)
    }
  }

  const addExcludedPair = async () => {
    const p1 = parseInt(newExcludedPair.participant1)
    const p2 = parseInt(newExcludedPair.participant2)
    
    if (!p1 || !p2) {
      toast.error("Please enter valid participant numbers")
      return
    }
    
    if (p1 === p2) {
      toast.error("Cannot exclude a participant from themselves")
      return
    }
    
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "add-excluded-pair",
          participant1: p1,
          participant2: p2,
          reason: "Admin exclusion"
        }),
      })
      const data = await res.json()
      
      if (res.ok) {
        setNewExcludedPair({ participant1: '', participant2: '' })
        await fetchExcludedPairs() // Refresh the list
        toast.success(data.message)
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      console.error("Error adding excluded pair:", error)
      toast.error("Failed to add excluded pair")
    }
  }

  const removeExcludedPair = async (id: string) => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "remove-excluded-pair",
          id: id
        }),
      })
      const data = await res.json()
      
      if (res.ok) {
        await fetchExcludedPairs() // Refresh the list
        toast.success(data.message)
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      console.error("Error removing excluded pair:", error)
      toast.error("Failed to remove excluded pair")
    }
  }

  const fetchExcludedParticipants = async () => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-excluded-participants" }),
      })
      const data = await res.json()
      if (res.ok) {
        setExcludedParticipants(data.excludedParticipants || [])
      } else {
        console.error("Failed to fetch excluded participants:", data.error)
      }
    } catch (error) {
      console.error("Error fetching excluded participants:", error)
    }
  }

  const addExcludedParticipant = async () => {
    const participantNumber = parseInt(newExcludedParticipant)
    
    if (!participantNumber || participantNumber <= 0) {
      toast.error("Please enter a valid participant number")
      return
    }
    
    if (participantNumber === 9999) {
      toast.error("Cannot exclude the organizer participant")
      return
    }
    
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "add-excluded-participant",
          participantNumber: participantNumber,
          reason: banPermanently 
            ? "Admin exclusion - PERMANENTLY BANNED from all matching" 
            : "Admin exclusion - participant excluded from all matching",
          banPermanently: banPermanently
        }),
      })
      const data = await res.json()
      
      if (res.ok) {
        setNewExcludedParticipant('')
        setBanPermanently(false) // Reset checkbox
        await fetchExcludedParticipants() // Refresh the list
        toast.success(data.message)
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      console.error("Error adding excluded participant:", error)
      toast.error("Failed to add excluded participant")
    }
  }

  const removeExcludedParticipant = async (id: string) => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "remove-excluded-participant",
          id: id
        }),
      })
      const data = await res.json()
      
      if (res.ok) {
        await fetchExcludedParticipants() // Refresh the list
        toast.success(data.message)
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      console.error("Error removing excluded participant:", error)
      toast.error("Failed to remove excluded participant")
    }
  }

  const addManualMatch = async () => {
    const participant1 = parseInt(newManualMatch.participant1)
    const participant2 = parseInt(newManualMatch.participant2)
    
    if (!participant1 || !participant2 || participant1 <= 0 || participant2 <= 0) {
      toast.error("Please enter valid participant numbers")
      return
    }
    
    if (participant1 === participant2) {
      toast.error("Cannot match a participant with themselves")
      return
    }
    
    if (participant1 === 9999 || participant2 === 9999) {
      toast.error("Cannot create matches with the organizer participant")
      return
    }
    
    try {
      const res = await fetch("/api/admin/trigger-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          eventId: currentEventId,
          manualMatch: { participant1: participant1, participant2: participant2, bypassEligibility: bypassEligibility }
        }),
      })
      const data = await res.json()
      
      if (res.ok) {
        setNewManualMatch({participant1: '', participant2: ''})
        
        // Extract detailed scores from the response
        const result = data.results?.[0]
        let detailedMessage = `✅ ${data.message}\n\n🎯 COMPATIBILITY BREAKDOWN:\n`
        detailedMessage += `📊 Total Score: ${data.compatibility_score}%\n\n`
        
        if (result) {
          detailedMessage += `🧠 MBTI: ${result.mbti_compatibility_score}% (10% max)\n`
          detailedMessage += `💝 Attachment: ${result.attachment_compatibility_score}% (15% max)\n`
          detailedMessage += `💬 Communication: ${result.communication_compatibility_score}% (15% max)\n`
          detailedMessage += `🏠 Lifestyle: ${result.lifestyle_compatibility_score}% (15% max)\n`
          detailedMessage += `⭐ Core Values: ${result.core_values_compatibility_score}% (20% max)\n`
          detailedMessage += `✨ Vibe Analysis: ${result.vibe_compatibility_score}% (25% max)\n`
          
          // Add humor bonus if applicable
          if (result.humor_bonus && result.humor_bonus > 0) {
            detailedMessage += `😄 Humor Bonus: +${result.humor_bonus}% (2% max)`
          } else {
            detailedMessage += `😄 Humor Bonus: +0% (different styles)`
          }
        }
        
        toast.success(detailedMessage, { duration: 6000 })
        fetchParticipants() // Refresh to show updated data
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      console.error("Error adding manual match:", error)
      toast.error("Failed to add manual match")
    }
  }

  const filteredParticipants = participants.filter(p => {
    // Search term filter
    const matchesSearch = searchTerm === "" || (
      p.assigned_number.toString().includes(searchTerm) ||
      (p.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.survey_data?.answers?.gender?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.survey_data?.answers?.ageGroup?.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    
    // Eligible participants filter (current event or signed up for next event)
    const isEligible = !showEligibleOnly || (
      p.event_id === currentEventId || // Current event participants
      p.signup_for_next_event === true // Signed up for next event
    )
    
    // Gender filter
    const matchesGender = genderFilter === "all" || (
      (genderFilter === "male" && (p.survey_data?.gender === "male" || p.survey_data?.answers?.gender === "male")) ||
      (genderFilter === "female" && (p.survey_data?.gender === "female" || p.survey_data?.answers?.gender === "female"))
    )
    
    // Payment filter - PAID = WhatsApp sent, PAID_DONE = actually paid
    let matchesPayment = true
    if (paymentFilter !== "all") {
      if (paymentFilter === "paid") {
        // Awaiting payment: WhatsApp sent (PAID = true) but not paid yet (PAID_DONE = false)
        matchesPayment = (p.PAID === true && p.PAID_DONE !== true)
      } else if (paymentFilter === "unpaid") {
        // Not contacted: no WhatsApp sent yet (PAID = false)
        matchesPayment = (!p.PAID || p.PAID === false)
      } else if (paymentFilter === "done") {
        // Actually paid (PAID_DONE = true)
        matchesPayment = (p.PAID_DONE === true)
      }
    }
    
    // WhatsApp filter - using PAID as WhatsApp sent indicator
    let matchesWhatsapp = true
    if (whatsappFilter !== "all") {
      if (whatsappFilter === "sent") {
        matchesWhatsapp = (p.PAID === true)
      } else if (whatsappFilter === "not_sent") {
        matchesWhatsapp = (!p.PAID || p.PAID === false)
      }
    }
    
    return matchesSearch && isEligible && matchesGender && matchesPayment && matchesWhatsapp
  })

  const phaseConfig = {
    registration: { label: "Registration", color: "text-blue-400", bg: "bg-blue-400/10", icon: UserRound },
    form: { label: "Form", color: "text-green-400", bg: "bg-green-400/10", icon: CheckSquare },
    waiting: { label: "Waiting", color: "text-yellow-400", bg: "bg-yellow-400/10", icon: Clock },
    round_1: { label: "Round 1", color: "text-purple-400", bg: "bg-purple-400/10", icon: BarChart3 },
    waiting_2: { label: "Waiting 2", color: "text-yellow-300", bg: "bg-yellow-300/10", icon: Clock },
    round_2: { label: "Round 2", color: "text-pink-400", bg: "bg-pink-400/10", icon: BarChart3 },
    // waiting_3: { label: "Waiting 3", color: "text-yellow-200", bg: "bg-yellow-200/10", icon: Clock },
    // round_3: { label: "Round 3", color: "text-indigo-400", bg: "bg-indigo-400/10", icon: BarChart3 },
    // waiting_4: { label: "Waiting 4", color: "text-yellow-100", bg: "bg-yellow-100/10", icon: Clock },
    // round_4: { label: "Round 4", color: "text-cyan-400", bg: "bg-cyan-400/10", icon: BarChart3 },
    group_phase: { label: "Group Phase", color: "text-orange-400", bg: "bg-orange-400/10", icon: Users },
    // Legacy phases for backward compatibility
    matching: { label: "Matching", color: "text-green-400", bg: "bg-green-400/10", icon: BarChart3 },
    waiting2: { label: "Waiting for Round 2", color: "text-yellow-300", bg: "bg-yellow-300/10", icon: Clock },
    matching2: { label: "Matching Round 2", color: "text-pink-400", bg: "bg-pink-400/10", icon: BarChart3 },
  }

  // Ensure currentPhase is always a string
  const safeCurrentPhase = currentPhase || "registration"
  
  const currentPhaseConfig = phaseConfig[safeCurrentPhase as keyof typeof phaseConfig] || {
    label: "Unknown",
    color: "text-gray-400",
    bg: "bg-gray-400/10",
    icon: AlertCircle
  }

  const sendAnnouncement = async () => {
    if (!announcement.trim()) return
    
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-announcement",
        message: announcement,
        type: announcementType
      }),
    })
    
    if (res.ok) {
      setAnnouncement("")
      setShowAnnouncementModal(false)
      fetchParticipants() // Refresh to get updated state
      toast.success("Announcement sent!")
    } else {
      toast.error("Failed to send announcement")
    }
  }

  const clearAnnouncement = async () => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear-announcement" }),
    })
    
    if (res.ok) {
      setCurrentAnnouncement(null)
      fetchParticipants()
      toast.success("Announcement cleared!")
    } else {
      toast.error("Failed to clear announcement")
    }
  }

  const toggleEmergencyPause = async () => {
    const newPausedState = !emergencyPaused
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-emergency-pause",
        paused: newPausedState
      }),
    })
    
    if (res.ok) {
      setEmergencyPaused(newPausedState)
      fetchParticipants()
      toast.success(`Emergency ${newPausedState ? 'pause' : 'resume'} activated!`)
    } else {
      toast.error("Failed to toggle emergency pause")
    }
  }

  const fetchGroupAssignments = async () => {
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "get-group-assignments",
          event_id: currentEventId
        })
      })
      
      const data = await response.json()
      if (response.ok) {
        setGroupAssignments(data.groupAssignments || [])
        setTotalGroups(data.totalGroups || 0)
        setTotalGroupParticipants(data.totalParticipants || 0)
        setShowGroupAssignmentsModal(true)
      } else {
        console.error("Error fetching group assignments:", data.error)
        toast.error("Failed to fetch group assignments: " + (data.error || "Unknown error"))
      }
    } catch (error) {
      console.error("Error fetching group assignments:", error)
      toast.error("Error fetching group assignments")
    }
  }

  const showParticipantResults = async (matchResults: any[], totalMatches: number, type: "ai" | "no-ai" | "group", calculatedPairs: any[] = [], preloadedParticipantNames: any = {}) => {
    // Store parameters for refresh
    setLastMatchParams({ matchResults, totalMatches, type, calculatedPairs })
    
    try {
      // Convert match results to participant results format
      const participantMap = new Map()
      
      let participantInfoMap = new Map()
      let allParticipants: any[] = []
      
      // Use preloaded participant names if available (from fresh database results)
      if (Object.keys(preloadedParticipantNames).length > 0) {
        console.log(`📋 Using preloaded participant names: ${Object.keys(preloadedParticipantNames).length} participants`)
        Object.entries(preloadedParticipantNames).forEach(([number, name]) => {
          participantInfoMap.set(parseInt(number), {
            name: name as string,
            id: `participant_${number}`,
            paid_done: false // Will be updated from match results if needed
          })
        })
      } else {
        // Fallback: Get all participants to have their names (across all events since names are consistent)
        console.log(`📋 Fetching participant names from database...`)
        const participantsRes = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "participants" }), // No event_id filter for names
        })
        const participantsData = await participantsRes.json()
        allParticipants = participantsData.participants || []
        
        console.log(`📋 Fetched ${allParticipants.length} participants for name mapping`)
        
        // Create a map of participant numbers to participant info
        // Prioritize records that have names (in case same participant exists across events)
        allParticipants.forEach((p: any) => {
          const existingInfo = participantInfoMap.get(p.assigned_number)
          const currentName = p.name || p.survey_data?.name
          
          // Debug logging for name mapping
          if (currentName) {
            console.log(`👤 Mapping participant #${p.assigned_number}: "${currentName}"`)
          }
          
          // Only update if we don't have this participant yet, or if current record has a name and existing doesn't
          if (!existingInfo || (currentName && !existingInfo.name.startsWith('المشارك #'))) {
            participantInfoMap.set(p.assigned_number, {
              name: currentName || `المشارك #${p.assigned_number}`,
              id: p.id,
              paid_done: p.PAID_DONE || false
            })
          }
        })
      }
      
      console.log(`🗺️ Created participant info map with ${participantInfoMap.size} entries`)
      
      // Filter match results by current event_id and process them
      const filteredMatchResults = matchResults.filter((match: any) => match.event_id === currentEventId)
      console.log(`🔍 Filtering results: ${matchResults.length} total matches, ${filteredMatchResults.length} for current event (${currentEventId})`)
      
      filteredMatchResults.forEach((match: any) => {
        // Helper function to determine incompatibility reason
        const getIncompatibilityReason = (participantNum: number, partnerNum: number) => {
          if (partnerNum === 9999) {
            // Matched with organizer - determine why no real match was found
            const participant = allParticipants.find((p: any) => p.assigned_number === participantNum)
            if (!participant) return "بيانات المشارك غير مكتملة"
            
            const reasons = []
            
            // Check if they have survey data
            if (!participant.survey_data || Object.keys(participant.survey_data).length === 0) {
              reasons.push("لم يكمل الاستبيان")
            }
            
            // Check gender preference constraints
            const gender = participant.gender || participant.survey_data?.gender
            const sameGenderPref = participant.same_gender_preference || participant.survey_data?.answers?.same_gender_preference?.includes('yes')
            
            if (sameGenderPref) {
              reasons.push("يفضل نفس الجنس ولا يوجد مشاركين متوافقين من نفس الجنس")
            } else if (gender) {
              reasons.push(`لا يوجد مشاركين متوافقين من الجنس الآخر (${gender === 'male' ? 'ذكر يبحث عن أنثى' : 'أنثى تبحث عن ذكر'})`)
            }
            
            // Check age constraints for females
            if (gender === 'female') {
              const age = participant.age || participant.survey_data?.age
              if (age) {
                reasons.push(`قيود العمر: ${age} سنة (يجب أن يكون الفرق أقل من 5 سنوات)`)
              }
            }
            
            // Check if already matched in previous events
            reasons.push("قد يكون تم مطابقته في أحداث سابقة مع جميع المشاركين المتاحين")
            
            return reasons.length > 0 ? reasons.join(" • ") : "لا يوجد مشاركين متوافقين متاحين"
          }
          return null
        }
        
        // Add participant A
        if (match.participant_a_number) {
          const participantInfo = participantInfoMap.get(match.participant_a_number)
          const existing = participantMap.get(match.participant_a_number)
          if (!existing || match.compatibility_score > existing.compatibility_score) {
            const incompatibilityReason = getIncompatibilityReason(match.participant_a_number, match.participant_b_number)
            
            // Debug name mapping
            const participantName = participantInfo?.name || `المشارك #${match.participant_a_number}`
            console.log(`🔍 Processing participant A #${match.participant_a_number}: "${participantName}" (from participantInfo: ${participantInfo?.name})`)
            
            participantMap.set(match.participant_a_number, {
              id: participantInfo?.id || `participant_${match.participant_a_number}`,
              assigned_number: match.participant_a_number,
              name: participantName,
              compatibility_score: match.compatibility_score || 0,
              mbti_compatibility_score: match.mbti_compatibility_score || 0,
              attachment_compatibility_score: match.attachment_compatibility_score || 0,
              communication_compatibility_score: match.communication_compatibility_score || 0,
              lifestyle_compatibility_score: match.lifestyle_compatibility_score || 0,
              core_values_compatibility_score: match.core_values_compatibility_score || 0,
              vibe_compatibility_score: match.vibe_compatibility_score || 0,
              partner_assigned_number: match.participant_b_number,
              partner_name: participantInfoMap.get(match.participant_b_number)?.name || `المشارك #${match.participant_b_number}`,
              is_organizer_match: match.participant_b_number === 9999,
              incompatibility_reason: incompatibilityReason,
              paid_done: participantInfo?.paid_done || false,
              partner_paid_done: participantInfoMap.get(match.participant_b_number)?.paid_done || false
            })
          }
        }
        
        // Add participant B (only if not organizer)
        if (match.participant_b_number && match.participant_b_number !== 9999) {
          const participantInfo = participantInfoMap.get(match.participant_b_number)
          const existing = participantMap.get(match.participant_b_number)
          if (!existing || match.compatibility_score > existing.compatibility_score) {
            const incompatibilityReason = getIncompatibilityReason(match.participant_b_number, match.participant_a_number)
            
            // Debug name mapping
            const participantName = participantInfo?.name || `المشارك #${match.participant_b_number}`
            console.log(`🔍 Processing participant B #${match.participant_b_number}: "${participantName}" (from participantInfo: ${participantInfo?.name})`)
            
            participantMap.set(match.participant_b_number, {
              id: participantInfo?.id || `participant_${match.participant_b_number}`,
              assigned_number: match.participant_b_number,
              name: participantName,
              compatibility_score: match.compatibility_score || 0,
              mbti_compatibility_score: match.mbti_compatibility_score || 0,
              attachment_compatibility_score: match.attachment_compatibility_score || 0,
              communication_compatibility_score: match.communication_compatibility_score || 0,
              lifestyle_compatibility_score: match.lifestyle_compatibility_score || 0,
              core_values_compatibility_score: match.core_values_compatibility_score || 0,
              vibe_compatibility_score: match.vibe_compatibility_score || 0,
              partner_assigned_number: match.participant_a_number,
              partner_name: participantInfoMap.get(match.participant_a_number)?.name || `المشارك #${match.participant_a_number}`,
              is_organizer_match: match.participant_a_number === 9999,
              incompatibility_reason: incompatibilityReason,
              paid_done: participantInfo?.paid_done || false,
              partner_paid_done: participantInfoMap.get(match.participant_a_number)?.paid_done || false
            })
          }
        }
      })
      
      const participantResults = Array.from(participantMap.values())
      
      setParticipantResults(participantResults)
      setTotalMatches(totalMatches)
      setMatchType(type)
      setCalculatedPairs(calculatedPairs)
      setIsFromCache(false)
      setShowResultsModal(true)
    } catch (err) {
      console.error("Error preparing participant results:", err)
      toast.error("Error preparing results display")
    }
  }

  // New function to load cached results from compatibility cache table
  const loadCachedResults = async () => {
    try {
      setLoading(true)
      console.log(`🔍 Loading cached results for event ${currentEventId}`)
      
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "get-cached-results",
          event_id: currentEventId
        }),
      })
      
      const data = await res.json()
      
      if (res.ok && data.success) {
        console.log(`✅ Loaded ${data.calculatedPairs.length} cached pairs and ${data.participantResults.length} participant results`)
        
        // Set the data directly from the cache
        setParticipantResults(data.participantResults)
        setTotalMatches(data.totalMatches)
        setCalculatedPairs(data.calculatedPairs)
        setMatchType("ai") // Default to AI type for cached results
        setIsFromCache(true)
        
        // Store for refresh functionality
        setLastMatchParams({ 
          matchResults: [], // Not needed for cached results
          totalMatches: data.totalMatches, 
          type: "ai", 
          calculatedPairs: data.calculatedPairs 
        })
        
        setShowResultsModal(true)
        
        // Show success message with cache stats
        toast.success(`Loaded cached results! ${data.participantResults.length} participants with matches, ${data.calculatedPairs.length} total compatibility calculations. All data loaded from compatibility cache table.`, { duration: 5000 })
      } else {
        console.error("Failed to load cached results:", data.error)
        toast.error(`Failed to load cached results: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error loading cached results:", error)
      toast.error("Error loading cached results")
    } finally {
      setLoading(false)
    }
  }

  // Clean Slate Function - Remove last admin result and current event matches
  const cleanSlate = async () => {
    const confirmMessage = `⚠️ CLEAN SLATE OPERATION\n\nThis will permanently:\n• Remove the LAST admin result from admin_results table\n• Delete ALL matches for Event ${currentEventId} from result_match table\n\nThis gives you a clean slate to generate new matches.\n\nAre you absolutely sure?`
    
    if (!confirm(confirmMessage)) return
    
    // Double confirmation for safety
    if (!confirm("🚨 FINAL CONFIRMATION\n\nThis action cannot be undone. Proceed with clean slate?")) return
    
    setLoading(true)
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "clean-slate",
          event_id: currentEventId
        }),
      })
      
      const data = await res.json()
      if (res.ok) {
        toast.success(`Clean slate completed! Removed ${data.adminResultsRemoved || 0} admin result(s) and ${data.matchesRemoved || 0} match(es) for Event ${currentEventId}. You now have a clean slate for new match generation.`, { duration: 5000 })
        // Refresh the participants list to reflect changes
        fetchParticipants()
      } else {
        toast.error(`Clean slate failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error during clean slate:", error)
      toast.error("Error during clean slate operation")
    } finally {
      setLoading(false)
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 text-white p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <Shield className="w-12 h-12 text-slate-300" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent">
              Admin Access
            </h1>
            <p className="text-slate-400 text-sm">Enter your credentials to continue</p>
          </div>
          
          <div className="space-y-4">
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                placeholder="Enter Admin Password"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:border-slate-400 transition-all duration-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && login()}
              />
            </div>
            
            <button
              className="w-full bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg"
              onClick={login}
            >
              Access Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-slate-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-400/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Header */}
      <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-slate-600 to-slate-700 p-2 rounded-xl">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent">
                Admin Dashboard
              </h1>
              <p className="text-slate-400 text-sm">Participant Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Results Visibility Status */}
            <div className={`flex items-center gap-2 px-4 py-2 backdrop-blur-sm border rounded-xl ${
              resultsVisible 
                ? 'bg-green-500/20 border-green-400/30 text-green-300' 
                : 'bg-red-500/20 border-red-400/30 text-red-300'
            }`}>
              <Eye className="w-4 h-4" />
              <div className="text-right">
                <div className="text-sm font-semibold">
                  {resultsVisible ? 'Results Visible' : 'Results Hidden'}
                </div>
                <div className="text-xs opacity-75">
                  {resultsVisible ? 'Participants can view results' : 'Waiting screen shown'}
                </div>
              </div>
            </div>

            {/* Current Time Display */}
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl">
              <Clock className="w-4 h-4 text-blue-400" />
              <div className="text-right">
                <div className="text-white font-mono text-sm">
                  {currentTime.toLocaleTimeString('ar-SA', { 
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </div>
                <div className="text-slate-400 text-xs">
                  {currentTime.toLocaleDateString('ar-SA', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short'
                  })}
                </div>
              </div>
            </div>
          
            <div className="flex items-center gap-3">
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition-all duration-300"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Phase Control */}
      <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${currentPhaseConfig.bg} border border-white/20`}>
              <currentPhaseConfig.icon className={`w-4 h-4 ${currentPhaseConfig.color}`} />
              <span className={`font-medium ${currentPhaseConfig.color}`}>
                {currentPhaseConfig.label}
              </span>
            </div>
            

            
                         <select
               value={safeCurrentPhase}
               onChange={(e) => updatePhase(e.target.value)}
               className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
               style={{
                 color: 'white',
                 backgroundColor: 'rgba(15, 23, 42, 0.8)'
               }}
             >
               <option value="registration" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Registration</option>
               <option value="form" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Form</option>
               <option value="waiting" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting</option>
               <option value="round_1" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 1</option>
               <option value="waiting_2" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting 2</option>
                             <option value="round_2" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 2</option>
              {/* <option value="waiting_3" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting 3</option>
              <option value="round_3" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 3</option>
              <option value="waiting_4" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting 4</option>
              <option value="round_4" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 4</option> */}
              <option value="group_phase" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Group Phase</option>
             </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2">
              <span className="text-slate-300 text-sm">Total: </span>
              <span className="font-bold text-white">{participants.length}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2">
              <span className="text-slate-300 text-sm">Waiting: </span>
              <span className="font-bold text-white">{waitingCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 p-6 max-w-7xl mx-auto">
        {/* Action Bar */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, number, gender..."
                  className="pl-10 pr-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={manualNumber ?? ""}
                  onChange={(e) => setManualNumber(Number(e.target.value))}
                  placeholder="رقم المشارك"
                  className="w-32 px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
                />
                <button
                  onClick={async () => {
                    setLoading(true)
                    const res = await fetch("/api/participant", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "create-token" }),
                    })
                    const data = await res.json()
                    if (data.secure_token) {
                      setQrParticipant({
                        assigned_number: data.assigned_number,
                        secure_token: data.secure_token,
                      })
                      fetchParticipants()
                    } else {
                      toast.error("فشل في توليد الرابط")
                    }
                    setLoading(false)
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl transition-all duration-300"
                >
                  <Plus className="w-4 h-4" />
                  Auto Assign Number
                </button>

                <button
                  disabled={!manualNumber}
                  onClick={async () => {
                    const res = await fetch("/api/participant", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "create-token", assigned_number: manualNumber }),
                    })
                    const data = await res.json()
                    if (data.secure_token) {
                      setQrParticipant({
                        assigned_number: manualNumber,
                        secure_token: data.secure_token,
                      })
                      setManualNumber(null)
                      fetchParticipants()
                    } else {
                      toast.error("فشل في توليد الرابط")
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl disabled:opacity-50 transition-all duration-300"
                >
                  <QrCode className="w-4 h-4" />
                  Manual QR
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (!confirm("Assign table numbers to locked matches only?\n\nThis will:\n1. Clear all table numbers for current event\n2. Assign sequential numbers (1, 2, 3...) only to locked/pinned matches")) return
                  const res = await fetch("/api/admin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                      action: "set-table",
                      event_id: currentEventId
                    }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    toast.success(`${data.message}. Assigned tables: ${data.assignedTables}, Total matches: ${data.totalMatches}`, { duration: 4000 })
                  } else {
                    toast.error(`Failed: ${data.error}`)
                  }
                  fetchParticipants()
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl transition-all duration-300"
              >
                <Table2 className="w-4 h-4" />
                Auto Assign Tables (Locked Only)
              </button>

              <button
                onClick={async () => {
                  if (!confirm("Are you sure you want to advance to the next phase?")) return
                  setLoading(true)
                  const res = await fetch("/api/admin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "advance-phase", currentPhase: safeCurrentPhase }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    toast.success(`Phase advanced to ${data.new_phase}. All players instantly transition to new phase!`)
                    fetchParticipants()
                  } else {
                    toast.error("Failed to advance phase")
                  }
                  setLoading(false)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-300"
              >
                <ChevronRight className="w-4 h-4" />
                Advance Phase
              </button>

              <button
                onClick={async () => {
                  let confirmMessage = `Are you sure you want to generate matches for Event ${currentEventId} using the new personality-based algorithm?\n\nThis will check previous events to avoid repeated matches.`
                  if (excludedPairs.length > 0) {
                    confirmMessage += `\n\n⚠️ ${excludedPairs.length} excluded pair(s) will be enforced:\n${excludedPairs.map(p => `#${p.participant1_number} ↔ #${p.participant2_number}`).join('\n')}`
                  }
                  if (excludedParticipants.length > 0) {
                    confirmMessage += `\n\n🚫 ${excludedParticipants.length} participant(s) excluded from ALL matching:\n${excludedParticipants.map(p => `#${p.participant_number}`).join(', ')}`
                  }
                  if (!confirm(confirmMessage)) return
                  setLoading(true)
                  const res = await fetch("/api/admin/trigger-match", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                      eventId: currentEventId,
                      excludedPairs: excludedPairs
                    }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    let successMessage = `✅ ${data.message}\n\nMatches created: ${data.count}\nEvent ID: ${currentEventId}`
                    if (excludedPairs.length > 0) {
                      successMessage += `\nExcluded pairs enforced: ${excludedPairs.length}`
                    }
                    if (excludedParticipants.length > 0) {
                      successMessage += `\nParticipants excluded from all matching: ${excludedParticipants.length}`
                    }
                    
                    // Add performance metrics if available
                    if (data.performance) {
                      successMessage += `\n\n⚡ Performance Metrics:`
                      successMessage += `\nTotal time: ${data.performance.totalTimeSeconds}s`
                      successMessage += `\nCache hits: ${data.performance.cacheHits} (${data.performance.cacheHitRate}%)`
                      successMessage += `\nAI calls: ${data.performance.aiCalls}`
                      successMessage += `\nAvg time per pair: ${data.performance.avgTimePerPair}ms`
                      
                      if (data.performance.cacheHitRate > 0) {
                        const timeSaved = ((data.performance.cacheHits * 2500) / 1000).toFixed(1)
                        const costSaved = (data.performance.cacheHits * 0.002).toFixed(3)
                        successMessage += `\n\n💰 Savings from cache:`
                        successMessage += `\nTime saved: ~${timeSaved}s`
                        successMessage += `\nCost saved: ~$${costSaved}`
                      }
                    }
                    
                    toast.success(successMessage, { duration: 5000 })
                    fetchParticipants()
                    // Show results modal with calculated pairs
                    await showParticipantResults(data.results || [], data.count || 0, "ai", data.calculatedPairs || [])
                  } else {
                    toast.error("Failed to generate matches: " + (data.error || "Unknown error"))
                  }
                  setLoading(false)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl transition-all duration-300"
              >
                <RefreshCcw className="w-4 h-4" />
                Generate Matches
              </button>

              <button
                onClick={async () => {
                  let confirmMessage = `Generate group matches for Event ${currentEventId}? This will create groups of 3-4 people based on MBTI compatibility.`
                  if (excludedParticipants.length > 0) {
                    confirmMessage += `\n\n🚫 ${excludedParticipants.length} participant(s) will be excluded from ALL matching:\n${excludedParticipants.map(p => `#${p.participant_number}`).join(', ')}`
                  }
                  if (!confirm(confirmMessage)) return
                  setLoading(true)
                  const res = await fetch("/api/admin/trigger-match", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                      matchType: "group",
                      eventId: currentEventId
                    }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    toast.success(`${data.message}. Groups created: ${data.count}`, { duration: 4000 })
                    fetchParticipants()
                    // Show results modal (groups don't have calculated pairs)
                    await showParticipantResults(data.results || [], data.count || 0, "group", [])
                  } else {
                    toast.error("Failed to generate group matches: " + (data.error || "Unknown error"))
                  }
                  setLoading(false)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl transition-all duration-300"
              >
                <Users className="w-4 h-4" />
                Generate Groups
              </button>

              <button
                onClick={loadCachedResults}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white rounded-xl transition-all duration-300 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <BarChart3 className="w-4 h-4" />
                )}
                Load Cached Results
              </button>

              <button
                onClick={fetchGroupAssignments}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl transition-all duration-300"
              >
                <Users className="w-4 h-4" />
                Show Groups
              </button>

              <button
                onClick={cleanSlate}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl transition-all duration-300 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Clean Slate
              </button>

              <button
                onClick={async () => {
                  if (!confirm("⚠️ This will permanently delete all profiles that haven't completed the survey. Are you sure?")) return
                  setLoading(true)
                  try {
                    const res = await fetch("/api/admin", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "cleanup-incomplete-profiles" }),
                    })
                    const data = await res.json()
                    if (res.ok) {
                      toast.success(`Cleanup completed! Removed ${data.deletedCount} incomplete profiles. ${data.remainingCount} complete profiles remain.`, { duration: 4000 })
                      fetchParticipants()
                    } else {
                      toast.error(`Error: ${data.error}`)
                    }
                  } catch (error) {
                    toast.error(`Network error: ${error}`)
                  }
                  setLoading(false)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl transition-all duration-300"
              >
                <Trash2 className="w-4 h-4" />
                Cleanup Incomplete
              </button>

              {/* Results Visibility Control */}
              <button
                onClick={toggleResultsVisibility}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
                  resultsVisible 
                    ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white' 
                    : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white'
                }`}
              >
                {resultsVisible ? (
                  <>
                    <Eye className="w-4 h-4" />
                    Hide Results
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    Show Results
                  </>
                )}
              </button>

              {/* View Last Results Button - Only show when results exist but modal is closed */}
              {participantResults.length > 0 && !showResultsModal && (
                <button
                  onClick={() => setShowResultsModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl transition-all duration-300"
                >
                  <BarChart3 className="w-4 h-4" />
                  View Last Results
                </button>
              )}

              {/* Session History Button */}
              {availableSessions.length > 0 && (
                <button
                  onClick={() => setShowSessionHistory(!showSessionHistory)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl transition-all duration-300"
                >
                  <Clock className="w-4 h-4" />
                  Results History ({availableSessions.length})
                </button>
              )}
            </div>
          </div>

          {/* Session History Panel */}
          {showSessionHistory && availableSessions.length > 0 && (
            <div className="mt-6 bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 rounded-lg">
                    <Clock className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-indigo-300">Results History</h3>
                    <p className="text-slate-400 text-sm">Previous match generation sessions for Event {currentEventId}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSessionHistory(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto">
                {availableSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                      currentSessionId === session.session_id
                        ? 'bg-indigo-500/20 border-indigo-400/50 shadow-lg'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                    }`}
                    onClick={() => loadSessionResults(session)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          session.match_type === 'individual' ? 'bg-blue-400' : 'bg-green-400'
                        }`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">
                              {session.match_type === 'individual' ? 'Individual' : 'Group'} Matching
                            </span>
                            {session.generation_type === 'no-ai' && (
                              <span className="px-2 py-1 bg-orange-500/20 text-orange-300 text-xs rounded-full">
                                No AI
                              </span>
                            )}
                            {session.generation_type === 'cached' && (
                              <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full">
                                Cached
                              </span>
                            )}
                            {currentSessionId === session.session_id && (
                              <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-400">
                            {new Date(session.created_at).toLocaleString()} • {session.total_matches} matches
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {session.generation_duration_ms && (
                          <span className="text-xs text-slate-500">
                            {(session.generation_duration_ms / 1000).toFixed(1)}s
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Excluded Pairs Management */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <X className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-red-300">Excluded Pairs</h3>
              <p className="text-slate-400 text-sm">Prevent specific participants from being matched together</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Add New Excluded Pair */}
            <div className="space-y-4">
              <h4 className="text-white font-medium">Add Excluded Pair</h4>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Participant #"
                  value={newExcludedPair.participant1}
                  onChange={(e) => setNewExcludedPair({...newExcludedPair, participant1: e.target.value})}
                  className="w-24 px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 transition-all duration-300"
                />
                <span className="text-slate-400">and</span>
                <input
                  type="number"
                  placeholder="Participant #"
                  value={newExcludedPair.participant2}
                  onChange={(e) => setNewExcludedPair({...newExcludedPair, participant2: e.target.value})}
                  className="w-24 px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 transition-all duration-300"
                />
                <button
                  onClick={addExcludedPair}
                  disabled={!newExcludedPair.participant1 || !newExcludedPair.participant2}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl disabled:opacity-50 transition-all duration-300"
                >
                  <Plus className="w-4 h-4" />
                  Exclude
                </button>
              </div>
            </div>

            {/* Current Excluded Pairs */}
            <div className="space-y-4">
              <h4 className="text-white font-medium">Current Exclusions ({excludedPairs.length})</h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {excludedPairs.length === 0 ? (
                  <p className="text-slate-400 text-sm">No excluded pairs</p>
                ) : (
                  excludedPairs.map((pair) => (
                    <div key={pair.id} className="flex items-center justify-between bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2">
                      <span className="text-white text-sm">
                        #{pair.participant1_number} ↔ #{pair.participant2_number}
                      </span>
                      <button
                        onClick={() => removeExcludedPair(pair.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Excluded Participants Management */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Shield className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="font-semibold text-orange-300">Excluded Participants</h3>
              <p className="text-slate-400 text-sm">Exclude specific participants from ALL matching (they won't be matched with anyone)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Add New Excluded Participant */}
            <div className="space-y-4">
              <h4 className="text-white font-medium">Exclude Participant</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Participant #"
                    value={newExcludedParticipant}
                    onChange={(e) => setNewExcludedParticipant(e.target.value)}
                    className="w-32 px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/50 transition-all duration-300"
                  />
                  <button
                    onClick={addExcludedParticipant}
                    disabled={!newExcludedParticipant}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl disabled:opacity-50 transition-all duration-300 ${
                      banPermanently 
                        ? "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800" 
                        : "bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800"
                    } text-white`}
                  >
                    {banPermanently ? <Ban className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    {banPermanently ? "Ban Permanently" : "Exclude from All"}
                  </button>
                </div>
                
                {/* Ban Permanently Checkbox */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="banPermanently"
                    checked={banPermanently}
                    onChange={(e) => setBanPermanently(e.target.checked)}
                    className="w-4 h-4 text-red-600 bg-white/10 border-white/20 rounded focus:ring-red-500 focus:ring-2"
                  />
                  <label htmlFor="banPermanently" className="text-red-300 text-sm font-medium cursor-pointer">
                    Ban permanently (uses -10 instead of -1)
                  </label>
                </div>
              </div>
              
              <p className="text-slate-400 text-xs">
                ⚠️ This participant will be excluded from ALL matching (individual and group)
                {banPermanently && (
                  <span className="block text-red-300 font-medium mt-1">
                    🚫 PERMANENT BAN: This participant will be marked with -10 for permanent exclusion
                  </span>
                )}
              </p>
            </div>

            {/* Current Excluded Participants */}
            <div className="space-y-4">
              <h4 className="text-white font-medium">Excluded from All Matching ({excludedParticipants.length})</h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {excludedParticipants.length === 0 ? (
                  <p className="text-slate-400 text-sm">No excluded participants</p>
                ) : (
                  excludedParticipants.map((participant) => (
                    <div key={participant.id} className={`flex items-center justify-between backdrop-blur-sm border rounded-lg px-3 py-2 ${
                      participant.is_banned 
                        ? "bg-red-500/10 border-red-400/30" 
                        : "bg-white/5 border-white/10"
                    }`}>
                      <div className="flex items-center gap-2">
                        {participant.is_banned && (
                          <div className="flex items-center gap-1">
                            <Ban className="w-4 h-4 text-red-400" />
                            <span className="text-red-300 text-xs font-bold px-2 py-0.5 bg-red-500/20 rounded-full border border-red-400/30">
                              BANNED
                            </span>
                          </div>
                        )}
                        <span className={`text-sm ${participant.is_banned ? "text-red-200" : "text-white"}`}>
                          #{participant.participant_number} - {participant.is_banned ? "PERMANENTLY BANNED" : "Excluded from ALL matching"}
                        </span>
                      </div>
                      <button
                        onClick={() => removeExcludedParticipant(participant.id)}
                        className={`transition-colors ${
                          participant.is_banned 
                            ? "text-red-400 hover:text-red-300" 
                            : "text-orange-400 hover:text-orange-300"
                        }`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Manual Match Creation */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-300">Manual Match Creation</h3>
              <p className="text-slate-400 text-sm">Create individual matches manually with real compatibility scores</p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-white font-medium">Add New Match</h4>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                placeholder="Participant #1"
                value={newManualMatch.participant1}
                onChange={(e) => setNewManualMatch({...newManualMatch, participant1: e.target.value})}
                className="w-32 px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all duration-300"
              />
              <span className="text-slate-400">↔</span>
              <input
                type="number"
                placeholder="Participant #2"
                value={newManualMatch.participant2}
                onChange={(e) => setNewManualMatch({...newManualMatch, participant2: e.target.value})}
                className="w-32 px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all duration-300"
              />
              <button
                onClick={addManualMatch}
                disabled={!newManualMatch.participant1 || !newManualMatch.participant2}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl disabled:opacity-50 transition-all duration-300"
              >
                <Users className="w-4 h-4" />
                Create Match
              </button>
            </div>
            
            {/* Bypass Eligibility Checkbox */}
            <div className="flex items-center gap-3 mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bypassEligibility}
                  onChange={(e) => setBypassEligibility(e.target.checked)}
                  className="w-4 h-4 text-orange-500 bg-white/10 border-white/20 rounded focus:ring-orange-400/50 focus:ring-2"
                />
                <span className={`text-sm font-medium transition-colors ${
                  bypassEligibility ? 'text-orange-300' : 'text-slate-400'
                }`}>
                  ⚠️ Bypass Eligibility Checks
                </span>
              </label>
            </div>
            <div className="text-slate-400 text-xs space-y-1">
              <p>• Creates a match with real compatibility scores based on participant data</p>
              <p>• Match will appear in results as if generated by the algorithm</p>
              <p>• Uses Event ID: <span className="text-blue-300 font-mono">{currentEventId}</span></p>
              {bypassEligibility && (
                <p className="text-orange-300 font-medium">⚠️ Eligibility bypass enabled - will match ANY participants regardless of survey completion, exclusions, or payment status</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto p-6">
          {/* Timer Control Section */}
          <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-sm border border-white/20 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Clock className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-blue-300">Timer Control</h3>
                    <p className="text-slate-400 text-sm">Manage session timers globally</p>
                  </div>
                </div>
                
                {globalTimerActive ? (
                  <div className="flex items-center gap-3 px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-xl">
                    <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                    <div className="text-right">
                      <div className="text-green-300 font-medium">
                        {globalTimerRound === 0 ? 'Group Phase' : `Round ${globalTimerRound}`} Active
                      </div>
                      <div className="text-green-200 text-sm font-mono">
                        {Math.floor(globalTimerRemaining / 60)}:{(globalTimerRemaining % 60).toString().padStart(2, '0')} remaining
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2 bg-slate-500/20 border border-slate-500/30 rounded-xl">
                    <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
                    <div className="text-slate-300 font-medium">
                      No active timer
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!globalTimerActive ? (
                  <>
                    <button
                      onClick={() => startGlobalTimer(1)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <Clock className="w-4 h-4" />
                      Round 1 (30min)
                    </button>
                    <button
                      onClick={() => startGlobalTimer(2)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <Clock className="w-4 h-4" />
                      Round 2 (30min)
                    </button>
                    <button
                      onClick={() => startGlobalTimer(0)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <Users className="w-4 h-4" />
                      Group (30min)
                    </button>
                  </>
                ) : (
                  <button
                    onClick={endGlobalTimer}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                  >
                    <X className="w-4 h-4" />
                    End Timer
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Phase & Round Control */}
            <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-sm border border-white/20 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Settings className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-purple-300">Phase Control</h3>
                  <p className="text-slate-400 text-sm">Manage event phases</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${currentPhaseConfig.bg} border border-white/20 flex-1`}>
                    <currentPhaseConfig.icon className={`w-4 h-4 ${currentPhaseConfig.color}`} />
                    <span className={`font-medium ${currentPhaseConfig.color}`}>
                      {currentPhaseConfig.label}
                    </span>
                  </div>
                  
                  <select
                    value={safeCurrentPhase}
                    onChange={(e) => updatePhase(e.target.value)}
                    className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-400/50 transition-all duration-300"
                    style={{
                      color: 'white',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)'
                    }}
                  >
                    <option value="registration" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Registration</option>
                    <option value="form" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Form</option>
                    <option value="waiting" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting</option>
                    <option value="round_1" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 1</option>
                    <option value="waiting_2" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Waiting 2</option>
                    <option value="round_2" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Round 2</option>
                    <option value="group_phase" style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>Group Phase</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300 text-sm">Current Event ID:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateCurrentEventId(Math.max(1, currentEventId - 1))}
                      className="p-1 rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors"
                      title="Switch to previous event"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-3 py-1 bg-slate-700 rounded text-white font-medium min-w-[2rem] text-center">
                      {currentEventId}
                    </span>
                    <button
                      onClick={() => updateCurrentEventId(currentEventId + 1)}
                      className="p-1 rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors"
                      title="Create/switch to next event"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="text-slate-400 text-xs ml-2">
                      (Max: {maxEventId})
                    </span>
                  </div>
                </div>
                
                <div className="text-slate-400 text-xs bg-slate-800/50 rounded-lg p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span>New participants → Event {currentEventId}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>All existing participants are Event 1</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300 text-sm">Total Rounds:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateRounds(Math.max(2, currentRounds - 1))}
                      className="p-1 rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-3 py-1 bg-slate-700 rounded text-white font-medium min-w-[2rem] text-center">
                      {currentRounds}
                    </span>
                    <button
                      onClick={() => updateRounds(Math.min(6, currentRounds + 1))}
                      className="p-1 rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="text-slate-400 text-xs ml-2">
                      (Optimal: {optimalRounds})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-sm border border-white/20 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Activity className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-300">Quick Actions</h3>
                  <p className="text-slate-400 text-sm">Common admin tasks</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setManualNumber(null)}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Refresh
                </button>

                <button
                  onClick={openMatrix}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <BarChart3 className="w-4 h-4" />
                  Matrix
                </button>

                <button
                  onClick={async () => {
                    let confirmMessage = "Generate matches without AI vibe analysis? (All participants will get full vibe score)"
                    if (excludedParticipants.length > 0) {
                      confirmMessage += `\n\n🚫 ${excludedParticipants.length} participant(s) will be excluded from ALL matching:\n${excludedParticipants.map(p => `#${p.participant_number}`).join(', ')}`
                    }
                    if (!confirm(confirmMessage)) return
                    setLoading(true)
                    const res = await fetch("/api/admin/trigger-match", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ skipAI: true }),
                    })
                    const data = await res.json()
                    if (res.ok) {
                      let successMessage = `✅ ${data.message}\n\nMatches created: ${data.count}`
                      
                      // Add performance metrics if available
                      if (data.performance) {
                        successMessage += `\n\n⚡ Performance Metrics:`
                        successMessage += `\nTotal time: ${data.performance.totalTimeSeconds}s`
                        successMessage += `\nCache hits: ${data.performance.cacheHits} (${data.performance.cacheHitRate}%)`
                        successMessage += `\nAI calls: ${data.performance.aiCalls} (skipped)`
                        successMessage += `\nAvg time per pair: ${data.performance.avgTimePerPair}ms`
                        
                        if (data.performance.cacheHitRate > 0) {
                          const timeSaved = ((data.performance.cacheHits * 2500) / 1000).toFixed(1)
                          successMessage += `\n\n💰 Time saved from cache: ~${timeSaved}s`
                        }
                      }
                      
                      toast.success(successMessage, { duration: 5000 })
                      fetchParticipants()
                      // Show results modal with calculated pairs
                      await showParticipantResults(data.results || [], data.count || 0, "no-ai", data.calculatedPairs || [])
                    } else {
                      toast.error("Failed to generate matches: " + (data.error || "Unknown error"))
                    }
                    setLoading(false)
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Generate (No AI)
                </button>

                <button
                  onClick={toggleRegistration}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 text-sm ${
                    registrationEnabled
                      ? "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                      : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white"
                  }`}
                >
                  <UserRound className="w-4 h-4" />
                  {registrationEnabled ? "Close Registration" : "Open Registration"}
                </button>

                <button
                  onClick={toggleEventFinished}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 text-sm ${
                    eventFinished
                      ? "bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white"
                      : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  Event {currentEventId}: {eventFinished ? "Finished" : "Ongoing"}
                </button>

                <button
                  onClick={prepareForNextEvent}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg transition-all duration-300 text-sm disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                  Ready for Next Event
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Participants Section */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <div className="max-w-6xl mx-auto p-6">
          {/* Participants List */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-slate-300 text-sm">Current Rounds:</label>
                  <select
                    value={currentRounds}
                    onChange={(e) => updateRounds(Number(e.target.value))}
                    className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
                  >
                    {[2, 3, 4, 5, 6].map(rounds => (
                      <option key={rounds} value={rounds} style={{ backgroundColor: 'rgb(15, 23, 42)', color: 'white' }}>
                        {rounds} rounds
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => updateRounds(optimalRounds)}
                  className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <Settings className="w-3 h-3" />
                  Use Optimal
                </button>
              </div>
              <div className="text-slate-400 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Participants:</span>
                  <span className="text-white">{participants.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max pairs per round:</span>
                  <span className="text-white">{Math.floor(participants.length / 2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total possible pairs:</span>
                  <span className="text-white">{participants.length > 0 ? Math.floor((participants.length * (participants.length - 1)) / 2) : 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Repeats with {currentRounds} rounds:</span>
                  <span className={`${currentRounds > optimalRounds ? 'text-yellow-400' : 'text-green-400'}`}>
                    {participants.length > 0 ? Math.max(0, (currentRounds * Math.floor(participants.length / 2)) - Math.floor((participants.length * (participants.length - 1)) / 2)) : 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Display */}
          {participantStats && (
            <div className="mt-4 p-4 rounded-xl border border-white/20 bg-white/5">
              <h3 className="text-white font-semibold mb-3">Participant Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-400">{participantStats.total_participants}</p>
                  <p className="text-slate-400 text-sm">Total Registered</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{participantStats.form_completed}</p>
                  <p className="text-slate-400 text-sm">Form Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-400">{participantStats.waiting_count}</p>
                  <p className="text-slate-400 text-sm">Currently Waiting</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-400">{participantStats.current_round_participants}</p>
                  <p className="text-slate-400 text-sm">In Current Round</p>
                </div>
              </div>
            </div>
          )}

          {/* Current Announcement Display */}
          {currentAnnouncement?.message && (
            <div className="mt-4 p-4 rounded-xl border border-white/20 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    currentAnnouncement.type === "warning" ? "bg-yellow-400" :
                    currentAnnouncement.type === "error" ? "bg-red-400" :
                    currentAnnouncement.type === "success" ? "bg-green-400" :
                    "bg-blue-400"
                  }`}></div>
                  <div>
                    <p className="text-white font-medium">{currentAnnouncement.message}</p>
                    <p className="text-slate-400 text-sm">
                      {new Date(currentAnnouncement.time).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={clearAnnouncement}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filter Controls */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-4 mb-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Eligible Filter Toggle */}
            <button
              onClick={() => setShowEligibleOnly(!showEligibleOnly)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 ${
                showEligibleOnly 
                  ? 'bg-green-500/20 border-green-400/50 text-green-300' 
                  : 'bg-white/10 border-white/20 text-slate-300 hover:bg-white/20'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium">
                {showEligibleOnly ? 'Eligible Only' : 'All Participants'}
              </span>
              {showEligibleOnly && (
                <CheckCircle className="w-4 h-4" />
              )}
            </button>
            
            {/* Gender Filter Dropdown */}
            <div className="relative">
              <select
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
                className="appearance-none bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 pr-8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
              >
                <option value="all" className="bg-slate-800 text-white">All Genders</option>
                <option value="male" className="bg-slate-800 text-white">Male Only</option>
                <option value="female" className="bg-slate-800 text-white">Female Only</option>
              </select>
              <ChevronRight className="absolute right-2 top-1/2 transform -translate-y-1/2 rotate-90 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Payment Status Filter */}
            <div className="relative">
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="appearance-none bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 pr-8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
              >
                <option value="all" className="bg-slate-800 text-white">All Payment</option>
                <option value="paid" className="bg-slate-800 text-white">Awaiting Payment</option>
                <option value="unpaid" className="bg-slate-800 text-white">Not Contacted</option>
                <option value="done" className="bg-slate-800 text-white">Payment Done</option>
              </select>
              <ChevronRight className="absolute right-2 top-1/2 transform -translate-y-1/2 rotate-90 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* WhatsApp Status Filter */}
            <div className="relative">
              <select
                value={whatsappFilter}
                onChange={(e) => setWhatsappFilter(e.target.value)}
                className="appearance-none bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 pr-8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
              >
                <option value="all" className="bg-slate-800 text-white">All WhatsApp</option>
                <option value="sent" className="bg-slate-800 text-white">Message Sent</option>
                <option value="not_sent" className="bg-slate-800 text-white">Not Contacted</option>
              </select>
              <ChevronRight className="absolute right-2 top-1/2 transform -translate-y-1/2 rotate-90 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Filter Results Count */}
            {(showEligibleOnly || genderFilter !== "all" || paymentFilter !== "all" || whatsappFilter !== "all") && (
              <div className="bg-green-500/20 backdrop-blur-sm border border-green-400/30 rounded-xl px-3 py-2">
                <span className="text-green-300 text-sm">Filtered: </span>
                <span className="font-bold text-green-200">{filteredParticipants.length}</span>
              </div>
            )}

            {/* Export Template Selection */}
            {selectedParticipants.size > 0 && (
              <>
                <div className="relative">
                  <select
                    value={exportTemplateType}
                    onChange={(e) => setExportTemplateType(e.target.value as 'match' | 'payment-reminder')}
                    className="appearance-none bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 pr-8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all duration-300"
                  >
                    <option value="match" className="bg-slate-800 text-white">Match Notification</option>
                    <option value="payment-reminder" className="bg-slate-800 text-white">Payment Reminder</option>
                  </select>
                  <ChevronRight className="absolute right-2 top-1/2 transform -translate-y-1/2 rotate-90 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>

                {/* Export Selected Participants Button */}
                <button
                  onClick={exportToExcel}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-300 text-sm disabled:opacity-50"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  Export ({selectedParticipants.size}) to Excel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Participants Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="text-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
              <p className="text-slate-400">Loading participants...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredParticipants.map((p) => (
              <div
                key={p.id}
                data-participant={p.assigned_number}
                className={`group bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 cursor-pointer transform hover:scale-105 ${
                  selectedParticipants.has(p.assigned_number) ? 'ring-2 ring-slate-400 bg-slate-400/10' : ''
                }`}
                onClick={() => setDetailParticipant(p)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-gradient-to-r from-slate-600 to-slate-700 p-3 rounded-xl">
                    <UserRound className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { 
                        e.stopPropagation();
                        setWhatsappParticipant(p); 
                        setShowWhatsappModal(true); 
                      }}
                      className="p-3 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 hover:text-green-300 transition-all duration-200 active:scale-95 touch-manipulation"
                      aria-label="Send WhatsApp message"
                    >
                      <MessageSquare className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleParticipantSelection(p.assigned_number)
                      }}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      {selectedParticipants.has(p.assigned_number) ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">#{p.assigned_number}</div>
                    
                    {/* Participant Name - Make it POP! */}
                    {p.name && (
                      <div className="mt-2 mb-3">
                        <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 rounded-lg px-3 py-2 backdrop-blur-sm">
                          <div className="text-lg font-bold bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent">
                            {p.name}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-center gap-1 text-slate-400 text-sm mb-2">
                      <Table2 className="w-4 h-4" />
                      {p.table_number ?? "Unassigned"}
                    </div>
                    
                    {/* Eligibility Badges */}
                    <div className="flex flex-wrap items-center justify-center gap-1 mb-2">
                      {p.event_id === currentEventId && (
                        <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded-full border border-blue-400/30">
                          Current Event
                        </span>
                      )}
                      {p.event_id && p.event_id !== currentEventId && (
                        <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-300 rounded-full border border-purple-400/30">
                          Event {p.event_id}
                        </span>
                      )}
                      {p.signup_for_next_event && (
                        <span className="px-2 py-1 text-xs bg-green-500/20 text-green-300 rounded-full border border-green-400/30">
                          Next Event
                        </span>
                      )}
                    </div>

                    {/* Payment and WhatsApp Status Badges */}
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {/* WhatsApp Status Badge - Clickable */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMessageSentStatus(p.assigned_number, p.PAID);
                        }}
                        disabled={updatingStatus?.participantNumber === p.assigned_number && updatingStatus?.type === 'message'}
                        className={`px-2 py-1 text-xs rounded-full border transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 ${
                          p.PAID 
                            ? 'bg-green-500/20 text-green-300 border-green-400/30 hover:bg-green-500/30' 
                            : 'bg-red-500/20 text-red-300 border-red-400/30 hover:bg-red-500/30'
                        }`}
                        title={`Click to ${p.PAID ? 'mark as not sent' : 'mark as sent'}`}
                      >
                        {updatingStatus?.participantNumber === p.assigned_number && updatingStatus?.type === 'message' ? (
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin"></div>
                            📱
                          </span>
                        ) : (
                          p.PAID ? '📱 Sent' : '📱 Not Sent'
                        )}
                      </button>

                      {/* Payment Status Badge - Clickable */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePaymentStatus(p.assigned_number, p.PAID_DONE);
                        }}
                        disabled={updatingStatus?.participantNumber === p.assigned_number && updatingStatus?.type === 'payment'}
                        className={`px-2 py-1 text-xs rounded-full border transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 ${
                          p.PAID_DONE 
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/30'
                            : p.PAID 
                              ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30 hover:bg-yellow-500/30'
                              : 'bg-gray-500/20 text-gray-300 border-gray-400/30 hover:bg-gray-500/30'
                        }`}
                        title={`Click to ${p.PAID_DONE ? 'mark as unpaid' : 'mark as paid'}`}
                      >
                        {updatingStatus?.participantNumber === p.assigned_number && updatingStatus?.type === 'payment' ? (
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin"></div>
                            💰
                          </span>
                        ) : (
                          p.PAID_DONE ? '💰 Paid' : (p.PAID ? '💰 Pending' : '💰 No Contact')
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WhatsApp Message Modal */}
      <WhatsappMessageModal
        participant={whatsappParticipant}
        isOpen={showWhatsappModal}
        onClose={() => {
          setShowWhatsappModal(false);
          setWhatsappParticipant(null);
        }}
      />

      {/* Participant Results Modal */}
      <ParticipantResultsModal
        isOpen={showResultsModal}
        onClose={() => setShowResultsModal(false)}
        results={participantResults}
        matchType={matchType}
        totalMatches={totalMatches}
        calculatedPairs={calculatedPairs}
        isFromCache={isFromCache}
        onSelectParticipant={(participantNumber) => {
          // Find the participant and add them to selection
          const participant = participants.find(p => p.assigned_number === participantNumber);
          if (participant) {
            setSelectedParticipants(prev => new Set([...prev, participantNumber]));
            // Scroll to the participant in the main list for visual confirmation
            setTimeout(() => {
              const element = document.querySelector(`[data-participant="${participantNumber}"]`);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 100);
          }
        }}
      />

      {/* Group Assignments Modal */}
      <GroupAssignmentsModal
        isOpen={showGroupAssignmentsModal}
        onClose={() => setShowGroupAssignmentsModal(false)}
        groupAssignments={groupAssignments}
        totalGroups={totalGroups}
        totalParticipants={totalGroupParticipants}
      />

      {/* React Hot Toast Container */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--toast-bg)',
            color: 'var(--toast-color)',
            border: '1px solid var(--toast-border)',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500',
            padding: '12px 16px',
            maxWidth: '400px',
            direction: 'rtl',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
        }}
      />
    </div>
  )
}
