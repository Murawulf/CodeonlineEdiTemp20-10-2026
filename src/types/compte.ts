export interface Permission {
  page_id: number;
  read: number;
  write: number;
  hide: number;
  page_name?: string;
}

export interface Compte {
  id_compte: number;
  id_entite: number; // Required - most components need this
  email: string;
  name: string;
  prenom?: string | null;
  initials?: string;
  profile_id: number;
  permissions: Permission[];
  certicode?: string | null;
  role?: string | null;
  is_suspended: number;
  created_at: string;
  id_producteur: number;
  producer_name: string | null;
  avatar_url?: string | null;
  nom_entite?: string;
}
