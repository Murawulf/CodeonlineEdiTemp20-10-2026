import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useNotifications } from '@/contexts/NotificationContext';
import { useApi } from '@/hooks/useApi';

type SubscriptionState = 'trial' | 'pending_review' | 'active' | 'expired' | 'suspended';

// ─── NEW: account état — replaces the old suspend-only boolean with a richer set of
// states an admin/master can put an account into. `is_suspended` is kept in the payload
// for backward compatibility (server keeps it in sync with `etat`), but the UI now reads
// and writes `etat` everywhere.
type AccountEtat = 'active' | 'pending' | 'suspended' | 'disabled';

interface Account {
  id_compte: number;
  id_entite: number;
  email: string;
  name: string | null;
  prenom: string | null;
  certicode: string | null;
  is_suspended: number;
  etat: AccountEtat;
  is_master: boolean;
  is_payment_responsible: boolean;
  created_at: string;
  profile_id: number | null;
  permissions: AccountPermission[];
  producer_name?: string | null;
  subscription_status?: SubscriptionState;
  subscription_expires_at?: string | null;
}

interface SubscriptionStatus {
  id_compte: number;
  is_privileged: boolean;
  subscription_status: SubscriptionState;
  trial_ends_at: string;
  days_left_trial: number;
  subscription_expires_at: string | null;
  has_access: boolean;
}

// ─── NEW: iPay plan catalog, prices are authoritative server-side (never hard-coded here) ───
interface IpayPlan {
  code: string;
  months: number;
  amount: number;
  currency: string;
  label: string;
}

interface Virement {
  id_virement: number;
  id_compte: number;
  id_entite: number | null;
  image_path: string;
  original_filename: string | null;
  montant: number | null;
  reference: string | null;
  months_requested: number;
  statut: 'pending' | 'approved' | 'rejected';
  source: string;
  submitted_at: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  email?: string;
  name?: string;
  prenom?: string;
  entite_name?: string;
}
interface AccountPermission {
  page_id: number;
  page_name?: string;
  read: boolean;
  write: boolean;
  hide: boolean;
  apercu?: boolean;
  upload?: boolean;
  delete_file?: boolean;
  create_folder?: boolean;
}
interface Profile {
  id_profile: number;
  role: string | null;
  is_suspended: number;
  id_entite: number | null;
  company_name: string | null;
}
interface Page {
  page_id: number;
  page_name: string;
}
interface Company {
  id_entite: number;
  raison_socialle: string;
  identifiant_national?: string | null;
}

// ─── HIERARCHY RULE: entity 999 is the top of the tree, 111 sits directly under it ───
// 999 can see every account, including its own.
// 111 can see every account EXCEPT accounts belonging to entity 999.
// Everyone else can only ever see accounts belonging to their own entity.
const TOP_ENTITY_ID = 999;
const SECOND_ENTITY_ID = 111;

// ─── NEW: bank demo entity — id_entite 2756 is used for live demonstrations to the bank.
// iPay Tn / ClicToPay hasn't been given real API credentials yet (see the "Configuration —
// ClicToPay" panel under Paramètres), so redirecting straight to iPay's hosted payment page
// currently dead-ends in ERR_CONNECTION_RESET. Rather than sending a demo viewer into that
// wall, any account under this entity gets a friendly explanatory notice instead when it
// tries to pay an iPay offer — see handleIpayPayment() and the "iPay demo notice" modal below.
const DEMO_ENTITY_ID = 2756;

// ─── Subscription / trial status display ───
const SUBSCRIPTION_LABELS: Record<SubscriptionState, { label: string; className: string }> = {
  trial: { label: 'Essai', className: 'bg-blue-100 text-blue-800' },
  pending_review: { label: 'En attente', className: 'bg-yellow-100 text-yellow-800' },
  active: { label: 'Actif', className: 'bg-green-100 text-green-800' },
  expired: { label: 'Expiré', className: 'bg-red-100 text-red-800' },
  suspended: { label: 'Suspendu', className: 'bg-gray-300 text-gray-800' },
};

// ─── NEW: account état labels (replaces the old binary "Actif / Suspendue" text) ───
const ETAT_LABELS: Record<AccountEtat, { label: string; className: string }> = {
  active: { label: 'Actif', className: 'bg-green-100 text-green-800' },
  pending: { label: 'En attente', className: 'bg-yellow-100 text-yellow-800' },
  suspended: { label: 'Suspendu', className: 'bg-gray-300 text-gray-800' },
  disabled: { label: 'Désactivé', className: 'bg-red-100 text-red-800' },
};
const ETAT_ORDER: AccountEtat[] = ['active', 'pending', 'suspended', 'disabled'];

// ─── NEW: searchable entity combobox ───
// Replaces the old plain <select> listing every company, which became unusable once the
// entity list grew into the thousands. This is a type-to-filter input: it matches on
// `raison_socialle` (name) OR `identifiant_national`, shows up to 50 results at a time,
// and supports mouse + keyboard (↑/↓/Enter/Esc) selection.
interface EntityComboboxProps {
  companies: Company[];
  value: number | 'all' | '';
  onChange: (value: number | 'all' | '') => void;
  placeholder?: string;
  // When set, an extra option using this label is shown at the top and selecting it
  // reports value 'all' (used by the entity filter in the toolbar).
  allLabel?: string;
  disabled?: boolean;
  className?: string;
}

const MAX_ENTITY_RESULTS = 50;

