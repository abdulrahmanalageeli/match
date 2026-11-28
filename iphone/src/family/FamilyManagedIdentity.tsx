import { UsersRound } from '../BrandIcons';
import './family-managed-identity.css';

type FamilyManagedIdentityProps = {
  manager?: string;
  variant?: 'inline' | 'row' | 'hero' | 'profile';
};

export function FamilyManagedIdentity({ manager, variant = 'inline' }: FamilyManagedIdentityProps) {
  const relative = manager?.trim();
  if (!relative) return null;

  return <span className="wd-family-identity" data-variant={variant}>
    <span className="wd-family-identity-label"><UsersRound size={14} aria-hidden="true"/><span><span className="wd-family-label-prefix">حساب </span>عائلي</span></span>
    {variant !== 'inline' && <span className="wd-family-identity-contact"><span className="wd-family-contact-prefix">{variant === 'profile' ? 'التواصل مع' : 'بإدارة'} </span><bdi>{relative}</bdi></span>}
  </span>;
}
