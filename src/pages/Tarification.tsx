import React, { useEffect, useState } from "react";
import axios from "axios";
import { useApi } from "../hooks/useApi";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
  Autocomplete,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  LinearProgress,
  Alert,
  Divider,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Business as BusinessIcon,
  Inventory as InventoryIcon,
  PriceChange as PriceChangeIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  Check as CheckIcon,
} from "@mui/icons-material";

/* ===================== CONSTANTS ===================== */

/* ===================== TYPES ===================== */

interface Entite {
  id_entite: number;
  raison_socialle: string;
  email?: string;
  gln?: string;
}

interface Product {
  id: number;
  libelle: string;
  gtin: string;
  brand?: string;
}

interface Buyer {
  id_entite: number;
  raison_socialle: string;
  email?: string;
}

interface TarificationItem {
  id_tarification: number;
  id_fiche_produit: number;
  id_buyer_entite: number;
  buyer_name?: string;
  buyer_email?: string;
  libelle_tarif: string;
  code_tarif?: string;
  type_tarif: string;
  statut: string;
  data: {
    prix?: number;
    devise?: string;
    min_qte?: number;
    max_qte?: number;
    remise_pct?: number;
    tva_pct?: number;
    commentaire?: string;
  };
  created_at?: string;
  updated_at?: string;
}

/* ===================== COMPONENT ===================== */