const EntityCombobox: React.FC<EntityComboboxProps> = ({
  companies,
  value,
  onChange,
  placeholder = 'Rechercher par nom (raison sociale) ou identifiant national...',
  allLabel,
  disabled = false,
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCompany = useMemo(
    () => (typeof value === 'number' ? companies.find((c) => c.id_entite === value) : undefined),
    [companies, value]
  );

  // What the input shows when the user isn't actively typing a new search.
  const displayValue = value === 'all' ? allLabel || '' : selectedCompany ? selectedCompany.raison_socialle : '';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies.slice(0, MAX_ENTITY_RESULTS);
    return companies
      .filter((c) => {
        const name = (c.raison_socialle || '').toLowerCase();
        const idNat = (c.identifiant_national || '').toLowerCase();
        return name.includes(q) || idNat.includes(q);
      })
      .slice(0, MAX_ENTITY_RESULTS);
  }, [companies, query]);

  useEffect(() => setHighlightedIndex(0), [query, open]);

  const handleSelect = (id: number | 'all') => {
    onChange(id);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const optionCount = (allLabel ? 1 : 0) + results.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, optionCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allLabel && highlightedIndex === 0) {
        handleSelect('all');
      } else {
        const company = results[allLabel ? highlightedIndex - 1 : highlightedIndex];
        if (company) handleSelect(company.id_entite);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={open ? query : displayValue}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full border border-gray-300 rounded-lg p-2 pr-8 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500"
        />
        <svg
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
      </div>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {allLabel && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect('all')}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                highlightedIndex === 0 ? 'bg-blue-50' : ''
              } ${value === 'all' ? 'font-semibold text-blue-950' : 'text-gray-700'}`}
            >
              {allLabel}
            </button>
          )}
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">Aucune entité trouvée</p>
          ) : (
            results.map((company, i) => {
              const idx = allLabel ? i + 1 : i;
              return (
                <button
                  key={company.id_entite}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(company.id_entite)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex flex-col ${
                    highlightedIndex === idx ? 'bg-blue-50' : ''
                  } ${value === company.id_entite ? 'font-semibold text-blue-950' : 'text-gray-700'}`}
                >
                  <span>{company.raison_socialle}</span>
                  {company.identifiant_national && (
                    <span className="text-xs text-gray-400">Identifiant national : {company.identifiant_national}</span>
                  )}
                </button>
              );
            })
          )}
          {!query && companies.length > results.length && (
            <p className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
              {companies.length} entités au total — tapez pour affiner la recherche.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const Comptes: React.FC = () => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const addNotificationRef = useRef(addNotification);
  useEffect(() => { addNotificationRef.current = addNotification; });

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [customRole, setCustomRole] = useState('');
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const [etatSubmenuOpen, setEtatSubmenuOpen] = useState(false);
  const [etatSubmenuPosition, setEtatSubmenuPosition] = useState<{ top: number; left: number } | null>(null);
  const etatButtonRef = useRef<HTMLButtonElement>(null);
  const etatSubmenuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [prenom, setPrenom] = useState('');
  const [idProducteur, setIdProducteur] = useState<number | ''>('');
  const [profileId, setProfileId] = useState<number | ''>('');
  const [selectedPageId, setSelectedPageId] = useState<number | ''>('');
  const [tempPermissions, setTempPermissions] = useState<Partial<AccountPermission>>({
    read: false,
    write: false,
    hide: false,
    apercu: false,
    upload: false,
    delete_file: false,
    create_folder: false,
  });
  const [configuredPermissions, setConfiguredPermissions] = useState<AccountPermission[]>([]);
  const [editingPermId, setEditingPermId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [suspending, setSuspending] = useState<number | null>(null);
  const [isInitialFetch, setIsInitialFetch] = useState(true);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Account | 'raison_socialle' | 'profile' | 'subscription_status' | 'etat' | null;
    direction: 'ASC' | 'DESC' | null;
  }>({ key: null, direction: null });
  const [idCompte, setIdCompte] = useState<number | null>(null);
  const [userIdProducteur, setUserIdProducteur] = useState<number | null>(null);
  const [userProducerName, setUserProducerName] = useState<string | null>(null);
  const [userAccount, setUserAccount] = useState<Account | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [managedEntityIds, setManagedEntityIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEntity, setFilterEntity] = useState<number | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | AccountEtat>('all');
  // ─── NEW: creation-date range filters ───
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSubscription, setFilterSubscription] = useState<'all' | SubscriptionState>('all');

  // ─── NEW: subscription / trial state (own account) ───
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [virementFile, setVirementFile] = useState<File | null>(null);
  const [virementMontant, setVirementMontant] = useState('');
  const [virementReference, setVirementReference] = useState('');
  const [submittingVirement, setSubmittingVirement] = useState(false);

  // ─── NEW: iPay online payment (carte bancaire / virement via iPay checkout) ───
  const [ipayLoading, setIpayLoading] = useState(false);
  const [ipayPlans, setIpayPlans] = useState<IpayPlan[]>([]);
  const [loadingIpayPlans, setLoadingIpayPlans] = useState(false);

  // ─── NEW: iPay bank-demo notice — shown instead of the real iPay redirect for
  // DEMO_ENTITY_ID accounts (see handleIpayPayment). Keeps the plan + the real payment_url
  // around so the "Continuer vers la page de paiement" button can still reach it on demand.
  const [ipayDemoNoticeOpen, setIpayDemoNoticeOpen] = useState(false);
  const [ipayDemoPlan, setIpayDemoPlan] = useState<IpayPlan | null>(null);
  const [ipayDemoPaymentUrl, setIpayDemoPaymentUrl] = useState<string | null>(null);

  // ─── NEW: subscription validation (999/111 admins) ───
  const [virementsModalOpen, setVirementsModalOpen] = useState(false);
  const [virements, setVirements] = useState<Virement[]>([]);
  const [virementsFilter, setVirementsFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [loadingVirements, setLoadingVirements] = useState(false);
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [monthsInput, setMonthsInput] = useState<Record<number, number>>({});
  const [rejectReasonInput, setRejectReasonInput] = useState<Record<number, string>>({});

  const modalRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  // Track whether we're currently handling a menu action to prevent outside-click from firing
  const isHandlingMenuAction = useRef(false);

  const parentKeywords = ['EDI', 'Produits', 'Paramètres'];

  // ─── HIERARCHY RULE: who is at the top (999) vs second level (111) ───
  const isTopEntity = useMemo(() => userIdProducteur === TOP_ENTITY_ID, [userIdProducteur]);
  const isSecondEntity = useMemo(() => userIdProducteur === SECOND_ENTITY_ID, [userIdProducteur]);

  const isSpecialUser = useMemo(() => {
    return isSecondEntity || isTopEntity;
  }, [isSecondEntity, isTopEntity]);

  // ─── NEW: bank demo entity — see DEMO_ENTITY_ID above. Coerced with Number() because
  // userIdProducteur is set straight from whatever the login payload / localStorage JSON
  // has for id_entite, which can come through as a string depending on how it was stored —
  // a strict `===` against the numeric constant would silently never match in that case. ───
  const isDemoEntity = useMemo(() => Number(userIdProducteur) === DEMO_ENTITY_ID, [userIdProducteur]);

  // ─── NEW: master account — set only by 999/111, scoped to their own entity. A master
  // acts like an entity-level admin: full manage rights over accounts in `id_entite`,
  // but never outside it (mirrors the server-side `canManageAccount` rule).
  const isMasterUser = useMemo(() => !!userAccount?.is_master, [userAccount]);

  const isAdminUser = useMemo(() => {
    if (isSpecialUser) return true;
    if (isMasterUser) return true;
    if (!userAccount?.profile_id) return false;
    const profile = profiles.find((p) => p.id_profile === userAccount.profile_id);
    if (!profile) return false;
    const roleLower = profile.role?.toLowerCase() || '';
    const adminKeywords = ['superviseur', 'admin'];
    return adminKeywords.some((kw) => roleLower.includes(kw));
  }, [isSpecialUser, isMasterUser, userAccount, profiles]);

  // ─── FIX: only admins (999 / 111 / superviseur-admin profile / entity master) may manage
  // accounts, and NOBODY may act on their own account from this menu — this mirrors the
  // same rule enforced server-side (see server.js) so the UI never offers an action the API
  // will reject, and so an account can never lock itself out.
  const canManageOtherAccount = (account: Account) => isAdminUser && account.id_compte !== idCompte;

  // ─── NEW: only 999/111 may flag/unflag an account as the entity's master account. ───
  const canFlagMaster = isSpecialUser;

  // ─── NEW: the payment-responsible flag can be set by 999/111 (any entity) or by the
  // master account of that same entity — never by anyone else. ───
  const canFlagPaymentResponsible = (account: Account) =>
    isSpecialUser || (isMasterUser && account.id_entite === userIdProducteur);

  // ─── FIX: an expired trial/subscription should only leave the "Mon compte" (this page's
  // own subscription section) reachable. 999/111 are platform admins and are never gated.
  const restrictedBySubscription = !!(subStatus && !subStatus.is_privileged && !subStatus.has_access);

  // ─── NEW: only the entity's designated payment-responsible account gets the paywall /
  // virement-submission UI. Everyone else in the entity (master included, unless they are
  // also flagged) sees a "contact your admin" message instead — set via
  // handleTogglePaymentResponsible() by 999/111 or by the entity's master account.
  const canSubmitPayment = !isSpecialUser && !!userAccount?.is_payment_responsible;

  useEffect(() => {
    const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (raw) {
      try {
        const parsedUser = JSON.parse(raw);
        if (parsedUser.id_compte) setIdCompte(parsedUser.id_compte);
        else addNotificationRef.current('Utilisateur non authentifié, id_compte manquant', 'error');
        if (parsedUser.id_entite) setUserIdProducteur(parsedUser.id_entite);
        if (parsedUser.producer_name) setUserProducerName(parsedUser.producer_name);
      } catch {
        addNotificationRef.current("Erreur lors du chargement de l'utilisateur", 'error');
      }
    } else {
      addNotificationRef.current('Aucun utilisateur connecté', 'error');
    }
  }, []);

  const fetchUserAccount = useCallback(async () => {
    if (!idCompte) return;
    try {
      const res = await api.get<Account>(`/api/comptes/${idCompte}`, { withCredentials: true });
      setUserAccount(res.data);
    } catch {
      addNotificationRef.current('Erreur lors du chargement du compte utilisateur', 'error');
    }
  }, [idCompte]);

  useEffect(() => {
    if (idCompte && !userAccount) fetchUserAccount();
  }, [idCompte, userAccount, fetchUserAccount]);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await api.get<Profile[]>(`/api/profiles`, { withCredentials: true });
      setProfiles(res.data);
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des profils', 'error');
    }
  }, [idCompte]);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await api.get<Company[]>(`/api/companies`, { withCredentials: true });
      setCompanies(res.data);
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des entreprises', 'error');
    }
  }, []);

  const fetchPages = useCallback(async () => {
    try {
      const res = await api.get<Page[]>(`/api/pages`, { withCredentials: true });
      setPages(res.data);
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des pages', 'error');
    }
  }, []);

  const fetchManagedEntities = useCallback(async () => {
    try {
      const res = await api.get<Company[]>(`/api/companies`, { withCredentials: true });
      setManagedEntityIds(res.data.map((c) => c.id_entite));
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des entités', 'error');
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<Account[]>(`/api/comptes`, { withCredentials: true });
      let filteredAccounts = res.data;

      // ─── HIERARCHY RULE: visibility of accounts based on entity level ───
      if (userIdProducteur === TOP_ENTITY_ID) {
        // Top of the hierarchy (999): sees absolutely everyone, including its own accounts.
        // No filtering applied.
      } else if (userIdProducteur === SECOND_ENTITY_ID) {
        // Second level (111): sees everyone EXCEPT accounts belonging to entity 999.
        filteredAccounts = filteredAccounts.filter((account) => account.id_entite !== TOP_ENTITY_ID);
      } else {
        // Regular users: only their own entity's accounts, with the suspended-profile filter,
        // and entity 999 is excluded as a defense-in-depth measure (it should never match anyway
        // since these users are filtered down to their own id_entite below).
        filteredAccounts = filteredAccounts.filter((account) => {
          if (!account.profile_id) return true;
          const profile = profiles.find((p) => p.id_profile === account.profile_id);
          return profile && !profile.is_suspended;
        });
        filteredAccounts = filteredAccounts.filter((account) => account.id_entite !== TOP_ENTITY_ID);
        if (userIdProducteur) {
          filteredAccounts = filteredAccounts.filter((account) => account.id_entite === userIdProducteur);
        } else {
          filteredAccounts = filteredAccounts.filter((account) => account.id_compte === idCompte);
        }
      }

      setAccounts(filteredAccounts);
      setDataLoaded(true);
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des comptes', 'error');
    } finally {
      setLoading(false);
    }
  }, [profiles, isSpecialUser, userIdProducteur, idCompte, managedEntityIds, isAdminUser]);

  useEffect(() => {
    if (isInitialFetch) {
      const fetches = [fetchProfiles(), fetchCompanies(), fetchPages()];
      if (userIdProducteur === 999) fetches.push(fetchManagedEntities());
      Promise.all(fetches)
        .then(() => setIsInitialFetch(false))
        .catch(() => addNotificationRef.current('Échec du chargement initial des données', 'error'));
    }
  }, [fetchProfiles, fetchCompanies, fetchPages, fetchManagedEntities, isInitialFetch, userIdProducteur]);

  useEffect(() => {
    if (!isInitialFetch && profiles.length > 0 && !dataLoaded) fetchAccounts();
  }, [fetchAccounts, isInitialFetch, profiles, dataLoaded]);

  // ─── NEW: own trial/subscription status, used for the top banner + "Mon abonnement" modal ───
  const fetchSubscriptionStatus = useCallback(async () => {
    try {
      const res = await api.get<SubscriptionStatus>('/api/subscription/status', { withCredentials: true });
      setSubStatus(res.data);
    } catch (error: any) {
      // Non-blocking: if this fails we simply don't show the banner.
      console.error('Erreur lors de la récupération du statut d’abonnement', error);
    }
  }, []);

  useEffect(() => {
    if (idCompte) fetchSubscriptionStatus();
  }, [idCompte, fetchSubscriptionStatus]);

  // ─── NEW: admin (999/111) list of virement submissions to validate ───
  const fetchVirements = useCallback(async () => {
    if (!isSpecialUser) return;
    try {
      setLoadingVirements(true);
      const query = virementsFilter !== 'all' ? `?statut=${virementsFilter}` : '';
      const res = await api.get<Virement[]>(`/api/subscription/virements${query}`, { withCredentials: true });
      setVirements(res.data);
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des justificatifs', 'error');
    } finally {
      setLoadingVirements(false);
    }
  }, [isSpecialUser, virementsFilter]);

  useEffect(() => {
    if (virementsModalOpen) fetchVirements();
  }, [virementsModalOpen, virementsFilter, fetchVirements]);

  const resetVirementForm = () => {
    setVirementFile(null);
    setVirementMontant('');
    setVirementReference('');
  };

  // ─── NEW: authoritative plan list + prices, fetched from the backend (never hard-coded) ───
  const fetchIpayPlans = useCallback(async () => {
    try {
      setLoadingIpayPlans(true);
      const res = await api.get<IpayPlan[]>('/api/payment/ipay/plans', { withCredentials: true });
      setIpayPlans(res.data);
    } catch (error: any) {
      // Non-blocking: the manual virement option still works if this fails.
      console.error('Erreur lors de la récupération des offres iPay', error);
    } finally {
      setLoadingIpayPlans(false);
    }
  }, []);

  const handleOpenSubscriptionModal = () => {
    resetVirementForm();
    setSubModalOpen(true);
    fetchSubscriptionStatus();
    fetchIpayPlans();
  };

  // ─── NEW: "Payer avec iPay" — redirects to the iPay checkout. The backend determines the
  // price/duration from `plan`; the subscription is only ever activated server-side after the
  // iPay webhook confirms payment, never from this redirect. ───
  const handleIpayPayment = async (planCode: string) => {
    try {
      setIpayLoading(true);

      const res = await api.post(
        '/api/payment/ipay/create',
        { plan: planCode },
        { withCredentials: true }
      );

      if (!res.data?.payment_url) {
        throw new Error('Lien de paiement iPay manquant');
      }

      // ─── DEBUG: temporary — remove once the bank-demo notice is confirmed to trigger
      // correctly in the field. If the notice still doesn't show for the demo account,
      // check this log: userIdProducteur must equal 2756 (as a number) for isDemoEntity
      // to be true. If it prints something like "2756" (string) that's already handled by
      // the Number() coercion above; if it prints a completely different id, the logged-in
      // test account's id_entite isn't actually 2756 and DEMO_ENTITY_ID below needs updating.
      console.log('[iPay demo check]', { userIdProducteur, isDemoEntity, DEMO_ENTITY_ID });

      // ─── DEMO: the create call above already recorded the transaction server-side —
      // it shows up in Transactions as "En attente" exactly like any other request. For
      // DEMO_ENTITY_ID accounts, iPay Tn / ClicToPay hasn't been given real API credentials
      // yet, so redirecting straight to `payment_url` only leads to iPay's hosted page
      // failing with ERR_CONNECTION_RESET. Show an explanatory notice instead of that dead
      // end; the real link is kept so "Continuer vers la page de paiement" can still reach it.
      if (isDemoEntity) {
        setIpayDemoPlan(ipayPlans.find((p) => p.code === planCode) || null);
        setIpayDemoPaymentUrl(res.data.payment_url);
        setIpayDemoNoticeOpen(true);
        setIpayLoading(false);
        return;
      }

      window.location.href = res.data.payment_url;
    } catch (error: any) {
      console.error('iPay payment error:', error);
      addNotification(
        error.response?.data?.error || 'Impossible de démarrer le paiement iPay',
        'error'
      );
      setIpayLoading(false);
    }
  };

  // ─── NEW: "Continuer vers la page de paiement" — for the bank-demo notice. Lets anyone
  // who wants to see the real (currently failing) iPay checkout reach it on purpose, instead
  // of the app silently hiding that it exists.
  const handleContinueToIpayCheckout = () => {
    if (!ipayDemoPaymentUrl) return;
    window.location.href = ipayDemoPaymentUrl;
  };

  const closeIpayDemoNotice = () => {
    setIpayDemoNoticeOpen(false);
    setIpayDemoPlan(null);
    setIpayDemoPaymentUrl(null);
  };

  const handleSubmitVirement = async () => {
    if (!virementFile) {
      addNotification('Veuillez sélectionner une image ou un PDF du virement', 'error');
      return;
    }
    try {
      setSubmittingVirement(true);
      const formData = new FormData();
      formData.append('proof', virementFile);
      if (virementMontant) formData.append('montant', virementMontant);
      if (virementReference) formData.append('reference', virementReference);

      await api.post('/api/subscription/virement', formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      addNotification('Justificatif envoyé avec succès, en attente de validation', 'success');
      resetVirementForm();
      fetchSubscriptionStatus();
    } catch (error: any) {
      addNotification(error.response?.data?.error || "Erreur lors de l'envoi du justificatif", 'error');
    } finally {
      setSubmittingVirement(false);
    }
  };

  const handleViewVirementImage = async (id: number) => {
    try {
      const res = await api.get(`/api/subscription/virements/${id}/image`, {
        withCredentials: true,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(res.data as Blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      addNotification("Impossible d'afficher le justificatif", 'error');
    }
  };

  const handleValidateVirement = async (id: number, action: 'approve' | 'reject') => {
    try {
      setValidatingId(id);
      const payload: { action: 'approve' | 'reject'; months?: number; reject_reason?: string } = { action };
      if (action === 'approve') payload.months = monthsInput[id] || 12;
      if (action === 'reject') payload.reject_reason = rejectReasonInput[id] || '';

      await api.patch(`/api/subscription/virements/${id}/validate`, payload, { withCredentials: true });

      addNotification(
        action === 'approve' ? 'Abonnement activé avec succès' : 'Justificatif rejeté',
        'success'
      );
      fetchVirements();
      fetchAccounts();
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Erreur lors de la validation', 'error');
    } finally {
      setValidatingId(null);
    }
  };

  const formatMonthsPeriod = (v: Virement) => `${v.months_requested} mois`;

  // ─── FIXED: outside-click handler that respects in-progress menu actions.
  // This is the ONLY thing that closes the action menu — a plain click/tap outside
  // it, or clicking the toggle button itself again (handled in handleActionButtonClick).
  // No hover/mouseleave/scroll listener closes it anymore, so moving the cursor off
  // the menu no longer dismisses it. ───
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If we're mid-action, skip closing
      if (isHandlingMenuAction.current) return;

      if (modalOpen && modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setModalOpen(false);
      }
      if (actionMenuOpen !== null && actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        // Clicks inside the portaled état submenu land outside actionMenuRef's DOM
        // subtree (it's portaled separately), so check it explicitly before closing.
        if (etatSubmenuRef.current && etatSubmenuRef.current.contains(event.target as Node)) return;
        setActionMenuOpen(null);
        setMenuPosition(null);
      }
    };

    if (modalOpen || actionMenuOpen !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [modalOpen, actionMenuOpen]);

  // ─── Close the état flyout submenu whenever the action menu switches rows or closes ───
  useEffect(() => {
    setEtatSubmenuOpen(false);
    setEtatSubmenuPosition(null);
  }, [actionMenuOpen]);

  const resetForm = () => {
    setEmail('');
    setName('');
    setPrenom('');
    setIdProducteur('');
    setProfileId('');
    setCustomRole('');
    setUseCustomPermissions(false);
    setSelectedPageId('');
    setTempPermissions({ read: false, write: false, hide: false, apercu: false, upload: false, delete_file: false, create_folder: false });
    setConfiguredPermissions([]);
    setEditingPermId(null);
  };

  const openNewModal = () => {
    setEditingAccount(null);
    resetForm();
    if (!isSpecialUser && userIdProducteur) setIdProducteur(userIdProducteur);
    setModalOpen(true);
  };

  // ─── FIXED: openEditModal closes the menu first, then opens the modal ───
  const openEditModal = async (account: Account) => {
    // Close action menu immediately
    setActionMenuOpen(null);
    setMenuPosition(null);

    setEditingAccount(account);
    setEmail(account.email);
    setName(account.name || '');
    setPrenom(account.prenom || '');
    setIdProducteur(account.id_entite);
    setProfileId(account.profile_id || '');

    const profile = profiles.find((p) => p.id_profile === account.profile_id);
    const isCustom = !!profile?.role?.startsWith('Custom');
    setUseCustomPermissions(isCustom);
    setCustomRole(isCustom ? profile!.role || '' : '');

    if (isCustom) {
      try {
        const res = await api.get<AccountPermission[]>(
          `/api/account-permissions/${account.id_compte}`,
          { withCredentials: true }
        );
        const perms = res.data.map((perm) => ({
          page_id: perm.page_id,
          page_name: pages.find((page) => page.page_id === perm.page_id)?.page_name || '',
          read: !!perm.read,
          write: !!perm.write,
          hide: !!perm.hide,
          apercu: !!perm.apercu,
          upload: !!perm.upload,
          delete_file: !!perm.delete_file,
          create_folder: !!perm.create_folder,
        }));
        setConfiguredPermissions(perms);
      } catch (error: any) {
        addNotification(error.response?.data?.error || 'Échec de la récupération des permissions du compte', 'error');
      }
    } else {
      setConfiguredPermissions([]);
    }

    setModalOpen(true);
  };

  const handleTempPermissionChange = (field: keyof AccountPermission) => {
    setTempPermissions((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const applyPagePermissions = () => {
    if (!selectedPageId) return;
    const page = pages.find((p) => p.page_id === Number(selectedPageId));
    if (!page) return;
    const isMedia = page.page_name.toLowerCase() === 'media';
    const newPerm: AccountPermission = {
      page_id: page.page_id,
      page_name: page.page_name,
      read: !!tempPermissions.read,
      write: !!tempPermissions.write,
      hide: !!tempPermissions.hide,
    };
    if (isMedia) {
      newPerm.apercu = !!tempPermissions.apercu;
      newPerm.upload = !!tempPermissions.upload;
      newPerm.delete_file = !!tempPermissions.delete_file;
      newPerm.create_folder = !!tempPermissions.create_folder;
    }
    setConfiguredPermissions((prev) => {
      const updated = prev.filter((p) => p.page_id !== page.page_id);
      return [...updated, newPerm];
    });
    setTempPermissions({ read: false, write: false, hide: false, apercu: false, upload: false, delete_file: false, create_folder: false });
    setSelectedPageId('');
    setEditingPermId(null);
  };

  const startEditingPerm = (perm: AccountPermission) => {
    setEditingPermId(perm.page_id);
    setSelectedPageId(perm.page_id);
    setTempPermissions({
      read: perm.read,
      write: perm.write,
      hide: perm.hide,
      apercu: perm.apercu || false,
      upload: perm.upload || false,
      delete_file: perm.delete_file || false,
      create_folder: perm.create_folder || false,
    });
  };

  const cancelEditingPerm = () => {
    setEditingPermId(null);
    setSelectedPageId('');
    setTempPermissions({ read: false, write: false, hide: false, apercu: false, upload: false, delete_file: false, create_folder: false });
  };

  const removeConfiguredPermission = (pageId: number) => {
    setConfiguredPermissions((prev) => prev.filter((p) => p.page_id !== pageId));
  };

  const handleSelectAllPermissions = () => {
    const allPerms = pages.map((page) => {
      const isMedia = page.page_name.toLowerCase() === 'media';
      return {
        page_id: page.page_id,
        page_name: page.page_name,
        read: true,
        write: true,
        hide: false,
        ...(isMedia && { apercu: true, upload: true, delete_file: true, create_folder: true }),
      };
    });
    setConfiguredPermissions(allPerms);
  };

  const handleCustomPermissionsChange = (checked: boolean) => {
    setUseCustomPermissions(checked);
    if (!checked) {
      setProfileId('');
      setCustomRole('');
      setConfiguredPermissions([]);
    } else {
      setProfileId('');
    }
  };

  const handleProfileChange = (value: string) => {
    setProfileId(value ? Number(value) : '');
    if (value) {
      setUseCustomPermissions(false);
      setCustomRole('');
      setConfiguredPermissions([]);
    }
  };

  const handleEntityChange = (value: string) => {
    if (isSpecialUser) setIdProducteur(value ? Number(value) : '');
  };

  const generateRandomPassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  };

  const handleSendConnectionInfo = async (account: Account) => {
    // Close action menu
    setActionMenuOpen(null);
    setMenuPosition(null);

    try {
      // Backend handles password generation, hashing, DB update, PDF generation and email all in one call
      const res = await api.post<{ emailSent: boolean; emailError?: string }>(
        `/api/send-connection-info`,
        { email: account.email, sendEmail: true },
        { withCredentials: true }
      );

      // The backend now always resets the password / generates the PDF, but
      // email sending is best-effort — if SMTP is down it comes back with
      // emailSent: false instead of a 500, so tell the user honestly.
      if (res.data.emailSent) {
        addNotification('Fiche de connexion envoyée avec succès', 'success');
      } else {
        addNotification(
          `Mot de passe réinitialisé, mais l'email n'a pas pu être envoyé (${res.data.emailError || 'erreur SMTP'}). Utilisez "Télécharger" pour récupérer la fiche.`,
          'error'
        );
      }
      fetchAccounts();
    } catch (error: any) {
      addNotification(
        error.response?.data?.error || "Erreur lors de l'envoi de la fiche de connexion",
        'error'
      );
    }
  };

  // ─── FIX: "Télécharger" used to hit the same endpoint as "Envoyer", which only
  // responded once the OVH SMTP email had been sent — so a broken SMTP server (535
  // auth failure) made both buttons fail with the same 500, even though downloading
  // doesn't need email at all. We now pass sendEmail: false so the backend skips the
  // SMTP step entirely and just returns the generated PDF.
  const handleDownloadConnectionInfo = async (account: Account) => {
    setActionMenuOpen(null);
    setMenuPosition(null);

    const confirmed = window.confirm(
      `Télécharger la fiche de connexion de ${account.email} va générer un nouveau mot de passe pour ce compte. Continuer ?`
    );
    if (!confirmed) return;

    try {
      const res = await api.post<{ pdfBase64: string }>(
        `/api/send-connection-info`,
        { email: account.email, sendEmail: false },
        { withCredentials: true }
      );

      const byteChars = atob(res.data.pdfBase64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fiche_connexion_${account.email}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      addNotification('Fiche de connexion téléchargée avec succès', 'success');
      fetchAccounts();
    } catch (error: any) {
      addNotification(
        error.response?.data?.error || 'Erreur lors du téléchargement de la fiche de connexion',
        'error'
      );
    }
  };

  // ─── FIX: there was no delete action wired up anywhere in the UI, even though the backend
  // has a DELETE /api/comptes/:id endpoint — this is why accounts could never be removed.
  const handleDelete = async (account: Account) => {
    setActionMenuOpen(null);
    setMenuPosition(null);

    if (account.id_compte === idCompte) {
      addNotification('Vous ne pouvez pas supprimer votre propre compte.', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Supprimer définitivement le compte ${account.email} ? Cette action est irréversible.`
    );
    if (!confirmed) return;

    try {
      await api.delete(`/api/comptes/${account.id_compte}`, { withCredentials: true });
      addNotification('Compte supprimé avec succès', 'success');
      fetchAccounts();
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Erreur lors de la suppression du compte', 'error');
    }
  };

  const handleSubmit = async () => {
    if (!email) { addNotification("L'email est requis", 'error'); return; }
    if (useCustomPermissions && !customRole.trim()) { addNotification('Le nom du profil personnalisé est requis', 'error'); return; }
    if (useCustomPermissions && configuredPermissions.length === 0) { addNotification('Veuillez définir au moins une permission personnalisée', 'error'); return; }

    const payload = {
      id_entite: idProducteur || 1,
      email,
      name: name || null,
      prenom: prenom || null,
      profile_id: useCustomPermissions ? null : profileId || 8,
      useCustomPermissions,
      ...(useCustomPermissions && { role: customRole.trim() }),
      ...(useCustomPermissions && {
        permissions: configuredPermissions.map((p) => ({
          page_id: p.page_id,
          read: p.read ? 1 : 0,
          write: p.write ? 1 : 0,
          hide: p.hide ? 1 : 0,
          ...(p.page_name?.toLowerCase() === 'media' && {
            apercu: p.apercu ? 1 : 0,
            upload: p.upload ? 1 : 0,
            delete_file: p.delete_file ? 1 : 0,
            create_folder: p.create_folder ? 1 : 0,
          }),
        })),
      }),
    };

    try {
      if (editingAccount) {
        await api.put(`/api/comptes/${editingAccount.id_compte}`, payload, { withCredentials: true });
        addNotification('Compte mis à jour avec succès', 'success');
      } else {
        await api.post(`/api/comptes`, payload, { withCredentials: true });
        addNotification('Compte créé avec succès', 'success');
      }
      setModalOpen(false);
      fetchAccounts();
      fetchProfiles();
    } catch (error: any) {
      addNotification(
        `${error.response?.data?.error || 'Erreur lors de la sauvegarde'}${error.response?.data?.details ? `: ${error.response.data.details}` : ''}`,
        'error'
      );
    }
  };

  // ─── NEW: replaces the old binary handleSuspend — an admin/master can now move an
  // account through any of the four états instead of only toggling suspended/active.
  // Calls the new PATCH /api/comptes/:id/etat endpoint (see server.js).
  const handleChangeEtat = async (id: number, etat: AccountEtat) => {
    setActionMenuOpen(null);
    setMenuPosition(null);

    // ─── FIX: never let an account change its own état — a self-suspend/self-disable is a
    // permanent lockout since the account can't log back in to undo it. The server enforces
    // this too; this check just gives an immediate, friendly message instead of a failed request.
    if (id === idCompte) {
      addNotification('Vous ne pouvez pas modifier l’état de votre propre compte.', 'error');
      return;
    }

    try {
      setSuspending(id);
      await api.patch(`/api/comptes/${id}/etat`, { etat }, { withCredentials: true });
      addNotification(`État du compte mis à jour : ${ETAT_LABELS[etat].label}`, 'success');
      fetchAccounts();
    } catch (error: any) {
      addNotification(error.response?.data?.error || "Erreur lors du changement d'état", 'error');
    } finally {
      setSuspending(null);
    }
  };

  // ─── NEW: flag/unflag an account as the master account of its entity (999/111 only).
  // The server enforces uniqueness — flagging a new master clears the previous one for
  // that same entity, so there's always at most one master per entity.
  const handleToggleMaster = async (account: Account) => {
    setActionMenuOpen(null);
    setMenuPosition(null);
    try {
      setSuspending(account.id_compte);
      await api.patch(
        `/api/comptes/${account.id_compte}/master`,
        { is_master: !account.is_master },
        { withCredentials: true }
      );
      addNotification(
        !account.is_master ? 'Compte défini comme Admin de son entité' : 'Statut Admin retiré',
        'success'
      );
      fetchAccounts();
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Erreur lors de la mise à jour du statut Admin', 'error');
    } finally {
      setSuspending(null);
    }
  };

  // ─── NEW: flag/unflag the account responsible for payment within its entity. Only this
  // account will see the paywall + trial-ending notifications; the server enforces
  // uniqueness per entity the same way it does for the master flag.
  const handleTogglePaymentResponsible = async (account: Account) => {
    setActionMenuOpen(null);
    setMenuPosition(null);
    try {
      setSuspending(account.id_compte);
      await api.patch(
        `/api/comptes/${account.id_compte}/payment-responsible`,
        { is_payment_responsible: !account.is_payment_responsible },
        { withCredentials: true }
      );
      addNotification(
        !account.is_payment_responsible
          ? 'Compte défini comme responsable du paiement pour son entité'
          : 'Statut de responsable du paiement retiré',
        'success'
      );
      fetchAccounts();
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Erreur lors de la mise à jour du responsable paiement', 'error');
    } finally {
      setSuspending(null);
    }
  };

  // ─── NEW: manual subscription overrides — lets an admin/master mark an account's
  // subscription as expired (e.g. to test the paywall) or put it back into trial (e.g. to
  // undo that, or to extend a demo) without needing a real payment or virement. Calls the
  // new PATCH /api/comptes/:id_compte/subscription endpoint (see server.js). Same
  // "never on your own account" rule as handleChangeEtat, enforced both here and server-side.
  const handleExpireSubscription = async (account: Account) => {
    setActionMenuOpen(null);
    setMenuPosition(null);

    if (account.id_compte === idCompte) {
      addNotification('Vous ne pouvez pas modifier l’abonnement de votre propre compte.', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Marquer l'abonnement de ${account.email} comme expiré ? Le compte perdra l'accès jusqu'à un nouveau paiement ou une remise en essai.`
    );
    if (!confirmed) return;

    try {
      setSuspending(account.id_compte);
      await api.patch(`/api/comptes/${account.id_compte}/subscription`, { action: 'expire' }, { withCredentials: true });
      addNotification('Abonnement marqué comme expiré', 'success');
      fetchAccounts();
    } catch (error: any) {
      addNotification(error.response?.data?.error || "Erreur lors de l'expiration de l'abonnement", 'error');
    } finally {
      setSuspending(null);
    }
  };

  const handleResetTrial = async (account: Account) => {
    setActionMenuOpen(null);
    setMenuPosition(null);

    if (account.id_compte === idCompte) {
      addNotification('Vous ne pouvez pas modifier l’abonnement de votre propre compte.', 'error');
      return;
    }

    const confirmed = window.confirm(`Remettre le compte ${account.email} en période d'essai ?`);
    if (!confirmed) return;

    try {
      setSuspending(account.id_compte);
      await api.patch(`/api/comptes/${account.id_compte}/subscription`, { action: 'trial' }, { withCredentials: true });
      addNotification('Compte remis en période d’essai', 'success');
      fetchAccounts();
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Erreur lors de la remise en essai', 'error');
    } finally {
      setSuspending(null);
    }
  };

  // ─── FIXED: use mousedown + stopPropagation so the outside-click never fires first ───
  // ─── FIXED: menu now always fits on screen. Instead of guessing a fixed menu height,
  // we pick whichever side (above/below the button) has more room, then cap the menu's
  // own height to that available space (it scrolls internally past that, via
  // overflow-y-auto) so none of its options are ever cut off by the viewport edge. ───
  const handleActionButtonClick = (accountId: number, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const menuWidth = 256; // matches w-64
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let menuLeft = rect.right - menuWidth;
    if (menuLeft < margin) menuLeft = margin;
    if (menuLeft + menuWidth > viewportWidth - margin) menuLeft = viewportWidth - menuWidth - margin;

    const spaceBelow = viewportHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    let menuTop: number;
    let maxHeight: number;
    if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
      // Open downward, capped to whatever room is actually left below the button.
      menuTop = rect.bottom + 4;
      maxHeight = Math.max(150, spaceBelow - 4);
    } else {
      // Not enough room below — open upward instead, capped the same way.
      maxHeight = Math.max(150, spaceAbove - 4);
      menuTop = Math.max(margin, rect.top - maxHeight - 4);
    }

    setMenuPosition({ top: menuTop, left: menuLeft, maxHeight });
    setActionMenuOpen(actionMenuOpen === accountId ? null : accountId);
  };

  const handleSort = (key: keyof Account | 'raison_socialle' | 'profile' | 'subscription_status' | 'etat') => {
    setSortConfig((prev) => {
      const isSameKey = prev.key === key;
      const direction = isSameKey && prev.direction === 'ASC' ? 'DESC' : 'ASC';
      setAccounts((prevAccounts) => {
        const sortedAccounts = [...prevAccounts];
        sortedAccounts.sort((a, b) => {
          let aValue: any;
          let bValue: any;
          if (key === 'raison_socialle') {
            aValue = companies.find((c) => c.id_entite === a.id_entite)?.raison_socialle || '';
            bValue = companies.find((c) => c.id_entite === b.id_entite)?.raison_socialle || '';
          } else if (key === 'etat') {
            aValue = ETAT_ORDER.indexOf(a.etat || 'active');
            bValue = ETAT_ORDER.indexOf(b.etat || 'active');
          } else if (key === 'profile') {
            const aProfile = profiles.find((p) => p.id_profile === a.profile_id);
            const bProfile = profiles.find((p) => p.id_profile === b.profile_id);
            aValue = aProfile?.role?.startsWith('Custom') ? 'Permissions personnalisées' : aProfile?.role || 'N/A';
            bValue = bProfile?.role?.startsWith('Custom') ? 'Permissions personnalisées' : bProfile?.role || 'N/A';
          } else if (key === 'name') {
            aValue = ((a.name || '') + ' ' + (a.prenom || '')).trim();
            bValue = ((b.name || '') + ' ' + (b.prenom || '')).trim();
          } else if (key === 'prenom') {
            aValue = a.prenom || '';
            bValue = b.prenom || '';
          } else if (key === 'created_at') {
            // ─── NEW: sort chronologically rather than lexically ───
            const aTime = new Date(a.created_at).getTime();
            const bTime = new Date(b.created_at).getTime();
            aValue = Number.isNaN(aTime) ? 0 : aTime;
            bValue = Number.isNaN(bTime) ? 0 : bTime;
          } else if (key === 'subscription_status') {
            aValue = SUBSCRIPTION_LABELS[a.subscription_status || 'trial']?.label || '';
            bValue = SUBSCRIPTION_LABELS[b.subscription_status || 'trial']?.label || '';
          } else {
            aValue = (a as any)[key] || '';
            bValue = (b as any)[key] || '';
          }
          if (aValue === '' && bValue !== '') return 1;
          if (bValue === '' && aValue !== '') return -1;
          if (aValue === '' && bValue === '') return 0;
          if (typeof aValue === 'string') { aValue = aValue.toLowerCase(); bValue = bValue.toLowerCase(); }
          if (aValue < bValue) return direction === 'ASC' ? -1 : 1;
          if (aValue > bValue) return direction === 'ASC' ? 1 : -1;
          return 0;
        });
        return sortedAccounts;
      });
      return { key, direction };
    });
  };

  const currentEntityId = useMemo(() => {
    let entityId: number | null = editingAccount?.id_entite ?? null;
    if (!entityId && idProducteur) entityId = Number(idProducteur);
    if (entityId === 0) entityId = null;
    return entityId;
  }, [editingAccount, idProducteur]);

  const filteredProfilesForSelect = useMemo(() => {
    if (!profiles.length) return [];
    const global = profiles.filter((p) => p.id_entite === null && !p.is_suspended);
    const entityId = Number(currentEntityId || userIdProducteur || 0);
    const entityProfiles = profiles.filter((p) => !p.is_suspended && p.id_entite === entityId);
    return [...global, ...entityProfiles];
  }, [profiles, currentEntityId, userIdProducteur]);

  // ─── HIERARCHY RULE: entity 999 never appears in entity pickers/dropdowns unless you ARE 999 ───
  // This keeps 111 (and everyone else) from filtering by, or assigning new accounts to, entity 999.
  const visibleCompanies = useMemo(() => {
    if (isTopEntity) return companies;
    return companies.filter((c) => c.id_entite !== TOP_ENTITY_ID);
  }, [companies, isTopEntity]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('fr-FR');
  };

  // ─── NEW: subscription badge for the accounts table ───
  const renderSubscriptionBadge = (account: Account) => {
    const isPrivilegedAccount = [TOP_ENTITY_ID, SECOND_ENTITY_ID].includes(account.id_entite);
    if (isPrivilegedAccount) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          Admin (accès illimité)
        </span>
      );
    }
    const status = account.subscription_status || 'trial';
    const info = SUBSCRIPTION_LABELS[status] || SUBSCRIPTION_LABELS.trial;
    let sub = '';
    if (status === 'active' && account.subscription_expires_at) {
      sub = `jusqu'au ${formatDate(account.subscription_expires_at)}`;
    } else if (status === 'trial') {
      const trialEnd = new Date(account.created_at);
      trialEnd.setDate(trialEnd.getDate() + 30);
      const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000));
      sub = `${daysLeft} j restants`;
    }
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${info.className}`}>
          {info.label}
        </span>
        {sub && <span className="text-[11px] text-gray-500">{sub}</span>}
      </div>
    );
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterEntity('all');
    setFilterStatus('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterSubscription('all');
  };

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        account.email.toLowerCase().includes(searchLower) ||
        (account.name || '').toLowerCase().includes(searchLower) ||
        (account.prenom || '').toLowerCase().includes(searchLower) ||
        (companies.find((c) => c.id_entite === account.id_entite)?.raison_socialle || '').toLowerCase().includes(searchLower) ||
        (profiles.find((p) => p.id_profile === account.profile_id)?.role || '').toLowerCase().includes(searchLower);
      const matchesEntity = filterEntity === 'all' || account.id_entite === filterEntity;
      const matchesStatus = filterStatus === 'all' || (account.etat || 'active') === filterStatus;

      // ─── NEW: creation-date range filter ───
      const accountDate = new Date(account.created_at);
      const matchesDateFrom = !filterDateFrom || (!Number.isNaN(accountDate.getTime()) && accountDate >= new Date(filterDateFrom));
      const matchesDateTo = !filterDateTo || (!Number.isNaN(accountDate.getTime()) && accountDate <= new Date(`${filterDateTo}T23:59:59.999`));

      // ─── NEW: subscription status filter ───
      const matchesSubscription =
        filterSubscription === 'all' || (account.subscription_status || 'trial') === filterSubscription;

      return matchesSearch && matchesEntity && matchesStatus && matchesDateFrom && matchesDateTo && matchesSubscription;
    });
  }, [accounts, searchQuery, filterEntity, filterStatus, filterDateFrom, filterDateTo, filterSubscription, companies, profiles]);

  // ─── NEW: rows for the table, grouped by entity for 999/111 so the whole account book
  // reads as "entity → its accounts" instead of one big undifferentiated list. Within each
  // entity, the master account (if any) is pinned to the top and visually flagged; regular
  // users/masters (who already only ever see their own entity) get a single ungrouped
  // group, so no header clutter for them.
  type TableRow =
    | { type: 'header'; id_entite: number; name: string; masterEmail: string | null }
    | { type: 'account'; account: Account };

  const groupedRows = useMemo<TableRow[]>(() => {
    if (!isSpecialUser) {
      // Single-entity view: master account still pinned first, no header row needed.
      const sorted = [...filteredAccounts].sort((a, b) => (b.is_master ? 1 : 0) - (a.is_master ? 1 : 0));
      return sorted.map((account) => ({ type: 'account', account }));
    }

    const byEntity = new Map<number, Account[]>();
    for (const account of filteredAccounts) {
      const list = byEntity.get(account.id_entite) || [];
      list.push(account);
      byEntity.set(account.id_entite, list);
    }

    const entityIds = Array.from(byEntity.keys()).sort((a, b) => {
      const nameA = companies.find((c) => c.id_entite === a)?.raison_socialle || '';
      const nameB = companies.find((c) => c.id_entite === b)?.raison_socialle || '';
      return nameA.localeCompare(nameB);
    });

    const rows: TableRow[] = [];
    for (const entityId of entityIds) {
      const entityAccounts = byEntity.get(entityId)!;
      // Master account(s) pinned to the top of their entity's group.
      entityAccounts.sort((a, b) => (b.is_master ? 1 : 0) - (a.is_master ? 1 : 0));
      const masterEmail = entityAccounts.find((a) => a.is_master)?.email || null;
      const entityName = companies.find((c) => c.id_entite === entityId)?.raison_socialle
        || entityAccounts[0]?.producer_name
        || `Entité ${entityId}`;
      rows.push({ type: 'header', id_entite: entityId, name: entityName, masterEmail });
      for (const account of entityAccounts) rows.push({ type: 'account', account });
    }
    return rows;
  }, [filteredAccounts, isSpecialUser, companies]);

  // ─── NEW: illustrative preview values for the iPay bank-demo notice — a mocked
  // transaction row + reference, shaped just like a real one, purely to show what the
  // account will see once the payment is recorded (see the "iPay demo notice" modal below).
  const demoTransactionPreview = useMemo(() => {
    if (!ipayDemoNoticeOpen) return null;
    const now = Date.now();
    const rand = Math.random().toString(16).slice(2, 8);
    return {
      id: `${rand}${now.toString(16).slice(-2)}`.slice(0, 8),
      reference: `CO-3-${now}-${rand}`,
      clientName: [userAccount?.prenom, userAccount?.name].filter(Boolean).join(' ') || userAccount?.email || 'Votre compte',
    };
  }, [ipayDemoNoticeOpen, userAccount]);

  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Paramètres</span>
        <span className="text-gray-300">›</span>
        <span className="text-blue-600 font-medium">Comptes</span>
      </nav>
      <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">

        {/* ─── NEW: trial/subscription banner for the logged-in user's own account ─── */}
        {subStatus && !subStatus.is_privileged && !subStatus.has_access && (
          <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-red-800">
              {canSubmitPayment
                ? "Votre période d'essai ou votre abonnement a expiré. Soumettez un justificatif de virement pour retrouver l'accès."
                : "L'essai ou l'abonnement de votre entité a expiré. Contactez votre administrateur pour régulariser la situation."}
            </p>
            {/* ─── NEW: only the entity's payment-responsible account gets the submit button;
                everyone else is pointed at their admin instead. ─── */}
            {canSubmitPayment && (
              <button
                onClick={handleOpenSubscriptionModal}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors whitespace-nowrap"
              >
                Soumettre mon virement
              </button>
            )}
          </div>
        )}
        {subStatus && !subStatus.is_privileged && subStatus.has_access && subStatus.subscription_status === 'trial' && subStatus.days_left_trial <= 10 && (
          <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-amber-800">
              {canSubmitPayment
                ? `Votre période d'essai gratuite se termine dans ${subStatus.days_left_trial} jour${subStatus.days_left_trial > 1 ? 's' : ''}. Pensez à soumettre votre justificatif de virement pour éviter toute interruption d'accès.`
                : `La période d'essai de votre entité se termine dans ${subStatus.days_left_trial} jour${subStatus.days_left_trial > 1 ? 's' : ''}. Contactez votre administrateur pour éviter toute interruption d'accès.`}
            </p>
            {canSubmitPayment && (
              <button
                onClick={handleOpenSubscriptionModal}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium transition-colors whitespace-nowrap"
              >
                Soumettre mon virement
              </button>
            )}
          </div>
        )}
        {subStatus && !subStatus.is_privileged && subStatus.subscription_status === 'pending_review' && (
          <div className="mb-4 p-4 rounded-lg border border-yellow-200 bg-yellow-50">
            <p className="text-sm text-yellow-800">
              Votre justificatif de virement est en cours de validation par l'administrateur. Vous conservez l'accès pendant ce temps.
            </p>
          </div>
        )}

        {/* ─── FIX: previously the full account-management table (and every other page,
            wherever they don't check this too) rendered no matter what, even when the
            banner above says access is blocked. An expired account should only be able to
            reach this subscription section — everything else is now gated behind
            `restrictedBySubscription`. See server.js's new `requireAccountAccess` middleware
            for the matching backend enforcement (the UI gate alone is not security). ─── */}
        {restrictedBySubscription ? (
          <div className="bg-white shadow-md rounded-lg overflow-hidden p-8 text-center">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Accès restreint</h2>
            <p className="text-sm text-gray-600 max-w-lg mx-auto mb-6">
              {canSubmitPayment
                ? "Votre période d'essai ou votre abonnement a expiré. La gestion des comptes est indisponible tant que votre situation n'est pas régularisée. Soumettez votre justificatif de virement ci-dessus ; vous retrouverez l'accès dès sa validation par un administrateur."
                : "L'essai ou l'abonnement de votre entité a expiré. La gestion des comptes est indisponible tant que la situation n'est pas régularisée. Contactez votre administrateur — seul le compte responsable du paiement de votre entité peut soumettre un justificatif."}
            </p>
            {canSubmitPayment && (
              <button
                onClick={handleOpenSubscriptionModal}
                className="px-6 py-3 bg-blue-950 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition-colors"
              >
                Soumettre mon virement
              </button>
            )}
          </div>
        ) : (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                {/* ─── FIX: creating an account is now gated to admins/masters in the UI too —
                    it was previously shown to everyone, and the server now enforces the same
                    entity-scoping rule (see server.js POST /api/comptes). ─── */}
                {isAdminUser && (
                  <button
                    onClick={openNewModal}
                    className="px-4 py-2 bg-blue-950 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition-colors w-full md:w-auto"
                  >
                    Ajouter
                  </button>
                )}
                {!isSpecialUser && (
                  <button
                    onClick={handleOpenSubscriptionModal}
                    className="px-4 py-2 border border-blue-950 text-blue-950 rounded-lg hover:bg-blue-50 text-sm font-medium transition-colors w-full md:w-auto"
                  >
                    Mon abonnement
                  </button>
                )}
                {isSpecialUser && (
                  <button
                    onClick={() => setVirementsModalOpen(true)}
                    className="px-4 py-2 border border-blue-950 text-blue-950 rounded-lg hover:bg-blue-50 text-sm font-medium transition-colors w-full md:w-auto"
                  >
                    Justificatifs de virement
                  </button>
                )}
              </div>
            </div>

            {/* ─── NEW: filter bar now includes entity, status, creation-date range, and a reset action ─── */}
            <div className="flex flex-col md:flex-row md:flex-wrap md:items-end gap-4 mb-4">
              <input
                type="text"
                placeholder="Rechercher par email, nom, prénom, entité ou profil..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:flex-1 md:min-w-[220px] border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
              />
              <EntityCombobox
                companies={visibleCompanies}
                value={filterEntity}
                onChange={(v) => setFilterEntity(v === '' ? 'all' : v)}
                allLabel="Toutes les entités"
                placeholder="Filtrer par entité (nom ou identifiant national)..."
                className="w-full md:w-64"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | AccountEtat)}
                className="w-full md:w-auto border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
              >
                <option value="all">Tous les statuts</option>
                {ETAT_ORDER.map((etat) => (
                  <option key={etat} value={etat}>{ETAT_LABELS[etat].label}</option>
                ))}
              </select>
              <select
                value={filterSubscription}
                onChange={(e) => setFilterSubscription(e.target.value as 'all' | SubscriptionState)}
                className="w-full md:w-auto border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
              >
                <option value="all">Tous les abonnements</option>
                <option value="trial">Essai</option>
                <option value="pending_review">En attente</option>
                <option value="active">Actif</option>
                <option value="expired">Expiré</option>
                <option value="suspended">Suspendu</option>
              </select>
              <div className="w-full md:w-auto">
                <label className="block text-xs font-medium text-gray-500 mb-1">Créé à partir du</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full md:w-auto border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
                />
              </div>
              <div className="w-full md:w-auto">
                <label className="block text-xs font-medium text-gray-500 mb-1">Créé jusqu'au</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full md:w-auto border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
                />
              </div>
              <button
                onClick={resetFilters}
                className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
              >
                Réinitialiser les filtres
              </button>
            </div>

            {loading ? (
              <p className="text-center text-gray-600 text-sm">Chargement des comptes...</p>
            ) : filteredAccounts.length === 0 ? (
              <p className="text-center text-gray-600 text-sm">Aucun compte disponible</p>
            ) : (
              /* ─── FIX: table used to be `min-w-max` inside an `overflow-x-auto` wrapper —
                  that forces the table to be exactly as wide as its unwrapped content,
                  which is wider than the screen on anything but a big monitor, hence the
                  side-scrolling. `table-fixed` + explicit column widths below makes the
                  table always exactly as wide as its container: cells wrap their text
                  instead of pushing the table wider, so there's nothing left to scroll. ─── */
              <div>
                <table className="w-full border-collapse table-fixed">
                  <colgroup>
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '9%' }} />
                  </colgroup>
                  <thead className="bg-blue-950 text-white text-xs md:text-sm font-medium">
                    <tr>
                      <th className="p-1.5 md:p-3 text-center break-words cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('profile')}>
                        Nom Profil {sortConfig.key === 'profile' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-1.5 md:p-3 text-left break-words cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('email')}>
                        Email {sortConfig.key === 'email' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-1.5 md:p-3 text-left break-words cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('name')}>
                        Nom {sortConfig.key === 'name' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-1.5 md:p-3 text-left break-words cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('prenom')}>
                        Prénom {sortConfig.key === 'prenom' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-1.5 md:p-3 text-left break-words cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('raison_socialle')}>
                        Entité {sortConfig.key === 'raison_socialle' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-1.5 md:p-3 text-center break-words">Rôle</th>
                      <th className="p-1.5 md:p-3 text-center break-words cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('created_at')}>
                        Date de création {sortConfig.key === 'created_at' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-1.5 md:p-3 text-center break-words cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('etat')}>
                        Statut {sortConfig.key === 'etat' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-1.5 md:p-3 text-center break-words cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('subscription_status')}>
                        Abonnement {sortConfig.key === 'subscription_status' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-1.5 md:p-3 text-center sticky right-0 z-20 bg-blue-950 shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.35)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedRows.map((row, index) => {
                      // ─── NEW: entity header row — only rendered for 999/111, groups the table
                      // by entity so the hierarchy (entité → ses comptes, dont son maître) reads
                      // at a glance instead of one flat undifferentiated list. ───
                      if (row.type === 'header') {
                        return (
                          <tr key={`entity-${row.id_entite}`} className="bg-blue-100 text-xs md:text-sm">
                            <td colSpan={10} className="border-t border-b border-blue-200 p-2 md:p-3 font-semibold text-blue-950">
                              🏢 {row.name}
                              {row.masterEmail && (
                                <span className="ml-2 font-normal text-blue-800">— admin : {row.masterEmail}</span>
                              )}
                            </td>
                          </tr>
                        );
                      }

                      const account = row.account;
                      const profile = profiles.find((p) => p.id_profile === account.profile_id);
                      const roleDisplay = profile?.role?.startsWith('Custom') ? 'Permissions personnalisées' : profile?.role || 'N/A';
                      const etat = account.etat || 'active';
                      const etatInfo = ETAT_LABELS[etat] || ETAT_LABELS.active;
                      // ─── NEW: pulled out so the sticky Actions cell below can match the row's
                      // own background instead of showing through to whatever scrolls under it.
                      const rowBgClass = account.is_master
                        ? 'bg-amber-50'
                        : etat !== 'active'
                        ? 'bg-gray-200'
                        : index % 2 === 0
                        ? 'bg-white'
                        : 'bg-gray-50';
                      return (
                        <tr
                          key={account.id_compte}
                          className={`group ${rowBgClass} hover:bg-blue-50 transition-colors text-xs md:text-sm`}
                        >
                          {/* ─── NEW: entity-grouped rows are indented so master + regular accounts
                              are visually nested under their "🏢 entité" header row above. ─── */}
                          <td className="border-t border-gray-200 p-1.5 md:p-3 text-center whitespace-normal break-words">
                            <span className={isSpecialUser ? 'pl-3 inline-block' : ''}>{roleDisplay}</span>
                          </td>
                          <td className="border-t border-gray-200 p-1.5 md:p-3 text-left whitespace-normal break-words">
                            <span className={isSpecialUser ? 'pl-3' : ''}>{account.email}</span>
                          </td>
                          <td className="border-t border-gray-200 p-1.5 md:p-3 text-left whitespace-normal break-words">{account.name || 'N/A'}</td>
                          <td className="border-t border-gray-200 p-1.5 md:p-3 text-left whitespace-normal break-words">{account.prenom || 'N/A'}</td>
                          <td className="border-t border-gray-200 p-1.5 md:p-3 text-left whitespace-normal break-words">
                            {companies.find((c) => c.id_entite === account.id_entite)?.raison_socialle || account.producer_name || 'N/A'}
                          </td>
                          {/* ─── NEW: master + payment-responsible badges, plainly visible ─── */}
                          <td className="border-t border-gray-200 p-1.5 md:p-3 text-center whitespace-normal break-words">
                            <div className="flex flex-col items-center gap-1">
                              {account.is_master && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-200 text-amber-900">
                                  ⭐ Admin
                                </span>
                              )}
                              {account.is_payment_responsible && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-800">
                                  💳 Paiement
                                </span>
                              )}
                              {!account.is_master && !account.is_payment_responsible && (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </div>
                          </td>
                          <td className="border-t border-gray-200 p-1.5 md:p-3 text-center whitespace-normal break-words">
                            {formatDate(account.created_at)}
                          </td>
                          <td className="border-t border-gray-200 p-1.5 md:p-3 text-center whitespace-normal break-words">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${etatInfo.className}`}>
                              {etatInfo.label}
                            </span>
                          </td>
                          <td className="border-t border-gray-200 p-1.5 md:p-3 text-center whitespace-normal break-words">
                            {renderSubscriptionBadge(account)}
                          </td>
                          <td
                            className={`border-t border-gray-200 p-1.5 md:p-3 text-center relative sticky right-0 z-10 ${rowBgClass} group-hover:bg-blue-50 shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.15)]`}
                          >
                            <button
                              onClick={(e) => handleActionButtonClick(account.id_compte, e)}
                              className={`px-1.5 md:px-3 py-1 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition-colors text-base md:text-lg font-medium ${
                                suspending === account.id_compte ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              disabled={suspending === account.id_compte}
                              aria-label={`Ouvrir le menu d'actions pour le compte ${account.id_compte}`}
                              aria-expanded={actionMenuOpen === account.id_compte}
                            >
                              {suspending === account.id_compte ? 'En cours...' : '☰'}
                            </button>

                            {/* ─── FIXED: rendered via a portal straight onto <body> instead of inline
                                inside the sticky Actions cell. That cell is `position: sticky` with a
                                z-index, which creates its own local stacking context — a `fixed` element
                                nested inside it was still confined to that context, so later rows'
                                sticky cells (same z-index, later in paint order) could end up covering
                                this menu even though it's visually "in front". A portal escapes the
                                table entirely, so the menu always renders on top, unconditionally. ─── */}
                            {actionMenuOpen === account.id_compte && menuPosition && createPortal(
                              <div
                                ref={actionMenuRef}
                                className="fixed z-30 w-64 bg-white border border-gray-200 rounded-lg shadow-xl overflow-y-auto overflow-x-visible"
                                style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px`, maxHeight: `${menuPosition.maxHeight}px` }}
                                role="menu"
                              >
                                <button
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    openEditModal(account);
                                  }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-950 transition-colors"
                                  role="menuitem"
                                >
                                  Modifier
                                </button>

                                {/* ─── NEW: état sub-menu — replaces the old single suspend/reactivate
                                    toggle with the full set of états, so an admin/master can move an
                                    account into any state instead of only suspending it. Only offered
                                    when the caller is allowed to manage this account, matching the
                                    server-side rule, and never for the caller's own row. ─── */}
                                {canManageOtherAccount(account) && (
                                  <div className="border-t border-gray-100">
                                    <button
                                      ref={etatButtonRef}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();

                                        if (etatSubmenuOpen) {
                                          setEtatSubmenuOpen(false);
                                          setEtatSubmenuPosition(null);
                                          return;
                                        }

                                        const btn = e.currentTarget;
                                        const rect = btn.getBoundingClientRect();
                                        const submenuWidth = 176; // matches w-44
                                        const margin = 8;
                                        const gap = 4;

                                        // Always open to the right of "État". If there isn't quite
                                        // enough room, clamp it to stay on-screen rather than flipping
                                        // to the left side.
                                        let left = rect.right + gap;
                                        const maxLeft = window.innerWidth - submenuWidth - margin;
                                        if (left > maxLeft) left = maxLeft;
                                        if (left < margin) left = margin;

                                        let top = rect.top;
                                        const submenuHeightEstimate = 4 * 36 + 8; // 4 options + padding
                                        if (top + submenuHeightEstimate > window.innerHeight - margin) {
                                          top = Math.max(margin, window.innerHeight - margin - submenuHeightEstimate);
                                        }

                                        setEtatSubmenuPosition({ top, left });
                                        setEtatSubmenuOpen(true);
                                      }}
                                      className="flex items-center justify-between w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 transition-colors"
                                      role="menuitem"
                                      aria-haspopup="true"
                                      aria-expanded={etatSubmenuOpen}
                                    >
                                      <span>
                                        État{' '}
                                        <span
                                          className={`ml-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${ETAT_LABELS[etat].className}`}
                                        >
                                          {ETAT_LABELS[etat].label}
                                        </span>
                                      </span>
                                      <svg
                                        className="w-3 h-3 text-gray-700 flex-shrink-0"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={2.5}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <polyline points="9 6 15 12 9 18" />
                                      </svg>
                                    </button>
                                  </div>
                                )}

                                {/* ─── État flyout submenu, portaled to <body> just like the main
                                    action menu, using a fixed position computed at click time. This
                                    guarantees it's never clipped by any ancestor's overflow or stacking
                                    context, regardless of how close to a screen edge the row sits. ─── */}
                                {canManageOtherAccount(account) && etatSubmenuOpen && etatSubmenuPosition && createPortal(
                                  <div
                                    ref={etatSubmenuRef}
                                    className="fixed z-40 w-44 bg-white border border-gray-200 rounded-lg shadow-xl py-1"
                                    style={{ top: `${etatSubmenuPosition.top}px`, left: `${etatSubmenuPosition.left}px` }}
                                    role="menu"
                                  >
                                    {ETAT_ORDER.map((candidateEtat) => (
                                      <button
                                        key={candidateEtat}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleChangeEtat(account.id_compte, candidateEtat);
                                          setEtatSubmenuOpen(false);
                                          setEtatSubmenuPosition(null);
                                        }}
                                        disabled={etat === candidateEtat}
                                        className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                                          etat === candidateEtat
                                            ? `${ETAT_LABELS[candidateEtat].className} cursor-default font-medium`
                                            : 'text-gray-700 hover:bg-blue-100 hover:text-blue-950'
                                        }`}
                                        role="menuitem"
                                      >
                                        {etat === candidateEtat ? '✓ ' : ''}
                                        {ETAT_LABELS[candidateEtat].label}
                                      </button>
                                    ))}
                                  </div>,
                                  document.body
                                )}

                                {/* ─── NEW: manual subscription overrides — expire the account's
                                    subscription on demand, or put it back into a fresh trial.
                                    Same visibility rule as État / Supprimer. ─── */}
                                {canManageOtherAccount(account) && (
                                  <div className="border-t border-gray-100">
                                    <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                                      Abonnement
                                    </p>
                                    <button
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        handleResetTrial(account);
                                      }}
                                      className="block w-full text-left px-4 py-2 text-sm text-teal-700 hover:bg-teal-50 transition-colors"
                                      role="menuitem"
                                    >
                                      🔄 Remettre en essai
                                    </button>
                                    <button
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        handleExpireSubscription(account);
                                      }}
                                      className="block w-full text-left px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 transition-colors"
                                      role="menuitem"
                                    >
                                      ⛔ Marquer comme expiré
                                    </button>
                                  </div>
                                )}

                                {/* ─── NEW: 999/111 only — flag/unflag this account as the master
                                    account of its entity. ─── */}
                                {canFlagMaster && (
                                  <button
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      handleToggleMaster(account);
                                    }}
                                    className="block w-full text-left px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 transition-colors border-t border-gray-100"
                                    role="menuitem"
                                  >
                                    {account.is_master ? '⭐ Retirer le statut Admin' : '⭐ Devenir Admin'}
                                  </button>
                                )}

                                {/* ─── NEW: 999/111 or this entity's master — flag/unflag this account
                                    as the one responsible for payment/paywall in its entity. ─── */}
                                {canFlagPaymentResponsible(account) && (
                                  <button
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      handleTogglePaymentResponsible(account);
                                    }}
                                    className="block w-full text-left px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50 transition-colors"
                                    role="menuitem"
                                  >
                                    {account.is_payment_responsible ? '💳 Retirer le responsable paiement' : '💳 Définir comme responsable paiement'}
                                  </button>
                                )}

                                <button
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    handleSendConnectionInfo(account);
                                  }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-950 transition-colors border-t border-gray-100"
                                  role="menuitem"
                                >
                                  Envoyer fiche connexion
                                </button>
                                {/* ─── FIX: this used to call handleSendConnectionInfo (same as the button
                                    above), so it silently re-sent an email instead of downloading a file.
                                    It now actually downloads the generated PDF. ─── */}
                                <button
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    handleDownloadConnectionInfo(account);
                                  }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-950 transition-colors"
                                  role="menuitem"
                                >
                                  Télécharger fiche connexion
                                </button>
                                {/* ─── FIX: there was previously no way to delete an account from the UI
                                    at all, even though the backend supports it. ─── */}
                                {canManageOtherAccount(account) && (
                                  <button
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      handleDelete(account);
                                    }}
                                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
                                    role="menuitem"
                                  >
                                    Supprimer
                                  </button>
                                )}
                              </div>,
                              document.body
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}

        {/* ─── Modal ─── */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div
              ref={modalRef}
              className="bg-white rounded-xl p-8 w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-custom shadow-2xl ring-1 ring-gray-200"
            >
              <h2 className="text-2xl font-semibold mb-6 text-blue-950">
                {editingAccount ? 'Modifier le compte' : 'Nouveau compte'}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Entité</label>
                  <EntityCombobox
                    companies={visibleCompanies}
                    value={idProducteur}
                    onChange={(v) => handleEntityChange(v === '' || v === 'all' ? '' : String(v))}
                    placeholder="Sélectionner une entité (par défaut: ID 1) — nom ou identifiant national"
                    disabled={!isSpecialUser}
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    className="w-full border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Entrez le courriel"
                    required
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Nom</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Entrez votre nom"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Prénom</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    placeholder="Entrez votre prenom"
                  />
                </div>
              </div>

              <label className="block mb-2 text-sm font-medium text-gray-700">Profil</label>
              <select
                className="w-full border border-gray-200 rounded-lg p-3 mb-6 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                value={profileId}
                onChange={(e) => handleProfileChange(e.target.value)}
                disabled={useCustomPermissions}
              >
                <option value="">Sélectionner un profil (par défaut: ID 8)</option>
                {filteredProfilesForSelect.map((profile) => (
                  <option key={profile.id_profile} value={profile.id_profile}>
                    {profile.role || `Profil ${profile.id_profile}`} {profile.id_entite ? `(Spécifique à ${profile.company_name})` : '(Global)'}
                  </option>
                ))}
              </select>

              <label className="flex items-center mb-6">
                <input
                  type="checkbox"
                  checked={useCustomPermissions}
                  onChange={(e) => handleCustomPermissionsChange(e.target.checked)}
                  className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                />
                <span className="ml-2 text-sm text-gray-700">Utiliser des permissions personnalisées</span>
              </label>

              {useCustomPermissions && (
                <>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Nom du Profil Personnalisé</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg p-3 mb-6 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder="Entrez le nom du profil"
                    required
                  />
                  <p className="text-sm text-gray-600 mb-6">
                    Pour ajouter des permissions personnalisées : Sélectionnez une page dans la liste déroulante, cochez les permissions souhaitées, cliquez sur 'Appliquer', puis sélectionnez une autre page si nécessaire. Répétez pour chaque page.
                  </p>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Permissions personnalisées</label>
                  <button
                    onClick={handleSelectAllPermissions}
                    className="mb-6 px-4 py-2 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium"
                  >
                    Sélectionner toutes les pages et permissions (Lire/Écrire)
                  </button>

                  <div className="mb-6">
                    <select
                      value={selectedPageId}
                      onChange={(e) => setSelectedPageId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full border border-gray-200 rounded-lg p-3 mb-3 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    >
                      <option value="">Sélectionner une page</option>
                      {pages.map((page) => (
                        <option key={page.page_id} value={page.page_id}>{page.page_name}</option>
                      ))}
                    </select>

                    {selectedPageId && (
                      <div className="mb-4 pl-0 sm:pl-2 bg-gray-50 p-4 rounded-lg shadow-sm">
                        <h4 className="text-sm font-medium mb-3 text-gray-800">
                          Permissions pour {pages.find((p) => p.page_id === Number(selectedPageId))?.page_name}
                        </h4>
                        {pages.find((p) => p.page_id === Number(selectedPageId))?.page_name.toLowerCase() === 'media' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(['apercu', 'upload', 'delete_file', 'create_folder'] as const).map((field) => (
                              <label key={field} className="flex items-center">
                                <input type="checkbox" checked={!!tempPermissions[field]} onChange={() => handleTempPermissionChange(field)} className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950" />
                                <span className="ml-2 text-sm text-gray-700">
                                  {field === 'apercu' ? 'Aperçu' : field === 'upload' ? 'Upload' : field === 'delete_file' ? 'Supprimer fichier' : 'Créer dossier'}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {(['read', 'write', 'hide'] as const).map((field) => (
                              <label key={field} className="flex items-center">
                                <input type="checkbox" checked={!!tempPermissions[field]} onChange={() => handleTempPermissionChange(field)} className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950" />
                                <span className="ml-2 text-sm text-gray-700">
                                  {field === 'read' ? 'Lire' : field === 'write' ? 'Éditer' : 'Masquer'}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="flex space-x-3 mt-4">
                          <button onClick={applyPagePermissions} className="px-4 py-2 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium">Appliquer</button>
                          <button onClick={cancelEditingPerm} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors">Annuler</button>
                        </div>
                      </div>
                    )}

                    <div className="mt-6">
                      <h3 className="text-base font-medium mb-3 text-gray-800">Permissions configurées</h3>
                      {configuredPermissions.length === 0 ? (
                        <p className="text-sm text-gray-500">Aucune permission ajoutée pour le moment.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-4">
                          {configuredPermissions.map((perm) => {
                            const activePermissions: string[] = [];
                            if (perm.read) activePermissions.push('Lire');
                            if (perm.write) activePermissions.push('Éditer');
                            if (perm.hide) activePermissions.push('Masquer');
                            if (perm.apercu) activePermissions.push('Aperçu');
                            if (perm.upload) activePermissions.push('Upload');
                            if (perm.delete_file) activePermissions.push('Supprimer fichier');
                            if (perm.create_folder) activePermissions.push('Créer dossier');
                            return (
                              <div key={perm.page_id} className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-100">
                                <div className="flex justify-between items-center mb-3">
                                  <span className="font-medium text-gray-800">{perm.page_name}</span>
                                  <div className="space-x-2">
                                    <button onClick={() => startEditingPerm(perm)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Modifier</button>
                                    <button onClick={() => removeConfiguredPermission(perm.page_id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Supprimer</button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {activePermissions.length > 0 ? activePermissions.map((p) => (
                                    <span key={p} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{p}</span>
                                  )) : <span className="text-sm text-gray-500">Aucune</span>}
                                </div>
                                {editingPermId === perm.page_id && (
                                  <div className="mt-4 pt-4 border-t border-gray-200">
                                    {perm.page_name?.toLowerCase() === 'media' ? (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {(['apercu', 'upload', 'delete_file', 'create_folder'] as const).map((field) => (
                                          <label key={field} className="flex items-center">
                                            <input type="checkbox" checked={!!tempPermissions[field]} onChange={() => handleTempPermissionChange(field)} className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950" />
                                            <span className="ml-2 text-sm text-gray-700">
                                              {field === 'apercu' ? 'Aperçu' : field === 'upload' ? 'Upload' : field === 'delete_file' ? 'Supprimer fichier' : 'Créer dossier'}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {(['read', 'write', 'hide'] as const).map((field) => (
                                          <label key={field} className="flex items-center">
                                            <input type="checkbox" checked={!!tempPermissions[field]} onChange={() => handleTempPermissionChange(field)} className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950" />
                                            <span className="ml-2 text-sm text-gray-700">
                                              {field === 'read' ? 'Lire' : field === 'write' ? 'Éditer' : 'Masquer'}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex space-x-3 mt-4">
                                      <button onClick={applyPagePermissions} className="px-4 py-2 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium">Appliquer</button>
                                      <button onClick={cancelEditingPerm} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors">Annuler</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-4 mt-6">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-6 py-3 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-6 py-3 bg-blue-950 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={
                    !email ||
                    (useCustomPermissions && !customRole.trim()) ||
                    (useCustomPermissions && configuredPermissions.length === 0)
                  }
                >
                  {editingAccount ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── NEW: "Mon abonnement" modal — own trial status + virement submission ─── */}
        {subModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl p-8 w-full max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl ring-1 ring-gray-200">
              <h2 className="text-2xl font-semibold mb-6 text-blue-950">Mon abonnement</h2>

              {subStatus ? (
                <div className="mb-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Statut</span>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        SUBSCRIPTION_LABELS[subStatus.subscription_status]?.className || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {SUBSCRIPTION_LABELS[subStatus.subscription_status]?.label || subStatus.subscription_status}
                    </span>
                  </div>
                  {subStatus.subscription_status === 'trial' && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Fin de la période d'essai</span>
                      <span className="text-sm font-medium text-gray-800">
                        {formatDate(subStatus.trial_ends_at)} ({subStatus.days_left_trial} j restants)
                      </span>
                    </div>
                  )}
                  {subStatus.subscription_status === 'active' && subStatus.subscription_expires_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Abonnement valide jusqu'au</span>
                      <span className="text-sm font-medium text-gray-800">{formatDate(subStatus.subscription_expires_at)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Accès actuel</span>
                    <span className={`text-sm font-medium ${subStatus.has_access ? 'text-green-700' : 'text-red-700'}`}>
                      {subStatus.has_access ? 'Autorisé' : 'Bloqué'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-6">Chargement du statut...</p>
              )}

              <hr className="my-6 border-gray-200" />

              {/* ─── NEW: only the entity's payment-responsible account gets the upload form;
                  everyone else sees a simple "contact your admin" notice instead. ─── */}
              {!canSubmitPayment ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-700">
                    Le paiement et le justificatif de virement de votre entité sont gérés par un autre compte.
                    Contactez votre administrateur si vous pensez que l'accès doit être régularisé.
                  </p>
                </div>
              ) : (
                <>
              {/* ─── NEW: Section A — automatic online payment via iPay (carte bancaire / virement) ─── */}
              <h3 className="text-base font-medium mb-3 text-gray-800">Payer avec iPay</h3>
              <p className="text-sm text-gray-600 mb-4">
                Vous serez redirigé vers iPay pour choisir votre moyen de paiement (carte bancaire ou virement).
                L'abonnement est activé automatiquement dès confirmation du paiement.
              </p>

              {loadingIpayPlans ? (
                <p className="text-sm text-gray-500 mb-4">Chargement des offres...</p>
              ) : ipayPlans.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  {ipayPlans.map((plan) => (
                    <button
                      key={plan.code}
                      onClick={() => handleIpayPayment(plan.code)}
                      disabled={ipayLoading}
                      className="flex flex-col items-start px-4 py-3 border border-gray-200 rounded-lg hover:border-blue-950 hover:bg-blue-50 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="text-sm font-medium text-gray-800">
                        Payer l'abonnement {plan.label}
                      </span>
                      <span className="text-sm text-blue-950 font-semibold">
                        {plan.amount} {plan.currency}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-6">
                  Les offres de paiement en ligne ne sont pas disponibles pour le moment.
                </p>
              )}

              {ipayLoading && (
                <p className="text-sm text-gray-500 mb-4">Redirection vers iPay en cours...</p>
              )}

              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs font-medium text-gray-400 uppercase">OU</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              {/* ─── Section B — existing manual bank-transfer workflow, unchanged ─── */}
              <h3 className="text-base font-medium mb-1 text-gray-800">Virement bancaire manuel</h3>
              <h3 className="text-base font-medium mb-3 text-gray-800">Soumettre un justificatif de virement</h3>
              <p className="text-sm text-gray-600 mb-4">
                Envoyez une photo ou un PDF de votre virement bancaire. Un administrateur validera votre paiement
                et activera votre abonnement.
              </p>

              <label className="block mb-2 text-sm font-medium text-gray-700">Justificatif (image ou PDF)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setVirementFile(e.target.files?.[0] || null)}
                className="w-full border border-gray-200 rounded-lg p-3 mb-4 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm text-sm"
              />

              <label className="block mb-2 text-sm font-medium text-gray-700">Montant (optionnel)</label>
              <input
                type="number"
                step="0.01"
                value={virementMontant}
                onChange={(e) => setVirementMontant(e.target.value)}
                placeholder="Ex: 250.00"
                className="w-full border border-gray-200 rounded-lg p-3 mb-4 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
              />

              <label className="block mb-2 text-sm font-medium text-gray-700">Référence bancaire (optionnel)</label>
              <input
                type="text"
                value={virementReference}
                onChange={(e) => setVirementReference(e.target.value)}
                placeholder="Ex: REF-2026-0042"
                className="w-full border border-gray-200 rounded-lg p-3 mb-6 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
              />
                </>
              )}

              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setSubModalOpen(false)}
                  className="px-6 py-3 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                >
                  Fermer
                </button>
                {canSubmitPayment && (
                  <button
                    onClick={handleSubmitVirement}
                    disabled={!virementFile || submittingVirement}
                    className="px-6 py-3 bg-blue-950 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingVirement ? 'Envoi en cours...' : 'Envoyer le justificatif'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── NEW: admin (999/111) virement validation modal ─── */}
        {virementsModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl ring-1 ring-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-semibold text-blue-950">Justificatifs de virement</h2>
                <select
                  value={virementsFilter}
                  onChange={(e) => setVirementsFilter(e.target.value as 'all' | 'pending' | 'approved' | 'rejected')}
                  className="border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
                >
                  <option value="pending">En attente</option>
                  <option value="approved">Approuvés</option>
                  <option value="rejected">Rejetés</option>
                  <option value="all">Tous</option>
                </select>
              </div>

              {loadingVirements ? (
                <p className="text-center text-gray-600 text-sm">Chargement...</p>
              ) : virements.length === 0 ? (
                <p className="text-center text-gray-600 text-sm">Aucun justificatif pour ce filtre</p>
              ) : (
                <div className="space-y-4">
                  {virements.map((v) => (
                    <div key={v.id_virement} className="border border-gray-200 rounded-lg p-4 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-800">
                            {v.prenom || ''} {v.name || ''} — {v.email}
                          </p>
                          <p className="text-sm text-gray-500">
                            {v.entite_name || `Entité ${v.id_entite ?? 'N/A'}`} · Soumis le {formatDate(v.submitted_at)} · {formatMonthsPeriod(v)}
                          </p>
                          {v.montant != null && <p className="text-sm text-gray-500">Montant: {v.montant}</p>}
                          {v.reference && <p className="text-sm text-gray-500">Référence: {v.reference}</p>}
                          {v.statut === 'rejected' && v.reject_reason && (
                            <p className="text-sm text-red-600 mt-1">Motif du rejet: {v.reject_reason}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-start sm:items-end gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              v.statut === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : v.statut === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {v.statut === 'pending' ? 'En attente' : v.statut === 'approved' ? 'Approuvé' : 'Rejeté'}
                          </span>
                          <button
                            onClick={() => handleViewVirementImage(v.id_virement)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Voir le justificatif
                          </button>
                        </div>
                      </div>

                      {v.statut === 'pending' && (
                        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600">Durée (mois)</label>
                            <input
                              type="number"
                              min={1}
                              value={monthsInput[v.id_virement] ?? v.months_requested}
                              onChange={(e) =>
                                setMonthsInput((prev) => ({ ...prev, [v.id_virement]: Number(e.target.value) }))
                              }
                              className="w-20 border border-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
                            />
                          </div>
                          <button
                            onClick={() => handleValidateVirement(v.id_virement, 'approve')}
                            disabled={validatingId === v.id_virement}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            Approuver
                          </button>
                          <input
                            type="text"
                            placeholder="Motif du rejet (optionnel)"
                            value={rejectReasonInput[v.id_virement] || ''}
                            onChange={(e) =>
                              setRejectReasonInput((prev) => ({ ...prev, [v.id_virement]: e.target.value }))
                            }
                            className="flex-1 border border-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
                          />
                          <button
                            onClick={() => handleValidateVirement(v.id_virement, 'reject')}
                            disabled={validatingId === v.id_virement}
                            className="px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            Rejeter
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setVirementsModalOpen(false)}
                  className="px-6 py-3 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── NEW: iPay bank-demo notice — shown instead of the real iPay redirect for
            DEMO_ENTITY_ID (2756) accounts. See handleIpayPayment(). Explains, in French,
            that the card-entry page is unavailable pending ClicToPay's real credentials,
            while making clear the transaction itself is already recorded and will work
            end-to-end once configured. A "Continuer" button still lets anyone reach the
            real (currently failing) iPay page on purpose. ─── */}
        {ipayDemoNoticeOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 sm:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl ring-1 ring-gray-200">
              <div className="flex items-start gap-4 mb-2">
                <div className="flex-shrink-0 w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-950 animate-spin" style={{ animationDuration: '2s' }} viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-blue-950">Paiement en ligne — configuration en cours</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Entité de démonstration {DEMO_ENTITY_ID}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm text-gray-700 leading-relaxed">
                <p>
                  Votre transaction {ipayDemoPlan ? <>pour l'offre <strong>{ipayDemoPlan.label}</strong></> : ''} a bien été
                  enregistrée. Comme illustré ci-dessous, elle apparaît immédiatement dans l'onglet <strong>Transactions</strong> avec
                  le statut <strong>« En attente »</strong>, exactement comme pour toute autre demande d'abonnement.
                </p>
                <p>
                  Actuellement, l'équipe technique finalise la configuration des identifiants ClicToPay (Merchant ID, API Key, API
                  Secret) auprès d'iPay Tn. Tant que ces identifiants ne sont pas renseignés, la page de saisie des informations de
                  carte bancaire — hébergée par iPay — ne peut pas se charger.
                </p>
                <p>
                  Dès que la configuration ci-dessous sera complétée, le parcours de paiement en ligne fonctionnera de bout en bout et
                  l'abonnement sera activé automatiquement, sans aucune action supplémentaire de votre part.
                </p>
              </div>

              {/* ─── Preview A: how the transaction already appears (mirrors the Transactions table) ─── */}
              <div className="mt-6">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Aperçu — Transactions</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 bg-blue-950 text-white text-[11px] font-medium px-3 py-2">
                    <span className="col-span-1">ID</span>
                    <span className="hidden sm:block col-span-1">Produit</span>
                    <span className="col-span-1">Client</span>
                    <span className="hidden sm:block col-span-1">Montant</span>
                    <span className="col-span-1">Statut</span>
                    <span className="col-span-1 sm:col-span-1">Référence</span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 items-center px-3 py-2.5 text-xs text-gray-700 bg-white">
                    <span className="col-span-1 truncate">{demoTransactionPreview?.id || '…'}</span>
                    <span className="hidden sm:block col-span-1 truncate">abonnement-edi</span>
                    <span className="col-span-1 truncate">{demoTransactionPreview?.clientName || '…'}</span>
                    <span className="hidden sm:block col-span-1">
                      {ipayDemoPlan ? `${ipayDemoPlan.amount} ${ipayDemoPlan.currency}` : '—'}
                    </span>
                    <span className="col-span-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-yellow-100 text-yellow-800">
                        En attente
                      </span>
                    </span>
                    <span className="col-span-1 truncate text-[11px] text-gray-500">{demoTransactionPreview?.reference || '…'}</span>
                  </div>
                </div>
              </div>

              {/* ─── Preview B: what still needs to be filled in (mirrors the ClicToPay config panel) ─── */}
              <div className="mt-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Aperçu — Configuration ClicToPay</h3>
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-500">Saisis par l'équipe technique — non disponible pour ce compte de démonstration.</p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-800 whitespace-nowrap ml-2">
                      En cours
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block mb-1 text-[11px] font-medium text-gray-500">Merchant ID</label>
                      <input type="text" disabled placeholder="Ex: MERCH_xxx" className="w-full border border-gray-200 rounded-md p-2 text-xs bg-gray-100 text-gray-400 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block mb-1 text-[11px] font-medium text-gray-500">API Key</label>
                      <input type="text" disabled placeholder="••••••••••••" className="w-full border border-gray-200 rounded-md p-2 text-xs bg-gray-100 text-gray-400 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block mb-1 text-[11px] font-medium text-gray-500">API Secret</label>
                      <input type="text" disabled placeholder="••••••••••••" className="w-full border border-gray-200 rounded-md p-2 text-xs bg-gray-100 text-gray-400 cursor-not-allowed" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── NEW: still offer a way through to the real iPay redirect, on purpose ─── */}
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800">
                  Vous pouvez tout de même continuer vers la page de paiement réelle si vous souhaitez voir son état actuel — tant que
                  les identifiants ci-dessus ne sont pas configurés, cette page ne se chargera pas (erreur de connexion côté iPay).
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6">
                <button
                  onClick={closeIpayDemoNotice}
                  className="px-6 py-3 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                >
                  Fermer
                </button>
                <button
                  onClick={handleContinueToIpayCheckout}
                  className="px-6 py-3 border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-50 text-sm font-medium transition-colors"
                >
                  Continuer vers la page de paiement
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Comptes;
