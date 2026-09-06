export type Event3GroupRoundTheme = {
  ordinalAr: string
  nameAr: string
  focusAr: string
  journeyAccent: "blue" | "purple" | "amber"
  badge: string
  border: string
  text: string
  mutedText: string
  bar: string
  shell: string
  wash: string
  primaryOrb: string
  secondaryOrb: string
  tertiaryOrb: string
  ring: string
  softPanel: string
}

export const EVENT3_GROUP_ROUND_THEMES: Record<number, Event3GroupRoundTheme> = {
  1: {
    ordinalAr: "الأولى",
    nameAr: "شرارة التعارف",
    focusAr: "طاقة خفيفة، انطباعات أولى، واكتشاف سريع للمشترك بينكم",
    journeyAccent: "blue",
    badge: "border-cyan-400/35 bg-cyan-500/[0.12] text-cyan-200",
    border: "border-cyan-400/25",
    text: "text-cyan-200",
    mutedText: "text-cyan-300/65",
    bar: "from-cyan-400 via-sky-500 to-blue-600",
    shell: "from-cyan-950/45 via-gray-950 to-sky-950/35",
    wash: "from-cyan-500/[0.16] via-sky-500/[0.07] to-transparent",
    primaryOrb: "bg-cyan-400/20",
    secondaryOrb: "bg-sky-500/14",
    tertiaryOrb: "bg-teal-400/[0.08]",
    ring: "ring-cyan-400/20",
    softPanel: "border-cyan-400/20 bg-cyan-500/[0.08]",
  },
  2: {
    ordinalAr: "الثانية",
    nameAr: "عمق وتواصل",
    focusAr: "قصص وقيم وأسئلة متابعة تكشف كيف يفكر كل شخص ويتواصل",
    journeyAccent: "purple",
    badge: "border-violet-400/35 bg-violet-500/[0.12] text-violet-200",
    border: "border-violet-400/25",
    text: "text-violet-200",
    mutedText: "text-violet-300/65",
    bar: "from-violet-500 via-purple-500 to-fuchsia-600",
    shell: "from-violet-950/45 via-gray-950 to-fuchsia-950/30",
    wash: "from-violet-500/[0.17] via-purple-500/[0.07] to-transparent",
    primaryOrb: "bg-violet-500/20",
    secondaryOrb: "bg-fuchsia-500/13",
    tertiaryOrb: "bg-purple-400/[0.08]",
    ring: "ring-violet-400/20",
    softPanel: "border-violet-400/20 bg-violet-500/[0.08]",
  },
  3: {
    ordinalAr: "الثالثة",
    nameAr: "انسجام وإيقاع",
    focusAr: "عفوية، فضول، وطريقة حضور كل شخص داخل الحوار الجماعي",
    journeyAccent: "amber",
    badge: "border-amber-400/35 bg-amber-500/[0.12] text-amber-200",
    border: "border-amber-400/25",
    text: "text-amber-200",
    mutedText: "text-amber-300/65",
    bar: "from-amber-400 via-orange-500 to-rose-600",
    shell: "from-amber-950/40 via-gray-950 to-rose-950/30",
    wash: "from-amber-500/[0.17] via-orange-500/[0.07] to-transparent",
    primaryOrb: "bg-amber-400/20",
    secondaryOrb: "bg-rose-500/13",
    tertiaryOrb: "bg-orange-400/[0.08]",
    ring: "ring-amber-400/20",
    softPanel: "border-amber-400/20 bg-amber-500/[0.08]",
  },
}

export function getEvent3GroupRoundTheme(round: number): Event3GroupRoundTheme {
  return EVENT3_GROUP_ROUND_THEMES[round] || EVENT3_GROUP_ROUND_THEMES[1]
}
