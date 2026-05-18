import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * Caracteristiques.tsx
 *
 * - Copy-paste ready.
 * - Props: { id_entite: number }
 *
 * Works with these API endpoints:
 * GET  /api/caracteristiques? id_entite,search,nature,page,limit
 * GET  /api/caracteristiques/:id
 * POST /api/caracteristiques
 * PUT  /api/caracteristiques/:id
 * DELETE /api/caracteristiques/:id
 * POST /api/caracteristiques/upload  (form field name = "file")
 */

// ------------------------- Types -------------------------
type ElementType = "varchar" | "number" | "integer" | "text" | "list";

interface ElementTechnique {
  nom: string;
  type: ElementType;
  options?: string[] | null; // if type === 'list'
  defaultValue?: string | null;
}

interface Illustration {
  filename: string;
  type: "image" | "video";
  url: string;
}

interface Caracteristique {
  id_carac?: number;
  id_entite: number;
  identification: string;
  description_fr?: string;
  description_en?: string | null;
  description_ar?: string | null;
  nature?: "fiche occasionnelle" | "fiche permanente" | string;
  utilite?: string;
  date_lancement?: string | null; // YYYY-MM-DD
  elements?: ElementTechnique[];
  illustrations?: Illustration[];
}

// ------------------------- Component -------------------------
const Caracteristiques: React.FC<{ id_entite: number }> = ({ id_entite }) => {
  // list
  const [items, setItems] = useState<Caracteristique[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [natureFilter, setNatureFilter] = useState<string>("");

  // modal & form
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Caracteristique | null>(null);
  const [form, setForm] = useState<Partial<Caracteristique>>({
    id_entite,
    identification: "",
    description_fr: "",
    description_en: "",
    description_ar: "",
    nature: "fiche occasionnelle",
    utilite: "",
    date_lancement: undefined,
    elements: [],
    illustrations: []
  });

  // upload file
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);

  // draggable modal
  const modalRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({ dragging: false, offsetX: 0, offsetY: 0 });
  const [modalPos, setModalPos] = useState<{ left: number | string; top: number | string }>({ left: "50%", top: 100 });

  // local UI helpers
  const emptyElement = (): ElementTechnique => ({ nom: "", type: "varchar", options: null, defaultValue: null });

  // ---------------- Fetch list ----------------
  const fetchList = async () => {
    setLoading(true);
    try {
      const resp = await axios.get("/api/caracteristiques", {
        params: {
          id_entite,
          search,
          nature: natureFilter
        }
      });
      setItems(resp.data.caracteristiques || []);
    } catch (err) {
      console.error("fetchList:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, natureFilter, id_entite]);

  // ---------------- Open modal for new or edit --------------
  const openNew = () => {
    setEditing(null);
    setForm({
      id_entite,
      identification: "",
      description_fr: "",
      description_en: "",
      description_ar: "",
      nature: "fiche occasionnelle",
      utilite: "",
      date_lancement: undefined,
      elements: [],
      illustrations: []
    });
    setModalPos({ left: "50%", top: 100 });
    setOpen(true);
  };

  const openEdit = async (id: number | undefined) => {
    if (!id) return;
    try {
      const resp = await axios.get(`/api/caracteristiques/${id}`);
      const { carac, elements, illustrations } = resp.data;
      // map server structure to client-friendly form
      setEditing(carac);
      setForm({
        id_entite: carac.id_entite,
        identification: carac.identification || "",
        description_fr: carac.description_fr || "",
        description_en: carac.description_en || "",
        description_ar: carac.description_ar || "",
        nature: carac.nature || "fiche occasionnelle",
        utilite: carac.utilite || "",
        date_lancement: carac.date_lancement || undefined,
        elements: elements?.map((e: any) => ({
          nom: e.nom_element,
          type: e.type_element,
          options: e.options_element ? JSON.parse(e.options_element) : null,
          defaultValue: e.valeur_default || null
        })) || [],
        illustrations: illustrations?.map((m: any) => ({
          filename: m.filename,
          type: m.type,
          url: m.url
        })) || []
      });
      setModalPos({ left: "50%", top: 100 });
      setOpen(true);
    } catch (err) {
      console.error("openEdit:", err);
    }
  };

  // ---------------- Save (create or update) ----------------
  const save = async () => {
    try {
      // prepare payload
      const payload: any = {
        id_entite,
        identification: form.identification || "",
        description_fr: form.description_fr || "",
        description_en: form.description_en || null,
        description_ar: form.description_ar || null,
        nature: form.nature || "fiche occasionnelle",
        utilite: form.utilite || "",
        date_lancement: form.date_lancement || null,
        elements: (form.elements || []).map((el) => ({
          nom: el.nom,
          type: el.type,
          options: el.options || null,
          defaultValue: el.defaultValue || null
        })),
        illustrations: (form.illustrations || [])
      };

      if (editing && editing.id_carac) {
        await axios.put(`/api/caracteristiques/${editing.id_carac}`, payload);
      } else {
        await axios.post("/api/caracteristiques", payload);
      }

      setOpen(false);
      fetchList();
    } catch (err) {
      console.error("save:", err);
      alert("Erreur lors de l'enregistrement. Voir console.");
    }
  };

  // ---------------- Delete ----------------
  const remove = async (id?: number) => {
    if (!id) return;
    if (!confirm("Voulez-vous vraiment supprimer cette fiche ?")) return;
    try {
      await axios.delete(`/api/caracteristiques/${id}`);
      fetchList();
    } catch (err) {
      console.error("remove:", err);
      alert("Erreur suppression.");
    }
  };

  // ---------------- Elements helpers ----------------
  const addElement = () => {
    setForm((f) => ({ ...(f || {}), elements: [...(f?.elements || []), emptyElement()] }));
  };

  const updateElement = (idx: number, patch: Partial<ElementTechnique>) => {
    setForm((f) => {
      const els = [...(f?.elements || [])];
      els[idx] = { ...(els[idx] || emptyElement()), ...patch };
      // if type changed to non-list clear options
      if (patch.type && patch.type !== "list") {
        els[idx].options = null;
      }
      return { ...(f || {}), elements: els };
    });
  };

  const removeElement = (idx: number) => {
    setForm((f) => {
      const els = [...(f?.elements || [])];
      els.splice(idx, 1);
      return { ...(f || {}), elements: els };
    });
  };

  // ---------------- Illustrations helpers ----------------
  const uploadFile = async () => {
    if (!fileToUpload) return alert("Choisissez un fichier avant d'uploader.");
    const fd = new FormData();
    fd.append("file", fileToUpload);
    try {
      const r = await axios.post("/api/caracteristiques/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const fileData = r.data;
      const newIllustration: Illustration = {
        filename: fileData.filename,
        type: fileData.type,
        url: fileData.url
      };
      setForm((f) => ({ ...(f || {}), illustrations: [...(f?.illustrations || []), newIllustration] }));
      setFileToUpload(null);
    } catch (err) {
      console.error("uploadFile:", err);
      alert("Erreur upload.");
    }
  };

  const removeIllustration = (idx: number) => {
    setForm((f) => {
      const imgs = [...(f?.illustrations || [])];
      imgs.splice(idx, 1);
      return { ...(f || {}), illustrations: imgs };
    });
  };

  // ---------------- Draggable modal handlers ----------------
  const onMouseDownDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    const modal = modalRef.current;
    if (!modal) return;
    dragRef.current.dragging = true;
    const rect = modal.getBoundingClientRect();
    dragRef.current.offsetX = e.clientX - rect.left;
    dragRef.current.offsetY = e.clientY - rect.top;
    document.addEventListener("mousemove", onMouseMoveDrag);
    document.addEventListener("mouseup", onMouseUpDrag);
  };

  const onMouseMoveDrag = (e: MouseEvent) => {
    if (!dragRef.current.dragging) return;
    const left = e.clientX - dragRef.current.offsetX;
    const top = Math.max(20, e.clientY - dragRef.current.offsetY); // don't go above
    setModalPos({ left: left, top: top });
  };

  const onMouseUpDrag = () => {
    dragRef.current.dragging = false;
    document.removeEventListener("mousemove", onMouseMoveDrag);
    document.removeEventListener("mouseup", onMouseUpDrag);
  };

  // ---------------- small helpers ----------------
  const elementTypeOptions: ElementType[] = ["varchar", "number", "integer", "text", "list"];

  // ---------------- Render ----------------
  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">EDI</span>
        <span className="text-gray-300">›</span>
        <span className="text-blue-600 font-medium">Caractéristiques</span>
      </nav>

      <div className="min-h-screen p-6">
      <div className="space-y-6">
        <Card className="w-full shadow">
          <CardHeader>
            <CardTitle className="text-2xl">Fiches Caractéristique</CardTitle>
            <CardDescription>Créez et gérez des fiches (identification, description FR, nature, éléments techniques, illustrations...)</CardDescription>
          </CardHeader>

          <CardContent>
            {/* Controls */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div className="flex gap-2 items-center">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher identification / utilité..."
                  className="border p-2 rounded w-64"
                />
                <select value={natureFilter} onChange={(e) => setNatureFilter(e.target.value)} className="border p-2 rounded">
                  <option value="">Toutes natures</option>
                  <option value="fiche occasionnelle">fiche occasionnelle</option>
                  <option value="fiche permanente">fiche permanente</option>
                </select>
                <button onClick={fetchList} className="px-3 py-2 bg-gray-100 rounded border">Filtrer</button>
              </div>

              <div className="flex gap-2">
                <button onClick={() => openNew()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">+ Nouvelle fiche</button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full table-auto border-collapse">
                <thead>
                  <tr className="bg-blue-900 text-white">
                    <th className="px-3 py-2 border text-left">Identification</th>
                    <th className="px-3 py-2 border text-left">Utilité</th>
                    <th className="px-3 py-2 border text-left">Nature</th>
                    <th className="px-3 py-2 border text-left">Date Lancement</th>
                    <th className="px-3 py-2 border text-left">#Éléments</th>
                    <th className="px-3 py-2 border text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="p-4">Chargement...</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={6} className="p-4">Aucune fiche trouvée.</td></tr>
                  ) : (
                    items.map((it) => (
                      <motion.tr key={it.id_carac} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="hover:bg-gray-50">
                        <td className="px-3 py-2 border">{it.identification}</td>
                        <td className="px-3 py-2 border">{it.utilite || "-"}</td>
                        <td className="px-3 py-2 border">{it.nature || "-"}</td>
                        <td className="px-3 py-2 border">{it.date_lancement || "-"}</td>
                        <td className="px-3 py-2 border">{(it.elements && it.elements.length) || 0}</td>
                        <td className="px-3 py-2 border">
                          <div className="flex gap-2">
                            <button className="px-2 py-1 bg-green-600 text-white rounded" onClick={() => openEdit(it.id_carac)}>Modifier</button>
                            <button className="px-2 py-1 bg-red-600 text-white rounded" onClick={() => remove(it.id_carac)}>Supprimer</button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal (custom, draggable) */}
      {open && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setOpen(false)} />
          <div
            ref={modalRef}
            className="fixed z-50 w-[900px] max-w-[96vw] left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-2xl"
            style={{
              top: typeof modalPos.top === "number" ? `${modalPos.top}px` : modalPos.top,
              left: typeof modalPos.left === "number" ? `${modalPos.left}px` : modalPos.left,
              transform: typeof modalPos.left === "string" ? "translateX(-50%)" : undefined
            }}
          >
            {/* Drag handle */}
            <div
              className="h-10 bg-gray-100 rounded-t-lg cursor-move flex items-center justify-between px-3"
              onMouseDown={onMouseDownDrag}
            >
              <div className="text-sm text-gray-700 font-medium">{editing ? "Modifier la fiche" : "Nouvelle fiche"}</div>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-black">✕</button>
              </div>
            </div>

            <div className="p-5 max-h-[80vh] overflow-y-auto">
              {/* Quick guide */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded text-sm text-gray-700">
                <strong>Guide rapide :</strong>
                <ul className="mt-2 list-disc pl-5 space-y-1">
                  <li>Remplissez <strong>Identification</strong> (nom de la fiche).</li>
                  <li>Tapez la <strong>description (FR)</strong> maintenant. Vous pouvez ajouter EN/AR plus tard.</li>
                  <li>Choisissez <strong>Nature</strong> (occasionnelle / permanente).</li>
                  <li>Ajoutez les <strong>éléments techniques</strong> (Détail = nom, Contenu = valeur). Pour type <em>list</em>, entrez les options séparées par des virgules.</li>
                  <li>Ajoutez <strong>illustrations</strong> (images ou vidéos) — upload puis « Upload » bouton.</li>
                </ul>
              </div>

              {/* Identification & utilite & nature */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <input
                  placeholder="Identification (ex: Blanchisserie — blanchiment)"
                  value={form.identification || ""}
                  onChange={(e) => setForm({ ...(form || {}), identification: e.target.value })}
                  className="border p-2 rounded w-full"
                />
                <input
                  placeholder="Utilité"
                  value={form.utilite || ""}
                  onChange={(e) => setForm({ ...(form || {}), utilite: e.target.value })}
                  className="border p-2 rounded w-full"
                />
                <select
                  value={form.nature || "fiche occasionnelle"}
                  onChange={(e) => setForm({ ...(form || {}), nature: e.target.value })}
                  className="border p-2 rounded w-full"
                >
                  <option value="fiche occasionnelle">fiche occasionnelle</option>
                  <option value="fiche permanente">fiche permanente</option>
                </select>
              </div>

              {/* Date lancement */}
              <div className="mb-3">
                <label className="text-sm text-gray-600">Date de lancement (optionnel)</label>
                <input
                  type="date"
                  value={form.date_lancement || ""}
                  onChange={(e) => setForm({ ...(form || {}), date_lancement: e.target.value })}
                  className="border p-2 rounded w-40 block mt-1"
                />
              </div>

              {/* Descriptions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <textarea
                  placeholder="Description (FR) — obligatoire"
                  value={form.description_fr || ""}
                  onChange={(e) => setForm({ ...(form || {}), description_fr: e.target.value })}
                  className="border p-2 rounded w-full h-28"
                />
                <textarea
                  placeholder="Description (EN) — optionnel"
                  value={form.description_en || ""}
                  onChange={(e) => setForm({ ...(form || {}), description_en: e.target.value })}
                  className="border p-2 rounded w-full h-28"
                />
                <textarea
                  placeholder="Description (AR) — optionnel"
                  value={form.description_ar || ""}
                  onChange={(e) => setForm({ ...(form || {}), description_ar: e.target.value })}
                  className="border p-2 rounded w-full h-28"
                />
              </div>

              {/* Elements techniques */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Éléments techniques</h4>
                  <button onClick={addElement} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">+ Ajouter un élément</button>
                </div>

                {(form.elements || []).length === 0 && <div className="text-sm text-gray-500 mb-2">Aucun élément ajouté.</div>}

                {(form.elements || []).map((el, i) => (
                  <div key={i} className="border rounded p-3 mb-2">
                    <div className="flex gap-2 items-center">
                      <input
                        placeholder="Nom de l'élément (ex: Capacité)"
                        value={el.nom}
                        onChange={(e) => updateElement(i, { nom: e.target.value })}
                        className="border p-2 rounded flex-1"
                      />

                      <select
                        value={el.type}
                        onChange={(e) => updateElement(i, { type: e.target.value as ElementType })}
                        className="border p-2 rounded"
                      >
                        {elementTypeOptions.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>

                      <button onClick={() => removeElement(i)} className="px-2 py-1 bg-red-600 text-white rounded">✕</button>
                    </div>

                    {/* options for list type */}
                    {el.type === "list" && (
                      <div className="mt-2">
                        <label className="text-sm text-gray-600">Options (séparées par des virgules)</label>
                        <input
                          placeholder="ex: petit,moyen,grand"
                          value={(el.options && (el.options as string[]).join(",")) || ""}
                          onChange={(e) => updateElement(i, { options: e.target.value.split(",").map(s => s.trim()) })}
                          className="border p-2 rounded w-full mt-1"
                        />
                      </div>
                    )}

                    {/* default value */}
                    <div className="mt-2">
                      <label className="text-sm text-gray-600">Valeur par défaut (optionnel)</label>
                      <input
                        placeholder="Valeur par défaut"
                        value={el.defaultValue || ""}
                        onChange={(e) => updateElement(i, { defaultValue: e.target.value })}
                        className="border p-2 rounded w-full mt-1"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Illustrations (images / videos) */}
              <div className="mb-4">
                <h4 className="font-semibold mb-2">Illustrations (images / vidéos)</h4>
                <div className="flex gap-2 items-center mb-2">
                  <input type="file" accept="image/*,video/*" onChange={(e) => setFileToUpload(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                  <button onClick={uploadFile} className="px-3 py-1 bg-green-600 text-white rounded">Upload</button>
                </div>

                <div className="flex gap-3 overflow-x-auto py-2">
                  {(form.illustrations || []).map((m, idx) => (
                    <div key={idx} className="relative">
                      {m.type === "image" ? (
                        <img src={m.url} alt="illustration" className="h-24 w-36 object-cover rounded border" />
                      ) : (
                        <video src={m.url} className="h-24 w-36 object-cover rounded border" controls />
                      )}
                      <button onClick={() => removeIllustration(idx)} className="absolute top-1 right-1 bg-red-600 text-white rounded-full px-1">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* modal actions */}
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => { setOpen(false); }} className="px-4 py-2 rounded border">Annuler</button>
                <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded">Valider</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
};

export default Caracteristiques;
