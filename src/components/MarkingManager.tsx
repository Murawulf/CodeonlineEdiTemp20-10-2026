import React, { useState, useEffect, useRef } from "react";
import { Tag, Barcode, Download, Printer } from "lucide-react";
import { createApiInstance } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import axios from "axios";
// @ts-ignore - bwip-js browser build
import bwipjs from "bwip-js/browser";

// ── Barcode canvas components ─────────────────────────────────────────────────
function GS1_128Canvas({ gs1String }: { gs1String: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !gs1String) return;
    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: "gs1-128",
        text: gs1String,
        scale: 3,
        height: 18,
        includetext: true,
        textxalign: "center",
        guardwhitespace: true,
        parsefnc: true,
      });
    } catch (e) {
      console.error("GS1-128 render error", e);
    }
  }, [gs1String]);
  return <canvas ref={canvasRef} className="mx-auto max-w-full" />;
}

function GS1DataMatrixCanvas({ gs1String }: { gs1String: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !gs1String) return;
    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: "gs1datamatrix",
        text: gs1String,
        scale: 5,
        includetext: false,
        parsefnc: true,
      });
    } catch (e) {
      console.error("DataMatrix render error", e);
    }
  }, [gs1String]);
  return <canvas ref={canvasRef} className="mx-auto" style={{ maxHeight: 120 }} />;
}

interface MarkingManagerProps {
  apiUrl: string;
  initialGtin?: string;
}

interface GS1Marking {
  gtin: string;
  batchNumber: string | null;
  expiryDate: string | null;
  serialNumber: string | null;
  elements: Array<{ ai: string; value: string; hrp: string }>;
  gs1String: string;
  gs1128BarcodeUrl: string;
  dataMatrixUrl: string;
  markingFormat: string;
  standard: string;
}

