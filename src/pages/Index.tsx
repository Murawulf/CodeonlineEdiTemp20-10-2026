/** INDEX.TSX — FINAL 100% WORKING VERSION (No lodash needed) */
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

import axios from "axios";
import { motion } from "framer-motion";
import { useSettings, useLocalApiUrl } from "../contexts/SettingsContext";

// Tiny built-in debounce (no external package)
const useDebounce = (callback: () => void, delay: number) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  return useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(callback, delay);
  }, [callback, delay]);
};

const P1_PALETTE = [
  "#172554", "#1e40af", "#3b82f6", "#8b5cf6",
  "#ec4899", "#f472b6", "#fbbf24", "#06b6d4"
];

const PAGE_IDS = { ENTITE: 2, PRODUITS: 3, CATALOGUE_FP: 7, COMPTES: 17 };

const toArray = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);

const topNAndRest = (items: { name: string; value: number }[], n = 8) => {
  const sorted = items.slice().sort((a, b) => b.value - a.value);
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
    dakar: "Dakar", thies: "Thiès", thiès: "Thiès", saint: "Saint-Louis",
    kaolack: "Kaolack", ziguinchor: "Ziguinchor", kolda: "Kolda", louga: "Louga",
    fatick: "Fatick", matam: "Matam", diourbel: "Diourbel", kedougou: "Kédougou",
    kaffrine: "Kaffrine", potou: "Potou"
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

const LoadingBlock: React.FC<{ text?: string }> = ({ text = "Chargement..." }) => (
  <div className="py-12 text-center text-sm text-gray-400">{text}</div>
);

// Active shape for pie chart
const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const {
    cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value
  } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const mx = cx + (outerRadius + 35) * cos;
  const my = cy + (outerRadius + 35) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 25;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";

  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 12}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle}
        innerRadius={outerRadius + 18} outerRadius={outerRadius + 26} fill={fill} opacity={0.9} />
      <path d={`M${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" strokeWidth={4} />
      <text x={ex + (cos >= 0 ? 1 : -1) * 14} y={ey} textAnchor={textAnchor}
        fill="#1f2937" className="text-base font-bold">{payload.name}</text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 14} y={ey} dy={22} textAnchor={textAnchor}
        fill="#6b7280" className="text-sm">{`${value} • ${(percent * 100).toFixed(1)}%`}</text>
    </g>
  );
};

const Index: React.FC = () => {
  console.log('[Index] 🏠 Dashboard page mounted');
  const { settings } = useSettings();
  const API_BASE_URL = useLocalApiUrl();
  console.log('[Index] 🌐 API_BASE_URL:', API_BASE_URL);
  const API_PIN_HEADER = settings.API_PIN || "3311";
  console.log('[Index] 🔐 API_PIN:', API_PIN_HEADER);

  const [accountRecord, setAccountRecord] = useState<any>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  const [selectedRegionOrCategory, setSelectedRegionOrCategory] = useState<string | null>(null);
  const [showOnlyPublished, setShowOnlyPublished] = useState(true);
  const [activePieIndex, setActivePieIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState("");

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [displayedCount, setDisplayedCount] = useState(40);

  const isAsepex = useMemo(() => {
    const id = Number(accountRecord?.id_entite ?? 0);
    return id === 999 || id === 111;
  }, [accountRecord]);

  const hasRead = useCallback((pageId: number) => {
    const perms = accountRecord?.permissions || [];
    return perms.some((p: any) => Number(p.page_id) === pageId && p.read && !p.hide);
  }, [accountRecord]);

  /* --------------------- LOAD DATA --------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoadingUser(true);
        const localId = getLocalUserIdFromStorage();
        const resp = await axios.get(`${API_BASE_URL}/api/comptes`, {
          withCredentials: true,
          headers: { "x-api-pin": API_PIN_HEADER }
        });
        const list = toArray(resp.data);
        const found = localId ? list.find((a: any) => Number(a.id_compte) === localId) : null;
        if (!cancelled) {
          setAccountRecord(found || list[0] || null);
          setAccounts(list);
        }
      } catch { } finally {
        if (!cancelled) setIsLoadingUser(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!accountRecord || !hasRead(PAGE_IDS.ENTITE)) return;
    (async () => {
      const url = isAsepex
        ? `${API_BASE_URL}/api/companies`
        : `${API_BASE_URL}/api/companies?id_entite=${accountRecord.id_entite}`;
      const resp = await axios.get(url, { withCredentials: true, headers: { "x-api-pin": API_PIN_HEADER } });
      setCompanies(toArray(resp.data));
    })();
  }, [accountRecord, hasRead, isAsepex]);

  useEffect(() => {
    if (!accountRecord) return;
    (async () => {
      const resp = await axios.get(`${API_BASE_URL}/api/companies`, { withCredentials: true, headers: { "x-api-pin": API_PIN_HEADER } });
      const match = toArray(resp.data).find((c: any) => Number(c.id_entite) === Number(accountRecord.id_entite));
      if (match?.logo) setCompanyLogo(match.logo);
    })();
  }, [accountRecord]);

  useEffect(() => {
    if (!accountRecord || (!hasRead(PAGE_IDS.PRODUITS) && !hasRead(PAGE_IDS.CATALOGUE_FP))) return;
    (async () => {
      const idParam = isAsepex ? "" : `&id_entite=${accountRecord.id_entite}`;
      const resp = await axios.get(`${API_BASE_URL}/api/products?page=1&limit=10000${idParam}`, { withCredentials: true });
      const list = toArray(resp.data?.products ?? resp.data ?? []);
      setProducts(list);
    })();
  }, [accountRecord, hasRead, isAsepex]);

  /* --------------------- DATA PROCESSING --------------------- */
  const companiesArr = toArray(companies);
  const productsArr = toArray(products);
  const accountsArr = toArray(accounts);

  const totalEntities = Math.max(0, companiesArr.length - 2);
  const totalCatalogue = productsArr.length;
  const totalAccounts = accountsArr.length;
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
      color: P1_PALETTE[i % P1_PALETTE.length]
    })), [isAsepex, regionData, categoryData]);

  const filteredAndSearched = useMemo(() => {
    let base = showOnlyPublished ? publishedProductsList : productsArr;

    if (selectedRegionOrCategory) {
      if (isAsepex) {
        const ids = companiesArr
          .filter(c => normalizeRegion(c.region) === selectedRegionOrCategory)
          .map(c => Number(c.id_entite));
        base = base.filter(p => ids.includes(Number(p.idEntreprise)));
      } else {
        base = base.filter(p => (p.codeClasse || p.brand || p.libelle || "") === selectedRegionOrCategory);
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
  }, [productsArr, publishedProductsList, showOnlyPublished, selectedRegionOrCategory, searchQuery, isAsepex, companiesArr]);

  const displayedProducts = filteredAndSearched.slice(0, displayedCount);
  const hasMore = displayedCount < filteredAndSearched.length;

  // Infinite scroll with tiny debounce
  const loadMore = useCallback(() => {
    if (hasMore) {
      setDisplayedCount(prev => Math.min(prev + 40, filteredAndSearched.length));
    }
  }, [hasMore, filteredAndSearched.length]);

  const debouncedLoadMore = useDebounce(loadMore, 100);

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 400) {
        debouncedLoadMore();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [debouncedLoadMore]);

  const last8Ids = new Set(publishedProductsList.slice(0, 8).map(p => p.id));

  const GridItem: React.FC<{ p: any }> = ({ p }) => {
    const img = p.images?.split(";")[0] || p.image || p.image_url ||
      "https://via.placeholder.com/180x180/f3f4f6/9ca3af?text=No+Image";

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="relative mb-2.5 break-inside-avoid rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all group"
      >
        <div className="relative aspect-square bg-gray-50">
          <img
            src={img}
            alt={p.libelle}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            onError={e => (e.target as HTMLImageElement).src = "https://via.placeholder.com/180x180/f3f4f6/9ca3af?text=No+Image"}
          />
          {last8Ids.has(p.id) && (
            <div className="absolute top-1 left-1 px-2 py-0.5 text-[9px] font-bold bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-full shadow-lg uppercase tracking-wider">
              New
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end">
            <div className="p-2 text-white">
              <div className="font-bold text-xs leading-tight line-clamp-1">{p.brand || "Sans marque"}</div>
              <div className="text-[10px] opacity-90 line-clamp-2">{p.libelle || "Produit"}</div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  if (isLoadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-2xl text-gray-600 animate-pulse">Chargement du tableau de bord...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900">

      {/* HERO */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 text-white py-20 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-10 mb-8">
              <img src="https://edi-dev.codeonline-info.com/lovable-uploads/a13c1ffe-9c2c-4e6a-a048-063ce7274535.png" alt="Codeonline" className="h-28 drop-shadow-2xl" />
              {companyLogo ? (
              <img src="https://fp.edi-dev.codeonline-info.com/images/logoag.png" alt="Codeonlineag" className="h-28 drop-shadow-2xl" />
                ) : (
                <div className="h-28 w-64 bg-white/10 rounded-2xl flex items-center justify-center text-lg font-medium backdrop-blur-sm">Votre Logo</div>
              )}
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold mt-4 leading-tight">Codeonline EDI</h1>
            <p className="mt-4 text-xl text-white/90 max-w-2xl"> Entités •  Catalogues Produits • Services EDI  </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-white/20">
            <div className="grid grid-cols-3 gap-8 text-center">
              <div><div className="text-white/80 text-sm">Entités</div><div className="text-4xl font-bold">{totalEntities}</div></div>
              <div><div className="text-white/80 text-sm">Fiches Produits</div><div className="text-4xl font-bold">{totalCatalogue}</div></div>
              <div><div className="text-white/80 text-sm">Comptes</div><div className="text-4xl font-bold">{totalAccounts}</div></div>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-6 py-12">

        {/* KPI + Search */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card className="text-center py-6 bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardHeader className="pb-2"><h3 className="text-sm text-gray-600">Entités</h3></CardHeader>
            <CardContent><div className="text-5xl font-bold text-blue-800">{totalEntities}</div></CardContent>
          </Card>
          <Card className="text-center py-6 bg-gradient-to-br from-green-50 to-emerald-50">
            <CardHeader className="pb-2"><h3 className="text-sm text-gray-600">Produits publiés</h3></CardHeader>
            <CardContent>
              <div className="text-5xl font-bold text-green-600">{publishedProductsList.length}</div>
              <div className="text-sm text-gray-500 mt-1">{unpublishedCount} non publiées</div>
            </CardContent>
          </Card>
            <Card className="text-center py-6 bg-gradient-to-br from-red-50 to-emerald-50">
            <CardHeader className="pb-2"><h3 className="text-sm text-gray-600">Produits non publiées</h3></CardHeader>
            <CardContent>
              <div className="text-5xl font-bold text-red-600">{unpublishedCount}</div>
              
            </CardContent>
          </Card>
         
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">

            {/* Pie Chart */}
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="bg-white border-none shadow-2xl rounded-3xl overflow-hidden">
                <CardHeader className="pb-4 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 text-white shadow-lg">
                  <div className="flex justify-between items-center">
                    <h3 className="text-2xl font-bold">{isAsepex ? "Entités par Région" : "Produits par Catégorie"}</h3>
                    <button onClick={() => setSelectedRegionOrCategory(null)} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-full text-sm font-medium transition">
                      Réinitialiser
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="pt-10">
                  <div className="h-96">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%" cy="50%"
                          outerRadius={140}
                          activeIndex={activePieIndex}
                          activeShape={renderActiveShape}
                          onMouseEnter={(_, i) => setActivePieIndex(i)}
                          onMouseLeave={() => setActivePieIndex(-1)}
                          onClick={(d: any) => {
                            if (d?.name) setSelectedRegionOrCategory(prev => prev === d.name ? null : d.name);
                          }}
                        >
                          {pieData.map((e, i) => <Cell key={`cell-${i}`} fill={e.color} cursor="pointer" />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Infinite Scroll Grid */}
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">
                  {selectedRegionOrCategory && `• ${selectedRegionOrCategory} • `}
                  {filteredAndSearched.length} produit{filteredAndSearched.length > 1 ? "s" : ""}
                </h3>
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input type="checkbox" checked={showOnlyPublished} onChange={e => setShowOnlyPublished(e.target.checked)} className="w-5 h-5 rounded text-blue-600" />
                  Publiés seulement
                </label>
              </div>

              <div
                ref={gridContainerRef}
                className="columns-3 sm:columns-4 md:columns-5 lg:columns-6 xl:columns-8 2xl:columns-10 gap-3 space-y-3 max-h-screen overflow-y-auto pb-20 scrollbar-thin scrollbar-thumb-gray-300"
              >
                {displayedProducts.map(p => (
                  <GridItem key={p.id || p.gtin} p={p} />
                ))}
                {hasMore && (
                  <div className="col-span-full text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="bg-white shadow-xl">
              <CardHeader><h3 className="text-lg font-bold">Dernières entités</h3></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {companiesArr.slice(0, 8).map(c => (
                    <div key={c.id_entite} className="flex justify-between text-sm">
                      <span className="font-medium truncate pr-2">{c.raison_socialle}</span>
                      <span className="text-gray-500 text-xs">{normalizeRegion(c.region)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;