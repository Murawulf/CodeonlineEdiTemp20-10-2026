/** INDEX.TSX — PREMIUM REDESIGN */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef
} from "react";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

/* ─── tiny debounce ─────────────────────────────────────────── */
const useDebounce = (callback: () => void, delay: number) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  return useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(callback, delay);
  }, [callback, delay]);
};

/* ─── palette ────────────────────────────────────────────────── */
const PALETTE = [
  "#0ea5e9", "#6366f1", "#f43f5e", "#10b981",
  "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899"
];

/* ─── constants ──────────────────────────────────────────────── */
const PAGE_IDS = { ENTITE: 2, PRODUITS: 3, CATALOGUE_FP: 7, COMPTES: 17 };
const HIDDEN_ENTITY_IDS = new Set([111, 999]);

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

/* ─── PRODUCT CARD ───────────────────────────────────────────── */
const ProductCard: React.FC<{ p: any; isNew: boolean; index: number }> = ({ p, isNew, index }) => {
  const img = p.images?.split(";")[0] || p.image || p.image_url || "";
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.02, 0.4) }}
      className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-slate-100 hover:border-sky-200 hover:-translate-y-0.5"
    >
      {/* Image */}
      <div className="relative aspect-square bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
        {img && !imgError ? (
          <img
            src={img}
            alt={p.libelle}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* New badge */}
        {isNew && (
          <div className="absolute top-2 left-2 px-2 py-0.5 text-[9px] font-black bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full uppercase tracking-widest shadow-lg">
            NEW
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-[10px] font-bold text-sky-600 truncate uppercase tracking-wide leading-none mb-0.5">
          {p.brand || "—"}
        </p>
        <p className="text-[11px] text-slate-700 truncate leading-tight font-medium">
          {p.libelle || "Produit"}
        </p>
      </div>
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
      placeholder="Rechercher un produit..."
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition shadow-sm"
    />
    {value && (
      <button onClick={() => onChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    )}
  </div>
);

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
const Index: React.FC = () => {
  const { settings } = useSettings();
  const api = useApi();

  const [accountRecord, setAccountRecord] = useState<any>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [showOnlyPublished, setShowOnlyPublished] = useState(true);
  const [activePieIndex, setActivePieIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState("");

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [displayedCount, setDisplayedCount] = useState(40);

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
      const url = isAsepex ? `/api/companies` : `/api/companies?id_entite=${accountRecord.id_entite}`;
      const resp = await api.get(url, { withCredentials: true });
      // Filter out hidden entity IDs
      const all = toArray(resp.data).filter((c: any) => !HIDDEN_ENTITY_IDS.has(Number(c.id_entite)));
      setCompanies(all);
    })();
  }, [accountRecord, hasRead, isAsepex]);

  /* ── LOAD: company logo ──────────────────────────────── */
  useEffect(() => {
    if (!accountRecord) return;
    (async () => {
      const resp = await api.get(`/api/companies`, { withCredentials: true });
      const match = toArray(resp.data).find((c: any) => Number(c.id_entite) === Number(accountRecord.id_entite));
      if (match?.logo) setCompanyLogo(match.logo);
    })();
  }, [accountRecord]);

  /* ── LOAD: products ──────────────────────────────────── */
  useEffect(() => {
    if (!accountRecord || (!hasRead(PAGE_IDS.PRODUITS) && !hasRead(PAGE_IDS.CATALOGUE_FP))) return;
    (async () => {
      const idParam = isAsepex ? "" : `&id_entite=${accountRecord.id_entite}`;
      const resp = await api.get(`/api/products?page=1&limit=10000${idParam}`, { withCredentials: true });
      const list = toArray(resp.data?.products ?? resp.data ?? []);
      setProducts(list);
    })();
  }, [accountRecord, hasRead, isAsepex]);

  /* ── DERIVED DATA ────────────────────────────────────── */
  const companiesArr = toArray(companies);
  const productsArr = toArray(products);
  const accountsArr = toArray(accounts);

  const totalEntities = companiesArr.length;
  const publishedProductsList = productsArr.filter(p => Number(p.status) === 2);
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

  const filteredProducts = useMemo(() => {
    let base = showOnlyPublished ? publishedProductsList : productsArr;

    if (selectedFilter) {
      if (isAsepex) {
        const ids = companiesArr
          .filter(c => normalizeRegion(c.region) === selectedFilter)
          .map(c => Number(c.id_entite));
        base = base.filter(p => ids.includes(Number(p.idEntreprise)));
      } else {
        base = base.filter(p => (p.codeClasse || p.brand || p.libelle || "") === selectedFilter);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(p =>
        (p.libelle || "").toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.gtin || "").includes(q)
      );
    }

    return base.sort((a, b) =>
      new Date(b.updatedAt || b.createdAt).getTime() -
      new Date(a.updatedAt || a.createdAt).getTime()
    );
  }, [productsArr, publishedProductsList, showOnlyPublished, selectedFilter, searchQuery, isAsepex, companiesArr]);

  const displayedProducts = filteredProducts.slice(0, displayedCount);
  const hasMore = displayedCount < filteredProducts.length;
  const last8Ids = new Set(publishedProductsList.slice(0, 8).map(p => p.id));

  /* ── infinite scroll ─────────────────────────────────── */
  const loadMore = useCallback(() => {
    if (hasMore) setDisplayedCount(prev => Math.min(prev + 40, filteredProducts.length));
  }, [hasMore, filteredProducts.length]);

  const debouncedLoadMore = useDebounce(loadMore, 100);

  useEffect(() => {
    const handleScroll = () => {
      const el = gridContainerRef.current;
      if (!el) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) debouncedLoadMore();
    };
    const el = gridContainerRef.current;
    el?.addEventListener("scroll", handleScroll);
    return () => el?.removeEventListener("scroll", handleScroll);
  }, [debouncedLoadMore]);

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
              className="grid grid-cols-3 gap-4 w-full md:w-auto"
            >
              {[
                { label: "Entités", value: totalEntities, icon: "🏢" },
                { label: "Produits", value: productsArr.length, icon: "📦" },
                { label: "Comptes", value: accountsArr.length, icon: "👤" },
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-white/8 backdrop-blur-md border border-white/10 rounded-2xl px-5 py-5 text-center min-w-[90px]">
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className="text-3xl font-black text-white">{value.toLocaleString()}</div>
                  <div className="text-xs text-slate-400 mt-1 font-medium">{label}</div>
                </div>
              ))}
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
                {pieData.map((d, i) => (
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
                {companiesArr.slice(0, 12).map((c, i) => (
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
        <section>
          {/* Section header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-black text-slate-800">Catalogue Produits</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                {filteredProducts.length.toLocaleString()} produits
                {selectedFilter && <span className="text-sky-500 font-medium"> • {selectedFilter}</span>}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              {/* Search */}
              <div className="sm:w-64">
                <SearchBar value={searchQuery} onChange={setSearchQuery} />
              </div>

              {/* Toggle */}
              <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm gap-1 self-start sm:self-auto">
                <button
                  onClick={() => setShowOnlyPublished(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${showOnlyPublished ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Publiés
                </button>
                <button
                  onClick={() => setShowOnlyPublished(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!showOnlyPublished ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Tous
                </button>
              </div>
            </div>
          </div>

          {/* The beautiful grid */}
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-6xl mb-4">📦</div>
              <p className="text-slate-500 font-medium">Aucun produit trouvé</p>
              <p className="text-slate-400 text-sm mt-1">Essayez de modifier votre recherche</p>
              {(searchQuery || selectedFilter) && (
                <button
                  onClick={() => { setSearchQuery(""); setSelectedFilter(null); }}
                  className="mt-4 px-4 py-2 bg-sky-50 text-sky-600 text-sm font-semibold rounded-xl hover:bg-sky-100 transition"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <div
              ref={gridContainerRef}
              className="max-h-[80vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
            >
              <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                {displayedProducts.map((p, i) => (
                  <ProductCard
                    key={p.id || p.gtin || i}
                    p={p}
                    isNew={last8Ids.has(p.id)}
                    index={i}
                  />
                ))}
              </div>

              {/* Loading more spinner */}
              {hasMore && (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-sky-500 animate-spin" />
                </div>
              )}

              {/* End of list */}
              {!hasMore && filteredProducts.length > 0 && (
                <div className="flex items-center gap-4 py-10">
                  <div className="flex-1 h-px bg-slate-200" />
                  <p className="text-xs text-slate-400 font-medium whitespace-nowrap">
                    {filteredProducts.length.toLocaleString()} produits affichés
                  </p>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
              )}
            </div>
          )}
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