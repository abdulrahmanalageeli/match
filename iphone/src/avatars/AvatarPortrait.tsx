import { useEffect, useId, useState } from "react";
import { dressStyles, skinTones, type PublicAvatar } from "../compatibility/appearance";
import "./avatar-portrait.css";

type Props = { avatar: PublicAvatar; className?: string; decorative?: boolean };

const rasterPortraitsReady = true;

function RasterPortrait({ source }: { source: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let current = true;
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    // Cached SVG image load events are inconsistent across browser remounts.
    // Decode the shared browser resource before revealing it above the fallback.
    void image.decode().then(() => { if (current) setReady(true); }, () => { if (current) setReady(false); });
    return () => { current = false; };
  }, [source]);
  return <image className="nf-avatar-render" href={source} x="0" y="0" width="400" height="480"
    preserveAspectRatio="xMidYMid slice" opacity={ready ? 1 : 0} data-ready={ready || undefined}
    onError={() => setReady(false)} aria-hidden="true" />;
}

/** A member-selected illustration. Clothing and skin are never inferred from a photo or profile. */
export function AvatarPortrait({ avatar, className = "", decorative = false }: Props) {
  const id = "portrait-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tone = skinTones.find(item => item.value === avatar.skinTone);
  const dress = dressStyles.find(item => item.value === avatar.style);
  if (!tone || !dress) return null;
  const fill = (name: string) => `url(#${id}-${name})`;
  const covered = avatar.style !== "uncovered";
  const niqab = avatar.style === "niqab";
  const rasterSource = `/avatars/semi-realistic/${avatar.style}-${avatar.skinTone}.webp?v=${niqab ? 7 : 6}`;
  const frontalFace = "M141 153c0-46 21-68 59-68s61 26 61 68l-4 73c-3 30-22 61-45 69-8 3-16 3-24 0-22-8-41-39-44-69z";
  const coveredFace = "M147 164c-1-36 19-63 53-63 35 0 55 29 55 65v50c0 30-18 62-42 77-8 5-18 5-26 0-24-15-40-47-40-77z";
  return <svg className={"nf-avatar-portrait " + className} viewBox="0 0 400 480" preserveAspectRatio="xMidYMid slice"
    role={decorative ? undefined : "img"} aria-hidden={decorative || undefined}
    aria-label={decorative ? undefined : `صورة رمزية · ${dress.label}`} focusable="false"
    data-avatar-style={avatar.style} data-skin-tone={avatar.skinTone}>
    <defs>
      <linearGradient id={id + "-background"} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#FBF5E9"/><stop offset=".48" stopColor="#EEDFD1"/><stop offset="1" stopColor="#CFADAE"/>
      </linearGradient>
      <radialGradient id={id + "-light"} cx=".28" cy=".21" r=".85">
        <stop stopColor="#FFFCF3" stopOpacity=".85"/><stop offset="1" stopColor="#FFFCF3" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id={id + "-cloth"} x1="0" y1="0" x2="1" y2=".9">
        <stop stopColor={niqab ? "#3B3D40" : "#D6A0A7"}/><stop offset=".4" stopColor={niqab ? "#17191C" : "#AD6C7B"}/><stop offset="1" stopColor={niqab ? "#090A0D" : "#75314B"}/>
      </linearGradient>
      <linearGradient id={id + "-fold"} x1="0" y1=".1" x2="1" y2="1">
        <stop stopColor={niqab ? "#55575A" : "#E8B7B8"}/><stop offset=".4" stopColor={niqab ? "#27292D" : "#BF8492"}/><stop offset="1" stopColor={niqab ? "#0E1013" : "#8D465F"}/>
      </linearGradient>
      <linearGradient id={id + "-body"} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor={niqab ? "#343437" : "#79364C"}/><stop offset=".55" stopColor={niqab ? "#18191B" : "#58172F"}/><stop offset="1" stopColor={niqab ? "#090A0C" : "#350E23"}/>
      </linearGradient>
      <linearGradient id={id + "-hair"} x1="0" y1="0" x2="1" y2=".5">
        <stop stopColor="#55322F"/><stop offset=".5" stopColor="#372128"/><stop offset="1" stopColor="#241923"/>
      </linearGradient>
      <linearGradient id={id + "-skin-shade"} x1="0" y1="0" x2="1" y2=".8">
        <stop stopColor="#FFEFDB" stopOpacity=".1"/><stop offset=".57" stopColor="#2E1020" stopOpacity="0"/><stop offset="1" stopColor="#2E1020" stopOpacity=".16"/>
      </linearGradient>
      <linearGradient id={id + "-edge"} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#F2DAC2" stopOpacity=".75"/><stop offset="1" stopColor="#F2DAC2" stopOpacity="0"/>
      </linearGradient>
    </defs>

    <rect width="400" height="480" fill={fill("background")}/>
    <rect width="400" height="480" fill={fill("light")}/>
    <g fill="none" stroke="#B58C78" strokeWidth=".7" opacity=".34" aria-hidden="true">
      <path d="M49 393V191a151 151 0 0 1 302 0v202"/>
      <path d="M63 393V191a137 137 0 0 1 274 0v202"/>
      <path d="M28 434c82-34 125-25 177 1s114 24 178-12"/>
      <path d="M22 446c82-34 134-21 186 5s105 24 180-13"/>
    </g>
    <g fill="#A77D66" opacity=".32" aria-hidden="true">
      <circle cx="49" cy="257" r="2"/><circle cx="351" cy="257" r="2"/>
      <circle cx="200" cy="40" r="2"/>
    </g>
    <ellipse cx="205" cy="457" rx="165" ry="24" fill="#5A0F28" opacity=".12"/>

    {/* Each skin region is painted with the exact selected palette color. */}
    {!covered && <>
      <path d="M115 334c-28-29-24-66-19-117 1-56-3-96 31-125 39-33 105-29 137 5 33 35 29 86 31 128 3 43 8 85-22 113z" fill={fill("hair")}/>
      <path d="M159 259v52c-10 12-34 19-52 25l44 91h104l42-91c-20-6-44-14-53-25v-52z" fill={tone.color}/>
      <path d="M159 259v52c-10 12-34 19-52 25l44 91h104l42-91c-20-6-44-14-53-25v-52z" fill={fill("skin-shade")}/>
      <path d="M159 266c16 13 27 18 42 18 16 0 30-8 43-21v26c-27 24-59 22-85 3z" fill="#3A1B27" opacity=".1"/>
      <path d="M107 330c-45 10-79 39-86 97l-8 53h374l-8-53c-7-58-42-87-83-97-20 18-52 42-95 42-44 0-75-25-94-42z" fill={fill("body")}/>
      <path d="M125 321c27 24 47 36 76 36 28 0 49-12 76-36l19 9c-22 28-52 48-95 48s-74-20-94-48z" fill="#EEDAC6"/>
      <path d="M83 350c-24 32-28 76-30 130M319 353c22 39 26 84 27 127" fill="none" stroke="#F4DCC5" strokeWidth="1" opacity=".17"/>
      <path d={frontalFace} fill={tone.color}/>
      <path d={frontalFace} fill={fill("skin-shade")}/>
      <path d="M199 85c-10 28-35 49-55 62-13 27-17 65-12 112 1 39 10 76 4 104-36-15-44-44-37-87 8-48-7-104 7-145 12-36 47-57 93-46z" fill={fill("hair")}/>
      <path d="M199 85c27-10 58 8 72 32 22 39 10 104 22 159 10 47 7 68-20 92-14-31-10-65-8-95 3-55 1-92-17-121-13-24-27-43-49-67z" fill={fill("hair")}/>
      <path d="M176 94c-37 28-56 66-53 106M245 110c25 34 28 66 26 98M117 237c-6 44-3 77 8 105M282 257c4 33 2 57-6 77" fill="none" stroke="#BF8B77" strokeWidth="1" opacity=".23"/>
    </>}

    {covered && <>
      <path d="M94 322c-47 20-70 46-77 107L10 480h380l-7-51c-7-60-31-88-79-107z" fill={fill("body")}/>
      <path d="M200 75c-69 0-104 58-103 132 1 65-23 118-37 149 39 12 75 34 91 67 14-25 32-43 51-61 40 9 76 12 137-7-20-41-33-85-36-143-3-78-33-137-103-137z" fill={fill("cloth")}/>
      <path d={coveredFace} fill={tone.color}/>
      <path d={coveredFace} fill={fill("skin-shade")}/>
      <path d="M200 75c-50 9-76 44-73 91 11-25 26-38 46-52 19-12 36-14 52-10-6-13-15-23-25-29z" fill={fill("fold")}/>
      <path d="M199 75c53-1 82 35 92 94 7 42 11 98 26 141-26-17-43-44-53-82-8-30-8-61-18-82-12-26-24-49-47-71z" fill={fill("fold")}/>
      <path d="M148 164c-12 39-13 84 9 115 20 28 61 45 109 54-47 9-87 24-115 57-21-47-44-91-36-146 4-30 17-61 33-80z" fill={fill("fold")}/>
      <path d="M256 217c5 51-17 78-49 103 36 6 71 11 108 0-22-25-44-59-59-103z" fill={fill("cloth")}/>
      <path d="M119 299c20 39 52 58 89 66M272 127c18 49 15 110 39 160M97 340c26 12 47 30 60 51" fill="none" stroke={fill("edge")} strokeWidth="1.1" opacity=".55"/>
      {niqab && <>
        {/* A sewn forehead band, narrow eye opening and separate hanging face veil. */}
        <path d="M143 166c4-45 23-68 57-68 37 0 55 27 59 68z" fill={fill("cloth")}/>
        <path d="M126 123q74-7 148 0l2 51H124z" fill={fill("cloth")}/>
        <path d="M128 129q73-6 144 0M126 169h148" fill="none" stroke="#76787C" strokeWidth=".8" opacity=".32"/>
        <g fill="#EFEAE0" stroke="#292329" strokeWidth="1">
          <path d="M157 183q13-10 26 0-13 9-26 0z"/>
          <path d="M217 183q13-10 26 0-13 9-26 0z"/>
        </g>
        <g fill="#30252A"><circle cx="170" cy="183" r="4.2"/><circle cx="230" cy="183" r="4.2"/></g>
        <g fill="#F8F0E7" opacity=".8"><circle cx="168.8" cy="181.5" r="1"/><circle cx="228.8" cy="181.5" r="1"/></g>
        <path d="M138 193q62-6 124 0l17 144q-79 24-158 0z" fill={fill("cloth")}/>
        <path d="M138 193q62-6 124 0M123 335q77 23 154 0" fill="none" stroke="#7E8083" strokeWidth="1.2" opacity=".3"/>
        <path d="M153 210l-7 117M247 210l8 117" fill="none" stroke="#6D7073" strokeWidth=".8" opacity=".15"/>
      </>}
    </>}
    <path d="M0 460c66-15 118-8 178 7s142 8 222-10v23H0z" fill={niqab ? "#08090B" : "#391127"} opacity=".12"/>
    {rasterPortraitsReady && <RasterPortrait key={rasterSource} source={rasterSource} />}
  </svg>;
}
