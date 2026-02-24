// OrderSummaryModal.tsx - Modale de récapitulatif de commande EANCOM
import React, { useState } from "react";
import { X, Eye, EyeOff, Package, Calendar, Building2, MapPin, Coins, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    isLoading?: boolean;
    orderData: {
        numCommande: string;
        datecommande: string;
        datelivraison: string;
        dateLivraisonDemandee?: string;
        dateLivraisonPlusTot?: string;
        dateLivraisonPlusTard?: string;
        fraisTransport?: number;
        Acheteur: string;
        fournisseur: string;
        fournisseurName: string;
        lieu_livraison_primaire: string;
        monnaie: string;
        articles: Array<{
            gtin: string;
            qty: number;
            price: number;
            unit: string;
            libelle: string;
        }>;
    };
}

// Helper function to parse EANCOM date format (YYYYMMDDHHMMSS or YYYYMMDD)
function parseEancomDate(eancomDate: string): Date {
    if (!eancomDate) return new Date();

    const year = parseInt(eancomDate.substring(0, 4));
    const month = parseInt(eancomDate.substring(4, 6)) - 1; // Month is 0-indexed
    const day = parseInt(eancomDate.substring(6, 8));

    if (eancomDate.length >= 14) {
        const hour = parseInt(eancomDate.substring(8, 10));
        const minute = parseInt(eancomDate.substring(10, 12));
        const second = parseInt(eancomDate.substring(12, 14));
        return new Date(year, month, day, hour, minute, second);
    }

    return new Date(year, month, day);
}

