import { useState, useEffect, useMemo, useCallback } from "react"
import { useLocation } from "react-router"
import toast, { Toaster } from 'react-hot-toast'
import { useDebounce } from "~/hooks/useDebounce"
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
  Phone,
  CreditCard,
  ArrowLeftRight,
  Shuffle,
  Ban,
  FileText,
  Bug,
  UserPlus,
  Download,
  Zap,
  Calendar,
  CalendarCheck
} from "lucide-react"
import ParticipantResultsModal from "~/components/ParticipantResultsModal"
import GroupAssignmentsModal from "~/components/GroupAssignmentsModal"
import WhatsappMessageModal from '~/components/WhatsappMessageModal';
import ParticipantQRModal from "~/components/ParticipantQRModal"
import ParticipantProfileModal from "~/components/ParticipantProfileModal"

export default function AdminPage() {
  const location = useLocation()
  const isCohost = location.pathname.includes('cohost') || new URLSearchParams(location.search).get('cohost') === '1'
  const [password, setPassword] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [participants, setParticipants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [qrParticipant, setQrParticipant] = useState<any | null>(null)
  const [detailParticipant, setDetailParticipant] = useState<any | null>(null)
  const [manualNumber, setManualNumber] = useState<number | null>(null)
  const [currentPhase, setCurrentPhase] = useState("form")
  const [searchTerm, setSearchTerm] = useState("")
  const debouncedSearch = useDebounce(searchTerm, 300) // Performance: debounce search by 300ms
  const [showEligibleOnly, setShowEligibleOnly] = useState(() => isCohost ? true : false)
  const [eligibleSubFilter, setEligibleSubFilter] = useState("none") // "none", "withNationality", "withoutNationality"
  const [genderFilter, setGenderFilter] = useState(() => isCohost ? "female" : "all") // "all", "male", "female"
  const [paymentFilter, setPaymentFilter] = useState("all") // "all", "paid", "unpaid", "done"
  const [whatsappFilter, setWhatsappFilter] = useState(() => isCohost ? "not_sent" : "all") // "all", "sent", "not_sent"
  const [sortBy, setSortBy] = useState("number") // "number", "name", "updated", "survey_updated"
  const [copied, setCopied] = useState(false)
  const [selectedParticipants, setSelectedParticipants] = useState<Set<number>>(new Set())
  const [announcement, setAnnouncement] = useState("")
  const [announcementType, setAnnouncementType] = useState("info")
  const [currentAnnouncement, setCurrentAnnouncement] = useState<any>(null)
  const [emergencyPaused, setEmergencyPaused] = useState(false)
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
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
  const [excludedParticipants, setExcludedParticipants] = useState<Array<{id: string, participant_number: number, participant_name?: string, created_at: string, reason: string, is_banned?: boolean}>>([])
  const [newExcludedParticipant, setNewExcludedParticipant] = useState('')
  const [banPermanently, setBanPermanently] = useState(false)
  
  // Delta cache count
  const [deltaCacheCount, setDeltaCacheCount] = useState(0)
  
  // Manual match management
  const [newManualMatch, setNewManualMatch] = useState({participant1: '', participant2: ''})
  const [bypassEligibility, setBypassEligibility] = useState(false)
  const [testModeOnly, setTestModeOnly] = useState(false)
  const [showAllMatches, setShowAllMatches] = useState(false)
  const [viewAllMatchesLoading, setViewAllMatchesLoading] = useState(false)
  
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
  const [exportTemplateType, setExportTemplateType] = useState<'match' | 'early-match' | 'payment-reminder' | 'reminder' | 'survey-completion'>('match');
  
  // Status update state
  const [updatingStatus, setUpdatingStatus] = useState<{participantNumber: number, type: 'message' | 'payment'} | null>(null);
  
  // Gender preference update state
  const [updatingGenderPref, setUpdatingGenderPref] = useState<number | null>(null);
  
  // Full profile modal state
  const [profileModalParticipant, setProfileModalParticipant] = useState<any | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Pre-cache state
  const [preCacheCount, setPreCacheCount] = useState(50);
  const [preCaching, setPreCaching] = useState(false);
  const [preCacheDirection, setPreCacheDirection] = useState<'forward' | 'reverse'>('forward');
  const [preCacheAll, setPreCacheAll] = useState(false);
  
  // Delta pre-cache state
  const [deltaCaching, setDeltaCaching] = useState(false);
  
  // Group debug state
  const [showGroupDebugModal, setShowGroupDebugModal] = useState(false);
  
  // Virtual scrolling / pagination state
  const [visibleCount, setVisibleCount] = useState(24); // Show 24 cards initially
  const BATCH_SIZE = 24; // Load 24 more each time
  const [groupDebugData, setGroupDebugData] = useState<any>(null);
  const [loadingGroupDebug, setLoadingGroupDebug] = useState(false);

  // Functions for prev event unmatched feature will be defined after state declarations

  // Brute-force protection for admin login
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lastAttemptTime, setLastAttemptTime] = useState<number | null>(null);

  // Track changes using refs to hold notification data (localStorage-based tracking)
  const [totalChangeInfo, setTotalChangeInfo] = useState<{count: number, show: boolean} | null>(null);
  const [eligibleChangeInfo, setEligibleChangeInfo] = useState<{count: number, show: boolean} | null>(null);

  // Track participant match history
  const [participantMatchHistory, setParticipantMatchHistory] = useState<Record<number, any[]>>({});
  const [loadingMatchHistory, setLoadingMatchHistory] = useState<Record<number, boolean>>({});

  // Delta cache participants state
  const [deltaCacheParticipants, setDeltaCacheParticipants] = useState<any[]>([]);
  const [showDeltaCacheTooltip, setShowDeltaCacheTooltip] = useState(false);
  const [loadingDeltaCacheParticipants, setLoadingDeltaCacheParticipants] = useState(false);

  // Prev event unmatched/organizer-matched -> signup next event
  const [showPrevUnmatchedModal, setShowPrevUnmatchedModal] = useState(false);
  const [prevUnmatchedLoading, setPrevUnmatchedLoading] = useState(false);
  const [prevUnmatched, setPrevUnmatched] = useState<any[]>([]);
  const [prevUnmatchedSelected, setPrevUnmatchedSelected] = useState<Set<number>>(new Set());
  const [prevEventId, setPrevEventId] = useState<number | null>(null);
  const [prevModalMode, setPrevModalMode] = useState<'prev' | 'never'>('prev');

  // Open modal and fetch candidates from previous event (N-1)
  const openPrevUnmatchedModal = async () => {
    setPrevUnmatchedLoading(true)
    try {
      setPrevModalMode('prev')
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-prev-unmatched-or-organizer', event_id: currentEventId })
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Failed to fetch previous event candidates')
        return
      }
      setPrevUnmatched(data.participants || [])
      setPrevEventId(typeof data.prev_event_id === 'number' ? data.prev_event_id : (currentEventId - 1))
      setPrevUnmatchedSelected(new Set())
      setShowPrevUnmatchedModal(true)
    } catch (e: any) {
      toast.error(e?.message || 'Network error while fetching candidates')
    } finally {
      setPrevUnmatchedLoading(false)
    }
  }

  // Open modal for participants who were never in any events
  const openNeverInEventsModal = async () => {
    setPrevUnmatchedLoading(true)
    try {
      setPrevModalMode('never')
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-never-in-events' })
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Failed to fetch never-in-events participants')
        return
      }
      setPrevUnmatched(data.participants || [])
      setPrevEventId(null)
      setPrevUnmatchedSelected(new Set())
      setShowPrevUnmatchedModal(true)
    } catch (e: any) {
      toast.error(e?.message || 'Network error while fetching participants')
    } finally {
      setPrevUnmatchedLoading(false)
    }
  }

  const togglePrevSelect = (num: number) => {
    setPrevUnmatchedSelected(prev => {
      const next = new Set(prev)
      if (next.has(num)) next.delete(num); else next.add(num)
      return next
    })
  }

  const selectAllPrev = () => {
    setPrevUnmatchedSelected(new Set(prevUnmatched.map(p => p.assigned_number)))
  }

  const clearPrevSelection = () => setPrevUnmatchedSelected(new Set())

  const signupPrevSelected = async () => {
    const list = Array.from(prevUnmatchedSelected)
    if (list.length === 0) { toast.error('اختر مشاركين أولاً'); return }
    setPrevUnmatchedLoading(true)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signup-participants-next-event', participantNumbers: list })
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Failed to sign up selected participants')
        return
      }
      toast.success(`تم تسجيل ${data.updated} للحدث القادم`)
      setShowPrevUnmatchedModal(false)
      setPrevUnmatched([])
      setPrevUnmatchedSelected(new Set())
      fetchParticipants()
    } catch (e: any) {
      toast.error(e?.message || 'Network error while signing up participants')
    } finally {
      setPrevUnmatchedLoading(false)
    }
  }

  // WhatsApp config for exports (loaded from event_state.whatsapp_config)
  const [whatsappConfig, setWhatsappConfig] = useState<any | null>(null);
  const [loadingWhatsappConfig, setLoadingWhatsappConfig] = useState(false);

  const STATIC_PASSWORD = "soulmatch2025"
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "soulmatch2025"

  // Load WhatsApp config once on mount
  useEffect(() => {
    const load = async () => {
      setLoadingWhatsappConfig(true)
      try {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-whatsapp-config' }),
        })
        const data = await res.json()
        if (res.ok && data?.success) {
          setWhatsappConfig(data.whatsapp_config || null)
        }
      } catch (e) {
        console.error('Failed to load WhatsApp config for exports', e)
      } finally {
        setLoadingWhatsappConfig(false)
      }
    }
    load()
  }, [])

  // Helper function to add bold formatting
  const bold = (text: string) => `*${text}*`;

  // Phone normalization helpers (mirrors SurveyComponent)
  // Convert Arabic numbers to English numbers
  const convertArabicToEnglish = (input: string): string => {
    const arabicNumbers = '٠١٢٣٤٥٦٧٨٩'
    const englishNumbers = '0123456789'
    
    return input.replace(/[٠-٩]/g, (match) => {
      const index = arabicNumbers.indexOf(match)
      return englishNumbers[index]
    })
  }

  // Normalize various input formats into { cc, local } suitable for E.164 composition
  // Handles: +9665xxxxxxxx, 009665xxxxxxxx, 9665xxxxxxxx, 05xxxxxxxx, 5xxxxxxxx, plain digits
  const normalizeAndSplitPhone = (rawInput: string, fallbackCC = '966'): { cc: string, local: string } => {
    if (!rawInput) return { cc: fallbackCC, local: '' }
    let s = convertArabicToEnglish(String(rawInput)).trim()
    // Remove spaces, hyphens, parentheses
    s = s.replace(/[\s\-()]/g, '')
    // Strip leading + or 00 international prefix
    if (s.startsWith('+')) s = s.slice(1)
    if (s.startsWith('00')) s = s.slice(2)
    // Keep digits only
    s = s.replace(/[^0-9]/g, '')

    let cc = ''
    let local = ''

    // Saudi-specific rules first (primary audience)
    if (s.startsWith('966')) {
      cc = '966'
      local = s.slice(3)
      if (local.startsWith('0')) local = local.slice(1)
    } else if (/^05\d{8}$/.test(s)) {
      // National format with trunk '0'
      cc = '966'
      local = s.slice(1)
    } else if (/^5\d{8}$/.test(s)) {
      // National significant number
      cc = '966'
      local = s
    } else if (s.length >= 11 && !s.startsWith('0')) {
      // Generic international: assume 3-digit CC if unknown
      cc = s.slice(0, 3)
      local = s.slice(3)
      if (local.startsWith('0')) local = local.slice(1)
    } else {
      // Fallback to local with default CC, strip leading zeros
      cc = fallbackCC
      local = s.replace(/^0+/, '')
    }

    // Final sanitation: digits only
    cc = cc.replace(/[^0-9]/g, '').slice(0, 3)
    local = local.replace(/[^0-9]/g, '')
    return { cc, local }
  }

  // Function to generate WhatsApp message for a participant
  const generateWhatsAppMessage = (participant: any, templateType: 'match' | 'early-match' | 'payment-reminder' | 'reminder' | 'survey-completion' = 'match') => {
    const name = participant.name || participant.survey_data?.name || `المشارك #${participant.assigned_number}`;
    const assignedNumber = participant.assigned_number;
    const secureToken = participant.secure_token;
    const d = {
      normalDeadlineMin: whatsappConfig?.normalDeadlineMin ?? 24 * 60,
      semiUrgentDeadlineMin: whatsappConfig?.semiUrgentDeadlineMin ?? 120,
      urgentDeadlineMin: whatsappConfig?.urgentDeadlineMin ?? 60,
      earlyPrice: whatsappConfig?.earlyPrice ?? 45,
      latePrice: whatsappConfig?.latePrice ?? 65,
      latePriceSwitchLabel: whatsappConfig?.latePriceSwitchLabel ?? 'Friday 28 Nov 3:00pm (Riyadh time)',
      eventDateText: whatsappConfig?.eventDateText ?? 'الأحد 16 نوفمبر 2025',
      eventTimeText: whatsappConfig?.eventTimeText ?? '8:15 مساءً',
      arrivalTimeText: whatsappConfig?.arrivalTimeText ?? '8:05 مساءً',
      locationName: whatsappConfig?.locationName ?? 'كوفي بلانيت - الدور الثاني',
      mapUrl: whatsappConfig?.mapUrl ?? 'https://maps.app.goo.gl/CYsyK9M5mxXMNo9YA',
      stcPay: whatsappConfig?.stcPay ?? '0560899666',
      bankName: whatsappConfig?.bankName ?? 'مصرف الراجحي: عبدالرحمن عبدالملك',
      iban: whatsappConfig?.iban ?? 'SA2480000588608016007502',
    }

    if (templateType === 'early-match') {
      return `*التوافق الأعمى* ✨

السلام عليكم *${name}*،

نسعد بإبلاغكم أنه تم العثور على شريك متوافق معكم من بين المشاركين.

📅 *لديكم حتى يوم الجمعة لتأكيد المشاركة*

💳 *رسوم المشاركة:* ${d.earlyPrice} ريال سعودي

*طرق الدفع:*
✦ STC Pay: ${d.stcPay}
✦ ${d.bankName}
✦ IBAN: ${d.iban}

بعد إتمام التحويل، يرجى إرسال صورة الإيصال فوراً لتأكيد حجزكم.

⭐ *كلما أكدتم مشاركتكم مبكراً، كلما زادت موثوقيتكم وأولويتكم في الفعاليات القادمة*

💡 *لماذا التأكيد المبكر مهم؟*
✦ يضمن مقعدكم في الفعالية
✦ يزيد من موثوقيتكم كمشارك
✦ يساعدنا في التخطيط الأفضل للفعالية
✦ يعطيكم أولوية في الفعاليات المستقبلية

⚠️ *ملاحظة مهمة:* 
لتأكيد حضوركم، يجب إتمام التحويل وإرسال صورة الإيصال. في حالة عدم التحويل خلال المدة المحددة، سيتم إعطاء الفرصة لمشارك آخر.

*تنبيه:* 
في حالة التأكيد ثم عدم الحضور أو الإلغاء، لا يمكن استرداد الرسوم.

📍 *تفاصيل الفعالية:*
المكان: ${d.locationName}
العنوان: 
${d.mapUrl}

📅 التاريخ: ${d.eventDateText}
🕰️ الوقت: ${d.eventTimeText}
⏱️ المدة: 60 دقيقة

*يرجى الحضور قبل الموعد بـ 10 دقائق*

معلوماتكم للفعالية:
رقم المشارك: *${assignedNumber}*
الرمز الخاص: *${secureToken}*

🔗 رابط الدخول المباشر:
https://match-omega.vercel.app/welcome?token=${secureToken}

نتطلع لحضوركم وتمنى لكم تجربة ممتعة.

فريق التوافق الأعمى`;
    } else if (templateType === 'payment-reminder') {
      return `*التوافق الأعمى* 💳

السلام عليكم *${name}*،

⚠️ *تذكير مهم - الدفع المطلوب*

🔴 *لم نستلم تحويلكم بعد!*

نذكركم بأنه تم العثور على شريك متوافق معكم، ولكن لم يتم إتمام الدفع حتى الآن.

⏰ *مهم جداً:* يرجى إتمام التحويل في أقرب وقت ممكن لتأكيد حجزكم.

💰 *رسوم المشاركة:*
🔸 ${d.earlyPrice} ريال (التسجيل قبل ${d.latePriceSwitchLabel})
🔸 ${d.latePrice} ريال (التسجيل بعد ${d.latePriceSwitchLabel})

⚠️ *تحذير:* في حالة عدم استلام التحويل قريباً، سيتم إعطاء الفرصة لمشارك آخر.

🚨 *لماذا يجب الدفع الآن؟*
✦ شريكك المتوافق ينتظر تأكيدك
✦ المقاعد محدودة وقد تُعطى لآخرين
✦ لضمان مشاركتك في الفعالية
✦ لتجنب خسارة هذه الفرصة الفريدة
✦ توفير ${Math.max(d.latePrice - d.earlyPrice, 0)} ريال بالتأكيد قبل ${d.latePriceSwitchLabel}

*طرق الدفع السريعة:*
✦ STC Pay: ${d.stcPay}
✦ ${d.bankName}
✦ IBAN: ${d.iban}

📸 *بعد التحويل:*
أرسل صورة الإيصال فوراً عبر الواتساب لتأكيد حجزكم.

⚠️ *مهم:*
✦ التأكيد بدون حضور سيؤدي لمنعكم من الفعاليات القادمة
✦ لا استرداد للرسوم بعد التأكيد (حتى في حالة الإلغاء المسبق)
✦ لا يمكن تأجيل دفع من فعاليه الى فعاليه اخرى

📍 *تفاصيل الفعالية:*
المكان: ${d.locationName}
التاريخ: ${d.eventDateText}
الوقت: ${d.eventTimeText} (الحضور ${d.arrivalTimeText})

العنوان: 
${d.mapUrl}

📱 *معلوماتك:*
رقم المشارك: *${assignedNumber}*
الرمز الخاص: *${secureToken}*

رابط حسابك:
https://match-omega.vercel.app/welcome?token=${secureToken}

⚡ *يرجى التحويل وإرسال الإيصال في أقرب وقت!*

🔥 لا تفوت هذه الفرصة!

فريق التوافق الأعمى`;
    } else if (templateType === 'survey-completion') {
      return `*${bold('إكمال الاستبيان للفعالية القادمة')}* 📝\n\nالسلام عليكم *${name}*،\n\nℹ️ لاحظنا أن لديك *بعض الأسئلة غير المكتملة* في الاستبيان. لإتمام تسجيلك والانضمام للفعالية القادمة، يرجى تعبئة ما تبقى الآن.\n\n🔗 *رابط الدخول المباشر إلى الاستبيان:*\nhttps://match-omega.vercel.app/welcome?token=${secureToken}&redo=1\n\n🛑 *إيقاف التسجيل التلقائي:*\nhttps://match-omega.vercel.app/welcome?token=${secureToken}&disableauto=1\n\n📱 *معلوماتك:*\nرقم المشارك: *${assignedNumber}*\nالرمز الخاص: *${secureToken}*\n\n⏰ يفضل الإكمال اليوم لضمان إدراجك في الفعالية القادمة. إذا واجهت أي مشكلة، رد على هذه الرسالة وسنساعدك فوراً.\n\nفريق التوافق الأعمى`;
    } else if (templateType === 'reminder') {
      return `*التوافق الأعمى* 🔔

السلام عليكم *${name}*،

⏰ *تذكير مهم بموعد الفعالية*

🗓️ *${d.eventDateText}*
🕰️ *الساعة ${d.eventTimeText}*
📍 *${d.locationName}*

✅ *تأكد من:*
• وصولك قبل الموعد بـ 10 دقائق
• إحضار هاتفك المحمول

💙 *نتطلع لرؤيتكم!* نرحب بحضوركم بكل سرور حتى لو تأخرتم قليلاً. إن واجهتكم أي ظروف طارئة تمنعكم من الحضور، نرجو إبلاغنا فوراً لنتمكن من إعطاء الفرصة لمشارك على قائمة الانتظار.

📱 *معلوماتك للفعالية:*
رقم المشارك: *${assignedNumber}*
الرمز الخاص: *${secureToken}*

🗺️ *الموقع:*
${d.mapUrl}

🔗 *رابط حسابك:*
https://match-omega.vercel.app/welcome?token=${secureToken}

🎉 *نتطلع لرؤيتك في الفعالية!*

فريق التوافق الأعمى`;
    }

    return `*التوافق الأعمى* ✨

السلام عليكم *${name}*،

نسعد بإبلاغكم أنه تم العثور على شريك متوافق معكم!

 💡 *نسخة التوافق العكسي* – هل الاختلاف يُكمل الصورة؟

⚠️ *ملاحظة مهمة:* 
إذا لم تتمكنوا من الحضور، يرجى إبلاغنا فوراً حتى نعطي الفرصة لمشارك آخر.

💰 *رسوم المشاركة:*
🔸 ${d.earlyPrice} ريال (التسجيل قبل ${d.latePriceSwitchLabel})
🔸 ${d.latePrice} ريال (التسجيل بعد ${d.latePriceSwitchLabel})

*طرق الدفع:*
✦ STC Pay: ${d.stcPay}
✦ ${d.bankName}
✦ IBAN: ${d.iban}

⚠️ *التأكيد يتم فقط بعد استلام التحويل والإيصال*

⚠️ *مهم:*
✦ التأكيد بدون حضور سيؤدي لمنعكم من الفعاليات القادمة
✦ لا استرداد للرسوم بعد التأكيد (حتى في حالة الإلغاء المسبق)
✦ لا يمكن تأجيل دفع من فعاليه الى فعاليه اخرى

📍 *تفاصيل الفعالية:*
المكان: ${d.locationName}
التاريخ: ${d.eventDateText}
الوقت: ${d.eventTimeText} (الحضور ${d.arrivalTimeText})

العنوان: 
${d.mapUrl}

📱 *معلوماتكم:*
رقم المشارك: *${assignedNumber}*
الرمز: *${secureToken}*
الرابط: 
https://match-omega.vercel.app/welcome?token=${secureToken}

نتطلع لحضوركم!

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
          // Apply the same phone normalization used in SurveyComponent, but
          // if the original input is already in international format with '+', keep it as-is.
          const rawPhone = (participant.phone_number
            || participant.survey_data?.answers?.phone_number
            || participant.survey_data?.phone_number
            || '') as string
          const cleanedOriginal = convertArabicToEnglish(rawPhone).trim().replace(/[\s\-()]/g, '')
          let phone = ''
          if (/^\+\d{6,}$/.test(cleanedOriginal)) {
            // Already valid international; keep it exactly as provided (after basic whitespace cleanup)
            phone = cleanedOriginal
          } else {
            const fallbackCC = String(participant.survey_data?.answers?.phone_cc || '966')
            const { cc, local } = normalizeAndSplitPhone(rawPhone, fallbackCC)
            phone = local ? (cc ? `+${cc}${local}` : local) : ''
          }
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
      const templateName = exportTemplateType === 'payment-reminder' ? 'payment_reminder' : 
                           exportTemplateType === 'early-match' ? 'early_match_notification' : 
                           exportTemplateType === 'reminder' ? 'event_reminder' :
                           exportTemplateType === 'survey-completion' ? 'survey_completion' : 'match_notification';
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
      
      const templateLabel = exportTemplateType === 'payment-reminder' ? 'تذكير الدفع' : 
                            exportTemplateType === 'early-match' ? 'إشعار مبكر' : 
                            exportTemplateType === 'reminder' ? 'تذكير الفعالية' :
                            exportTemplateType === 'survey-completion' ? 'إكمال الاستبيان' : 'إشعار المطابقة';
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

  // Function to update gender preference
  const updateGenderPreference = async (participantNumber: number, genderPreference: 'opposite_gender' | 'same_gender' | 'any_gender') => {
    setUpdatingGenderPref(participantNumber);
    
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "update-gender-preference",
          participantNumber: participantNumber,
          genderPreference: genderPreference
        })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        toast.success(`Gender preference updated for #${participantNumber}`);
        // Refresh participants list to show updated preference
        fetchParticipants();
      } else {
        toast.error(`Error updating gender preference: ${data.error}`);
      }
    } catch (error) {
      console.error("Error updating gender preference:", error);
      toast.error('Error updating gender preference');
    } finally {
      setUpdatingGenderPref(null);
    }
  }

  // Function to toggle participant exclusion
  const toggleParticipantExclusion = async (participantNumber: number, participantName: string) => {
    const isCurrentlyExcluded = excludedParticipants.some(ep => ep.participant_number === participantNumber);
    
    if (isCurrentlyExcluded) {
      // Remove from excluded participants
      const excludedEntry = excludedParticipants.find(ep => ep.participant_number === participantNumber);
      if (!excludedEntry) return;
      
      if (!confirm(`Remove participant #${participantNumber} (${participantName}) from exclusion list?`)) return;
      
      try {
        const response = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "remove-excluded-participant",
            id: excludedEntry.id
          })
        });
        
        const data = await response.json();
        if (response.ok) {
          await fetchExcludedParticipants();
          await fetchExcludedPairs();
          toast.success(data.message || `Participant #${participantNumber} removed from exclusion`);
        } else {
          toast.error(data.error || 'Failed to remove exclusion');
        }
      } catch (error) {
        console.error("Error removing exclusion:", error);
        toast.error('Error removing exclusion');
      }
    } else {
      // Add to excluded participants
      if (!confirm(`Exclude participant #${participantNumber} (${participantName}) from ALL matching?\n\nThis will prevent them from being matched with anyone.`)) return;
      
      try {
        const response = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "add-excluded-participant",
            participantNumber: participantNumber,
            reason: "Excluded from admin panel",
            is_banned: false
          })
        });
        
        const data = await response.json();
        if (response.ok) {
          await fetchExcludedParticipants();
          toast.success(data.message || `Participant #${participantNumber} excluded from all matching`);
        } else {
          toast.error(data.error || 'Failed to add exclusion');
        }
      } catch (error) {
        console.error("Error adding exclusion:", error);
        toast.error('Error adding exclusion');
      }
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