const Tarification: React.FC = () => {
  const api = useApi();
  const [myEntite, setMyEntite] = useState<Entite | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [tarifications, setTarifications] = useState<TarificationItem[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTarif, setEditingTarif] = useState<TarificationItem | null>(null);
  const [selectedBuyer, setSelectedBuyer] = useState<Buyer | null>(null);

  const [form, setForm] = useState<Partial<TarificationItem>>({
    libelle_tarif: "",
    code_tarif: "",
    type_tarif: "VENTE",
    statut: "ACTIF",
    data: {
      devise: "TND",
    },
  });

  const [filters, setFilters] = useState({
    type_tarif: "",
    statut: "",
  });

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.id_entite) {
          setMyEntite({
            id_entite: user.id_entite,
            raison_socialle: user.producer_name || user.name || "Mon Entreprise",
            email: user.email,
          });
        }
      } catch (e) {
        console.error("Error parsing user from localStorage:", e);
      }
    }
    loadBuyers();
  }, []);

  useEffect(() => {
    if (myEntite) {
      loadProducts();
    }
  }, [myEntite]);

  useEffect(() => {
    if (selectedProduct && myEntite) {
      loadTarifications();
    }
  }, [selectedProduct]);

  const loadProducts = async () => {
  if (!myEntite) return;
  setLoading(true);
  setError(null);

  try {
    const res = await api.get(`/api/entite-products`, {
      params: { id: myEntite.id_entite },
    });

    const data = res.data || [];

    console.log(`Produits pour entite ${myEntite.id_entite} : ${data.length}`);

    if (Array.isArray(data) && data.length > 0) {
      setProducts(data);
    } else {
      setError("Aucun produit trouvé pour cette entreprise");
      setProducts([]);
    }
  } catch (err: any) {
    console.error("Erreur /api/entite-products:", err?.response?.status, err?.response?.data);
    setError("Impossible de charger les produits (vérifiez si l'endpoint existe)");
    setProducts([]);
  } finally {
    setLoading(false);
  }
};

  const loadBuyers = async () => {
    const possible = ["/api/companies", "/api/company", "/api/entites", "/api/Entite", "/api/entreprises", "/api/entite"];

    for (const path of possible) {
      try {
        const res = await api.get(`${path}`);
        const data = res.data || [];
        if (Array.isArray(data) && data.length > 0) {
          console.log(`Buyers chargés depuis: ${path} (${data.length} entités)`);
          setBuyers(data);
          return;
        }
      } catch (err) {
        console.log(`Échec sur ${path}:`, err?.response?.status);
      }
    }
    console.warn("Aucun endpoint acheteurs n'a fonctionné");
    setBuyers([]);
  };

  const loadTarifications = async () => {
    if (!selectedProduct || !myEntite) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/tarifications`, {
        params: {
          id_fiche_produit: selectedProduct.id,
          id_entite: myEntite.id_entite,
        },
      });
      setTarifications(res.data || []);
    } catch (err) {
      console.error("Erreur tarifications:", err);
      setTarifications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (tarif?: TarificationItem) => {
    if (tarif) {
      setEditingTarif(tarif);
      setForm(tarif);
      const buyer = buyers.find((b) => b.id_entite === tarif.id_buyer_entite);
      setSelectedBuyer(buyer || null);
    } else {
      setForm({
        libelle_tarif: "",
        code_tarif: "",
        type_tarif: "VENTE",
        statut: "ACTIF",
        data: { devise: "TND" },
      });
      setEditingTarif(null);
      setSelectedBuyer(null);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTarif(null);
    setSelectedBuyer(null);
  };

  const handleFormChange = (field: string, value: any) => {
    if (field.startsWith("data.")) {
      const key = field.replace("data.", "");
      setForm((prev) => ({
        ...prev,
        data: { ...prev.data, [key]: value },
      }));
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
    }
  };

  const saveTarification = async () => {
    if (!selectedProduct || !selectedBuyer || !form.libelle_tarif) {
      alert("Champs obligatoires manquants");
      return;
    }
    if (!myEntite) return;

    setLoading(true);
    try {
      const payload = {
        id_fiche_produit: selectedProduct.id,
        id_buyer_entite: selectedBuyer.id_entite,
        id_entite: myEntite.id_entite,
        libelle_tarif: form.libelle_tarif,
        code_tarif: form.code_tarif,
        type_tarif: form.type_tarif,
        statut: form.statut,
        data: form.data,
      };

      if (editingTarif) {
        await api.put(
          `/api/tarifications/${editingTarif.id_tarification}`,
          payload
        );
      } else {
        await api.post(`/api/tarifications`, payload);
      }
      await loadTarifications();
      handleCloseDialog();
    } catch (err: any) {
      alert("Erreur sauvegarde : " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const deleteTarification = async (id: number) => {
    if (!window.confirm("Confirmer la suppression ?")) return;
    setLoading(true);
    try {
      await api.delete(`/api/tarifications/${id}`);
      await loadTarifications();
    } catch (err) {
      alert("Erreur suppression");
    } finally {
      setLoading(false);
    }
  };

  const filteredTarifications = tarifications.filter((t) => {
    const typeOk = !filters.type_tarif || t.type_tarif === filters.type_tarif;
    const statutOk = !filters.statut || t.statut === filters.statut;
    return typeOk && statutOk;
  });

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#ffffff" }}>
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Paramètres</span>
        <span className="text-gray-300">›</span>
        <span className="text-blue-600 font-medium">Tarification</span>
      </nav>
      <Box sx={{ maxWidth: 1400, mx: "auto", px: 2, py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: "#1a237e",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <PriceChangeIcon sx={{ fontSize: 32 }} />
            Gestion des Tarifications
          </Typography>
          <Typography variant="body2" sx={{ color: "#666", mt: 1 }}>
            Créez et gérez les tarifications par produit et par acheteur
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {myEntite ? (
          <Card sx={{ mb: 4, bgcolor: "#e8eaf6", border: "1px solid #5e35b1" }}>
            <CardContent sx={{ py: 2 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <BusinessIcon sx={{ color: "#5e35b1", fontSize: 28 }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ color: "#666" }}>
                    Vous êtes connecté en tant que:
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: "#1a237e" }}>
                    {myEntite.raison_socialle}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ) : (
          <Alert severity="warning" sx={{ mb: 3 }}>
            ⚠️ Veuillez vous connecter pour accéder à cette page
          </Alert>
        )}

        {myEntite && (
          <Card sx={{ mb: 4 }}>
            <CardHeader
              avatar={<InventoryIcon sx={{ color: "#5e35b1" }} />}
              title="Sélectionnez un produit"
              titleTypographyProps={{ variant: "h6", sx: { fontWeight: 600 } }}
              sx={{ pb: 1 }}
            />
            <CardContent>
              {loading ? (
                <Box sx={{ py: 2 }}>
                  <LinearProgress />
                  <Typography variant="body2" sx={{ mt: 1, color: "#666", textAlign: "center" }}>
                    Chargement des produits...
                  </Typography>
                </Box>
              ) : products.length > 0 ? (
                <Autocomplete
                  options={products}
                  value={selectedProduct}
                  onChange={(e, newValue) => setSelectedProduct(newValue)}
                  getOptionLabel={(option) =>
                    `${option.libelle} (GTIN: ${option.gtin})`
                  }
                  isOptionEqualToValue={(option, value) => option.id === value?.id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Chercher un produit..."
                      placeholder="Libellé ou GTIN"
                      slotProps={{
                        input: {
                          ...params.InputProps,
                          startAdornment: (
                            <>
                              <InputAdornment position="start">
                                <SearchIcon sx={{ color: "#999" }} />
                              </InputAdornment>
                              {params.InputProps.startAdornment}
                            </>
                          ),
                        },
                      }}
                    />
                  )}
                  noOptionsText="Aucun produit trouvé"
                />
              ) : (
                <Alert severity="info">
                  Aucun produit disponible pour votre entreprise. Créez-en d'abord dans la gestion des produits.
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {selectedProduct && myEntite && (
          <>
            <Card sx={{ mb: 4, bgcolor: "#f3e5f5" }}>
              <CardContent>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  <Box sx={{ flex: '1 1 45%', minWidth: 200 }}>
                    <Typography variant="subtitle2" sx={{ color: "#666" }}>
                      Produit sélectionné
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {selectedProduct.libelle}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: '1 1 45%', minWidth: 200 }}>
                    <Typography variant="subtitle2" sx={{ color: "#666" }}>
                      GTIN
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 600, fontFamily: "monospace" }}
                    >
                      {selectedProduct.gtin}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            <Card sx={{ mb: 4 }}>
              <CardHeader
                title="Filtres"
                titleTypographyProps={{ variant: "subtitle1", sx: { fontWeight: 600 } }}
                sx={{ pb: 1 }}
              />
              <CardContent>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  <Box sx={{ flex: '1 1 45%', minWidth: 200 }}>
                    <TextField
                      fullWidth
                      select
                      label="Type de tarif"
                      value={filters.type_tarif}
                      onChange={(e) =>
                        setFilters({ ...filters, type_tarif: e.target.value })
                      }
                      size="small"
                    >
                      <option value="">Tous</option>
                      <option value="VENTE">Vente</option>
                      <option value="ACHAT">Achat</option>
                      <option value="GROS">Gros</option>
                      <option value="DETAIL">Détail</option>
                    </TextField>
                  </Box>
                  <Box sx={{ flex: '1 1 45%', minWidth: 200 }}>
                    <TextField
                      fullWidth
                      select
                      label="Statut"
                      value={filters.statut}
                      onChange={(e) =>
                        setFilters({ ...filters, statut: e.target.value })
                      }
                      size="small"
                    >
                      <option value="">Tous</option>
                      <option value="ACTIF">Actif</option>
                      <option value="INACTIF">Inactif</option>
                      <option value="ARCHIVE">Archivé</option>
                    </TextField>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            <Box sx={{ mb: 3 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
                sx={{
                  bgcolor: "#5e35b1",
                  "&:hover": { bgcolor: "#4527a0" },
                  textTransform: "none",
                  fontWeight: 600,
                  py: 1.5,
                }}
              >
                Ajouter une tarification
              </Button>
            </Box>

            {loading && <LinearProgress sx={{ mb: 2 }} />}

            {filteredTarifications.length > 0 ? (
              <TableContainer
                component={Paper}
                sx={{
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  borderRadius: 2,
                }}
              >
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: "#f5f5f5" }}>
                      <TableCell sx={{ fontWeight: 700, color: "#1a237e" }}>Acheteur</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: "#1a237e" }}>Libellé</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: "#1a237e" }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: "#1a237e" }}>Prix</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: "#1a237e" }}>Remise</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: "#1a237e" }}>Statut</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: "#1a237e" }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTarifications.map((tarif) => (
                      <TableRow
                        key={tarif.id_tarification}
                        sx={{
                          "&:hover": { bgcolor: "#f5f5f5" },
                          borderBottom: "1px solid #e0e0e0",
                        }}
                      >
                        <TableCell>
                          <Tooltip title={tarif.buyer_email || ""}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {tarif.buyer_name || "—"}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>{tarif.libelle_tarif}</TableCell>
                        <TableCell>
                          <Chip
                            label={tarif.type_tarif}
                            size="small"
                            sx={{
                              bgcolor: tarif.type_tarif === "VENTE" ? "#e8f5e9" : "#fff3e0",
                              color: tarif.type_tarif === "VENTE" ? "#2e7d32" : "#e65100",
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {tarif.data.prix ? (
                            <>
                              {tarif.data.prix.toFixed(3)}{" "}
                              <span style={{ fontSize: "0.8em" }}>{tarif.data.devise}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell sx={{ color: tarif.data.remise_pct ? "#d32f2f" : "#999" }}>
                          {tarif.data.remise_pct ? `${tarif.data.remise_pct}%` : "—"}
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={tarif.statut === "ACTIF" ? <CheckIcon /> : undefined}
                            label={tarif.statut}
                            size="small"
                            sx={{
                              bgcolor:
                                tarif.statut === "ACTIF"
                                  ? "#c8e6c9"
                                  : tarif.statut === "INACTIF"
                                  ? "#ffccbc"
                                  : "#e0e0e0",
                              color:
                                tarif.statut === "ACTIF"
                                  ? "#1b5e20"
                                  : tarif.statut === "INACTIF"
                                  ? "#bf360c"
                                  : "#424242",
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Modifier">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenDialog(tarif)}
                                sx={{ color: "#5e35b1" }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Supprimer">
                              <IconButton
                                size="small"
                                onClick={() => deleteTarification(tarif.id_tarification)}
                                sx={{ color: "#d32f2f" }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Paper
                sx={{
                  p: 4,
                  textAlign: "center",
                  bgcolor: "#f5f5f5",
                  borderRadius: 2,
                }}
              >
                <PriceChangeIcon sx={{ fontSize: 48, color: "#ccc", mb: 2 }} />
                <Typography variant="body1" sx={{ color: "#999" }}>
                  Aucune tarification trouvée pour ce produit.
                </Typography>
                <Typography variant="caption" sx={{ color: "#bbb" }}>
                  Cliquez sur "Ajouter une tarification" pour en créer une.
                </Typography>
              </Paper>
            )}
          </>
        )}

        <Dialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          maxWidth="sm"
          fullWidth
          PaperProps={{ sx: { borderRadius: 2 } }}
        >
          <DialogTitle sx={{ fontWeight: 700, color: "#1a237e", pb: 1 }}>
            {editingTarif ? "Modifier la tarification" : "Ajouter une tarification"}
          </DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 3 }}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "#1a237e", mb: 1 }}>
                  Acheteur *
                </Typography>
                {buyers.length > 0 ? (
                  <Autocomplete
                    options={buyers.filter((b) => b.id_entite !== myEntite?.id_entite)}
                    value={selectedBuyer}
                    onChange={(e, newValue) => setSelectedBuyer(newValue)}
                    getOptionLabel={(option) =>
                      `${option.raison_socialle} (${option.email || "N/A"})`
                    }
                    isOptionEqualToValue={(option, value) => option.id_entite === value?.id_entite}
                    filterOptions={(options, state) => {
                      const inputValue = state.inputValue.toLowerCase();
                      return options.filter(
                        (option) =>
                          option.raison_socialle.toLowerCase().includes(inputValue) ||
                          option.email?.toLowerCase().includes(inputValue)
                      );
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Chercher par nom ou email..."
                        slotProps={{
                          input: {
                            ...params.InputProps,
                            startAdornment: (
                              <>
                                <InputAdornment position="start">
                                  <SearchIcon sx={{ color: "#999" }} />
                                </InputAdornment>
                                {params.InputProps.startAdornment}
                              </>
                            ),
                          },
                        }}
                      />
                    )}
                    noOptionsText="Aucun acheteur trouvé"
                  />
                ) : (
                  <Alert severity="warning">
                    Aucun acheteur disponible. Créez d'abord une nouvelle entité.
                  </Alert>
                )}
              </Box>

              {selectedBuyer && (
                <>
                  <Divider />

                  <TextField
                    fullWidth
                    label="Libellé *"
                    value={form.libelle_tarif || ""}
                    onChange={(e) => handleFormChange("libelle_tarif", e.target.value)}
                    placeholder="Ex: Tarif gros 2024"
                    variant="outlined"
                  />

                  <TextField
                    fullWidth
                    label="Code tarif"
                    value={form.code_tarif || ""}
                    onChange={(e) => handleFormChange("code_tarif", e.target.value)}
                    placeholder="Ex: TRF001"
                  />

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        fullWidth
                        select
                        label="Type"
                        value={form.type_tarif || "VENTE"}
                        onChange={(e) => handleFormChange("type_tarif", e.target.value)}
                      >
                        <option value="VENTE">Vente</option>
                        <option value="ACHAT">Achat</option>
                        <option value="GROS">Gros</option>
                        <option value="DETAIL">Détail</option>
                      </TextField>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        fullWidth
                        select
                        label="Statut"
                        value={form.statut || "ACTIF"}
                        onChange={(e) => handleFormChange("statut", e.target.value)}
                      >
                        <option value="ACTIF">Actif</option>
                        <option value="INACTIF">Inactif</option>
                        <option value="ARCHIVE">Archivé</option>
                      </TextField>
                    </Box>
                  </Box>

                  <Divider />

                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Informations de prix
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Prix"
                        value={form.data?.prix || ""}
                        onChange={(e) =>
                          handleFormChange("data.prix", e.target.value ? parseFloat(e.target.value) : undefined)
                        }
                        inputProps={{ step: "0.001", min: "0" }}
                      />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        fullWidth
                        select
                        label="Devise"
                        value={form.data?.devise || "TND"}
                        onChange={(e) => handleFormChange("data.devise", e.target.value)}
                      >
                        <option value="TND">TND</option>
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                      </TextField>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Remise (%)"
                        value={form.data?.remise_pct || ""}
                        onChange={(e) =>
                          handleFormChange("data.remise_pct", e.target.value ? parseFloat(e.target.value) : undefined)
                        }
                        inputProps={{ step: "0.01", min: "0", max: "100" }}
                      />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        fullWidth
                        type="number"
                        label="TVA (%)"
                        value={form.data?.tva_pct || ""}
                        onChange={(e) =>
                          handleFormChange("data.tva_pct", e.target.value ? parseFloat(e.target.value) : undefined)
                        }
                        inputProps={{ step: "0.01", min: "0", max: "100" }}
                      />
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Qté min"
                        value={form.data?.min_qte || ""}
                        onChange={(e) =>
                          handleFormChange("data.min_qte", e.target.value ? parseInt(e.target.value) : undefined)
                        }
                        inputProps={{ min: "0" }}
                      />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Qté max"
                        value={form.data?.max_qte || ""}
                        onChange={(e) =>
                          handleFormChange("data.max_qte", e.target.value ? parseInt(e.target.value) : undefined)
                        }
                        inputProps={{ min: "0" }}
                      />
                    </Box>
                  </Box>

                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Commentaire"
                    value={form.data?.commentaire || ""}
                    onChange={(e) => handleFormChange("data.commentaire", e.target.value)}
                    placeholder="Notes supplémentaires..."
                  />
                </>
              )}
            </Stack>
          </DialogContent>
          <Divider />
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={handleCloseDialog} sx={{ color: "#999" }}>
              Annuler
            </Button>
            <Button
              onClick={saveTarification}
              variant="contained"
              disabled={loading || !selectedBuyer}
              sx={{
                bgcolor: "#5e35b1",
                "&:hover": { bgcolor: "#4527a0" },
                textTransform: "none",
                fontWeight: 600,
              }}
            >
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default Tarification;