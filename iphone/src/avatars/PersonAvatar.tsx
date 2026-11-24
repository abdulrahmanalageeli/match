import {MemberBadge} from '../membership/MemberBadge';
import { useState } from 'react';
import type { CommunitySource, PublicPerson } from '../community/data';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import { DiscoveryPhoto } from '../privacy/DiscoveryPhoto';
import { AvatarPortrait } from './AvatarPortrait';
import './person-avatar.css';

/** A compact version of the profile image, with the same private-photo access rules. */
export function PersonAvatar({ person, source, className = '', protectedDiscovery = false }: {
  person: PublicPerson; source: CommunitySource; className?: string; protectedDiscovery?: boolean;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const letter = Array.from(person.alias.trim())[0] || 'ن';
  const photo = /^\/demo\/portraits\/[a-z0-9_-]+\.(webp|png|jpe?g)$/i.test(person.demoPhoto || '') && failedPhoto !== person.demoPhoto
    ? person.demoPhoto : undefined;
  const image = Boolean(person.portrait || person.publicAvatar || photo);
  return <span className={`nf-person-avatar ${className}`} data-image={image || undefined} data-tone={(letter.codePointAt(0) ?? 0) % 3}>
    {person.portrait ? <PortraitPhoto portrait={person.portrait} source={source} alt="" className="nf-person-avatar-image" discovery={protectedDiscovery ? {name:person.alias,compact:true} : undefined}/>
      : person.publicAvatar ? <AvatarPortrait avatar={person.publicAvatar} decorative discovery={protectedDiscovery ? {name:person.alias,compact:true} : undefined}/>
      : photo && protectedDiscovery ? <DiscoveryPhoto src={photo} name={person.alias} compact/>
      : photo ? <img src={photo} alt="" width="112" height="140" loading="lazy" decoding="async" onError={() => setFailedPhoto(photo)}/>
      : <b aria-hidden="true">{letter}</b>}
    <MemberBadge tier={person.membershipTier} active={person.premium}/>
  </span>;
}
