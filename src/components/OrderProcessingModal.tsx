import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check, X, AlertTriangle, Save } from "lucide-react";

interface OrderProcessingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  order: any;
  readonly?: boolean;
}

export default function OrderProcessingModal({ isOpen, onClose, onSubmit, order, readonly = false }: OrderProcessingModalProps) {
  const [action, setAction] = useState<"accepted" | "rejected" | "modified">("accepted");
  const [comment, setComment] = useState("");
  const [articles, setArticles] = useState<any[]>([]);
  const [confirmedDeliveryDate, setConfirmedDeliveryDate] = useState("");
  
  // Log when component receives props
  useEffect(() => {
    console.log("\n=== [OrderProcessingModal] Props Received ===");
    console.log("[MODAL COMPONENT] isOpen:", isOpen);
    console.log("[MODAL COMPONENT] readonly prop:", readonly);
    console.log("[MODAL COMPONENT] order:", order ? {
      id_order: order.id_order,
      type: order.type,
      status: order.status,
      statut: order.statut,
      id_entite_seller: order.id_entite_seller,
      id_entite_buyer: order.id_entite_buyer,
      is_staging: order.is_staging // Log staging flag
    } : null);
    console.log("=== [OrderProcessingModal] Props End ===\n");
  }, [isOpen, readonly, order]);

  useEffect(() => {
    if (order && order.lines) {
      console.log("[MODAL COMPONENT] Initializing order data...");
      console.log("[MODAL COMPONENT] Order lines count:", order.lines.length);
      console.log("[MODAL COMPONENT] Order status/statut:", order.status, "/", order.statut);
      
      setArticles(order.lines.map((line: any) => ({
        ...line,
        confirmedQty: line.confirmedQty !== undefined ? line.confirmedQty : line.qty,
        confirmedPrice: line.confirmedPrice !== undefined ? line.confirmedPrice : (line.price || line.prix || 0),
        comment: line.lineComment || line.line_comment || line.comment || ""
      })));
      
      // Initialize confirmed delivery date
      if (order.date_livraison) {
        const date = new Date(order.date_livraison);
        setConfirmedDeliveryDate(date.toISOString().split('T')[0]);
      }
      
      // Si la commande a déjà un statut, on essaie de le refléter
      let selectedAction: "accepted" | "rejected" | "modified" = "accepted";
      if (order.statut === 'accepted' || order.status === 'accepted') selectedAction = "accepted";
      else if (order.statut === 'rejected' || order.status === 'rejected') selectedAction = "rejected";
      else if (order.statut === 'modified' || order.status === 'modified') selectedAction = "modified";
      else selectedAction = "accepted"; // Default for 'received' or 'new'
      
      console.log("[MODAL COMPONENT] Setting default action to:", selectedAction);
      setAction(selectedAction);
      
      // Initialize comment if exists
      if (order.comment) {
        setComment(order.comment);
      } else {
        setComment(""); // Reset comment when changing order
      }
    }
  }, [order]);

  const handleSubmit = () => {
    // Determine if this is a staging order
    // If is_staging is explicitly defined, use it.
    // Otherwise, fallback: check if status is 'received' OR if type suggests it's an incoming order
    const isStaging = order.is_staging !== undefined 
      ? order.is_staging 
      : (order.status === 'received' || order.statut === 'received' || order.type === 'Reçue' || order.type === 'received');

    console.log("[MODAL SUBMIT] isStaging determination:", {
      explicit: order.is_staging,
      status: order.status || order.statut,
      type: order.type,
      FINAL: isStaging
    });

    const payload = {
      orderId: order.id_order,
      isStaging: isStaging, 
      status: action,
      comment: comment,
      confirmedDeliveryDate: confirmedDeliveryDate || order.date_livraison,
      modifiedArticles: action === 'modified' ? articles.map(a => ({
        gtin: a.gtin,
        qty: parseInt(a.confirmedQty),
        price: parseFloat(a.confirmedPrice),
        comment: a.comment
      })) : articles.map(a => ({
        gtin: a.gtin,
        qty: parseInt(a.confirmedQty),
        price: parseFloat(a.confirmedPrice),
        comment: a.comment
      }))
    };
    onSubmit(payload);
  };

  const updateArticleQty = (index: number, qty: string) => {
    const newArticles = [...articles];
    newArticles[index].confirmedQty = qty;
    
    // Auto-switch to modified if qty changes
    if (parseInt(qty) !== newArticles[index].qty) {
        setAction("modified");
    }
    
    setArticles(newArticles);
  };

  const updateArticlePrice = (index: number, price: string) => {
    const newArticles = [...articles];
    newArticles[index].confirmedPrice = price;
    
    // Auto-switch to modified if price changes
    const originalPrice = newArticles[index].price || newArticles[index].prix || 0;
    if (parseFloat(price) !== parseFloat(originalPrice)) {
        setAction("modified");
    }
    
    setArticles(newArticles);
  };

  const updateArticleComment = (index: number, comment: string) => {
    const newArticles = [...articles];
    newArticles[index].comment = comment;
    setArticles(newArticles);
  };

  if (!order) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            Traitement de la Commande 
            <span className="text-blue-600 font-mono">#{order.num_order || order.num_commande}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Info Commande */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <Label className="text-xs text-gray-500">Date Commande</Label>
              <div className="font-medium text-sm">{new Date(order.date_reception || order.created_at).toLocaleDateString()}</div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">
                {(order.type === 'Envoyée' || order.status === 'sent') ? 'Fournisseur' : 'Client'}
              </Label>
              <div className="font-medium">
                {(order.type === 'Envoyée' || order.status === 'sent') 
                  ? (order.seller_name || order.fournisseur_name || "Fournisseur")
                  : (order.buyer_name || "Client")
                }
              </div>
              <div className="text-xs text-gray-400">
                {(order.type === 'Envoyée' || order.status === 'sent')
                  ? (order.fournisseur_gln || order.supplier_gln)
                  : (order.acheteur_gln || order.buyer_gln)
                }
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Montant Total</Label>
              <div className="font-medium">{order.total_ht || order.montant_ht} {order.monnaie || "TND"}</div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Statut Actuel</Label>
              <div>
                {(() => {
                  const s = (order.statut || order.status || "new").toLowerCase();
                  let label = s;
                  let color = "outline";
                  let className = "";
                  
                  if (s === 'received' || s === 'reçue') { label = 'Reçue'; className = "bg-purple-100 text-purple-800 border-purple-200"; }
                  else if (s === 'accepted' || s === 'acceptée') { label = 'Acceptée'; className = "bg-green-100 text-green-800 border-green-200"; }
                  else if (s === 'rejected' || s === 'refusée') { label = 'Refusée'; className = "bg-red-100 text-red-800 border-red-200"; }
                  else if (s === 'shipped' || s === 'expédiée') { label = 'Expédiée'; className = "bg-blue-100 text-blue-800 border-blue-200"; }
                  else if (s === 'new') { label = 'En attente'; className = "bg-yellow-100 text-yellow-800 border-yellow-200"; }
                  else if (s === 'sent' || s === 'envoyée') { label = 'Envoyée'; className = "bg-blue-100 text-blue-800 border-blue-200"; }
                  
                  return <Badge variant="outline" className={className}>{label}</Badge>;
                })()}
              </div>
            </div>
          </div>

          {/* Détails supplémentaires (Dates & Lieu) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-lg">
            <div className="space-y-3">
               <h4 className="font-medium text-sm text-gray-700 mb-2">Dates de Livraison</h4>
               <div className="grid grid-cols-2 gap-2">
                 <div>
                    <Label className="text-xs text-gray-500">Demandée</Label>
                    <div className="text-sm font-medium">{order.date_livraison_demandee ? new Date(order.date_livraison_demandee).toLocaleDateString() : '-'}</div>
                 </div>
                 <div>
                    <Label className="text-xs text-gray-500">Confirmée</Label>
                    <div className="text-sm font-medium">{confirmedDeliveryDate ? new Date(confirmedDeliveryDate).toLocaleDateString() : '-'}</div>
                 </div>
                 <div>
                    <Label className="text-xs text-gray-500">Au plus tôt</Label>
                    <div className="text-sm font-medium">{order.date_livraison_plus_tot ? new Date(order.date_livraison_plus_tot).toLocaleDateString() : '-'}</div>
                 </div>
                 <div>
                    <Label className="text-xs text-gray-500">Au plus tard</Label>
                    <div className="text-sm font-medium">{order.date_livraison_plus_tard ? new Date(order.date_livraison_plus_tard).toLocaleDateString() : '-'}</div>
                 </div>
               </div>
            </div>
            
            <div className="space-y-3">
               <h4 className="font-medium text-sm text-gray-700 mb-2">Lieu de Livraison</h4>
               <div>
                  <Label className="text-xs text-gray-500">GLN Livraison</Label>
                  <div className="text-sm font-medium">{order.lieu_livraison_gln || order.acheteur_gln || '-'}</div>
               </div>
               <div className="mt-2">
                  <Label className="text-xs text-gray-500">Adresse (si disponible)</Label>
                  <div className="text-sm text-gray-600 italic">Non spécifiée</div>
               </div>
            </div>
          </div>

          {/* Choix Action */}
          {!readonly && (
            <div className="flex gap-4 justify-center py-2">
              <Button 
                type="button" 
                variant={action === "accepted" ? "default" : "outline"}
                className={`w-32 gap-2 ${action === "accepted" ? "bg-green-600 hover:bg-green-700" : "hover:text-green-600 hover:border-green-600"}`}
                onClick={() => setAction("accepted")}
              >
                <Check size={18} /> Accepter
              </Button>
              <Button 
                type="button" 
                variant={action === "modified" ? "default" : "outline"}
                className={`w-32 gap-2 ${action === "modified" ? "bg-orange-500 hover:bg-orange-600" : "hover:text-orange-500 hover:border-orange-500"}`}
                onClick={() => setAction("modified")}
              >
                <AlertTriangle size={18} /> Modifier
              </Button>
              <Button 
                type="button" 
                variant={action === "rejected" ? "default" : "outline"}
                className={`w-32 gap-2 ${action === "rejected" ? "bg-red-600 hover:bg-red-700" : "hover:text-red-600 hover:border-red-600"}`}
                onClick={() => setAction("rejected")}
              >
                <X size={18} /> Refuser
              </Button>
            </div>
          )}

          {/* Dates de livraison */}
          {!readonly && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Date demandée (lecture seule) */}
              <div>
                <Label htmlFor="requested-date" className="text-gray-700">Date de livraison demandée</Label>
                <Input 
                  id="requested-date"
                  type="text"
                  value={order.date_livraison ? new Date(order.date_livraison).toLocaleDateString('fr-FR') : 'Non spécifiée'}
                  className="mt-2 bg-gray-50 text-gray-600"
                  disabled
                  readOnly
                />
              </div>
              
              {/* Date confirmée (éditable) */}
              <div>
                <Label htmlFor="delivery-date" className="text-gray-700">Date de livraison confirmée</Label>
                <Input 
                  id="delivery-date"
                  type="date"
                  value={confirmedDeliveryDate}
                  onChange={(e) => setConfirmedDeliveryDate(e.target.value)}
                  className="mt-2"
                  disabled={readonly}
                />
              </div>
            </div>
          )}

          {/* Commentaire Global */}
          <div>
            <Label>Commentaire général {readonly ? "(Lecture seule)" : "(optionnel)"}</Label>
            <Textarea 
              placeholder={readonly ? "Aucun commentaire" : "Ajouter un message pour le client..."}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mt-2"
              disabled={readonly}
            />
          </div>

          {/* Liste Articles */}
          {action !== "rejected" && (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-center w-20">Image</th>
                    <th className="p-3 text-left">GTIN</th>
                    <th className="p-3 text-left">Libellé</th>
                    <th className="p-3 text-center">Qté Demandée</th>
                    <th className="p-3 text-center w-28">Qté Confirmée</th>
                    <th className="p-3 text-center w-28">Prix Original</th>
                    <th className="p-3 text-center w-28">Prix Confirmé</th>
                    <th className="p-3 text-left">Note Ligne</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((item, idx) => {
                    const originalPrice = item.price || item.prix || 0;
                    const isPriceChanged = parseFloat(item.confirmedPrice) !== parseFloat(originalPrice);
                    const isQtyChanged = item.confirmedQty != item.qty;
                    
                    return (
                      <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="p-3 text-center">
                          <div className="w-12 h-12 mx-auto rounded overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                            {item.images ? (
                              <img
                                src={item.images}
                                alt={item.libelle || "Produit"}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  const parent = (e.target as HTMLImageElement).parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
                                  }
                                }}
                              />
                            ) : (
                              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-xs">{item.gtin}</td>
                        <td className="p-3">{item.libelle || "Article " + (idx+1)}</td>
                        <td className="p-3 text-center font-medium">{item.qty}</td>
                        <td className="p-3 text-center">
                          <Input 
                            type="number" 
                            min="0"
                            value={item.confirmedQty}
                            onChange={(e) => updateArticleQty(idx, e.target.value)}
                            className={`h-8 text-center ${isQtyChanged ? "border-orange-500 bg-orange-50 font-bold text-orange-700" : ""}`}
                            disabled={readonly}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <div className="text-sm font-medium text-gray-600 bg-gray-50 px-3 py-2 rounded">
                            {parseFloat(originalPrice || 0).toFixed(2)}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <Input 
                            type="number" 
                            min="0"
                            step="0.01"
                            value={item.confirmedPrice}
                            onChange={(e) => updateArticlePrice(idx, e.target.value)}
                            className={`h-8 text-center ${isPriceChanged ? "border-orange-500 bg-orange-50 font-bold text-orange-700" : ""}`}
                            disabled={readonly}
                            placeholder={originalPrice.toString()}
                          />
                        </td>
                        <td className="p-3">
                          <Input 
                            placeholder={readonly ? "-" : "Note..."}
                            value={item.comment} 
                            onChange={(e) => updateArticleComment(idx, e.target.value)}
                            className="h-8 text-xs"
                            disabled={readonly}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          {action === "rejected" && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md flex items-start gap-3">
              <AlertTriangle className="mt-0.5" />
              <div>
                <p className="font-semibold">
                  {readonly ? "Commande Refusée" : "Attention : Refus de commande"}
                </p>
                <p className="text-sm mt-1">
                  {readonly 
                    ? (() => {
                        const dateStr = order?.updated_at && !isNaN(new Date(order.updated_at).getTime())
                          ? ` le ${new Date(order.updated_at).toLocaleDateString('fr-FR')} à ${new Date(order.updated_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}`
                          : "";
                        const isSupplier = order?.type === 'Reçue' || (order?.type !== 'Envoyée' && !['sent'].includes(order?.status || ''));
                        return isSupplier
                          ? `Vous avez refusé cette commande${dateStr}.`
                          : `Cette commande a été refusée${dateStr}.`;
                      })()
                    : "Vous êtes sur le point de refuser l'intégralité de cette commande. Un message de réponse (ORDRSP) sera envoyé au client pour l'informer."}
                </p>
              </div>
            </div>
          )}

        </div>

        <DialogFooter className="sm:justify-between gap-4">
          <Button variant="ghost" onClick={onClose}>{readonly ? "Fermer" : "Annuler"}</Button>
          {!readonly && (
            <Button onClick={handleSubmit} className="w-full sm:w-auto gap-2">
              <Save size={18} />
              Confirmer {action === "accepted" ? "l'acceptation" : action === "rejected" ? "le refus" : "la modification"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
