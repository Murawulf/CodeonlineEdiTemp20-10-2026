import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useApi } from "@/hooks/useApi";

// Error Boundary minimaliste pour l'isolation locale
class ActionErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { 
    if (this.state.hasError) {
      console.error("[SafeAcceptModificationsAction] Error caught by boundary");
      return null; // Fallback silencieux (Zero regression)
    }
    return this.props.children; 
  }
}

interface AcceptModificationsProps {
  order: any;
  currentEntiteId: string | number;
  onSuccess: () => void;
  className?: string;
}

const AcceptModificationsButton: React.FC<AcceptModificationsProps> = ({ order, currentEntiteId, onSuccess, className = "" }) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const api = useApi();

  if (!order || !currentEntiteId) return null;

  // Conditions strictes d'affichage : 
  // 1. C'est une commande que nous avons envoyée (nous sommes l'acheteur)
  // 2. Le statut actuel est "modified"
  const isBuyer = String(order.id_entite_buyer) === String(currentEntiteId) || order.type === "Envoyée";
  const isModified = (order.status || order.statut)?.toLowerCase() === 'modified' || (order.status || order.statut)?.toLowerCase() === 'modifiée';

  if (!isBuyer || !isModified) return null;

  const handleAccept = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await api.post('/api/orders/accept-modifications', 
        { orderId: order.id_order || order.id },
        { headers: { 'x-entite-id': currentEntiteId } }
      );
      
      toast({
        title: "Modifications acceptées",
        description: "Le message ORDCHG a été transmis au fournisseur.",
        className: "bg-green-50 border-green-200"
      });
      onSuccess();
    } catch (err: any) {
      console.error("[ORDCHG] Accept error:", err);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err.response?.data?.error || "Impossible de valider les modifications."
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      size="sm" 
      onClick={handleAccept} 
      disabled={loading}
      className={`bg-green-600 hover:bg-green-700 text-white flex gap-2 items-center ${className}`}
    >
      <CheckCircle size={16} />
      {loading ? "Traitement..." : "Accepter les modifications"}
    </Button>
  );
};

// Export sécurisé via ErrorBoundary
export default function SafeAcceptModificationsAction(props: AcceptModificationsProps) {
  return (
    <ActionErrorBoundary>
      <AcceptModificationsButton {...props} />
    </ActionErrorBoundary>
  );
}
