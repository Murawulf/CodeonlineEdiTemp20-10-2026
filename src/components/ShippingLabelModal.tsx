import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface ShippingLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  packageData: {
    sscc: string;
    weight?: number;
    type: string;
    items?: any[];
  };
  shipmentData: {
    sender: {
      name: string;
      address?: string;
      gln: string;
    };
    receiver: {
      name: string;
      address?: string;
      gln: string;
    };
    carrier?: string;
    dateExpedition?: string;
  };
}

export default function ShippingLabelModal({ isOpen, onClose, packageData, shipmentData }: ShippingLabelModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Using react-to-print for printing
  // Since I can't install it, I'll simulate the hook or just use window.print on a separate window/iframe logic if needed.
  // But wait, can I import useReactToPrint? It was not in package.json.
  // I must check package.json again. 
  // It is NOT in package.json.
  // So I cannot use useReactToPrint.
  // I will implement a simple print function that opens a new window or uses CSS print media.
  
  const handlePrint = () => {
    const content = contentRef.current;
    if (!content) return;
    
    const printWindow = window.open('', '', 'width=600,height=800');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Étiquette Logistique SSCC</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .label-container { 
              width: 100mm; 
              height: 150mm; 
              border: 2px solid black; 
              display: flex; 
              flex-direction: column;
              margin: 0 auto;
            }
            .section { border-bottom: 1px solid black; padding: 5px; }
            .section:last-child { border-bottom: none; }
            .header { font-size: 12px; text-transform: uppercase; color: #555; margin-bottom: 2px; }
            .value { font-size: 16px; font-weight: bold; }
            .large-value { font-size: 24px; font-weight: bold; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; }
            .barcode-container { text-align: center; padding: 10px; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; }
            img { max-width: 100%; height: auto; }
            @media print {
              body { padding: 0; margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          ${content.innerHTML}
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  // Format SSCC for display (usually grouped)
  // (00) 1 2345678 123456789 1
  const ssccDisplay = `(00) ${packageData.sscc}`;
  // Barcode URL (using online API for MVP)
  // AI 00 is implicit in SSCC structure usually, but for GS1-128 we need to encode it.
  // bwip-js syntax: (00)123...
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=gs1-128&text=(00)${packageData.sscc}&scale=3&height=30&includetext&textxalign=center`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Étiquette Logistique (SSCC)</DialogTitle>
        </DialogHeader>
        
        <div className="flex justify-center bg-gray-100 p-4 rounded-md overflow-hidden">
          <div ref={contentRef} className="bg-white w-[100mm] h-[150mm] border border-gray-300 shadow-sm flex flex-col text-black">
            
            {/* TOP: Sender / Receiver */}
            <div className="section grid-2 border-b border-black">
              <div className="border-r border-black p-2">
                <div className="header">Expéditeur (From)</div>
                <div className="value">{shipmentData.sender.name}</div>
                <div className="text-xs">{shipmentData.sender.address || "Adresse..."}</div>
                <div className="text-xs mt-1">GLN: {shipmentData.sender.gln}</div>
              </div>
              <div className="p-2">
                <div className="header">Destinataire (To)</div>
                <div className="value">{shipmentData.receiver.name}</div>
                <div className="text-xs">{shipmentData.receiver.address || "Adresse..."}</div>
                <div className="text-xs mt-1">GLN: {shipmentData.receiver.gln}</div>
              </div>
            </div>

            {/* MIDDLE: Shipment Info */}
            <div className="section p-2 border-b border-black">
              <div className="grid-2 gap-2">
                <div>
                  <div className="header">Transporteur</div>
                  <div className="value">{shipmentData.carrier || "-"}</div>
                </div>
                <div>
                  <div className="header">Date Expédition</div>
                  <div className="value">{shipmentData.dateExpedition || "-"}</div>
                </div>
              </div>
            </div>

            <div className="section p-2 border-b border-black">
               <div className="grid-2 gap-2">
                 <div>
                   <div className="header">Poids Brut (kg)</div>
                   <div className="large-value">{packageData.weight ? packageData.weight.toFixed(2) : "0.00"}</div>
                 </div>
                 <div>
                   <div className="header">Type Colis</div>
                   <div className="large-value">{packageData.type === 'PX' ? 'PALETTE' : 'CARTON'}</div>
                 </div>
               </div>
            </div>

            <div className="section p-2 border-b border-black flex-grow">
               <div className="header">Contenu</div>
               <div className="text-sm mt-1">
                 {packageData.items && packageData.items.length > 0 ? (
                   <ul className="list-disc pl-4">
                     {packageData.items.slice(0, 5).map((item, i) => (
                       <li key={i}>{item.libelle} (x{item.quantity})</li>
                     ))}
                     {packageData.items.length > 5 && <li>...</li>}
                   </ul>
                 ) : (
                   "Divers"
                 )}
               </div>
            </div>

            {/* BOTTOM: SSCC Barcode */}
            <div className="section barcode-container p-4 text-center">
              <div className="header mb-2">SSCC (Serial Shipping Container Code)</div>
              {/* Image generated by external service for MVP */}
              <img 
                src={barcodeUrl} 
                alt={packageData.sscc} 
                className="max-w-full h-auto mx-auto"
              />
            </div>

          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer size={16} /> Imprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