export default function MarkingManager({ apiUrl, initialGtin }: MarkingManagerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [markingData, setMarkingData] = useState<GS1Marking | null>(null);
  
  // Form fields
  const [gtin, setGtin] = useState(initialGtin || "");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [productionDate, setProductionDate] = useState("");
  const [netWeight, setNetWeight] = useState("");

  const generateMarking = async () => {
    if (!gtin) {
      toast({ title: "Erreur", description: "GTIN requis", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const api = createApiInstance(apiUrl);

      const payload: any = { gtin };
      if (batchNumber) payload.batchNumber = batchNumber;
      if (expiryDate) payload.expiryDate = expiryDate;
      if (serialNumber) payload.serialNumber = serialNumber;
      if (productionDate) payload.productionDate = productionDate;
      if (netWeight) payload.netWeight = parseFloat(netWeight);

      const res = await api.post("/api/edi/marking/generate", payload);

      if (res.data.success) {
        setMarkingData(res.data.marking);
        toast({
          title: "Marquage généré",
          description: "Marquage produit GS1 créé avec succès",
          className: "bg-green-600 text-white"
        });
      }
    } catch (err: any) {
      console.error("Error generating marking:", err);
      toast({
        title: "Erreur",
        description: err.response?.data?.error || "Échec de génération du marquage",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const printMarking = () => {
    if (!markingData) return;
    window.print();
  };

  const downloadMarking = () => {
    if (!markingData) return;
    
    const dataStr = JSON.stringify(markingData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `GS1_Marking_${markingData.gtin}_${markingData.serialNumber || 'batch'}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        className="border-orange-300 text-orange-700 hover:bg-orange-50"
      >
        <Tag className="mr-2 h-4 w-4" />
        Marquage Produit GS1
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-orange-600" />
              Générateur de Marquage Produit GS1
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Form Section */}
            {!markingData && (
              <Card>
                <CardHeader>
                  <CardTitle>Informations Produit</CardTitle>
                  <CardDescription>
                    Saisissez les données pour générer un marquage GS1-128 ou DataMatrix
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="gtin">GTIN (01) *</Label>
                      <Input
                        id="gtin"
                        value={gtin}
                        onChange={(e) => setGtin(e.target.value)}
                        placeholder="3456789012345"
                        maxLength={14}
                      />
                    </div>

                    <div>
                      <Label htmlFor="batchNumber">Numéro de lot (10)</Label>
                      <Input
                        id="batchNumber"
                        value={batchNumber}
                        onChange={(e) => setBatchNumber(e.target.value)}
                        placeholder="LOT2026A"
                        maxLength={20}
                      />
                    </div>

                    <div>
                      <Label htmlFor="expiryDate">Date de péremption (17)</Label>
                      <Input
                        id="expiryDate"
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="serialNumber">Numéro de série (21)</Label>
                      <Input
                        id="serialNumber"
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                        placeholder="SN00001"
                        maxLength={20}
                      />
                    </div>

                    <div>
                      <Label htmlFor="productionDate">Date de production (11)</Label>
                      <Input
                        id="productionDate"
                        type="date"
                        value={productionDate}
                        onChange={(e) => setProductionDate(e.target.value)}
                      />
                    </div>

                    <div className="col-span-2">
                      <Label htmlFor="netWeight">Poids net (kg) (3103)</Label>
                      <Input
                        id="netWeight"
                        type="number"
                        step="0.001"
                        value={netWeight}
                        onChange={(e) => setNetWeight(e.target.value)}
                        placeholder="0.500"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={generateMarking}
                    disabled={isGenerating || !gtin}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                  >
                    <Barcode className="mr-2 h-4 w-4" />
                    {isGenerating ? "Génération..." : "Générer Marquage"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Preview Section */}
            {markingData && (
              <div className="space-y-6 print:space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold">Marquage Produit Généré</h3>
                  <Button
                    onClick={() => setMarkingData(null)}
                    variant="outline"
                    size="sm"
                    className="print:hidden"
                  >
                    Nouveau
                  </Button>
                </div>

                {/* Product Info */}
                <div className="border rounded-lg p-4 bg-blue-50">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-600">GTIN (01)</p>
                      <p className="font-mono font-bold text-lg">{markingData.gtin}</p>
                    </div>
                    {markingData.serialNumber && (
                      <div>
                        <p className="text-xs text-gray-600">Numéro de série (21)</p>
                        <p className="font-mono font-bold">{markingData.serialNumber}</p>
                      </div>
                    )}
                    {markingData.batchNumber && (
                      <div>
                        <p className="text-xs text-gray-600">Lot (10)</p>
                        <p className="font-mono font-bold">{markingData.batchNumber}</p>
                      </div>
                    )}
                    {markingData.expiryDate && (
                      <div>
                        <p className="text-xs text-gray-600">DLC (17)</p>
                        <p className="font-mono font-bold">{markingData.expiryDate}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* GS1 Elements */}
                <div>
                  <h4 className="font-bold mb-2">Éléments GS1</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {markingData.elements.map((elem, idx) => (
                      <div key={idx} className="border rounded p-2 bg-gray-50">
                        <span className="font-mono text-xs font-bold text-orange-900">
                          ({elem.ai})
                        </span>
                        <span className="ml-2 font-mono text-sm">{elem.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Barcodes */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white text-center">
                    <p className="text-xs text-gray-600 mb-3 font-bold uppercase tracking-wide">CODE-BARRES GS1-128</p>
                    <GS1_128Canvas gs1String={markingData.gs1String} />
                    <p className="text-xs text-gray-400 mt-2 font-mono break-all">{markingData.gs1String}</p>
                  </div>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white text-center flex flex-col items-center justify-center">
                    <p className="text-xs text-gray-600 mb-3 font-bold uppercase tracking-wide">GS1 DataMatrix</p>
                    <GS1DataMatrixCanvas gs1String={markingData.gs1String} />
                  </div>
                </div>

                {/* GS1 String */}
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs text-gray-600 mb-1">Chaîne GS1</p>
                  <p className="font-mono text-sm break-all">{markingData.gs1String}</p>
                </div>

                {/* Footer */}
                <div className="text-center text-xs text-gray-500 border-t pt-3">
                  <p>{markingData.markingFormat} • {markingData.standard}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end print:hidden">
                  <Button onClick={downloadMarking} variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Télécharger
                  </Button>
                  <Button onClick={printMarking} className="bg-orange-600 hover:bg-orange-700">
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimer
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
