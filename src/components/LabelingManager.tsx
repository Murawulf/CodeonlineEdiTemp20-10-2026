import React, { useState, useEffect, useRef } from "react";
import { Printer, Barcode, Package, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import axios from "axios";
import { createApiInstance } from "@/hooks/useApi";
// @ts-ignore - bwip-js browser build
import bwipjs from "bwip-js/browser";

function GS1_128Canvas({ gs1String }: { gs1String: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !gs1String) return;
    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: "gs1-128",
        text: gs1String,
        scale: 3,
        height: 20,
        includetext: true,
        textxalign: "center",
        guardwhitespace: true,
        parsefnc: true,
      });
    } catch (e) {
      console.error("GS1-128 label render error", e);
    }
  }, [gs1String]);
  return <canvas ref={canvasRef} className="mx-auto max-w-full" />;
}

interface LabelingManagerProps {
  sscc: string;
  packageData: {
    type: string;
    weight: number;
  };
  shipmentData: {
    sender: { name: string; gln: string };
    receiver: { name: string; gln: string };
    carrier?: string;
    dateExpedition: string;
  };
  items: Array<{
    gtin: string;
    quantity: number;
    description?: string;
    batchNumber?: string;
    expiryDate?: string;
  }>;
  apiUrl: string;
}

interface GS1Label {
  sscc: string;
  ssccFormatted: string;
  sender: any;
  receiver: any;
  carrier: string | null;
  dateExpedition: string;
  packageType: string;
  grossWeight: number;
  items: any[];
  barcodes: Array<{ ai: string; value: string; hrp: string }>;
  gs1128String: string;
  barcodeUrl: string;
  labelFormat: string;
  standard: string;
}

export default function LabelingManager({
  sscc,
  packageData,
  shipmentData,
  items,
  apiUrl
}: LabelingManagerProps): JSX.Element {
  const [isGenerating, setIsGenerating] = useState(false);
  const [labelData, setLabelData] = useState<GS1Label | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const generateLabel = async () => {
    setIsGenerating(true);
    try {
      const api = createApiInstance(apiUrl);

      const payload = {
        sscc,
        packageData,
        shipmentData,
        items
      };

      const res = await api.post("/api/edi/label/generate", payload);

      if (res.data.success) {
        setLabelData(res.data.label);
        setShowPreview(true);
        toast({
          title: "Étiquette générée",
          description: "Étiquette logistique GS1-128 créée avec succès",
          className: "bg-green-600 text-white"
        });
      }
    } catch (err: any) {
      console.error("Error generating label:", err);
      toast({
        title: "Erreur",
        description: err.response?.data?.error || "Échec de génération de l'étiquette",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const printLabel = () => {
    if (!labelData) return;
    window.print();
  };

  const downloadLabel = () => {
    if (!labelData) return;
    
    // Create downloadable JSON
    const dataStr = JSON.stringify(labelData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `GS1_Label_${labelData.sscc}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <>
      <Button
        onClick={generateLabel}
        disabled={isGenerating}
        className="bg-purple-600 hover:bg-purple-700"
      >
        <Barcode className="mr-2 h-4 w-4" />
        {isGenerating ? "Génération..." : "Générer Étiquette GS1"}
      </Button>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-purple-600" />
              Étiquette Logistique GS1-128
            </DialogTitle>
          </DialogHeader>

          {labelData && (
            <div className="space-y-6 print:space-y-4">
              {/* Header */}
              <div className="border-b pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg">SSCC (00)</h3>
                    <p className="text-2xl font-mono font-bold text-blue-900">
                      {labelData.ssccFormatted}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Type de colis</p>
                    <p className="font-bold">{labelData.packageType}</p>
                    <p className="text-sm text-gray-600 mt-2">Poids brut</p>
                    <p className="font-bold">{labelData.grossWeight} kg</p>
                  </div>
                </div>
              </div>

              {/* Sender & Receiver */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-3 bg-blue-50">
                  <p className="text-xs font-semibold text-blue-900 mb-1">EXPÉDITEUR (SU)</p>
                  <p className="font-bold">{labelData.sender.name}</p>
                  <p className="text-sm text-gray-600">GLN: {labelData.sender.gln}</p>
                </div>
                <div className="border rounded-lg p-3 bg-green-50">
                  <p className="text-xs font-semibold text-green-900 mb-1">DESTINATAIRE (BY)</p>
                  <p className="font-bold">{labelData.receiver.name}</p>
                  <p className="text-sm text-gray-600">GLN: {labelData.receiver.gln}</p>
                </div>
              </div>

              {/* Transport Info */}
              {labelData.carrier && (
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-700 mb-1">TRANSPORTEUR</p>
                  <p className="font-bold">{labelData.carrier}</p>
                  <p className="text-sm text-gray-600">Date expédition: {labelData.dateExpedition}</p>
                </div>
              )}

              {/* Items */}
              <div>
                <h4 className="font-bold mb-2">Contenu du colis</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-left p-2">GTIN</th>
                        <th className="text-left p-2">Description</th>
                        <th className="text-right p-2">Qté</th>
                        <th className="text-left p-2">Lot</th>
                        <th className="text-left p-2">DLC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labelData.items.map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2 font-mono text-xs">{item.gtin}</td>
                          <td className="p-2">{item.description || "-"}</td>
                          <td className="p-2 text-right font-bold">{item.quantity}</td>
                          <td className="p-2 text-xs">{item.batchNumber || "-"}</td>
                          <td className="p-2 text-xs">{item.expiryDate || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* GS1 Application Identifiers */}
              <div>
                <h4 className="font-bold mb-2">Identifiants d'application GS1 (AI)</h4>
                <div className="grid grid-cols-2 gap-2">
                  {labelData.barcodes.map((bc, idx) => (
                    <div key={idx} className="border rounded p-2 bg-gray-50">
                      <span className="font-mono text-xs font-bold text-blue-900">
                        ({bc.ai})
                      </span>
                      <span className="ml-2 font-mono text-sm">{bc.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Barcode */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white text-center">
                <p className="text-xs text-gray-600 mb-3 font-bold uppercase tracking-wide">CODE-BARRES GS1-128</p>
                <GS1_128Canvas gs1String={labelData.gs1128String} />
                <p className="text-xs text-gray-500 mt-2 font-mono break-all">
                  {labelData.gs1128String}
                </p>
              </div>

              {/* Footer */}
              <div className="text-center text-xs text-gray-500 border-t pt-3">
                <p>{labelData.labelFormat} • {labelData.standard}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end print:hidden">
                <Button onClick={downloadLabel} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Télécharger JSON
                </Button>
                <Button onClick={printLabel} className="bg-purple-600 hover:bg-purple-700">
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
