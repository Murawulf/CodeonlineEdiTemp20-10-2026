/** INDEX.TSX — PREMIUM REDESIGN */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef
} from "react";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Sector
} from "recharts";

import { motion, AnimatePresence } from "framer-motion";
import { useSettings } from "../contexts/SettingsContext";
import { useApi } from "../hooks/useApi";
import { useNavigate } from "react-router-dom";

/* ─── palette ────────────────────────────────────────────────── */
const PALETTE = [
  "#0ea5e9", "#6366f1", "#f43f5e", "#10b981",
  "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899"
];

/* ─── constants ──────────────────────────────────────────────── */
const PAGE_IDS = { ENTITE: 2, PRODUITS: 3, CATALOGUE_FP: 7, COMPTES: 17 };
const HIDDEN_ENTITY_IDS = new Set([111, 999]);
const PAGE_SIZE_OPTIONS = [15, 25, 50, 100];
const PAGE_SIZE_STORAGE_KEY = "index.catalogue.pageSize";
const VIEW_STORAGE_KEY = "index.catalogue.view";

type SortKey = "recent" | "az" | "za" | "brand";
type ViewMode = "grid" | "list";

const toArray = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);

const topNAndRest = (items: { name: string; value: number }[], n = 8) => {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const top = sorted.slice(0, n);
  const restVal = sorted.slice(n).reduce((s, it) => s + it.value, 0);
  top.push({ name: "Autres", value: restVal });
  return top;
};

const normalizeRegion = (raw?: string) => {
  if (!raw) return "Inconnu";
  const r = String(raw).trim().toLowerCase();
  const map: Record<string, string> = {
    dakar: "Dakar", thies: "Thiès", thiès: "Thiès",
    saint: "Saint-Louis", kaolack: "Kaolack",
    ziguinchor: "Ziguinchor", kolda: "Kolda", louga: "Louga",
    fatick: "Fatick", matam: "Matam", diourbel: "Diourbel",
    kedougou: "Kédougou", kaffrine: "Kaffrine", potou: "Potou"
  };
  for (const [key, value] of Object.entries(map)) {
    if (r.includes(key)) return value;
  }
  return raw;
};

const getLocalUserIdFromStorage = (): number | null => {
  try {
    const raw = localStorage.getItem("currentUser");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Number(parsed?.id_compte ?? parsed?.id ?? null) || null;
  } catch {
    return null;
  }
};

const readStored = <T,>(key: string, fallback: T, isValid: (v: any) => boolean): T => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const writeStored = (key: string, value: any) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
};

const productTime = (p: any) => {
  const t = new Date(p.updatedAt || p.createdAt || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

const productImage = (p: any): string =>
  (typeof p.images === "string" ? p.images.split(";")[0] : "") || p.image || p.image_url || "";

const isPublished = (p: any) => Number(p.status) === 2;

/** Page numbers with ellipsis: 1 … 4 5 6 … 20 */
const getPageNumbers = (current: number, total: number): (number | "…")[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
};

/* ─── active pie shape ───────────────────────────────────────── */
const renderActiveShape = (props: any) => {
  const R = Math.PI / 180;
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  const sin = Math.sin(-R * midAngle);
  const cos = Math.cos(-R * midAngle);
  const mx = cx + (outerRadius + 28) * cos;
  const my = cy + (outerRadius + 28) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 18;
  const ey = my;
  const ta = cos >= 0 ? "start" : "end";
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 10} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle} innerRadius={outerRadius + 16} outerRadius={outerRadius + 22} fill={fill} opacity={0.7} />
      <path d={`M${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" strokeWidth={2.5} />
      <text x={ex + (cos >= 0 ? 1 : -1) * 10} y={ey - 5} textAnchor={ta} fill="#0f172a" fontSize={13} fontWeight={700}>{payload.name}</text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 10} y={ey + 14} textAnchor={ta} fill="#64748b" fontSize={11}>{`${value} — ${(percent * 100).toFixed(1)}%`}</text>
    </g>
  );
};

/* ─── small shared bits ──────────────────────────────────────── */
const ImagePlaceholder: React.FC<{ size?: string }> = ({ size = "w-10 h-10" }) => (
  <div className="w-full h-full flex items-center justify-center">
    <svg className={`${size} text-slate-300`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  </div>
);

const StatusPill: React.FC<{ published: boolean; className?: string }> = ({ published, className = "" }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${published
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"} ${className}`}
  >
    <span className={`w-1.5 h-1.5 rounded-full ${published ? "bg-emerald-500" : "bg-amber-500"}`} />
    {published ? "Publié" : "Brouillon"}
  </span>
);