const fetchParticipantMatchHistory = async (participantNumber: number) => {
  setLoadingMatchHistory(prev => ({ ...prev, [participantNumber]: true }))
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "get-all-match-history",
        match_id: "00000000-0000-0000-0000-000000000000"
      }),
    })
    const data = await res.json()
    
    if (data.success && data.matchHistory) {
      setParticipantMatchHistory(prev => ({
        ...prev,
        [participantNumber]: data.matchHistory[participantNumber] || []
      }))
    }
  } catch (error) {
    console.error("Error fetching match history:", error)
    toast.error("Failed to load match history")
  } finally {
    setLoadingMatchHistory(prev => ({ ...prev, [participantNumber]: false }))
  }
}

// Function to fetch participants that need delta cache updating
const fetchDeltaCacheParticipants = async () => {
  if (loadingDeltaCacheParticipants) return;
  
  setLoadingDeltaCacheParticipants(true);
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "get-delta-cache-participants",
        event_id: currentEventId 
      }),
    });
    const data = await res.json();
    
    if (res.ok && data.participants) {
      setDeltaCacheParticipants(data.participants);
      console.log(`📋 Loaded ${data.participants.length} participants needing delta cache update`);
    } else {
      console.error("Error fetching delta cache participants:", data.error);
      setDeltaCacheParticipants([]);
    }
  } catch (error) {
    console.error("Error fetching delta cache participants:", error);
    setDeltaCacheParticipants([]);
  } finally {
    setLoadingDeltaCacheParticipants(false);
  }
};