export default function OrderSummaryModal({ isOpen, onClose, onSubmit, isLoading = false, orderData }: OrderSummaryModalProps) {
    const [showEancomCodes, setShowEancomCodes] = useState(false);

    if (!isOpen) return null;

    const totalHT = orderData.articles.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // EANCOM Segment Mapping
    const eancomSegments = {
        header: {
            UNH: "UNH+MESS001+ORDERS:D:96A:UN:EAN008'",
            BGM: `BGM+220+${orderData.numCommande}+9'`,
            DTM_order: `DTM+137:${orderData.datecommande}:204'`,
            DTM_delivery: `DTM+2:${orderData.datelivraison}:204'`,
            NAD_buyer: `NAD+BY+${orderData.Acheteur}::9'`,
            NAD_supplier: `NAD+SU+${orderData.fournisseur}::9'`,
            NAD_delivery: `NAD+DP+${orderData.lieu_livraison_primaire}::9'`,
            CUX: `CUX+2:${orderData.monnaie}:9'`,
        },
        lines: orderData.articles.map((item, idx) => ({
            LIN: `LIN+${idx + 1}++${item.gtin}:EN'`,
            QTY: `QTY+21:${item.qty}:${item.unit}'`,
            PRI: `PRI+AAA:${item.price}::NTP:1:${item.unit}'`,
        })),
        footer: {
            UNS: "UNS+S'",
            CNT: `CNT+2:${orderData.articles.length}'`,
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div role="dialog" className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-3 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">Récapitulatif de la Commande</h2>
                        <p className="text-blue-100 text-xs mt-1">Commande N° {orderData.numCommande}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="text-white hover:bg-white/20"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Toggle EANCOM Codes */}
                    <div className="flex justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowEancomCodes(!showEancomCodes)}
                            className="gap-2 text-xs"
                        >
                            {showEancomCodes ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            {showEancomCodes ? "Masquer" : "Afficher"} codes EANCOM
                        </Button>
                    </div>

                    {/* Order Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Dates */}
                        <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Calendar className="h-4 w-4 text-blue-600" />
                                <h3 className="font-medium text-gray-900 text-sm">Dates</h3>
                            </div>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Commande :</span>
                                    <span className="font-medium">{parseEancomDate(orderData.datecommande).toLocaleDateString()}</span>
                                </div>
                                {showEancomCodes && (
                                    <div className="text-xs font-mono bg-blue-50 text-blue-800 p-2 rounded">
                                        {eancomSegments.header.DTM_order}
                                    </div>
                                )}
                                {/* <div className="flex justify-between">
                                    <span className="text-gray-600">Livraison :</span>
                                    <span className="font-medium">{parseEancomDate(orderData.datelivraison).toLocaleDateString()}</span>
                                </div>
                                {showEancomCodes && (
                                    <div className="text-xs font-mono bg-blue-50 text-blue-800 p-2 rounded">
                                        {eancomSegments.header.DTM_delivery}
                                    </div>
                                )} */}
                                {orderData.dateLivraisonDemandee && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Livraison demandée :</span>
                                            <span className="font-medium">{parseEancomDate(orderData.dateLivraisonDemandee).toLocaleDateString()}</span>
                                        </div>
                                        {showEancomCodes && (
                                            <div className="text-xs font-mono bg-blue-50 text-blue-800 p-2 rounded">
                                                DTM+2:{orderData.dateLivraisonDemandee}:102'
                                            </div>
                                        )}
                                    </>
                                )}
                                {orderData.dateLivraisonPlusTot && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Livraison au plus tôt :</span>
                                            <span className="font-medium">{parseEancomDate(orderData.dateLivraisonPlusTot).toLocaleDateString()}</span>
                                        </div>
                                        {showEancomCodes && (
                                            <div className="text-xs font-mono bg-blue-50 text-blue-800 p-2 rounded">
                                                DTM+64:{orderData.dateLivraisonPlusTot}:102'
                                            </div>
                                        )}
                                    </>
                                )}
                                {orderData.dateLivraisonPlusTard && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Livraison au plus tard :</span>
                                            <span className="font-medium">{parseEancomDate(orderData.dateLivraisonPlusTard).toLocaleDateString()}</span>
                                        </div>
                                        {showEancomCodes && (
                                            <div className="text-xs font-mono bg-blue-50 text-blue-800 p-2 rounded">
                                                DTM+63:{orderData.dateLivraisonPlusTard}:102'
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Parties */}
                        <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Building2 className="h-4 w-4 text-green-600" />
                                <h3 className="font-medium text-gray-900 text-sm">Parties</h3>
                            </div>
                            <div className="space-y-1.5 text-xs">
                                <div>
                                    <span className="text-gray-600">Acheteur GLN :</span>
                                    <div className="font-mono font-medium text-green-700">{orderData.Acheteur}</div>
                                    {showEancomCodes && (
                                        <div className="text-xs font-mono bg-green-50 text-green-800 p-2 rounded mt-1">
                                            {eancomSegments.header.NAD_buyer}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <span className="text-gray-600">Fournisseur :</span>
                                    <div className="font-medium">{orderData.fournisseurName}</div>
                                    <div className="font-mono text-sm text-gray-600">{orderData.fournisseur}</div>
                                    {showEancomCodes && (
                                        <div className="text-xs font-mono bg-green-50 text-green-800 p-2 rounded mt-1">
                                            {eancomSegments.header.NAD_supplier}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Delivery */}
                        <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <MapPin className="h-4 w-4 text-orange-600" />
                                <h3 className="font-medium text-gray-900 text-sm">Livraison</h3>
                            </div>
                            <div className="space-y-1.5 text-xs">
                                <div>
                                    <span className="text-gray-600">Lieu GLN :</span>
                                    <div className="font-mono font-medium">{orderData.lieu_livraison_primaire}</div>
                                    {showEancomCodes && (
                                        <div className="text-xs font-mono bg-orange-50 text-orange-800 p-2 rounded mt-1">
                                            {eancomSegments.header.NAD_delivery}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Frais de transport */}
                        {orderData.fraisTransport > 0 && (
                            <div className="bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <Truck className="h-4 w-4 text-purple-600" />
                                    <h3 className="font-medium text-gray-900 text-sm">Transport</h3>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Frais proposés :</span>
                                        <span className="font-medium">{orderData.fraisTransport.toFixed(2)} {orderData.monnaie}</span>
                                    </div>
                                    {showEancomCodes && (
                                        <div className="text-xs font-mono bg-blue-50 text-blue-800 p-2 rounded">
                                            MOA+23:{orderData.fraisTransport.toFixed(2)}'
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Currency */}
                        <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Coins className="h-4 w-4 text-yellow-600" />
                                <h3 className="font-medium text-gray-900 text-sm">Monnaie</h3>
                            </div>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Devise :</span>
                                    <span className="font-bold text-base">{orderData.monnaie}</span>
                                </div>
                                {showEancomCodes && (
                                    <div className="text-xs font-mono bg-yellow-50 text-yellow-800 p-2 rounded">
                                        {eancomSegments.header.CUX}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Articles */}
                    <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <Package className="h-4 w-4 text-purple-600" />
                            <h3 className="font-medium text-gray-900 text-sm">Articles ({orderData.articles.length})</h3>
                        </div>
                        <div className="space-y-2">
                            {orderData.articles.map((item, idx) => (
                                <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                                    <div className="flex justify-between items-start mb-1.5">
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-900 text-sm">{item.libelle}</div>
                                            <div className="text-xs font-mono text-gray-600 mt-0.5">GTIN: {item.gtin}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-600">
                                                {item.qty} {item.unit} × {item.price.toFixed(2)} {orderData.monnaie}
                                            </div>
                                            <div className="font-bold text-purple-700 mt-0.5 text-sm">
                                                {(item.qty * item.price).toFixed(2)} {orderData.monnaie}
                                            </div>
                                        </div>
                                    </div>

                                    {showEancomCodes && (
                                        <div className="mt-2 space-y-1">
                                            <div className="text-[10px] font-mono bg-purple-50 text-purple-800 p-1.5 rounded">
                                                {eancomSegments.lines[idx].LIN}
                                            </div>
                                            <div className="text-[10px] font-mono bg-purple-50 text-purple-800 p-1.5 rounded">
                                                {eancomSegments.lines[idx].QTY}
                                            </div>
                                            <div className="text-[10px] font-mono bg-purple-50 text-purple-800 p-1.5 rounded">
                                                {eancomSegments.lines[idx].PRI}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Total */}
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border-2 border-gray-300">
                        <div className="flex justify-between items-center">
                            <span className="text-base font-semibold text-gray-700">Total HT</span>
                            <span className="text-2xl font-bold text-gray-900">
                                {totalHT.toFixed(2)} {orderData.monnaie}
                            </span>
                        </div>
                    </div>

                    {/* EANCOM Footer */}
                    {showEancomCodes && (
                        <div className="bg-gray-800 text-gray-100 rounded-lg p-3">
                            <h4 className="font-medium mb-2 text-sm">Segments de fin EANCOM</h4>
                            <div className="space-y-1 text-[10px] font-mono">
                                <div className="bg-gray-700 p-1.5 rounded">{eancomSegments.footer.UNS}</div>
                                <div className="bg-gray-700 p-1.5 rounded">{eancomSegments.footer.CNT}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-5 py-3 flex justify-end gap-3 border-t flex-shrink-0">
                    <Button variant="outline" onClick={onClose} className="text-sm" disabled={isLoading}>
                        Fermer
                    </Button>
                    <Button 
                        className="bg-blue-600 hover:bg-blue-700 text-sm" 
                        onClick={onSubmit}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <span className="animate-spin mr-2">⏳</span> Envoi...
                            </>
                        ) : (
                            "Confirmer et Envoyer"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
