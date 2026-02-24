import React from "react";
import { X, Package, Tag, Globe, Calendar, DollarSign, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProductDetailModalProps {
  product: any;
  isOpen: boolean;
  onClose: () => void;
  currency?: string;
}

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, isOpen, onClose, currency = "EUR" }) => {
  if (!isOpen || !product) return null;

  const formatPrice = (price: number) => {
    return (price / 100).toFixed(2);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch {
      return dateStr;
    }
  };

  const getCountryName = (code: string) => {
    const countries: Record<string, string> = {
      "686": "Sénégal",
      "788": "Tunisie",
      "504": "Maroc",
      // Add more as needed
    };
    return countries[code] || code;
  };

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          role="dialog"
          className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-950 to-blue-800 text-white px-6 py-4 flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-1">{product.libelle}</h2>
              <p className="text-blue-100 text-xs flex items-center gap-2">
                <Tag size={12} />
                GTIN: {product.gtin}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors ml-4"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-4">
              {/* Image and Brand Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Product Image */}
                <div className="md:col-span-1">
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border-2 border-gray-200">
                    {product.images ? (
                      <img
                        src={product.images}
                        alt={product.libelle}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23f3f4f6' width='200' height='200'/%3E%3Ctext fill='%239ca3af' font-family='sans-serif' font-size='14' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3EImage non disponible%3C/text%3E%3C/svg%3E";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                        <ImageIcon size={48} />
                        <p className="mt-2 text-sm">Image non disponible</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Brand and Basic Info */}
                <div className="md:col-span-2 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2 text-blue-950 font-medium text-sm mb-1">
                        <Package size={14} />
                        Marque
                      </div>
                      <p className="text-base font-semibold text-blue-900">{product.brand || "N/A"}</p>
                      {product.subBrand && (
                        <p className="text-xs text-blue-700 mt-1">Sous-marque: {product.subBrand}</p>
                      )}
                    </div>

                    <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                      <div className="flex items-center gap-2 text-green-950 font-medium text-sm mb-1">
                        <Globe size={14} />
                        Origine
                      </div>
                      <p className="text-base font-semibold text-green-900">
                        {getCountryName(product.countryOfOrigin)}
                      </p>
                    </div>
                  </div>

                  {/* Price Section */}
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-200">
                    <div className="flex items-center gap-2 text-amber-950 font-medium text-sm mb-2">
                      <DollarSign size={14} />
                      Tarification
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-amber-700 mb-1">Prix minimum</p>
                        <p className="text-lg font-bold text-amber-900">
                          {formatPrice(product.prix_min)} {currency}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-amber-700 mb-1">Prix maximum</p>
                        <p className="text-lg font-bold text-amber-900">
                          {formatPrice(product.prix_max)} {currency}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              {product.description && (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-2 text-sm">Description</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">{product.description}</p>
                </div>
              )}

              {/* Technical Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2 text-sm">
                    <Tag size={14} />
                    Codes de classification
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Code Classe:</span>
                      <span className="font-mono font-medium">{product.codeClasse || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Code Brique:</span>
                      <span className="font-mono font-medium">{product.codebrique || "N/A"}</span>
                    </div>
                    {product.code_cader && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Code CADER:</span>
                        <span className="font-mono font-medium">{product.code_cader}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2 text-sm">
                    <Calendar size={14} />
                    Informations de mise à jour
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Créé le:</span>
                      <span className="font-medium">{formatDate(product.date_create_fp)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Mis à jour le:</span>
                      <span className="font-medium">{formatDate(product.date_mis_a_jour_fp)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Statut:</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        product.status === 2 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                      }`}>
                        {product.status === 2 ? "Actif" : `Statut ${product.status}`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-gray-600 mb-1">ID Produit</p>
                    <p className="font-mono font-semibold text-blue-900">{product.id}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 mb-1">ID Entreprise</p>
                    <p className="font-mono font-semibold text-blue-900">{product.idEntreprise}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 mb-1">Nombre d'images</p>
                    <p className="font-semibold text-blue-900">{product.nb_images || 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 mb-1">Prix actif</p>
                    <p className="font-semibold text-blue-900">{product.activ_prix ? "Oui" : "Non"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-5 py-3 border-t border-gray-200 flex justify-end flex-shrink-0">
            <Button onClick={onClose} className="bg-blue-950 hover:bg-blue-900 text-sm">
              Fermer
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProductDetailModal;