/* ─── PRODUCT CARD (grid view) ───────────────────────────────── */
const ProductCard: React.FC<{ p: any; isNew: boolean; index: number }> = ({ p, isNew, index }) => {
  const img = productImage(p);
  const [imgError, setImgError] = useState(false);
  const published = isPublished(p);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.015, 0.3) }}
      className="group relative flex flex-col bg-white rounded-2xl overflow-hidden border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] hover:border-sky-200 hover:-translate-y-1 transition-all duration-300"
    >
      {/* Image */}
      <div className="relative aspect-square bg-gradient-to-br from-slate-50 via-white to-slate-100 overflow-hidden">
        {img && !imgError ? (
          <img
            src={img}
            alt={p.libelle}
            loading="lazy"
            className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <ImagePlaceholder />
        )}

        {/* Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-2 pointer-events-none">
          {isNew ? (
            <span className="px-2 py-0.5 text-[9px] font-black bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full uppercase tracking-widest shadow-md">
              New
            </span>
          ) : <span />}
          <StatusPill published={published} className="bg-white/90 backdrop-blur" />
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3.5 border-t border-slate-100">
        <p className="text-[10px] font-bold text-sky-600 truncate uppercase tracking-wider mb-1">
          {p.brand || "Sans marque"}
        </p>
        <p className="text-[13px] text-slate-800 font-semibold leading-snug line-clamp-2 min-h-[2.5em]" title={p.libelle}>
          {p.libelle || "Produit"}
        </p>
        {p.gtin && (
          <p className="mt-auto pt-2.5 text-[10px] text-slate-400 font-mono tracking-wide truncate">
            GTIN {p.gtin}
          </p>
        )}
      </div>
    </motion.div>
  );
};

/* ─── PRODUCT ROW (list view) ────────────────────────────────── */
const ProductRow: React.FC<{ p: any; isNew: boolean; index: number }> = ({ p, isNew, index }) => {
  const img = productImage(p);
  const [imgError, setImgError] = useState(false);
  const published = isPublished(p);
  const date = productTime(p);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.01, 0.25) }}
      className="group flex items-center gap-4 px-4 py-3 hover:bg-sky-50/50 transition"
    >
      <div className="w-14 h-14 flex-shrink-0 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
        {img && !imgError ? (
          <img src={img} alt={p.libelle} loading="lazy" className="w-full h-full object-contain p-1" onError={() => setImgError(true)} />
        ) : (
          <ImagePlaceholder size="w-6 h-6" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800 truncate">{p.libelle || "Produit"}</p>
          {isNew && (
            <span className="px-1.5 py-px text-[9px] font-black bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full uppercase tracking-widest flex-shrink-0">New</span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          <span className="font-semibold text-sky-600">{p.brand || "Sans marque"}</span>
          {p.codeClasse && <span className="text-slate-400"> · {p.codeClasse}</span>}
        </p>
      </div>
      <p className="hidden md:block w-40 text-xs text-slate-400 font-mono truncate">{p.gtin || "—"}</p>
      <p className="hidden lg:block w-28 text-xs text-slate-400 text-right">
        {date ? new Date(date).toLocaleDateString("fr-FR") : "—"}
      </p>
      <StatusPill published={published} className="flex-shrink-0" />
    </motion.div>
  );
};

/* ─── KPI CARD ───────────────────────────────────────────────── */
const KpiCard: React.FC<{ label: string; value: number; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${color}`}
  >
    <div className="absolute -right-4 -top-4 opacity-10 text-[80px]">{icon}</div>
    <div className="relative z-10">
      <p className="text-sm font-medium text-white/80 mb-1">{label}</p>
      <p className="text-4xl font-black tracking-tight">{value.toLocaleString()}</p>
    </div>
  </motion.div>
);

/* ─── SEARCH BAR ─────────────────────────────────────────────── */
const SearchBar: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="relative">
    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <input
      type="text"
      placeholder="Rechercher nom, marque, GTIN..."
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full h-10 pl-10 pr-9 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition shadow-sm"
    />
    {value && (
      <button onClick={() => onChange("")} aria-label="Effacer" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    )}
  </div>
);

/* ─── SEGMENTED TOGGLE ───────────────────────────────────────── */
function Segmented<T extends string | number>({ value, options, onChange, ariaLabel }: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex items-center h-10 bg-white border border-slate-200 rounded-xl p-1 shadow-sm gap-0.5">
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-full min-w-[34px] px-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-center ${value === o.value
            ? "bg-sky-500 text-white shadow-sm"
            : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─── PAGINATION ─────────────────────────────────────────────── */
const Pagination: React.FC<{ page: number; totalPages: number; onChange: (p: number) => void }> = ({ page, totalPages, onChange }) => {
  if (totalPages <= 1) return null;
  const btn = "h-9 min-w-[36px] px-2 rounded-lg text-sm font-semibold transition flex items-center justify-center";
  return (
    <nav aria-label="Pagination" className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Page précédente"
        className={`${btn} text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
      </button>
      {getPageNumbers(page, totalPages).map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-1 text-slate-400 text-sm select-none">…</span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-current={n === page ? "page" : undefined}
            className={`${btn} ${n === page ? "bg-sky-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {n}
          </button>
        )
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Page suivante"
        className={`${btn} text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
      </button>
    </nav>
  );
};

/* ─── icons for the view toggle ──────────────────────────────── */
const GridIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
);
const ListIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
);

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
const Index: React.FC = () => {
  const { settings } = useSettings();
  const api = useApi();
  const navigate = useNavigate();

  const [accountRecord, setAccountRecord] = useState<any>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [enquetes, setEnquetes] = useState<any[]>([]);

  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [showOnlyPublished, setShowOnlyPublished] = useState(true);
  const [activePieIndex, setActivePieIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState("");

  /* catalogue controls */
  const catalogueRef = useRef<HTMLElement>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() =>
    readStored(PAGE_SIZE_STORAGE_KEY, 25, v => PAGE_SIZE_OPTIONS.includes(v)));
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    readStored<ViewMode>(VIEW_STORAGE_KEY, "grid", v => v === "grid" || v === "list"));
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  useEffect(() => { writeStored(PAGE_SIZE_STORAGE_KEY, pageSize); }, [pageSize]);
  useEffect(() => { writeStored(VIEW_STORAGE_KEY, viewMode); }, [viewMode]);

  /* ── is ASEPEX ────────────────────────────────────────── */
  const isAsepex = useMemo(() => {
    const id = Number(accountRecord?.id_entite ?? 0);
    return HIDDEN_ENTITY_IDS.has(id);
  }, [accountRecord]);

  const hasRead = useCallback((pageId: number) => {
    const perms = accountRecord?.permissions || [];
    return perms.some((p: any) => Number(p.page_id) === pageId && p.read && !p.hide);
  }, [accountRecord]);

  /* ── LOAD: user account ───────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoadingUser(true);
        const localId = getLocalUserIdFromStorage();
        const resp = await api.get(`/api/comptes`, { withCredentials: true });
        const list = toArray(resp.data);
        const found = localId ? list.find((a: any) => Number(a.id_compte) === localId) : null;
        if (!cancelled) { setAccountRecord(found || list[0] || null); setAccounts(list); }
      } catch { } finally {
        if (!cancelled) setIsLoadingUser(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── LOAD: companies ─────────────────────────────────── */
  useEffect(() => {
    if (!accountRecord || !hasRead(PAGE_IDS.ENTITE)) return;
    (async () => {
      try {
        const url = isAsepex ? `/api/companies` : `/api/companies?id_entite=${accountRecord.id_entite}`;
        const resp = await api.get(url, { withCredentials: true });
        // Filter out hidden entity IDs
        const all = toArray(resp.data).filter((c: any) => !HIDDEN_ENTITY_IDS.has(Number(c.id_entite)));
        setCompanies(all);
      } catch { setCompanies([]); }
    })();
  }, [accountRecord, hasRead, isAsepex]);

  /* ── LOAD: company logo ──────────────────────────────── */
  useEffect(() => {
    if (!accountRecord) return;
    (async () => {
      try {
        const resp = await api.get(`/api/companies`, { withCredentials: true });
        const match = toArray(resp.data).find((c: any) => Number(c.id_entite) === Number(accountRecord.id_entite));
        if (match?.logo) setCompanyLogo(match.logo);
      } catch { /* logo is optional */ }
    })();
  }, [accountRecord]);

  /* ── LOAD: enquêtes (retour enquêtes counter) ────────── */
  // Admins (999/111) → all enquêtes; others → only their own entité's
  // (matches the access rules on /api/enquetes and /api/enquetes/by-entite in server.js)
  useEffect(() => {
    if (!accountRecord) return;
    let cancelled = false;
    (async () => {
      try {
        const url = isAsepex
          ? `/api/enquetes`
          : `/api/enquetes/by-entite/${accountRecord.id_entite}`;
        const resp = await api.get(url, { withCredentials: true });
        if (!cancelled) setEnquetes(toArray(resp.data));
      } catch {
        if (!cancelled) setEnquetes([]);
      }
    })();
    return () => { cancelled = true; };
  }, [accountRecord, isAsepex]);

  /* ── LOAD: products ──────────────────────────────────── */
  useEffect(() => {
    if (!accountRecord || (!hasRead(PAGE_IDS.PRODUITS) && !hasRead(PAGE_IDS.CATALOGUE_FP))) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoadingProducts(true);
        const idParam = isAsepex ? "" : `&id_entite=${accountRecord.id_entite}`;
        const resp = await api.get(`/api/products?page=1&limit=10000${idParam}`, { withCredentials: true });
        const list = toArray(resp.data?.products ?? resp.data ?? []);
        if (!cancelled) setProducts(list);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setIsLoadingProducts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountRecord, hasRead, isAsepex]);

  /* ── DERIVED DATA ────────────────────────────────────── */
  const companiesArr = toArray(companies);
  const productsArr = toArray(products);
  const accountsArr = toArray(accounts);

  const totalEntities = companiesArr.length;
  const publishedProductsList = useMemo(() => productsArr.filter(isPublished), [productsArr]);
  const unpublishedCount = productsArr.length - publishedProductsList.length;

  const regionData = useMemo(() => {
    const map = new Map<string, number>();
    companiesArr.forEach(c => {
      const r = normalizeRegion(c.region);
      map.set(r, (map.get(r) || 0) + 1);
    });
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [companiesArr]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    productsArr.forEach(p => {
      const k = p.codeClasse || p.brand || p.libelle || "Non classé";
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [productsArr]);

  const pieData = useMemo(() =>
    topNAndRest(isAsepex ? regionData : categoryData, 8).map((d, i) => ({
      ...d,
      color: PALETTE[i % PALETTE.length]
    })),
    [isAsepex, regionData, categoryData]
  );

  /* "NEW" = the 8 most recently updated published products */
  const newIds = useMemo(() => new Set(
    [...publishedProductsList]
      .sort((a, b) => productTime(b) - productTime(a))
      .slice(0, 8)
      .map(p => p.id)
  ), [publishedProductsList]);

  const filteredProducts = useMemo(() => {
    let base = showOnlyPublished ? publishedProductsList : productsArr;

    if (selectedFilter) {
      if (isAsepex) {
        const ids = new Set(companiesArr
          .filter(c => normalizeRegion(c.region) === selectedFilter)
          .map(c => Number(c.id_entite)));
        base = base.filter(p => ids.has(Number(p.idEntreprise)));
      } else {
        base = base.filter(p => (p.codeClasse || p.brand || p.libelle || "") === selectedFilter);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      base = base.filter(p =>
        (p.libelle || "").toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        String(p.gtin || "").includes(q)
      );
    }

    // copy before sorting so we never mutate state arrays
    const sorted = [...base];
    const byName = (a: any, b: any) => (a.libelle || "").localeCompare(b.libelle || "", "fr", { sensitivity: "base" });
    switch (sortKey) {
      case "az": sorted.sort(byName); break;
      case "za": sorted.sort((a, b) => byName(b, a)); break;
      case "brand": sorted.sort((a, b) =>
        (a.brand || "~").localeCompare(b.brand || "~", "fr", { sensitivity: "base" }) || byName(a, b)); break;
      default: sorted.sort((a, b) => productTime(b) - productTime(a));
    }
    return sorted;
  }, [productsArr, publishedProductsList, showOnlyPublished, selectedFilter, searchQuery, isAsepex, companiesArr, sortKey]);

  /* ── pagination ──────────────────────────────────────── */
  const totalItems = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageItems = filteredProducts.slice(startIdx, startIdx + pageSize);

  // back to page 1 whenever the result set or page size changes
  useEffect(() => { setPage(1); }, [showOnlyPublished, selectedFilter, searchQuery, sortKey, pageSize]);

  const goToPage = useCallback((p: number) => {
    setPage(Math.min(Math.max(1, p), totalPages));
    catalogueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [totalPages]);

  const resetFilters = () => { setSearchQuery(""); setSelectedFilter(null); };

  /* ── LOADING STATE ───────────────────────────────────── */
  if (isLoadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-sky-200 border-t-sky-500 animate-spin" />
          <p className="text-slate-500 text-sm font-medium animate-pulse">Chargement du tableau de bord…</p>
        </div>
      </div>
    );
  }

  const selectCls = "h-10 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer appearance-none bg-no-repeat bg-[right_0.6rem_center] bg-[length:12px] bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%2394a3b8%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%223%22 d=%22M19 9l-7 7-7-7%22/%3E%3C/svg%3E')]";

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* ── HERO ─────────────────────────────────────────── */}
      <header className="relative overflow-hidden bg-gradient-to-br from-[#1e3ea1] via-[#162a6f] to-[#0b1633]">
        {/* Decorative blobs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-sky-300/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-indigo-300/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'1\' cy=\'1\' r=\'1\' fill=\'%23ffffff\' fill-opacity=\'0.04\'/%3E%3C/svg%3E')] opacity-60" />

        <div className="relative max-w-7xl mx-auto px-6 py-14 md:py-20">
          <div className="flex flex-col md:flex-row items-center justify-between gap-10">

            {/* Left: logos + title */}
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <div className="flex items-center gap-5 mb-6">
                <img src="/images/logo-codeonline.png" alt="Codeonline" className="h-14 drop-shadow-2xl" />
                {companyLogo && (
                  <>
                    <div className="w-px h-10 bg-white/20" />
                    <img src={companyLogo} alt="Company" className="h-14 drop-shadow-2xl object-contain" />
                  </>
                )}
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-white leading-none tracking-tight">
                Codeonline <span className="text-sky-400">EDI</span>
              </h1>
              <p className="mt-3 text-slate-400 text-base max-w-md">
                Gérez vos entités, catalogues produits, services EDI et médias en un seul endroit.
              </p>
            </motion.div>

            {/* Right: KPI chips */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto"
            >
              {[
                { label: "Retour Enquêtes", value: enquetes.length, icon: "📋", to: "/retour-enquete" },
                { label: "Entités", value: totalEntities, icon: "🏢" },
                { label: "Produits", value: productsArr.length, icon: "📦" },
                { label: "Comptes", value: accountsArr.length, icon: "👤" },
              ].map(({ label, value, icon, to }: { label: string; value: number; icon: string; to?: string }) => {
                const content = (
                  <>
                    <div className="text-2xl mb-1">{icon}</div>
                    <div className="text-3xl font-black text-white">{value.toLocaleString()}</div>
                    <div className="text-xs text-slate-400 mt-1 font-medium whitespace-nowrap">{label}</div>
                  </>
                );
                return to ? (
                  <button
                    key={label}
                    type="button"
                    onClick={() => navigate(to)}
                    title="Voir les retours d'enquêtes"
                    className="group relative bg-white/8 backdrop-blur-md border border-white/10 rounded-2xl px-5 py-5 text-center min-w-[90px] cursor-pointer transition hover:bg-white/15 hover:border-sky-400/50 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  >
                    <svg className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-white/30 group-hover:text-sky-300 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 17L17 7M17 7H8M17 7v9" /></svg>
                    {content}
                  </button>
                ) : (
                  <div key={label} className="bg-white/8 backdrop-blur-md border border-white/10 rounded-2xl px-5 py-5 text-center min-w-[90px]">
                    {content}
                  </div>
                );
              })}
            </motion.div>

          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ─────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-10 space-y-10">

        {/* ── KPI ROW ──────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Entités enregistrées" value={totalEntities} color="bg-gradient-to-br from-sky-500 to-blue-600" icon="🏢" />
          <KpiCard label="Produits publiés" value={publishedProductsList.length} color="bg-gradient-to-br from-emerald-500 to-teal-600" icon="✅" />
          <KpiCard label="Produits enregistrés" value={unpublishedCount} color="bg-gradient-to-br from-amber-500 to-orange-500" icon="📝" />
          <KpiCard label="Comptes actifs" value={accountsArr.length} color="bg-gradient-to-br from-violet-500 to-purple-600" icon="👤" />
        </div>

        {/* ── GRID: chart + sidebar ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Pie Chart */}
          <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden h-full">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="font-bold text-slate-800 text-lg">
                    {isAsepex ? "Entités par Région" : "Produits par Catégorie"}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Cliquez sur un segment pour filtrer</p>
                </div>
                {selectedFilter && (
                  <button
                    onClick={() => setSelectedFilter(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 text-xs font-semibold rounded-full hover:bg-rose-100 transition"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    {selectedFilter}
                  </button>
                )}
              </div>
              <div className="h-80 px-4 pb-4 pt-6">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%" cy="50%"
                      outerRadius={120}
                      innerRadius={50}
                      activeIndex={activePieIndex}
                      activeShape={renderActiveShape}
                      onMouseEnter={(_, i) => setActivePieIndex(i)}
                      onMouseLeave={() => setActivePieIndex(-1)}
                      onClick={(d: any) => d?.name && setSelectedFilter(prev => prev === d.name ? null : d.name)}
                    >
                      {pieData.map((e, i) => (
                        <Cell key={`cell-${i}`} fill={e.color} cursor="pointer" stroke="white" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "none", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.1)", fontSize: 13 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend chips */}
              <div className="px-6 pb-6 flex flex-wrap gap-2">
                {pieData.map((d) => (
                  <button
                    key={d.name}
                    onClick={() => setSelectedFilter(prev => prev === d.name ? null : d.name)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition border ${selectedFilter === d.name ? "border-transparent text-white shadow" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"}`}
                    style={selectedFilter === d.name ? { background: d.color, borderColor: d.color } : {}}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    {d.name}
                    <span className="opacity-60">{d.value}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Sidebar: latest entities */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 h-full overflow-hidden">
              <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-800 text-lg">Dernières entités</h2>
                <p className="text-xs text-slate-400 mt-0.5">{companiesArr.length} enregistrées</p>
              </div>
              <div className="p-4 space-y-1 overflow-y-auto max-h-80">
                {companiesArr.slice(0, 12).map((c) => (
                  <div key={c.id_entite} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition cursor-default">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-100 to-indigo-100 flex items-center justify-center text-xs font-black text-sky-600 flex-shrink-0">
                      {(c.raison_socialle || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate leading-tight">{c.raison_socialle}</p>
                      <p className="text-[11px] text-slate-400 truncate">{normalizeRegion(c.region)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── PRODUCT CATALOGUE SECTION ─────────────────── */}
        <section ref={catalogueRef} className="scroll-mt-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">

            {/* Header */}
            <div className="px-5 md:px-6 pt-6 pb-5 border-b border-slate-100 space-y-4">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Catalogue Produits</h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    <span className="font-semibold text-slate-600">{totalItems.toLocaleString()}</span> produit{totalItems > 1 ? "s" : ""}
                    {selectedFilter && <span className="text-sky-500 font-medium"> · {selectedFilter}</span>}
                    {searchQuery.trim() && <span className="text-sky-500 font-medium"> · « {searchQuery.trim()} »</span>}
                  </p>
                </div>
                <div className="w-full md:w-80">
                  <SearchBar value={searchQuery} onChange={setSearchQuery} />
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2.5">
                <Segmented
                  ariaLabel="Statut"
                  value={showOnlyPublished ? "pub" : "all"}
                  onChange={v => setShowOnlyPublished(v === "pub")}
                  options={[
                    { value: "pub", label: <>Publiés <span className="ml-1 opacity-70">{publishedProductsList.length.toLocaleString()}</span></> },
                    { value: "all", label: <>Tous <span className="ml-1 opacity-70">{productsArr.length.toLocaleString()}</span></> },
                  ]}
                />

                <label className="sr-only" htmlFor="catalogue-sort">Trier par</label>
                <select
                  id="catalogue-sort"
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as SortKey)}
                  className={selectCls}
                >
                  <option value="recent">Plus récents</option>
                  <option value="az">Nom A → Z</option>
                  <option value="za">Nom Z → A</option>
                  <option value="brand">Marque</option>
                </select>

                <div className="flex items-center gap-2 sm:ml-auto">
                  <span className="text-xs text-slate-400 font-medium hidden sm:inline">Par page</span>
                  <Segmented
                    ariaLabel="Produits par page"
                    value={pageSize}
                    onChange={setPageSize}
                    options={PAGE_SIZE_OPTIONS.map(n => ({ value: n, label: n, title: `${n} produits par page` }))}
                  />
                </div>

                <Segmented
                  ariaLabel="Affichage"
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { value: "grid", label: <GridIcon />, title: "Vue grille" },
                    { value: "list", label: <ListIcon />, title: "Vue liste" },
                  ]}
                />
              </div>
            </div>

            {/* Body */}
            <div className="p-5 md:p-6 bg-slate-50/60">
              {isLoadingProducts ? (
                /* skeleton */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
                      <div className="aspect-square bg-slate-100" />
                      <div className="p-3.5 space-y-2">
                        <div className="h-2.5 w-1/3 bg-slate-100 rounded" />
                        <div className="h-3 w-full bg-slate-100 rounded" />
                        <div className="h-3 w-2/3 bg-slate-100 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : totalItems === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-3xl mb-4 shadow-sm">📦</div>
                  <p className="text-slate-700 font-semibold">Aucun produit trouvé</p>
                  <p className="text-slate-400 text-sm mt-1">Essayez de modifier votre recherche ou vos filtres</p>
                  {(searchQuery || selectedFilter) && (
                    <button
                      onClick={resetFilters}
                      className="mt-5 px-4 py-2 bg-sky-500 text-white text-sm font-semibold rounded-xl hover:bg-sky-600 transition shadow-sm"
                    >
                      Réinitialiser les filtres
                    </button>
                  )}
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${viewMode}-${safePage}-${pageSize}-${sortKey}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {viewMode === "grid" ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {pageItems.map((p, i) => (
                          <ProductCard key={p.id || p.gtin || `${startIdx + i}`} p={p} isNew={newIds.has(p.id)} index={i} />
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden">
                        <div className="hidden md:flex items-center gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <span className="w-14" />
                          <span className="flex-1">Produit</span>
                          <span className="w-40">GTIN</span>
                          <span className="hidden lg:block w-28 text-right">Mis à jour</span>
                          <span className="w-[74px] text-right">Statut</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {pageItems.map((p, i) => (
                            <ProductRow key={p.id || p.gtin || `${startIdx + i}`} p={p} isNew={newIds.has(p.id)} index={i} />
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* Footer: range + pagination */}
            {!isLoadingProducts && totalItems > 0 && (
              <div className="px-5 md:px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Affichage <span className="font-semibold text-slate-700">{(startIdx + 1).toLocaleString()}–{Math.min(startIdx + pageSize, totalItems).toLocaleString()}</span> sur <span className="font-semibold text-slate-700">{totalItems.toLocaleString()}</span>
                  {totalPages > 1 && <span className="text-slate-400"> · page {safePage}/{totalPages}</span>}
                </p>
                <Pagination page={safePage} totalPages={totalPages} onChange={goToPage} />
              </div>
            )}
          </div>
        </section>

      </main>

      {/* ── FOOTER ────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Codeonline EDI. Tous droits réservés.</p>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-slate-400">Système opérationnel</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;