const fetchParticipants = async () => {
  setLoading(true)
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "participants" }),
    })
    const data = await res.json()
    const fetchedParticipants = data.participants || []
    
    // STEP 1: Read previous values from localStorage (before any updates)
    const previousTotal = parseInt(localStorage.getItem('admin_previous_total') || '0')
    const previousEligible = parseInt(localStorage.getItem('admin_previous_eligible') || '0')
    
    // STEP 2: Calculate current values
    const currentTotal = fetchedParticipants.length
    const currentEligible = fetchedParticipants.filter((p: any) => 
      p.event_id === currentEventId || 
      p.signup_for_next_event === true ||
      p.auto_signup_next_event === true
    ).length
    
    // STEP 3: Compare and detect changes (this must happen before localStorage update)
    let totalChange = null
    let eligibleChange = null
    
    if (previousTotal > 0 && currentTotal > previousTotal) {
      const newCount = currentTotal - previousTotal
      totalChange = { count: newCount, show: true }
      toast.success(`🎉 ${newCount} new participant${newCount > 1 ? 's' : ''} joined!`, { duration: 5000 })
    } else if (previousTotal > 0 && currentTotal < previousTotal) {
      const removedCount = previousTotal - currentTotal
      totalChange = { count: -removedCount, show: true }
      toast(`❌ ${removedCount} participant${removedCount > 1 ? 's' : ''} removed`, { duration: 5000 })
    }
    
    if (previousEligible > 0 && currentEligible > previousEligible) {
      const newCount = currentEligible - previousEligible
      eligibleChange = { count: newCount, show: true }
      toast.success(`✅ ${newCount} more eligible participant${newCount > 1 ? 's' : ''}!`, { duration: 5000 })
    } else if (previousEligible > 0 && currentEligible < previousEligible) {
      const removedCount = previousEligible - currentEligible
      eligibleChange = { count: -removedCount, show: true }
      toast(`⚠️ ${removedCount} fewer eligible participant${removedCount > 1 ? 's' : ''}`, { duration: 5000 })
    }
    
    // STEP 4: Update state with change info
    if (totalChange) {
      setTotalChangeInfo(totalChange)
      setTimeout(() => setTotalChangeInfo(null), 15000)
    }
    if (eligibleChange) {
      setEligibleChangeInfo(eligibleChange)
      setTimeout(() => setEligibleChangeInfo(null), 15000)
    }
    
    // STEP 5: Update localStorage AFTER comparison is complete (no race condition)
    localStorage.setItem('admin_previous_total', currentTotal.toString())
    localStorage.setItem('admin_previous_eligible', currentEligible.toString())
    
    // STEP 6: Update React state
    setParticipants(fetchedParticipants)
      
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
      
      // Fetch delta cache count
      try {
        const deltaCacheRes = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-delta-cache-count", event_id: fetchedEventId }),
        })
        const deltaCacheData = await deltaCacheRes.json()
        setDeltaCacheCount(deltaCacheData.count || 0)
      } catch (deltaCacheError) {
        console.error("Error fetching delta cache count:", deltaCacheError)
        setDeltaCacheCount(0)
      }
      
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

  // Export Individual Matches to CSV
  const exportIndividualMatchesCSV = async () => {
    try {
      setLoading(true)
      
      // Fetch match results directly from match_results table
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "get-match-results-for-export",
          event_id: currentEventId
        }),
      })
      
      if (!res.ok) {
        toast.error("Failed to fetch match results")
        return
      }
      
      const data = await res.json()
      const matches = data.matches || []
      
      if (matches.length === 0) {
        toast.error("No individual matches found for current event")
        return
      }
      
      // Fetch participant names
      const participantsRes = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "participants" }),
      })
      const participantsData = await participantsRes.json()
      const allParticipants = participantsData.participants || []
      
      // Create name lookup map
      const nameMap = new Map()
      allParticipants.forEach((p: any) => {
        const name = p.name || p.survey_data?.name || `المشارك #${p.assigned_number}`
        nameMap.set(p.assigned_number, name)
      })
      
      // Create CSV content with UTF-8 BOM for Excel compatibility
      let csvContent = "\uFEFF" // UTF-8 BOM
      csvContent += "Participant A Number,Participant A Name,Participant B Number,Participant B Name,Compatibility Score,Round,Table Number,Match Type\n"
      
      matches.forEach((match: any) => {
        const nameA = nameMap.get(match.participant_a_number) || `المشارك #${match.participant_a_number}`
        const nameB = nameMap.get(match.participant_b_number) || `المشارك #${match.participant_b_number}`
        const score = match.compatibility_score || 0
        const round = match.round || ''
        const table = match.table_number || ''
        const matchType = match.match_type || ''
        
        csvContent += `${match.participant_a_number},"${nameA}",${match.participant_b_number},"${nameB}",${score},${round},${table},"${matchType}"\n`
      })
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `individual_matches_event${currentEventId}_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      toast.success(`Exported ${matches.length} individual matches to CSV`)
    } catch (error) {
      console.error("Error exporting individual matches:", error)
      toast.error("Failed to export matches")
    } finally {
      setLoading(false)
    }
  }

  // Export Group Tables to CSV
  const exportGroupTablesCSV = async () => {
    try {
      setLoading(true)
      
      // Fetch group assignments
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "get-group-assignments",
          event_id: currentEventId 
        }),
      })
      
      if (!res.ok) {
        toast.error("Failed to fetch group assignments")
        return
      }
      
      const data = await res.json()
      const groups = data.groupAssignments || []
      
      if (groups.length === 0) {
        toast.error("No group assignments found for current event")
        return
      }
      
      // Create CSV content with UTF-8 BOM for Excel compatibility
      let csvContent = "\uFEFF" // UTF-8 BOM
      csvContent += "Group Number,Table Number,Participant Count,Participants,Compatibility Score\n"
      
      groups.forEach((group: any) => {
        const groupNum = group.group_number || ''
        const tableNum = group.table_number || ''
        const participantCount = group.participant_count || 0
        const score = group.compatibility_score || ''
        
        // Format participants as "Name1 (#1), Name2 (#2), ..."
        const participantsList = group.participants
          .map((p: any) => `${p.name} (#${p.number})`)
          .join(', ')
        
        csvContent += `${groupNum},${tableNum},${participantCount},"${participantsList}",${score}\n`
      })
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `group_tables_event${currentEventId}_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      toast.success(`Exported ${groups.length} groups to CSV`)
    } catch (error) {
      console.error("Error exporting groups:", error)
      toast.error("Failed to export groups")
    } finally {
      setLoading(false)
    }
  }

  // Check if admin login is locked out
  const checkLoginLockout = () => {
    if (!lockoutUntil) return { locked: false, remaining: 0 };
    
    const now = Date.now();
    const remaining = Math.ceil((lockoutUntil - now) / 1000);
    
    if (remaining <= 0) {
      setLockoutUntil(null);
      setLoginAttempts(0);
      return { locked: false, remaining: 0 };
    }
    
    return { locked: true, remaining };
  };

  // Get security status message for login
  const getLoginSecurityStatus = () => {
    const lockout = checkLoginLockout();
    
    if (lockout.locked) {
      return {
        type: 'error' as const,
        message: `محظور لمدة ${lockout.remaining} ثانية - محاولات فاشلة كثيرة`
      };
    }
    
    if (loginAttempts === 2) {
      return {
        type: 'warning' as const,
        message: 'تحذير: محاولة واحدة متبقية قبل الحظر'
      };
    }
    
    if (loginAttempts === 1) {
      return {
        type: 'info' as const,
        message: 'محاولتان متبقيتان'
      };
    }
    
    return null;
  };

  const login = () => {
    // Check if locked out
    const lockout = checkLoginLockout();
    if (lockout.locked) {
      toast.error(`محظور لمدة ${lockout.remaining} ثانية`);
      return;
    }

    if (password === STATIC_PASSWORD) {
      // Successful login - reset attempts
      localStorage.setItem("admin", "authenticated")
      setAuthenticated(true)
      setLoginAttempts(0)
      setLockoutUntil(null)
      setLastAttemptTime(null)
      fetchParticipants()
    } else {
      // Failed login - increment attempts
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);
      setLastAttemptTime(Date.now());
      
      // Progressive lockout durations
      const lockoutDurations = [
        0,      // 1st attempt: no lockout
        0,      // 2nd attempt: no lockout
        30,     // 3rd attempt: 30 seconds
        120,    // 4th attempt: 2 minutes
        300,    // 5th attempt: 5 minutes
        900,    // 6th attempt: 15 minutes
        1800,   // 7th attempt: 30 minutes
        3600    // 8th+ attempts: 1 hour
      ];
      
      const lockoutSeconds = lockoutDurations[Math.min(newAttempts, lockoutDurations.length - 1)];
      
      if (lockoutSeconds > 0) {
        setLockoutUntil(Date.now() + lockoutSeconds * 1000);
        toast.error(`كلمة مرور خاطئة. محظور لمدة ${lockoutSeconds} ثانية`);
      } else {
        toast.error(`كلمة مرور خاطئة. ${3 - newAttempts} محاولات متبقية`);
      }
    }
  }

  const logout = () => {
    localStorage.removeItem("admin")
    setAuthenticated(false)
    setPassword("")
  }

  useEffect(() => {
    // Clear tracking values on page refresh to start fresh
    localStorage.removeItem('admin_previous_total')
    localStorage.removeItem('admin_previous_eligible')
    
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

  // Auto-reset login attempts after 5 minutes of inactivity
  useEffect(() => {
    const resetInterval = setInterval(() => {
      if (lastAttemptTime && Date.now() - lastAttemptTime > 300000) { // 5 minutes
        setLoginAttempts(0);
        setLockoutUntil(null);
        setLastAttemptTime(null);
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(resetInterval);
  }, [lastAttemptTime]);

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
        await fetchExcludedParticipants() // Refresh the excluded participants list
        await fetchExcludedPairs() // Refresh the excluded pairs list since we deleted associated pairs
        
        // Show success message with details about removed pairs
        if (data.pairsRemoved > 0) {
          toast.success(`${data.message}`, { duration: 4000 })
        } else {
          toast.success(data.message)
        }
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
    
    // Show All Matches Mode: View all possible matches for participant1
    if (showAllMatches) {
      if (!participant1 || participant1 <= 0) {
        toast.error("Please enter a valid participant number")
        return
      }
      
      if (participant1 === 9999) {
        toast.error("Cannot view matches for the organizer participant")
        return
      }
      
      setViewAllMatchesLoading(true)
      console.log(`👁️ Fetching all matches for participant #${participant1}...`)
      
      try {
        const res = await fetch("/api/admin/trigger-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            eventId: currentEventId,
            viewAllMatches: {
              participantNumber: participant1,
              bypassEligibility: bypassEligibility
            }
          }),
        })
        
        if (!res.ok) {
          const errorText = await res.text()
          console.error("API Error Response:", errorText)
          let errorData
          try {
            errorData = JSON.parse(errorText)
          } catch {
            throw new Error(`Server error (${res.status}): ${errorText}`)
          }
          throw new Error(errorData.error || `Server returned ${res.status}`)
        }
        
        const data = await res.json()
        console.log("✅ View all matches response:", data)
        
        if (data.success && data.calculatedPairs) {
          // Transform calculatedPairs to match ParticipantResult interface
          // Fetch participant names from current participants list
          const transformedResults = data.calculatedPairs.map((pair: any) => {
            const targetParticipant = participants.find(p => p.assigned_number === pair.participant_a)
            const partnerParticipant = participants.find(p => p.assigned_number === pair.participant_b)
            
            const targetName = targetParticipant?.name || 
                              targetParticipant?.survey_data?.name || 
                              targetParticipant?.survey_data?.answers?.name ||
                              `المشارك #${pair.participant_a}`
            
            const partnerName = partnerParticipant?.name || 
                               partnerParticipant?.survey_data?.name || 
                               partnerParticipant?.survey_data?.answers?.name ||
                               `المشارك #${pair.participant_b}`
            
            return {
              id: `${pair.participant_a}-${pair.participant_b}`,
              assigned_number: pair.participant_a, // The target participant
              name: targetName,
              partner_assigned_number: pair.participant_b,
              partner_name: partnerName,
              compatibility_score: pair.compatibility_score,
              mbti_compatibility_score: pair.mbti_compatibility_score,
              attachment_compatibility_score: pair.attachment_compatibility_score,
              communication_compatibility_score: pair.communication_compatibility_score,
              lifestyle_compatibility_score: pair.lifestyle_compatibility_score,
              core_values_compatibility_score: pair.core_values_compatibility_score,
              vibe_compatibility_score: pair.vibe_compatibility_score,
              humor_early_openness_bonus: pair.bonusType || 'none',
              is_organizer_match: false,
              paid_done: partnerParticipant?.PAID_DONE || false
            }
          })
          
          // Show results in modal
          setParticipantResults(transformedResults)
          setCalculatedPairs(data.calculatedPairs) // Keep original for detail view
          setMatchType("ai")
          setTotalMatches(data.calculatedPairs.length)
          setShowResultsModal(true)
          setNewManualMatch({participant1: '', participant2: ''})
          toast.success(`Found ${data.calculatedPairs.length} gender-compatible matches for participant #${participant1}`)
        } else {
          throw new Error(data.error || "No calculated pairs returned from server")
        }
      } catch (error: any) {
        console.error("❌ Error viewing all matches:", error)
        toast.error(error.message || "Failed to view all matches. Please check console for details.")
      } finally {
        setViewAllMatchesLoading(false)
      }
      return
    }
    
    // Normal Manual Match Mode
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
          manualMatch: { 
            participant1: participant1, 
            participant2: participant2, 
            bypassEligibility: bypassEligibility,
            testModeOnly: testModeOnly
          }
        }),
      })
      const data = await res.json()
      
      if (res.ok) {
        setNewManualMatch({participant1: '', participant2: ''})
        
        // Extract detailed scores from the response
        const result = data.results?.[0]
        let detailedMessage = testModeOnly 
          ? `🧪 TEST MODE: ${data.message}\n\n🎯 COMPATIBILITY BREAKDOWN:\n`
          : `✅ ${data.message}\n\n🎯 COMPATIBILITY BREAKDOWN:\n`
        detailedMessage += `📊 Total Score: ${data.compatibility_score}%\n\n`
        
        if (result) {
          // Prefer new model fields if present
          const hasNewModel = (
            typeof result.synergyScore === 'number' ||
            typeof result.lifestyleScore === 'number' ||
            typeof result.humorOpenScore === 'number' ||
            typeof result.communicationScore === 'number' ||
            typeof result.vibeScore === 'number' ||
            typeof result.intentScore === 'number'
          )
          if (hasNewModel) {
            const round = (v:any) => Math.round((Number(v) || 0) * 100) / 100
            detailedMessage += `⚡ Synergy: ${round(result.synergyScore)}/35\n`
            detailedMessage += `🏠 Lifestyle: ${round(result.lifestyleScore)}/15\n`
            detailedMessage += `😄 Humor & Openness: ${round(result.humorOpenScore)}/15\n`
            detailedMessage += `💬 Communication: ${round(result.communicationScore)}/10\n`
            detailedMessage += `✨ AI Vibe: ${round(result.vibeScore)}/20\n`
            detailedMessage += `🎯 Meeting Goal & Values: ${round(result.intentScore)}/5\n`
            // Safety row (if flags present)
            const safety: string[] = []
            if (result.attachmentPenaltyApplied) safety.push('Attachment penalty: −5 (Anxious × Avoidant)')
            if (result.intentBoostApplied) safety.push('Intent Match: ×1.1 (Deep Seekers)')
            if (result.deadAirVetoApplied) safety.push('Capped by Dead‑Air (40%)')
            if (result.humorClashVetoApplied) safety.push('Capped by Humor Clash (50%)')
            if (result.capApplied && !result.deadAirVetoApplied && !result.humorClashVetoApplied) safety.push(`Capped by rule (${result.capApplied}%)`)
            if (safety.length > 0) {
              detailedMessage += `\n🛡️ Safety:\n- ${safety.join('\n- ')}\n`
            }
          } else {
            // Fallback to legacy fields
            detailedMessage += `🧠 MBTI: ${result.mbti_compatibility_score}% (5% max)\n`
            detailedMessage += `💝 Attachment: ${result.attachment_compatibility_score}% (5% max)\n`
            detailedMessage += `💬 Communication: ${result.communication_compatibility_score}% (10% max)\n`
            detailedMessage += `🏠 Lifestyle: ${result.lifestyle_compatibility_score}% (25% max)\n`
            detailedMessage += `⭐ Core Values: ${result.core_values_compatibility_score}% (20% max)\n`
            detailedMessage += `✨ Vibe Analysis: ${result.vibe_compatibility_score}% (35% max)\n`
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

  // Performance: Use useMemo to cache filtered participants (only recalculate when dependencies change)
  const filteredParticipants = useMemo(() => {
    // Reset visible count when filters change to show first batch
    setVisibleCount(BATCH_SIZE);
    
    const filtered = participants.filter(p => {
      // Search term filter - using debounced search for better performance
      const s = (debouncedSearch || "").trim();
      let matchesSearch = true;
      if (s !== "") {
        if (/^p\d+$/i.test(s)) {
          const digits = s.slice(1);
          const phone = (p.phone_number || "").replace(/\D/g, "");
          matchesSearch = phone.includes(digits);
        } else {
          matchesSearch = (
            p.assigned_number.toString().includes(s) ||
            (p.name?.toLowerCase().includes(s.toLowerCase())) ||
            (p.survey_data?.answers?.gender?.toLowerCase().includes(s.toLowerCase())) ||
            (p.survey_data?.answers?.ageGroup?.toLowerCase().includes(s.toLowerCase()))
          );
        }
      }
      
      // Check if participant is excluded from all matching
      const isExcluded = excludedParticipants.some(ep => ep.participant_number === p.assigned_number)
      
      // Eligible participants filter (current event or signed up for next event or auto-signup)
      // When eligible filter is active, also exclude participants in the excluded list
      const isEligible = !showEligibleOnly || (
        !isExcluded && (
          p.event_id === currentEventId ||
          p.signup_for_next_event === true ||
          p.auto_signup_next_event === true
        )
      )

      // Nationality-based subfilter when Eligible Only is active
      // "withNationality": must have nationality column filled (non-null, non-empty)
      // "withoutNationality": eligible but nationality missing/empty
      const hasNationality = (() => {
        if (p.nationality == null) return false
        if (typeof p.nationality === 'string') return p.nationality.trim().length > 0
        return true
      })()
      const matchesEligibleSub = !showEligibleOnly || eligibleSubFilter === "none" || (
        eligibleSubFilter === "withNationality" ? hasNationality : !hasNationality
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
      
      return matchesSearch && isEligible && matchesEligibleSub && matchesGender && matchesPayment && matchesWhatsapp
    })

    // Sort the filtered results
    return filtered.sort((a, b) => {
      if (sortBy === "number") {
        return a.assigned_number - b.assigned_number
      } else if (sortBy === "name") {
        const nameA = a.name || ""
        const nameB = b.name || ""
        return nameA.localeCompare(nameB)
      } else if (sortBy === "updated") {
        // Sort by updated_at (most recent first)
        const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return dateB - dateA // Descending order (newest first)
      } else if (sortBy === "survey_updated") {
        // Sort by survey_data_updated_at (most recent first)
        const dateA = a.survey_data_updated_at ? new Date(a.survey_data_updated_at).getTime() : 0
        const dateB = b.survey_data_updated_at ? new Date(b.survey_data_updated_at).getTime() : 0
        return dateB - dateA // Descending order (newest first)
      }
      return 0
    })
  }, [participants, debouncedSearch, showEligibleOnly, eligibleSubFilter, genderFilter, paymentFilter, whatsappFilter, sortBy, currentEventId, excludedParticipants])
  
  // Virtualized participants - only show a subset for performance
  const visibleParticipants = useMemo(() => {
    return filteredParticipants.slice(0, visibleCount)
  }, [filteredParticipants, visibleCount])
  
  // Check if there are more participants to load
  const hasMore = visibleCount < filteredParticipants.length
  const remainingCount = filteredParticipants.length - visibleCount
  
  // Load more participants
  const loadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + BATCH_SIZE, filteredParticipants.length))
  }, [filteredParticipants.length, BATCH_SIZE])
  
  // Load all remaining participants
  const loadAll = useCallback(() => {
    setVisibleCount(filteredParticipants.length)
  }, [filteredParticipants.length])

  // Calculate eligible participants count (current event or signed up for next event or auto-signup, excluding excluded participants)
  const eligibleCount = useMemo(() => {
    return participants.filter(p => {
      const isEligible = p.event_id === currentEventId || 
                        p.signup_for_next_event === true ||
                        p.auto_signup_next_event === true;
      const isExcluded = excludedParticipants.some(ep => ep.participant_number === p.assigned_number);
      return isEligible && !isExcluded;
    }).length
  }, [participants, currentEventId, excludedParticipants])

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
              partner_paid_done: participantInfoMap.get(match.participant_b_number)?.paid_done || false,
              humor_early_openness_bonus: match.humor_early_openness_bonus || 'none'
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
              partner_paid_done: participantInfoMap.get(match.participant_a_number)?.paid_done || false,
              humor_early_openness_bonus: match.humor_early_openness_bonus || 'none'
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

  // Pre-Cache Function - Cache compatibility calculations before running full match generation
  const preCacheMatches = async () => {
    const directionText = preCacheDirection === 'forward' ? 'top to bottom' : 'bottom to top'
    const countText = preCacheAll ? 'ALL eligible' : preCacheCount
    const confirmMessage = `Pre-cache ${countText} participant pair compatibility calculations?

This will:
• Calculate compatibility for ${countText} uncached pairs
• Process linearly (${directionText})
• Store results in compatibility_cache table
• Help prevent timeouts during full match generation

Proceed?`
    
    if (!confirm(confirmMessage)) return
    
    setPreCaching(true)
    try {
      const res = await fetch("/api/admin/trigger-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "pre-cache",
          eventId: currentEventId,
          count: preCacheAll ? 999999 : preCacheCount,
          direction: preCacheDirection,
          cacheAll: preCacheAll
        }),
      })
      
      const data = await res.json()
      
      if (res.ok && data.success) {
        let successMessage = `✅ Pre-cached ${data.cached_count} compatibility calculations!`
        
        if (data.already_cached > 0) {
          successMessage += `\n\n📊 ${data.already_cached} pairs were already cached`
        }
        
        if (data.skipped > 0) {
          successMessage += `\n⚠️ ${data.skipped} pairs skipped (incompatible)`
        }
        
        successMessage += `\n\n⏱️ Time taken: ${data.duration_seconds}s`
        successMessage += `\n💾 Total cached pairs now: ${data.total_cached}`
        
        toast.success(successMessage, { duration: 6000 })
      } else {
        toast.error(`Failed to pre-cache: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error pre-caching:", error)
      toast.error("Error pre-caching matches")
    } finally {
      setPreCaching(false)
    }
  }
  
  // Delta Pre-Cache Function - Smart incremental caching (only updated participants)
  const deltaCacheMatches = async () => {
    const confirmMessage = `🔄 Smart Delta Pre-Cache for Event ${currentEventId}?

This will:
• Detect participants who updated surveys since last cache
• Only cache pairs involving updated participants
• Reuse existing cache for unchanged participants
• Save time and API costs!

Proceed?`
    
    if (!confirm(confirmMessage)) return
    
    setDeltaCaching(true)
    try {
      const res = await fetch("/api/admin/trigger-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "delta-pre-cache",
          eventId: currentEventId,
          skipAI: false
        }),
      })
      
      const data = await res.json()
      
      if (res.ok && data.success) {
        let successMessage = `✅ Delta Cache Complete!`
        
        if (data.participants_needing_cache === 0) {
          successMessage = `✅ Cache is FRESH!\n\nNo participants have updated their surveys since last cache.\n\n📊 Stats:\n• Total eligible: ${data.total_eligible}\n• Last cache: ${new Date(data.last_cache_timestamp).toLocaleString()}`
        } else {
          successMessage += `\n\n📊 Smart Caching Results:`
          successMessage += `\n• Updated participants: ${data.participants_needing_cache}`
          successMessage += `\n• New pairs cached: ${data.cached_count}`
          
          if (data.already_cached > 0) {
            successMessage += `\n• Reused cached: ${data.already_cached}`
          }
          
          if (data.skipped > 0) {
            successMessage += `\n• Skipped (incompatible): ${data.skipped}`
          }
          
          successMessage += `\n• Pairs checked: ${data.pairs_checked}`
          successMessage += `\n• AI calls made: ${data.ai_calls_made}`
          successMessage += `\n\n⏱️ Time: ${data.duration_seconds}s`
          
          const efficiency = data.pairs_checked > 0 ? ((1 - (data.pairs_checked / (data.total_eligible * (data.total_eligible - 1) / 2))) * 100).toFixed(0) : 0
          successMessage += `\n💰 Efficiency: ${efficiency}% reduction vs full cache`
        }
        
        toast.success(successMessage, { duration: 8000 })
        // Refresh delta cache count
        fetchParticipants()
      } else {
        // Check if error is about missing cache metadata
        if (data.error && data.error.includes('No cache metadata')) {
          toast.error(`❌ Delta Cache Not Available\n\n${data.message || data.error}\n\n💡 Tip: Use the Pre-Cache button first to establish a baseline cache.`, { duration: 8000 })
        } else {
          toast.error(`Failed to delta cache: ${data.error || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error("Error delta caching:", error)
      toast.error("Error running delta pre-cache")
    } finally {
      setDeltaCaching(false)
    }
  }
  
  // Debug group eligibility function
  const debugGroupEligibility = async () => {
    setLoadingGroupDebug(true)
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "debug-group-eligibility",
          eventId: currentEventId
        }),
      })
      
      const data = await res.json()
      
      if (res.ok && data.success) {
        setGroupDebugData(data)
        setShowGroupDebugModal(true)
      } else {
        toast.error(`Failed to debug groups: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error debugging groups:", error)
      toast.error("Error debugging group eligibility")
    } finally {
      setLoadingGroupDebug(false)
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

  // Reset Groups Function - Remove all group matches for current event
  const resetGroups = async () => {
    const confirmMessage = `⚠️ RESET GROUPS\n\nThis will permanently:\n• Delete ALL group matches for Event ${currentEventId}\n\nThis will NOT affect individual matches.\n\nAre you sure?`
    
    if (!confirm(confirmMessage)) return
    
    setLoading(true)
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "reset-groups",
          event_id: currentEventId
        }),
      })
      
      const data = await res.json()
      if (res.ok) {
        toast.success(`Groups reset completed! Removed ${data.groupsRemoved || 0} group(s) for Event ${currentEventId}.`, { duration: 4000 })
        fetchParticipants()
      } else {
        toast.error(`Reset groups failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error resetting groups:", error)
      toast.error("Error resetting groups")
    } finally {
      setLoading(false)
    }
  }

  // Clear Temporary Exclusions Function - Remove all non-permanent exclusions AND excluded pairs
  const clearTempExclusions = async () => {
    const confirmMessage = `⚠️ CLEAR TEMPORARY EXCLUSIONS & EXCLUDED PAIRS\n\nThis will permanently:\n• Remove ALL temporary exclusions (-1)\n• Remove ALL excluded pairs\n• Keep ALL permanent bans (-10)\n\nThis allows temporarily excluded participants to be matched again.\n\nAre you sure?`
    
    if (!confirm(confirmMessage)) return
    
    setLoading(true)
    try {
      // Clear temporary exclusions
      const res1 = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "clear-temp-exclusions"
        }),
      })
      
      const data1 = await res1.json()
      
      // Clear excluded pairs
      const res2 = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "clear-excluded-pairs"
        }),
      })
      
      const data2 = await res2.json()
      
      if (res1.ok && res2.ok) {
        const exclusionsRemoved = data1.exclusionsRemoved || 0
        const pairsRemoved = data2.pairsRemoved || 0
        toast.success(`Cleared ${exclusionsRemoved} temporary exclusion(s) and ${pairsRemoved} excluded pair(s). Permanent bans remain in effect.`, { duration: 4000 })
        fetchExcludedPairs() // Refresh excluded pairs list
        fetchExcludedParticipants() // Refresh excluded participants list
        fetchParticipants()
      } else {
        const errors = []
        if (!res1.ok) errors.push(`Exclusions: ${data1.error}`)
        if (!res2.ok) errors.push(`Pairs: ${data2.error}`)
        toast.error(`Clear failed: ${errors.join(', ')}`)
      }
    } catch (error) {
      console.error("Error clearing temporary exclusions and pairs:", error)
      toast.error("Error clearing temporary exclusions and pairs")
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
                onKeyPress={(e) => e.key === 'Enter' && !checkLoginLockout().locked && login()}
                disabled={checkLoginLockout().locked}
              />
            </div>

            {/* Security Status Feedback */}
            {(() => {
              const status = getLoginSecurityStatus();
              if (!status) return null;
              
              const bgColors = {
                error: 'bg-red-500/20 border-red-500/30 text-red-300',
                warning: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300',
                info: 'bg-blue-500/20 border-blue-500/30 text-blue-300'
              };
              
              const icons = {
                error: <AlertCircle className="w-4 h-4" />,
                warning: <AlertCircle className="w-4 h-4" />,
                info: <Shield className="w-4 h-4" />
              };
              
              return (
                <div className={`flex items-center gap-2 p-3 rounded-lg border ${bgColors[status.type]} text-sm`}>
                  {icons[status.type]}
                  <span>{status.message}</span>
                </div>
              );
            })()}
            
            <button
              className={`w-full py-3 rounded-xl font-medium transition-all duration-300 shadow-lg ${
                checkLoginLockout().locked
                  ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white transform hover:scale-105'
              }`}
              onClick={login}
              disabled={checkLoginLockout().locked}
            >
              {checkLoginLockout().locked ? `Locked (${checkLoginLockout().remaining}s)` : 'Access Dashboard'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${isCohost ? 'from-slate-950 via-rose-950 to-slate-950' : 'from-slate-900 via-slate-800 to-slate-900'} text-white relative overflow-hidden`}>
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute -top-40 -right-40 w-80 h-80 ${isCohost ? 'bg-rose-400/10' : 'bg-slate-500/10'} rounded-full blur-3xl animate-pulse`}></div>
        <div className={`absolute -bottom-40 -left-40 w-80 h-80 ${isCohost ? 'bg-pink-400/10' : 'bg-slate-400/10'} rounded-full blur-3xl animate-pulse delay-1000`}></div>
      </div>

      {/* Header */}
      <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-slate-600 to-slate-700 p-2 rounded-xl">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent">
                  Admin Dashboard
                </h1>
                {isCohost && (
                  <span className="px-2 py-0.5 rounded-full text-sm bg-rose-500/15 border border-rose-400/30 text-rose-200">
                    Ghady
                  </span>
                )}
              </div>
              <p className="text-slate-400/70 text-sm">Participant Management System</p>
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

      {isCohost && (
        <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10 p-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-400/30 text-rose-300 text-sm font-medium">Cohost</div>
              <div className="px-3 py-1 rounded-lg bg-slate-800/60 border border-white/10 text-slate-100 text-sm font-semibold tracking-wide">
                Ghady ❤
              </div>
              <div className="text-slate-300/90 text-sm hidden md:block">
                Focused view • Defaults: <span className="font-semibold text-slate-200">Eligible Only</span> • <span className="font-semibold text-slate-200">Female</span> • <span className="font-semibold text-slate-200">WhatsApp Not Sent</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadCachedResults}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-200 text-sm hover:bg-rose-500/30 border border-rose-400/30 transition-colors"
                title="Load cached matches (results modal)"
              >
                ❤ Load Matches
              </button>
              <button
                onClick={fetchGroupAssignments}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-200 text-sm hover:bg-rose-500/30 border border-rose-400/30 transition-colors"
                title="Show current groups"
              >
                ❤ Show Groups
              </button>
              <button
                onClick={() => { setShowEligibleOnly(true); setGenderFilter('female'); setWhatsappFilter('not_sent'); setPaymentFilter('all'); setSortBy('number'); }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700 transition-colors"
              >
                Reset Defaults
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase Control */}
      <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10 p-4" style={{ display: isCohost ? 'none' : undefined }}>
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
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 relative">
              <span className="text-slate-300 text-sm">Total: </span>
              <span className="font-bold text-white">{participants.length}</span>
              {totalChangeInfo?.show && totalChangeInfo.count > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 bg-green-500/20 border border-green-500/40 text-green-300 text-xs font-semibold px-2 py-0.5 rounded-full animate-pulse">
                  <UserPlus className="w-3 h-3" />
                  +{totalChangeInfo.count} new
                </span>
              )}
              {totalChangeInfo?.show && totalChangeInfo.count < 0 && (
                <span className="ml-2 inline-flex items-center gap-1 bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold px-2 py-0.5 rounded-full animate-pulse">
                  <Minus className="w-3 h-3" />
                  {Math.abs(totalChangeInfo.count)} removed
                </span>
              )}
            </div>
            <div className="bg-green-500/20 backdrop-blur-sm border border-green-400/30 rounded-xl px-4 py-2 relative">
              <span className="text-green-300 text-sm">Eligible: </span>
              <span className="font-bold text-green-200">{eligibleCount}</span>
              {eligibleChangeInfo?.show && eligibleChangeInfo.count > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 bg-green-500/20 border border-green-500/40 text-green-300 text-xs font-semibold px-2 py-0.5 rounded-full animate-pulse">
                  <Plus className="w-3 h-3" />
                  +{Math.abs(eligibleChangeInfo.count)}
                </span>
              )}
              {eligibleChangeInfo?.show && eligibleChangeInfo.count < 0 && (
                <span className="ml-2 inline-flex items-center gap-1 bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold px-2 py-0.5 rounded-full animate-pulse">
                  <Minus className="w-3 h-3" />
                  {Math.abs(eligibleChangeInfo.count)}
                </span>
              )}
            </div>
            <div 
              className="bg-cyan-500/20 backdrop-blur-sm border border-cyan-400/30 rounded-xl px-4 py-2 relative cursor-pointer hover:bg-cyan-500/30 transition-colors z-[1000]" 
              onMouseEnter={() => {
                if (deltaCacheCount > 0) {
                  setShowDeltaCacheTooltip(true);
                  fetchDeltaCacheParticipants();
                }
              }}
              onMouseLeave={() => setShowDeltaCacheTooltip(false)}
              title={deltaCacheCount === 0 
                ? "Delta cache only counts participants who UPDATED their survey after last cache. Use Pre-Cache for first-time caching." 
                : "Hover to see participants who updated their survey data since last cache"}
            >
              <span className="text-cyan-300 text-sm">Delta Cache: </span>
              <span className="font-bold text-cyan-200">{deltaCacheCount}</span>
              {deltaCacheCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                  <Zap className="w-3 h-3" />
                  needs update
                </span>
              )}
              
              {/* Hover Tooltip */}
              {showDeltaCacheTooltip && deltaCacheCount > 0 && (
                <div className="absolute bottom-full left-0 mb-2 bg-gray-900/95 backdrop-blur-sm border border-cyan-400/30 rounded-xl p-4 shadow-xl min-w-80 max-w-md" style={{ zIndex: 999999 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-cyan-300 font-semibold text-sm">Participants Needing Delta Cache Update</h3>
                  </div>
                  
                  {loadingDeltaCacheParticipants ? (
                    <div className="flex items-center gap-2 text-cyan-300/70 text-xs">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading participants...
                    </div>
                  ) : deltaCacheParticipants.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {deltaCacheParticipants.map((participant, index) => (
                        <div key={participant.assigned_number || index} className="flex items-center justify-between p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                          <div className="flex items-center gap-2">
                            <UserRound className="w-3 h-3 text-cyan-400" />
                            <span className="text-cyan-200 text-xs font-medium">
                              #{participant.assigned_number}
                            </span>
                            <span className="text-cyan-300/80 text-xs">
                              {participant.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-cyan-400/60 text-xs">
                              {participant.eligibility_reason}
                            </span>
                            <span className="text-cyan-500/60 text-xs">
                              {participant.survey_data_updated_at ? 
                                new Date(participant.survey_data_updated_at).toLocaleDateString() : 
                                'Recently'
                              }
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-cyan-300/70 text-xs">
                      No participants found needing updates.
                    </div>
                  )}
                  
                  <div className="mt-3 pt-2 border-t border-cyan-500/20">
                    <p className="text-cyan-400/60 text-xs">
                      These participants updated their survey data since the last cache. 
                      Use "Delta Cache" to update only these participants.
                    </p>
                  </div>
                </div>
              )}
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
                  placeholder="Search by name, number, gender... (p1234 = phone last digits)"
                  className="pl-10 pr-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/50 transition-all duration-300"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="flex items-center gap-2" style={{ display: isCohost ? 'none' : undefined }}>
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

            {/* Admin Actions - Organized in sections */}
            <div className="space-y-3" style={{ display: isCohost ? 'none' : undefined }}>
              
              {/* Section 1: Match Generation */}
              <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Match Generation</h3>
                <div className="flex items-center gap-2 flex-wrap">
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
                      
                      // Show timer reminder if advancing to round phase
                      if (data.new_phase === "round") {
                        setTimeout(() => {
                          const shouldStartTimer = confirm(
                            "⏰ REMINDER: Start Timer?\n\n" +
                            "You've advanced to Round phase.\n\n" +
                            "Don't forget to start the timer for participants!\n\n" +
                            "Click OK to start Round 1 timer now, or Cancel to start it manually later."
                          )
                          
                          if (shouldStartTimer) {
                            // Trigger the start timer function for Round 1
                            startGlobalTimer(1)
                          }
                        }, 1000)
                      }
                      
                      fetchParticipants()
                    } else {
                      toast.error("Failed to advance phase")
                    }
                    setLoading(false)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
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
                    setLoading(false)
                    
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
                      
                      alert(successMessage)
                      fetchParticipants()
                      // Show results modal with calculated pairs
                      await showParticipantResults(data.results || [], data.count || 0, "ai", data.calculatedPairs || [])
                    } else {
                      alert(`❌ Failed to generate matches:\n\n${data.error || "Unknown error"}\n\n${data.details || ''}`)
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all duration-300 text-sm"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                  Generate Matches
                </button>

                <button
                  onClick={async () => {
                    let confirmMessage = `Are you sure you want to generate matches (Opposites Attract) for Event ${currentEventId}?\n\nThis will recompute final percentages using the opposites formula while reusing cached sub-scores.`
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
                        excludedPairs: excludedPairs,
                        oppositesMode: true
                      }),
                    })
                    const data = await res.json()
                    setLoading(false)

                    if (res.ok) {
                      let successMessage = `✅ Opposites Attract generation complete.\n\nMatches created: ${data.count}\nEvent ID: ${currentEventId}`
                      if (excludedPairs.length > 0) {
                        successMessage += `\nExcluded pairs enforced: ${excludedPairs.length}`
                      }
                      if (excludedParticipants.length > 0) {
                        successMessage += `\nParticipants excluded from all matching: ${excludedParticipants.length}`
                      }

                      if (data.performance) {
                        successMessage += `\n\n⚡ Performance Metrics:`
                        successMessage += `\nTotal time: ${data.performance.totalTimeSeconds}s`
                        successMessage += `\nCache hits: ${data.performance.cacheHits} (${data.performance.cacheHitRate}%)`
                        successMessage += `\nAI calls: ${data.performance.aiCalls}`
                        successMessage += `\nAvg time per pair: ${data.performance.avgTimePerPair}ms`
                      }

                      alert(successMessage)
                      fetchParticipants()
                      await showParticipantResults(data.results || [], data.count || 0, "ai", data.calculatedPairs || [])
                    } else {
                      alert(`❌ Failed to generate opposites matches:\n\n${data.error || "Unknown error"}\n\n${data.details || ''}`)
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-fuchsia-600 to-pink-700 hover:from-fuchsia-700 hover:to-pink-800 text-white rounded-lg transition-all duration-300 text-sm"
                  title="Generate matches using the Opposites Attract formula"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                  Generate Matches (Opposites)
                </button>

                {/* Paid-Only Preview (No DB Writes, Ignore Locked) */}
                <button
                  onClick={async () => {
                    let confirmMessage = `🧪 Preview PAID-ONLY matches for Event ${currentEventId}?\n\nThis will:\n• Use only participants with PAID_DONE = true\n• Ignore ALL locked matches\n• NOT write anything to the database (no inserts, no autosave)`
                    if (excludedPairs.length > 0) {
                      confirmMessage += `\n\n⚠️ Excluded pairs WILL still be enforced (${excludedPairs.length}):\n${excludedPairs.map(p => `#${p.participant1_number} ↔ #${p.participant2_number}`).join('\n')}`
                    }
                    if (!confirm(confirmMessage)) return
                    setLoading(true)
                    try {
                      const res = await fetch("/api/admin/trigger-match", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          eventId: currentEventId,
                          preview: true,
                          paidOnly: true,
                          ignoreLocked: true,
                          excludedPairs: excludedPairs
                        }),
                      })
                      const data = await res.json()
                      setLoading(false)
                      if (res.ok) {
                        toast.success(`🧪 Preview complete. Matches: ${data.count}`, { duration: 4000 })
                        await showParticipantResults(data.results || [], data.count || 0, "ai", data.calculatedPairs || [])
                      } else {
                        toast.error("Failed to preview matches: " + (data.error || "Unknown error"))
                      }
                    } catch (e: any) {
                      setLoading(false)
                      toast.error("Failed to preview matches: " + (e?.message || "Unknown error"))
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white rounded-lg transition-all duration-300 text-sm"
                  title="Preview matches for paying participants only (no DB writes, ignore locked)"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview Paid Matches
                </button>

                {/* Pre-Cache Button with Options */}
                <div className="flex items-center gap-1.5 bg-slate-800 p-1.5 rounded-lg border border-slate-700">
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={preCacheAll}
                        onChange={(e) => setPreCacheAll(e.target.checked)}
                        className="w-3.5 h-3.5"
                      />
                      All
                    </label>
                    {!preCacheAll && (
                      <input
                        type="number"
                        value={preCacheCount}
                        onChange={(e) => setPreCacheCount(Math.max(1, parseInt(e.target.value) || 1))}
                        min="1"
                        max="5000"
                        className="w-16 px-1.5 py-1 bg-slate-700 text-white border border-slate-600 rounded text-xs"
                        placeholder="50"
                      />
                    )}
                  </div>
                  
                  <select
                    value={preCacheDirection}
                    onChange={(e) => setPreCacheDirection(e.target.value as 'forward' | 'reverse')}
                    className="px-1.5 py-1 bg-slate-700 text-white border border-slate-600 rounded text-xs"
                  >
                    <option value="forward">↓ Top→Bottom</option>
                    <option value="reverse">↑ Bottom→Top</option>
                  </select>
                  
                  <button
                    onClick={preCacheMatches}
                    disabled={preCaching || loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded transition-all duration-300 disabled:opacity-50 text-xs"
                  >
                    {preCaching ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5" />
                    )}
                    Pre-Cache
                  </button>
                  
                  {/* Delta Pre-Cache Button (Smart Incremental) */}
                  <button
                    onClick={deltaCacheMatches}
                    disabled={deltaCaching || loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white rounded-lg transition-all duration-300 disabled:opacity-50 text-sm shadow-lg"
                    title="Smart caching - only updates changed participants"
                  >
                    {deltaCaching ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    Delta Cache
                  </button>
                </div>

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
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-lg transition-all duration-300 text-sm"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Generate Groups
                  </button>
                  
                  <button
                    onClick={async () => {
                      let confirmMessage = `Generate group matches (Opposites) for Event ${currentEventId}?\n\nThis will compute group scores using the opposites formula (flipped lifestyle, vibe, humor) while keeping synergy, values, and communication positive.`
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
                          eventId: currentEventId,
                          oppositesMode: true
                        }),
                      })
                      const data = await res.json()
                      if (res.ok) {
                        toast.success(`${data.message}. Groups created: ${data.count}`, { duration: 4000 })
                        fetchParticipants()
                        // Show results modal (groups don't have calculated pairs)
                        await showParticipantResults(data.results || [], data.count || 0, "group", [])
                      } else {
                        toast.error("Failed to generate opposites group matches: " + (data.error || "Unknown error"))
                      }
                      setLoading(false)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-fuchsia-600 to-pink-700 hover:from-fuchsia-700 hover:to-pink-800 text-white rounded-lg transition-all duration-300 text-sm"
                    title="Generate group matches using the Opposites formula"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Generate Groups (Opposites)
                  </button>
                  
                  <button
                    onClick={debugGroupEligibility}
                    disabled={loadingGroupDebug}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white rounded-lg transition-all duration-300 text-sm disabled:opacity-50"
                  >
                    {loadingGroupDebug ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Bug className="w-3.5 h-3.5" />
                    )}
                    Debug Groups
                  </button>

                  <button
                    onClick={loadCachedResults}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white rounded-lg transition-all duration-300 disabled:opacity-50 text-sm"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <BarChart3 className="w-3.5 h-3.5" />
                    )}
                    Load Cached Results
                  </button>
                </div>
              </div>

              {/* Section 2: View & Manage */}
              <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">View & Manage</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={fetchGroupAssignments}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg transition-all duration-300 text-sm"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Show Groups
                  </button>

                  <button
                    onClick={openPrevUnmatchedModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all duration-300 text-sm"
                    title="Find previous event unmatched / organizer-matched participants and sign them up for next event"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    Prev Unmatched → Next Event
                  </button>

                  <button
                    onClick={openNeverInEventsModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-lg transition-all duration-300 text-sm"
                    title="Find registrants who never participated in any event and sign them up for next event"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    Never-in-Events → Next Event
                  </button>

                  <button
                    onClick={async () => {
                      if (!confirm("Sign up ALL participants with nationality filled (completed new survey fields) for next event?")) return
                      try {
                        const res = await fetch('/api/admin', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'signup-nationality-next-event' })
                        })
                        const data = await res.json()
                        if (res.ok) {
                          toast.success(`Signed up ${data.updatedCount || 0} participants for next event`)
                          fetchParticipants()
                        } else {
                          toast.error(`Failed: ${data.error || 'Unknown error'}`)
                        }
                      } catch (err) {
                        console.error('Network error:', err)
                        toast.error('Network error while signing up nationality-complete participants')
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white rounded-lg transition-all duration-300 text-sm"
                    title="Sign up all participants with nationality filled for next event"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    Nationality → Next Event
                  </button>

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
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-lg transition-all duration-300 text-sm"
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    Auto Assign Tables
                  </button>
                </div>
              </div>

              {/* Section 3: Danger Zone */}
              <div className="bg-red-900/10 p-3 rounded-lg border border-red-800/30">
                <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Danger Zone</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={cleanSlate}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg transition-all duration-300 disabled:opacity-50 text-sm"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Clean Slate
                  </button>

                  <button
                    onClick={resetGroups}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg transition-all duration-300 disabled:opacity-50 text-sm"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Users className="w-3.5 h-3.5" />
                    )}
                    Reset Groups
                  </button>

                  <button
                    onClick={clearTempExclusions}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white rounded-lg transition-all duration-300 disabled:opacity-50 text-sm"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Shield className="w-3.5 h-3.5" />
                    )}
                    Clear Temp Exclusions
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
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg transition-all duration-300 text-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Cleanup Incomplete
                  </button>

                  {/* Results Visibility Control */}
                  <button
                    onClick={toggleResultsVisibility}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-300 text-sm ${
                      resultsVisible 
                        ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white' 
                        : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white'
                    }`}
                  >
                    {resultsVisible ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Hide Results
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Show Results
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

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
        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-6" style={{ display: isCohost ? 'none' : undefined }}>
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
        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-6" style={{ display: isCohost ? 'none' : undefined }}>
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
                        <div className="flex flex-col">
                          <span className={`text-sm font-medium ${participant.is_banned ? "text-red-200" : "text-white"}`}>
                            #{participant.participant_number} - {participant.participant_name || `المشارك #${participant.participant_number}`}
                          </span>
                          <span className="text-xs text-slate-400">
                            {participant.is_banned ? "PERMANENTLY BANNED from all matching" : "Excluded from ALL matching"}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeExcludedParticipant(participant.id)}
                        className={`transition-colors ${
                          participant.is_banned 
                            ? "text-red-400 hover:text-red-300" 
                            : "text-orange-400 hover:text-orange-300"
                        }`}
                        title="Remove exclusion and all associated excluded pairs"
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
        <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-6" style={{ display: isCohost ? 'none' : undefined }}>
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
                disabled={!newManualMatch.participant1 || (!showAllMatches && !newManualMatch.participant2) || viewAllMatchesLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ${
                  showAllMatches
                    ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white'
                    : testModeOnly 
                    ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white'
                }`}
              >
                {viewAllMatchesLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : showAllMatches ? (
                  <>
                    <Eye className="w-4 h-4" />
                    View All Matches
                  </>
                ) : testModeOnly ? (
                  <>
                    <Users className="w-4 h-4" />
                    Test Compatibility
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    Create Match
                  </>
                )}
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
            
            {/* Test Mode Only Checkbox */}
            <div className="flex items-center gap-3 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={testModeOnly}
                  onChange={(e) => setTestModeOnly(e.target.checked)}
                  className="w-4 h-4 text-cyan-500 bg-white/10 border-white/20 rounded focus:ring-cyan-400/50 focus:ring-2"
                />
                <span className={`text-sm font-medium transition-colors ${
                  testModeOnly ? 'text-cyan-300' : 'text-slate-400'
                }`}>
                  🧪 Test Mode Only
                </span>
              </label>
            </div>
            
            {/* Show All Matches Checkbox */}
            <div className="flex items-center gap-3 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllMatches}
                  onChange={(e) => setShowAllMatches(e.target.checked)}
                  className="w-4 h-4 text-purple-500 bg-white/10 border-white/20 rounded focus:ring-purple-400/50 focus:ring-2"
                />
                <span className={`text-sm font-medium transition-colors ${
                  showAllMatches ? 'text-purple-300' : 'text-slate-400'
                }`}>
                  👁️ Show All Possible Matches
                </span>
              </label>
            </div>
            <div className="text-slate-400 text-xs space-y-1">
              {showAllMatches ? (
                <>
                  <p>• View all possible matches for a single participant</p>
                  <p>• Shows compatibility scores with gender-compatible participants only</p>
                  <p>• Respects gender preferences (opposite/same/any gender)</p>
                  <p>• Results sorted by compatibility (just like clicking عرض in results modal)</p>
                  <p>• Respects eligibility bypass setting if enabled</p>
                </>
              ) : testModeOnly ? (
                <>
                  <p>• Calculates compatibility scores without saving to database</p>
                  <p>• Ignores compatibility cache for fresh calculations</p>
                  <p>• Does not check for or affect existing matches</p>
                  <p>• Perfect for testing algorithm changes or participant compatibility</p>
                </>
              ) : (
                <>
                  <p>• Creates a match with real compatibility scores based on participant data</p>
                  <p>• Match will appear in results as if generated by the algorithm</p>
                  <p>• Automatically cleans up conflicting matches</p>
                </>
              )}
              <p>• Uses Event ID: <span className="text-blue-300 font-mono">{currentEventId}</span></p>
              {showAllMatches && (
                <p className="text-purple-300 font-medium">👁️ View mode enabled - will display ALL possible matches without creating any matches</p>
              )}
              {bypassEligibility && (
                <p className="text-orange-300 font-medium">⚠️ Eligibility bypass enabled - will {showAllMatches ? 'search' : 'match'} ANY participants regardless of survey completion, exclusions, or payment status</p>
              )}
              {testModeOnly && !showAllMatches && (
                <p className="text-cyan-300 font-medium">🧪 Test mode enabled - will calculate compatibility but NOT save to database or affect existing matches</p>
              )}
            </div>
          </div>
        </div>

      {/* Control Panel */}
      <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10" style={{ display: isCohost ? 'none' : undefined }}>
        <div className={`max-w-6xl mx-auto ${isCohost ? 'p-4 md:p-6' : 'p-6'}`}>
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

                <button
                  onClick={exportIndividualMatchesCSV}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white rounded-lg transition-all duration-300 text-sm disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Export Matches CSV
                </button>

                <button
                  onClick={exportGroupTablesCSV}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white rounded-lg transition-all duration-300 text-sm disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Export Groups CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Participants Section */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <div className="max-w-6xl mx-auto p-6">
          {/* Participants List (hide rounds for co-host) */}
          {!isCohost && (
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
          )}

          {/* Statistics Display */}
          {isCohost ? (
            (() => {
              const girls = participants.filter(p => (p.gender || p.survey_data?.gender) === 'female');
              const girlsRegistered = girls.length;
              const girlsEligible = girls.filter(p => p.event_id === currentEventId || p.signup_for_next_event === true).length;
              const girlsMessaged = girls.filter(p => p.PAID === true).length;
              const girlsPaid = girls.filter(p => p.PAID_DONE === true).length;

              return (
                <div className="mt-4 p-4 rounded-xl border border-white/20 bg-white/5">
                  <h3 className="text-white font-semibold mb-3">Girls Overview</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-rose-300">{girlsRegistered}</p>
                      <p className="text-slate-400 text-sm">Registered</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-pink-300">{girlsEligible}</p>
                      <p className="text-slate-400 text-sm">Eligible</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-300">{girlsMessaged}</p>
                      <p className="text-slate-400 text-sm">Messaged</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-emerald-300">{girlsPaid}</p>
                      <p className="text-slate-400 text-sm">Paid</p>
                    </div>
                  </div>
                </div>
              )
            })()
          ) : (
            participantStats && (
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
            )
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
                {!isCohost && (
                  <button
                    onClick={clearAnnouncement}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Co-host Mobile Filters (compact) */}
        {isCohost && (
          <div className="md:hidden sticky top-0 z-20 bg-white/5 backdrop-blur-xl backdrop-saturate-150 border border-white/20 rounded-2xl p-3 mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEligibleOnly(!showEligibleOnly)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${showEligibleOnly ? 'bg-green-500/20 border-green-400/50 text-green-300' : 'bg-white/10 border-white/20 text-slate-300'}`}
              >
                <Filter className="w-4 h-4" />
                Eligible
              </button>
              {/* Nationality subfilters (co-host mobile) */}
              <button
                onClick={() => setEligibleSubFilter(prev => prev === 'withNationality' ? 'none' : 'withNationality')}
                className={`px-3 py-2 rounded-xl border text-sm transition-all ${eligibleSubFilter === 'withNationality' ? 'bg-blue-500/20 border-blue-400/50 text-blue-300' : 'bg-white/10 border-white/20 text-slate-300'}`}
                title="Eligible + Nationality filled"
              >
                Nat ✓
              </button>
              <button
                onClick={() => setEligibleSubFilter(prev => prev === 'withoutNationality' ? 'none' : 'withoutNationality')}
                className={`px-3 py-2 rounded-xl border text-sm transition-all ${eligibleSubFilter === 'withoutNationality' ? 'bg-amber-500/20 border-amber-400/50 text-amber-300' : 'bg-white/10 border-white/20 text-slate-300'}`}
                title="Eligible + No nationality"
              >
                Nat ✗
              </button>
              <div className="flex-1 relative">
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="w-full appearance-none bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-2 pr-8 text-white text-sm focus:outline-none"
                >
                  <option value="all" className="bg-slate-800 text-white">Payment</option>
                  <option value="paid" className="bg-slate-800 text-white">Awaiting</option>
                  <option value="unpaid" className="bg-slate-800 text-white">Not Contacted</option>
                  <option value="done" className="bg-slate-800 text-white">Done</option>
                </select>
                <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              <div className="flex-1 relative">
                <select
                  value={whatsappFilter}
                  onChange={(e) => setWhatsappFilter(e.target.value)}
                  className="w-full appearance-none bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-2 pr-8 text-white text-sm focus:outline-none"
                >
                  <option value="all" className="bg-slate-800 text-white">WhatsApp</option>
                  <option value="sent" className="bg-slate-800 text-white">Sent</option>
                  <option value="not_sent" className="bg-slate-800 text-white">Not Sent</option>
                </select>
                <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        )}

        {/* Filter Controls */}
        <div className={`${isCohost ? 'hidden md:block ' : ''}bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-4 mb-4`}>
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
            {/* Nationality subfilters (main filter bar) */}
            <button
              onClick={() => setEligibleSubFilter(prev => prev === 'withNationality' ? 'none' : 'withNationality')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300 ${eligibleSubFilter === 'withNationality' ? 'bg-blue-500/20 border-blue-400/50 text-blue-300' : 'bg-white/10 border-white/20 text-slate-300 hover:bg-white/20'}`}
              title="Eligible + Nationality filled"
            >
              <span className="text-sm font-medium">Nat ✓</span>
            </button>
            <button
              onClick={() => setEligibleSubFilter(prev => prev === 'withoutNationality' ? 'none' : 'withoutNationality')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300 ${eligibleSubFilter === 'withoutNationality' ? 'bg-amber-500/20 border-amber-400/50 text-amber-300' : 'bg-white/10 border-white/20 text-slate-300 hover:bg-white/20'}`}
              title="Eligible + No nationality"
            >
              <span className="text-sm font-medium">Nat ✗</span>
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

            {/* Sort By Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none bg-blue-500/10 backdrop-blur-sm border border-blue-400/30 rounded-xl px-4 py-2 pr-8 text-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all duration-300"
              >
                <option value="number" className="bg-slate-800 text-white">Sort by Number</option>
                <option value="name" className="bg-slate-800 text-white">Sort by Name</option>
                <option value="updated" className="bg-slate-800 text-white">Sort by Last Update</option>
                <option value="survey_updated" className="bg-slate-800 text-white">Sort by Survey Update</option>
              </select>
              <ChevronRight className="absolute right-2 top-1/2 transform -translate-y-1/2 rotate-90 w-4 h-4 text-blue-400 pointer-events-none" />
            </div>

            {/* Filter Results Count */}
            {(showEligibleOnly || eligibleSubFilter !== "none" || genderFilter !== "all" || paymentFilter !== "all" || whatsappFilter !== "all") && (
              <div className="bg-green-500/20 backdrop-blur-sm border border-green-400/30 rounded-xl px-3 py-2">
                <span className="text-green-300 text-sm">Filtered: </span>
                <span className="font-bold text-green-200">{filteredParticipants.length}</span>
              </div>
            )}

            {/* Select All Visible Button */}
            {filteredParticipants.length > 0 && (
              <button
                onClick={() => {
                  const allVisibleNumbers = new Set(filteredParticipants.map(p => p.assigned_number))
                  const areAllSelected = filteredParticipants.every(p => selectedParticipants.has(p.assigned_number))
                  
                  if (areAllSelected) {
                    // Deselect all visible
                    const newSelected = new Set(selectedParticipants)
                    filteredParticipants.forEach(p => newSelected.delete(p.assigned_number))
                    setSelectedParticipants(newSelected)
                  } else {
                    // Select all visible
                    const newSelected = new Set(selectedParticipants)
                    filteredParticipants.forEach(p => newSelected.add(p.assigned_number))
                    setSelectedParticipants(newSelected)
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 ${
                  filteredParticipants.every(p => selectedParticipants.has(p.assigned_number))
                    ? 'bg-purple-500/20 border-purple-400/50 text-purple-300 hover:bg-purple-500/30'
                    : 'bg-white/10 border-white/20 text-slate-300 hover:bg-white/20'
                }`}
              >
                {filteredParticipants.every(p => selectedParticipants.has(p.assigned_number)) ? (
                  <>
                    <CheckSquare className="w-4 h-4" />
                    <span className="text-sm font-medium">Deselect All ({filteredParticipants.length})</span>
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4" />
                    <span className="text-sm font-medium">Select All Visible ({filteredParticipants.length})</span>
                  </>
                )}
              </button>
            )}

            {/* Export Template Selection */}
            {selectedParticipants.size > 0 && (
              <>
                <div className="relative">
                  <select
                    value={exportTemplateType}
                    onChange={(e) => setExportTemplateType(e.target.value as 'match' | 'early-match' | 'payment-reminder' | 'reminder' | 'survey-completion')}
                    className="appearance-none bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 pr-8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all duration-300"
                  >
                    <option value="match" className="bg-slate-800 text-white">Match Notification</option>
                    <option value="early-match" className="bg-slate-800 text-white">Early Match Notification</option>
                    <option value="payment-reminder" className="bg-slate-800 text-white">Payment Reminder</option>
                    <option value="reminder" className="bg-slate-800 text-white">Event Reminder</option>
                    <option value="survey-completion" className="bg-slate-800 text-white">Survey Completion (إكمال الاستبيان)</option>
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
          <>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${isCohost ? 'gap-6 md:gap-4' : 'gap-4'}`}>
            {visibleParticipants.map((p) => {
              // Determine color-coded border based on status - PRIORITY SYSTEM
              const isExcluded = excludedParticipants.some(ep => ep.participant_number === p.assigned_number);
              const isPaid = p.PAID_DONE === true;
              const isUnpaid = p.PAID === true && !isPaid;
              const isCurrentEvent = p.event_id === currentEventId;
              const isNextEvent = p.signup_for_next_event === true || p.auto_signup_next_event === true;
              
              let borderColor = 'border-white/20'; // Default
              let borderGlow = '';
              
              // Priority order: Excluded > Paid > Unpaid > Current Event > Next Event > Past Event
              if (isExcluded) {
                // Highest priority: Excluded participants
                borderColor = 'border-red-500/50';
                borderGlow = 'shadow-lg shadow-red-500/20';
              } else if (isPaid) {
                // Payment completed (regardless of event)
                borderColor = 'border-green-500/50';
                borderGlow = 'shadow-lg shadow-green-500/20';
              } else if (isUnpaid) {
                // Awaiting payment (regardless of event)
                borderColor = 'border-yellow-500/50';
                borderGlow = 'shadow-lg shadow-yellow-500/20';
              } else if (isCurrentEvent) {
                // Current event but not contacted
                borderColor = 'border-orange-500/50';
                borderGlow = 'shadow-lg shadow-orange-500/20';
              } else if (isNextEvent) {
                // Signed up for next event
                borderColor = 'border-blue-500/50';
                borderGlow = 'shadow-lg shadow-blue-500/20';
              } else if (p.event_id && p.event_id !== currentEventId) {
                // Past event participants
                borderColor = 'border-purple-500/50';
                borderGlow = 'shadow-lg shadow-purple-500/20';
              }
              
              return (
                <div
                  key={p.id}
                  data-participant={p.assigned_number}
                  className={
                    isCohost
                      ? `group relative bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-2xl md:backdrop-blur-xl border-4 rounded-3xl p-4 md:p-6 hover:bg-white/10 transition-all duration-300 cursor-pointer hover:rotate-1 hover:-translate-y-0.5 shadow-xl md:shadow-md ${
                          p.PAID_DONE
                            ? 'border-emerald-400/60 shadow-lg shadow-emerald-500/20'
                            : (p.PAID
                                ? 'border-yellow-400/60 shadow-lg shadow-yellow-500/20'
                                : 'border-rose-300/30 shadow-md shadow-rose-300/10')
                        } ${
                          selectedParticipants.has(p.assigned_number) ? 'ring-4 ring-rose-400 bg-rose-400/10' : ''
                        }`
                      : `group relative bg-white/5 backdrop-blur-xl border-2 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 cursor-pointer transform hover:scale-105 ${borderColor} ${borderGlow} ${
                          selectedParticipants.has(p.assigned_number) ? 'ring-2 ring-slate-400 bg-slate-400/10' : ''
                        }`
                  }
                  onClick={() => {
                    setProfileModalParticipant(p);
                    setShowProfileModal(true);
                  }}
                >
                {/* Top-right Exclude Button (Both admin and co-host) */}
                <div className="absolute top-3 right-3 md:top-2 md:right-2 z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleParticipantExclusion(p.assigned_number, p.name || `#${p.assigned_number}`);
                    }}
                    className={`rounded-full p-3 md:p-2 backdrop-blur border transition-all duration-200 active:scale-95 shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-white/30 ${
                      isExcluded
                        ? (isCohost
                            ? 'bg-rose-500/20 border-rose-400/50 text-rose-100 hover:bg-rose-500/30'
                            : 'bg-orange-500/15 border-orange-400/40 text-orange-200 hover:bg-orange-500/25 hover:shadow-orange-500/30')
                        : (isCohost
                            ? 'bg-rose-400/15 border-rose-300/40 text-rose-100 hover:bg-rose-400/25'
                            : 'bg-red-500/15 border-red-400/40 text-red-200 hover:bg-red-500/25 hover:shadow-red-500/30')
                    }`}
                    title={isExcluded ? 'Remove from exclusion list' : 'Exclude from all matching'}
                    aria-label={isExcluded ? 'Unexclude participant' : 'Exclude participant'}
                  >
                    {isExcluded ? (
                      <Shield className="w-5 h-5 md:w-4 md:h-4" />
                    ) : (
                      <Ban className="w-5 h-5 md:w-4 md:h-4" />
                    )}
                  </button>
                </div>
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-gradient-to-r from-slate-600 to-slate-700 p-3 rounded-xl">
                    <UserRound className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    {!isCohost && (
                      <button
                        onClick={(e) => { 
                          e.stopPropagation();
                          setQrParticipant(p);
                          setDetailParticipant(p);
                        }}
                        className="p-3 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 hover:text-blue-300 transition-all duration-200 active:scale-95 touch-manipulation"
                        aria-label="Show QR Code"
                        title="Show QR Code"
                      >
                        <QrCode className="w-5 h-5" />
                      </button>
                    )}
                    {!isCohost && (
                      <button
                        onClick={(e) => { 
                          e.stopPropagation();
                          setWhatsappParticipant(p); 
                          setShowWhatsappModal(true); 
                        }}
                        className="p-3 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 hover:text-green-300 transition-all duration-200 active:scale-95 touch-manipulation flex items-center gap-2"
                        aria-label="Send WhatsApp message"
                        title="Send WhatsApp message"
                      >
                        <MessageSquare className="w-5 h-5" />
                      </button>
                    )}
                    {!isCohost && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleParticipantSelection(p.assigned_number)
                        }}
                        className="text-slate-400 hover:text-white transition-colors"
                        title="Select participant"
                      >
                        {selectedParticipants.has(p.assigned_number) ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="text-center">
                    <div className={`${isCohost ? 'text-3xl md:text-2xl' : 'text-2xl'} font-bold text-white`}>#{p.assigned_number}</div>
                    
                    {/* Participant Name - Make it POP! */}
                    {p.name && (
                      <div className="mt-2 mb-3">
                        <div className={`${isCohost ? 'bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-400/30' : 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30'} rounded-lg px-3 py-2 backdrop-blur-sm`}> 
                          <div className={`${isCohost ? 'text-xl md:text-lg' : 'text-lg'} font-bold ${isCohost ? 'bg-gradient-to-r from-rose-300 to-pink-300' : 'bg-gradient-to-r from-cyan-300 to-blue-300'} bg-clip-text text-transparent`}>
                            {p.name}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Co-host Mobile: status pill under name */}
                    {isCohost && (
                      <div className="md:hidden mt-1">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${
                          p.PAID_DONE
                            ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
                            : (p.PAID
                                ? 'bg-yellow-500/15 text-yellow-200 border-yellow-400/30'
                                : 'bg-gray-500/15 text-gray-200 border-gray-400/30')
                        }`}>
                          {p.PAID_DONE ? 'Paid' : (p.PAID ? 'Pending' : 'Not Sent')}
                        </span>
                      </div>
                    )}

                    {/* Co-host centered actions */}
                    {isCohost && (
                      <div className={`mt-2 pt-3 border-t border-white/10 ${isCohost ? 'bg-white/5 rounded-2xl p-3 md:p-0' : ''}`}> 
                        <div className="hidden md:block text-xs text-slate-400 mb-2 font-semibold text-center">Quick Actions</div>
                        <div className="flex flex-col items-center gap-3 md:gap-2">
                          {/* Message sent toggle */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMessageSentStatus(p.assigned_number, p.PAID);
                            }}
                            disabled={updatingStatus?.participantNumber === p.assigned_number && updatingStatus?.type === 'message'}
                            className={`w-full max-w-[280px] justify-center px-5 py-3 md:px-4 md:py-2 rounded-xl border text-base md:text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-60 ${
                              p.PAID
                                ? 'bg-green-500/15 text-green-200 border-green-400/40 hover:bg-green-500/25'
                                : 'bg-red-500/15 text-red-200 border-red-400/40 hover:bg-red-500/25'
                            }`}
                            title={`Click to ${p.PAID ? 'mark as not sent' : 'mark as sent'}`}
                          >
                            {updatingStatus?.participantNumber === p.assigned_number && updatingStatus?.type === 'message' ? (
                              <span className="flex items-center gap-2 justify-center">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Updating...</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-2 justify-center">
                                <Phone className="w-5 h-5 md:w-4 md:h-4" />
                                <span>{p.PAID ? 'Message: Sent' : 'Message: Not Sent'}</span>
                              </span>
                            )}
                          </button>

                          {/* Payment status toggle */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePaymentStatus(p.assigned_number, p.PAID_DONE);
                            }}
                            disabled={updatingStatus?.participantNumber === p.assigned_number && updatingStatus?.type === 'payment'}
                            className={`w-full max-w-[280px] justify-center px-5 py-3 md:px-4 md:py-2 rounded-xl border text-base md:text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-60 ${
                              p.PAID_DONE
                                ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/25'
                                : (p.PAID
                                    ? 'bg-yellow-500/15 text-yellow-200 border-yellow-400/40 hover:bg-yellow-500/25'
                                    : 'bg-gray-500/15 text-gray-200 border-gray-400/40 hover:bg-gray-500/25')
                            }`}
                            title={`Click to ${p.PAID_DONE ? 'mark as unpaid' : 'mark as paid'}`}
                          >
                            {updatingStatus?.participantNumber === p.assigned_number && updatingStatus?.type === 'payment' ? (
                              <span className="flex items-center gap-2 justify-center">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Updating...</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-2 justify-center">
                                <CreditCard className="w-5 h-5 md:w-4 md:h-4" />
                                <span>{p.PAID_DONE ? 'Payment: Paid' : (p.PAID ? 'Payment: Pending' : 'Payment: No Contact')}</span>
                              </span>
                            )}
                          </button>

                          {/* Open WhatsApp modal */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setWhatsappParticipant(p);
                              setShowWhatsappModal(true);
                            }}
                            className="w-full max-w-[280px] justify-center px-5 py-3 md:px-4 md:py-2 rounded-xl border text-base md:text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-95 bg-green-500/10 text-green-200 border-green-400/30 hover:bg-green-500/20"
                            title="Send WhatsApp message"
                          >
                            <span className="flex items-center gap-2 justify-center">
                              <MessageSquare className="w-5 h-5 md:w-4 md:h-4" />
                              <span>Send WhatsApp</span>
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Registration Time (created_at) */}
                    {!isCohost && p.created_at && (() => {
                      const createdAt = new Date(p.created_at);
                      // Cutoff: Nov 14, 2025 3:00 PM Riyadh time
                      const cutoffDate = new Date('2025-11-14T15:00:00+03:00');
                      const isLate = createdAt.getTime() > cutoffDate.getTime();

                      const dateTimeStr = createdAt.toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                        timeZone: 'Asia/Riyadh'
                      });

                      return (
                        <div className={`text-xs mb-2 flex items-center justify-center gap-1 font-medium ${isLate ? 'text-orange-400' : 'text-blue-400'}`}>
                          <Calendar className="w-3 h-3" />
                          <span>{dateTimeStr}</span>
                          {isLate && (
                            <span className="ml-1 px-1.5 py-0.5 bg-orange-500/20 text-orange-300 rounded text-[10px] font-bold border border-orange-400/30">
                              LATE
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    
                    {/* Next Event Signup Time */}
                    {!isCohost && p.next_event_signup_timestamp && (() => {
                      const signedAt = new Date(p.next_event_signup_timestamp);
                      // Cutoff: Nov 14, 2025 3:00 PM Riyadh time
                      const cutoffDate = new Date('2025-11-14T15:00:00+03:00');
                      const isLate = signedAt.getTime() > cutoffDate.getTime();

                      const dateTimeStr = signedAt.toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                        timeZone: 'Asia/Riyadh'
                      });

                      return (
                        <div className={`text-xs mb-2 flex items-center justify-center gap-1 font-medium ${isLate ? 'text-orange-400' : 'text-green-400'}`}>
                          <CalendarCheck className="w-3 h-3" />
                          <span>Next: {dateTimeStr}</span>
                          {isLate && (
                            <span className="ml-1 px-1.5 py-0.5 bg-orange-500/20 text-orange-300 rounded text-[10px] font-bold border border-orange-400/30">
                              LATE
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    
                    {/* Last Update Time (Relative) */}
                    {!isCohost && p.updated_at && (() => {
                      const updatedAt = new Date(p.updated_at);
                      const diffMs = Date.now() - updatedAt.getTime();
                      const diffMins = Math.floor(diffMs / 60000);
                      const diffHours = Math.floor(diffMs / 3600000);
                      const diffDays = Math.floor(diffMs / 86400000);

                      // Determine if updated within 24 hours
                      const isRecent = diffHours < 24;
                      const colorClass = isRecent ? 'text-green-400' : 'text-slate-500';
                      const iconColorClass = isRecent ? 'text-green-400' : '';

                      let timeText = '';
                      if (diffMins < 1) timeText = 'Just now';
                      else if (diffMins < 60) timeText = `${diffMins}m ago`;
                      else if (diffHours < 24) timeText = `${diffHours}h ago`;
                      else if (diffDays === 1) timeText = '1d ago';
                      else if (diffDays < 30) timeText = `${diffDays}d ago`;
                      else {
                        timeText = updatedAt.toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          timeZone: 'Asia/Riyadh'
                        });
                      }

                      return (
                        <div className={`text-xs ${colorClass} mb-2 flex items-center justify-center gap-1 font-medium`}>
                          <Clock className={`w-3 h-3 ${iconColorClass}`} />
                          {timeText}
                        </div>
                      );
                    })()}
                    
                    {!isCohost && (
                      <div className="flex items-center justify-center gap-1 text-slate-400 text-sm mb-2">
                        <Table2 className="w-4 h-4" />
                        {p.table_number ?? "Unassigned"}
                      </div>
                    )}
                    {/* Admin-only: Participant Token (copyable) */}
                    {!isCohost && (
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-slate-400 text-xs">Token:</span>
                        {p.secure_token ? (
                          <div onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(p.secure_token); toast.success('Token copied'); }} className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1 border border-white/10 cursor-pointer hover:bg-white/10 active:bg-white/20" title="Copy token" aria-label="Copy token" role="button">
                            <code className="text-[11px] text-slate-200 tracking-wide">{p.secure_token}</code>
                            <button
                              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(p.secure_token); toast.success('Token copied'); }}
                              className="p-1 rounded-md hover:bg-white/10 text-slate-300"
                              title="Copy token"
                              aria-label="Copy token"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const res = await fetch('/api/participant', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'create-token', assigned_number: p.assigned_number })
                                });
                                const data = await res.json();
                                if (data.secure_token) {
                                  toast.success('Token generated');
                                  fetchParticipants();
                                } else {
                                  toast.error(data.error || 'Failed to generate token');
                                }
                              } catch (err) {
                                console.error('Error generating token', err);
                                toast.error('Failed to generate token');
                              }
                            }}
                            className="text-xs px-2 py-1 rounded-lg border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10 transition-colors"
                            title="Generate token"
                          >
                            Generate Token
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* Eligibility Badges */}
                    {!isCohost && (
                    <div className="flex flex-wrap items-center justify-center gap-1 mb-2">
                      {excludedParticipants.some(ep => ep.participant_number === p.assigned_number) && (
                        <span className="px-2 py-1 text-xs bg-red-500/20 text-red-300 rounded-full border border-red-400/30 font-semibold animate-pulse">
                          🚫 Excluded
                        </span>
                      )}
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
                      {p.auto_signup_next_event && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm('Remove auto signup for next event?')) {
                              try {
                                const res = await fetch('/api/admin', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    action: 'toggle-auto-signup',
                                    assigned_number: p.assigned_number,
                                    auto_signup: false
                                  })
                                });
                                const data = await res.json();
                                if (data.success) {
                                  toast.success('Auto signup removed');
                                  fetchParticipants();
                                } else {
                                  toast.error(data.error || 'Failed to update');
                                }
                              } catch (error) {
                                console.error('Error updating auto signup:', error);
                                toast.error('Failed to update auto signup');
                              }
                            }
                          }}
                          className="px-2 py-1 text-xs bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-400/30 hover:bg-cyan-500/30 transition-all duration-200 hover:scale-105 active:scale-95"
                          title="Click to remove auto signup"
                        >
                          Auto Signup
                        </button>
                      )}
                    </div>
                    )}

                    {/* Payment and WhatsApp Status Badges */}
                    {!isCohost && (
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
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Updating...</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span>{p.PAID ? 'Sent' : 'Not Sent'}</span>
                          </span>
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
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Updating...</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3" />
                            <span>{p.PAID_DONE ? 'Paid' : (p.PAID ? 'Pending' : 'No Contact')}</span>
                          </span>
                        )}
                      </button>
                    </div>
                    )}

                    {/* Gender Preference Selector (hide on co-host mobile) */}
                    <div className={`mt-3 pt-3 border-t border-white/10 ${isCohost ? 'hidden md:block' : ''}`}>
                      {(() => {
                        // Compute current preference for quick visibility (normalized)
                        const rawPref = p.survey_data?.answers?.gender_preference as string | undefined
                        const dbSame = !!p.same_gender_preference
                        const dbAny = !!p.any_gender_preference
                        let normalized: 'opposite_gender' | 'same_gender' | 'any_gender' | undefined
                        if (rawPref === 'opposite_gender' || rawPref === 'same_gender' || rawPref === 'any_gender') {
                          normalized = rawPref
                        } else if (rawPref === 'any') {
                          normalized = 'any_gender'
                        } else if (rawPref === 'male' || rawPref === 'female') {
                          const myGender = (p.gender || p.survey_data?.gender) as 'male' | 'female' | undefined
                          if (myGender && rawPref === myGender) normalized = 'same_gender'
                          else normalized = 'opposite_gender'
                        }
                        if (!normalized) normalized = dbAny ? 'any_gender' : (dbSame ? 'same_gender' : 'opposite_gender')

                        const labelText = normalized === 'any_gender' ? 'Any' : (normalized === 'same_gender' ? 'Same' : 'Opposite')
                        const color = normalized === 'any_gender' ? 'text-purple-300' : (normalized === 'same_gender' ? 'text-pink-300' : 'text-blue-300')

                        return (
                          <div className="text-xs text-slate-400 mb-2 font-semibold text-center">
                            Gender Preference: <span className={`ml-1 inline-flex items-center gap-1 ${color}`}>
                              {normalized === 'any_gender' && <Shuffle className="w-3 h-3" />}
                              {normalized === 'same_gender' && <Users className="w-3 h-3" />}
                              {normalized === 'opposite_gender' && <ArrowLeftRight className="w-3 h-3" />}
                              {labelText}
                            </span>
                          </div>
                        )
                      })()}
                      {updatingGenderPref === p.assigned_number ? (
                        <div className="flex items-center justify-center gap-2 text-purple-400 text-xs">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Updating...
                        </div>
                      ) : (() => {
                        // Determine current gender preference (normalize new schema values)
                        const rawPref = p.survey_data?.answers?.gender_preference as string | undefined;
                        let storedPref: 'opposite_gender' | 'same_gender' | 'any_gender' | undefined;
                        if (rawPref === 'opposite_gender' || rawPref === 'same_gender' || rawPref === 'any_gender') {
                          storedPref = rawPref;
                        } else if (rawPref === 'any') {
                          storedPref = 'any_gender';
                        } else if (rawPref === 'male' || rawPref === 'female') {
                          const myGender = (p.gender || p.survey_data?.gender) as 'male' | 'female' | undefined;
                          if (myGender && rawPref === myGender) storedPref = 'same_gender';
                          else storedPref = 'opposite_gender';
                        }

                        const sameGenderPref = !!p.same_gender_preference || storedPref === 'same_gender';
                        const anyGenderPref = !!p.any_gender_preference || storedPref === 'any_gender';

                        let currentPref: 'opposite_gender' | 'same_gender' | 'any_gender' = storedPref || 'opposite_gender';
                        if (!storedPref) {
                          currentPref = anyGenderPref ? 'any_gender' : (sameGenderPref ? 'same_gender' : 'opposite_gender');
                        }

                        return (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateGenderPreference(p.assigned_number, 'opposite_gender');
                              }}
                              className={`px-2 py-1 text-xs rounded-lg border transition-all duration-200 hover:scale-105 active:scale-95 ${
                                currentPref === 'opposite_gender'
                                  ? 'bg-blue-500/30 text-blue-200 border-blue-400/50 font-semibold'
                                  : 'bg-blue-500/10 text-blue-300 border-blue-400/20 hover:bg-blue-500/20'
                              }`}
                              title="Match with opposite gender only"
                            >
                              <span className="inline-flex items-center gap-2">
                                <ArrowLeftRight className="w-4 h-4" />
                                <span>Opposite Gender {currentPref === 'opposite_gender' ? '(Selected)' : ''}</span>
                              </span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateGenderPreference(p.assigned_number, 'same_gender');
                              }}
                              className={`px-2 py-1 text-xs rounded-lg border transition-all duration-200 hover:scale-105 active:scale-95 ${
                                currentPref === 'same_gender'
                                  ? 'bg-pink-500/30 text-pink-200 border-pink-400/50 font-semibold'
                                  : 'bg-pink-500/10 text-pink-300 border-pink-400/20 hover:bg-pink-500/20'
                              }`}
                              title="Match with same gender only"
                            >
                              <span className="inline-flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                <span>Same Gender {currentPref === 'same_gender' ? '(Selected)' : ''}</span>
                              </span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateGenderPreference(p.assigned_number, 'any_gender');
                              }}
                              className={`px-2 py-1 text-xs rounded-lg border transition-all duration-200 hover:scale-105 active:scale-95 ${
                                currentPref === 'any_gender'
                                  ? 'bg-purple-500/30 text-purple-200 border-purple-400/50 font-semibold'
                                  : 'bg-purple-500/10 text-purple-300 border-purple-400/20 hover:bg-purple-500/20'
                              }`}
                              title="Match with any gender"
                            >
                              <span className="inline-flex items-center gap-2">
                                <Shuffle className="w-4 h-4" />
                                <span>Any Gender {currentPref === 'any_gender' ? '(Selected)' : ''}</span>
                              </span>
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Load Match History Button (hide on co-host mobile) */}
                    {!participantMatchHistory[p.assigned_number] && !loadingMatchHistory[p.assigned_number] && (
                      <div className={`mt-3 pt-3 border-t border-white/10 ${isCohost ? 'hidden md:block' : ''}`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchParticipantMatchHistory(p.assigned_number);
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-300 text-xs"
                        >
                          <Clock className="w-3 h-3" />
                          Load Match History
                        </button>
                      </div>
                    )}

                    {/* Loading State (hide on co-host mobile) */}
                    {loadingMatchHistory[p.assigned_number] && (
                      <div className={`mt-3 pt-3 border-t border-white/10 ${isCohost ? 'hidden md:block' : ''}`}>
                        <div className="flex items-center justify-center gap-2 text-blue-400 text-xs">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Loading history...
                        </div>
                      </div>
                    )}

                    {/* Previous Match History (hide on co-host mobile) */}
                    {participantMatchHistory[p.assigned_number] && participantMatchHistory[p.assigned_number].length > 0 && (
                      <div className={`mt-3 pt-3 border-t border-white/10 ${isCohost ? 'hidden md:block' : ''}`}>
                        <div className="text-xs text-slate-400 mb-2 font-semibold">Previous Matches:</div>
                        <div className="space-y-1">
                          {participantMatchHistory[p.assigned_number].slice(0, 5).map((match: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-xs bg-white/5 rounded px-2 py-1">
                              <div className="flex items-center gap-1">
                                <span className="text-cyan-400">#{match.partner_number}</span>
                                <span className="text-slate-400">{match.partner_name}</span>
                              </div>
                              {match.event_id && match.event_id !== currentEventId && (
                                <span className="text-xs text-purple-400">E{match.event_id}</span>
                              )}
                            </div>
                          ))}
                          {participantMatchHistory[p.assigned_number].length > 5 && (
                            <div className="text-xs text-slate-500 text-center">
                              +{participantMatchHistory[p.assigned_number].length - 5} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          
          {/* Virtual Scrolling Load More Controls */}
          {hasMore && (
            <div className="mt-6 flex flex-col items-center gap-4 p-6 bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl">
              <div className="text-center">
                <p className="text-slate-300 text-sm mb-1">
                  Showing <span className="font-bold text-white">{visibleCount}</span> of <span className="font-bold text-white">{filteredParticipants.length}</span> participants
                </p>
                <p className="text-slate-400 text-xs">
                  <span className="font-semibold text-cyan-400">{remainingCount}</span> more participants hidden for performance
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={loadMore}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <ChevronRight className="w-4 h-4 rotate-90" />
                  Load Next {Math.min(BATCH_SIZE, remainingCount)}
                </button>
                
                {remainingCount > BATCH_SIZE && (
                  <button
                    onClick={loadAll}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    <Eye className="w-4 h-4" />
                    Load All ({remainingCount})
                  </button>
                )}
              </div>
              
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Zap className="w-3 h-3 text-yellow-400" />
                <span>Virtual scrolling improves performance with large datasets</span>
              </div>
            </div>
          )}
          </>
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
        cohostTheme={isCohost}
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
        matchHistory={participantMatchHistory}
        currentEventId={currentEventId}
        cohostTheme={isCohost}
      />

      {/* Group Assignments Modal */}
      <GroupAssignmentsModal
        isOpen={showGroupAssignmentsModal}
        onClose={() => setShowGroupAssignmentsModal(false)}
        groupAssignments={groupAssignments}
        totalGroups={totalGroups}
        totalParticipants={totalGroupParticipants}
        eventId={currentEventId}
        onSwapApplied={async () => { await fetchGroupAssignments() }}
        cohostTheme={isCohost}
      />

      {/* Participant QR Code Modal */}
      <ParticipantQRModal
        isOpen={detailParticipant !== null}
        onClose={() => setDetailParticipant(null)}
        participant={detailParticipant}
        cohostTheme={isCohost}
      />

      {/* Prev Unmatched Candidates Modal */}
      {showPrevUnmatchedModal && (
        <div className={`fixed inset-0 z-50 ${isCohost ? 'bg-rose-900/40' : 'bg-black/70'} backdrop-blur-sm flex items-center justify-center p-4`}>
          <div className={`${isCohost ? 'bg-gradient-to-br from-rose-950 via-slate-900 to-rose-950 border-4 border-rose-400/30 rounded-3xl shadow-2xl' : 'bg-slate-900 rounded-2xl border border-slate-700'} max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col`}>
            <div className={`p-4 border-b ${isCohost ? 'border-rose-400/20' : 'border-slate-700'} flex items-center justify-between`}>
              <div className="flex items-center gap-2 text-white">
                <CalendarCheck className={`w-5 h-5 ${isCohost ? 'text-rose-300' : 'text-green-400'}`} />
                <h3 className="text-lg font-bold">
                  {prevModalMode === 'prev' ? (
                    <>Prev Event Candidates {prevEventId ? `(Event ${prevEventId})` : ''}</>
                  ) : (
                    <>Never-in-Events Candidates</>
                  )}
                </h3>
              </div>
              <button onClick={() => setShowPrevUnmatchedModal(false)} className={`p-2 rounded ${isCohost ? 'hover:bg-rose-900/40 text-rose-200' : 'hover:bg-slate-800 text-slate-300'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              {prevUnmatchedLoading ? (
                <div className={`text-center ${isCohost ? 'text-rose-200' : 'text-cyan-200'} flex items-center justify-center gap-2`}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : prevUnmatched.length === 0 ? (
                <div className="text-center text-slate-300">No candidates found from previous event.</div>
              ) : (
                <div className="space-y-2">
                  {prevUnmatched.map((p) => (
                    <label key={p.assigned_number} className={`flex items-center justify-between rounded px-3 py-2 border ${isCohost ? 'bg-rose-500/10 border-rose-400/20' : 'bg-white/5 border-white/10'}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={prevUnmatchedSelected.has(p.assigned_number)}
                          onChange={() => togglePrevSelect(p.assigned_number)}
                          className={`${isCohost ? 'accent-rose-400' : 'accent-green-500'}`}
                        />
                        <div>
                          <div className="text-white font-bold">#{p.assigned_number} • {p.name || p.survey_data?.name || 'No name'}</div>
                          <div className="text-xs text-slate-400">{p.gender || '—'} {p.age ? `• ${p.age}y` : ''} {p.phone_number ? `• ${p.phone_number}` : ''}</div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">Prev Event: E{p.event_id}</div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className={`p-4 border-t ${isCohost ? 'border-rose-400/20' : 'border-slate-700'} flex items-center gap-2 justify-between`}>
              <div className="flex items-center gap-2">
                <button onClick={selectAllPrev} className={`px-3 py-1.5 rounded text-white text-sm ${isCohost ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-700 hover:bg-slate-600'}`}>Select All</button>
                <button onClick={clearPrevSelection} className={`px-3 py-1.5 rounded text-white text-sm ${isCohost ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-700 hover:bg-slate-600'}`}>Clear</button>
                <span className="text-xs text-slate-400">Selected: {prevUnmatchedSelected.size}</span>
              </div>
              <button
                onClick={signupPrevSelected}
                disabled={prevUnmatchedLoading || prevUnmatchedSelected.size === 0}
                className={`px-4 py-2 rounded text-white text-sm disabled:opacity-50 ${isCohost ? 'bg-rose-600 hover:bg-rose-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {prevUnmatchedLoading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Signing up...</span> : 'Sign up for next event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Profile Modal with Inline Editing */}
      <ParticipantProfileModal
        participant={profileModalParticipant}
        isOpen={showProfileModal}
        onClose={() => {
          setShowProfileModal(false);
          setProfileModalParticipant(null);
        }}
        onUpdate={fetchParticipants}
        cohostTheme={isCohost}
      />

      {/* Group Debug Modal */}
      {showGroupDebugModal && groupDebugData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-700 bg-gradient-to-r from-yellow-900/20 to-orange-900/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bug className="w-6 h-6 text-yellow-400" />
                  <h2 className="text-2xl font-bold text-white">Group Eligibility Debug</h2>
                </div>
                <button
                  onClick={() => setShowGroupDebugModal(false)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                  <div className="text-sm text-slate-400">Total Paid</div>
                  <div className="text-2xl font-bold text-white">{groupDebugData.total_paid}</div>
                </div>
                <div className="bg-green-900/20 p-4 rounded-lg border border-green-700/30">
                  <div className="text-sm text-green-400">Eligible</div>
                  <div className="text-2xl font-bold text-green-300">{groupDebugData.eligible.length}</div>
                </div>
                <div className="bg-red-900/20 p-4 rounded-lg border border-red-700/30">
                  <div className="text-sm text-red-400">Not Eligible</div>
                  <div className="text-2xl font-bold text-red-300">{groupDebugData.not_eligible.length}</div>
                </div>
                <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-700/30">
                  <div className="text-sm text-blue-400">Eligibility Rate</div>
                  <div className="text-2xl font-bold text-blue-300">
                    {((groupDebugData.eligible.length / groupDebugData.total_paid) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              {/* Eligible Participants */}
              <div className="bg-green-900/10 border border-green-700/30 rounded-lg p-4">
                <h3 className="text-lg font-bold text-green-300 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Eligible for Groups ({groupDebugData.eligible.length})
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {groupDebugData.eligible.map((p: any) => (
                    <div key={p.participant_number} className="bg-slate-800 p-3 rounded border border-green-700/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white">#{p.participant_number}</div>
                          <div className="text-sm text-slate-400">{p.name || 'No name'}</div>
                        </div>
                        <div className="text-xs text-green-400">
                          {p.gender} • {p.age}y
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Matched with: #{p.matched_with}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Not Eligible Participants */}
              <div className="bg-red-900/10 border border-red-700/30 rounded-lg p-4">
                <h3 className="text-lg font-bold text-red-300 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Not Eligible for Groups ({groupDebugData.not_eligible.length})
                </h3>
                <div className="space-y-2">
                  {groupDebugData.not_eligible.map((p: any) => (
                    <div key={p.participant_number} className="bg-slate-800 p-3 rounded border border-red-700/20">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-bold text-white">#{p.participant_number}</div>
                            <div className="text-sm text-slate-400">{p.name || 'No name'}</div>
                            <div className="text-xs text-slate-500">{p.gender} • {p.age}y</div>
                          </div>
                          <div className="mt-1 text-sm text-red-400 font-medium">
                            {p.reason}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Exclusion Breakdown */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-3">Exclusion Reasons Breakdown</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900 p-3 rounded">
                    <div className="text-sm text-slate-400">Matched with Organizer</div>
                    <div className="text-xl font-bold text-orange-400">
                      {groupDebugData.not_eligible.filter((p: any) => p.reason.includes('organizer')).length}
                    </div>
                  </div>
                  <div className="bg-slate-900 p-3 rounded">
                    <div className="text-sm text-slate-400">No Individual Match</div>
                    <div className="text-xl font-bold text-purple-400">
                      {groupDebugData.not_eligible.filter((p: any) => p.reason.includes('no individual match')).length}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-700 bg-slate-800/50">
              <button
                onClick={() => setShowGroupDebugModal(false)}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
