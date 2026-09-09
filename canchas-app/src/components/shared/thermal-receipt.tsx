'use client'

import { useState } from 'react'
import { Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatARS } from '@/lib/utils'

export type ReceiptType = 'BOOKING' | 'CANTINA_ORDER'

export interface BookingReceiptData {
  clubName: string
  courtName: string
  sport: string
  date: string
  time: string
  customerName: string
  customerPhone?: string | null
  totalAmount: number
  depositPaid: number
  balanceDue: number
  bookingId: string
  cancellationPolicy?: string
}

export interface CantinaReceiptData {
  clubName: string
  orderNumber: string
  courtOrTable: string
  customerName: string
  dateTime: string
  items: Array<{ name: string; quantity: number; unitPrice: number; subtotal: number }>
  totalAmount: number
  paymentMethod?: string
  notes?: string
}

interface ThermalReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  type: ReceiptType
  bookingData?: BookingReceiptData
  cantinaData?: CantinaReceiptData
}

export function ThermalReceiptModal({
  isOpen,
  onClose,
  type,
  bookingData,
  cantinaData,
}: ThermalReceiptModalProps) {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm')

  const handlePrint = () => {
    window.print()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] bg-slate-900 border-slate-800 text-slate-100 p-4">
        <DialogHeader className="print:hidden pb-2 border-b border-slate-800 flex flex-row items-center justify-between">
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Impresión Térmica ESC/POS</span>
          </DialogTitle>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
            <button
              onClick={() => setPaperWidth('80mm')}
              className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                paperWidth === '80mm' ? 'bg-emerald-600 text-white' : 'text-slate-400'
              }`}
            >
              80mm
            </button>
            <button
              onClick={() => setPaperWidth('58mm')}
              className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                paperWidth === '58mm' ? 'bg-emerald-600 text-white' : 'text-slate-400'
              }`}
            >
              58mm
            </button>
          </div>
        </DialogHeader>

        {/* CONTENEDOR DE TICKET IMPRIMIBLE */}
        <div className="py-2 flex justify-center">
          <div
            id="thermal-receipt-container"
            className={`bg-white text-black font-mono text-xs p-4 shadow-xl border border-slate-300 rounded ${
              paperWidth === '80mm' ? 'w-[300px]' : 'w-[230px] text-[11px] p-2'
            }`}
          >
            {/* ENCABEZADO */}
            <div className="text-center pb-2 border-b border-dashed border-black">
              <div className="font-black text-sm tracking-wider uppercase">
                {type === 'BOOKING' ? bookingData?.clubName || 'CANCHARCLUB' : cantinaData?.clubName || 'CANCHARCLUB'}
              </div>
              <div className="text-[10px] tracking-tight">cancharclub.com.ar</div>
              <div className="text-[10px] mt-1 font-bold">
                {type === 'BOOKING' ? 'COMPROBANTE DE TURNO' : 'COMANDA DE CANTINA'}
              </div>
            </div>

            {/* CUERPO DEL TICKET: RESERVA DE TURNO */}
            {type === 'BOOKING' && bookingData && (
              <div className="py-2 space-y-1.5 border-b border-dashed border-black">
                <div className="flex justify-between">
                  <span>FECHA:</span>
                  <span className="font-bold">{bookingData.date}</span>
                </div>
                <div className="flex justify-between">
                  <span>HORA:</span>
                  <span className="font-bold">{bookingData.time} HS</span>
                </div>
                <div className="flex justify-between">
                  <span>CANCHA:</span>
                  <span className="font-bold">{bookingData.courtName}</span>
                </div>
                <div className="flex justify-between">
                  <span>CLIENTE:</span>
                  <span className="font-bold truncate max-w-[140px]">{bookingData.customerName}</span>
                </div>
                {bookingData.customerPhone && (
                  <div className="flex justify-between text-[10px]">
                    <span>TEL:</span>
                    <span>{bookingData.customerPhone}</span>
                  </div>
                )}
                <div className="pt-1 border-t border-dotted border-black space-y-0.5">
                  <div className="flex justify-between font-bold">
                    <span>TOTAL:</span>
                    <span>{formatARS(bookingData.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-black font-semibold">
                    <span>SEÑA PAGADA:</span>
                    <span>{formatARS(bookingData.depositPaid)}</span>
                  </div>
                  <div className="flex justify-between font-black border-t border-black pt-1">
                    <span>SALDO PENDIENTE:</span>
                    <span>{formatARS(bookingData.balanceDue)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* CUERPO DEL TICKET: COMANDA DE CANTINA */}
            {type === 'CANTINA_ORDER' && cantinaData && (
              <div className="py-2 space-y-1.5 border-b border-dashed border-black">
                <div className="flex justify-between">
                  <span>PEDIDO #:</span>
                  <span className="font-bold">{cantinaData.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>DESTINO:</span>
                  <span className="font-black uppercase">{cantinaData.courtOrTable}</span>
                </div>
                <div className="flex justify-between">
                  <span>CLIENTE:</span>
                  <span className="font-bold">{cantinaData.customerName}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>HORA:</span>
                  <span>{cantinaData.dateTime}</span>
                </div>

                {/* ITEMS */}
                <div className="pt-2 border-t border-dotted border-black">
                  <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-black">
                    <span>CANT. ARTÍCULO</span>
                    <span>SUBT.</span>
                  </div>
                  <div className="py-1 space-y-1">
                    {cantinaData.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-[11px] leading-tight">
                        <span>{item.quantity}x {item.name}</span>
                        <span className="font-bold">{formatARS(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-black border-t border-black pt-1 mt-1 text-xs">
                    <span>TOTAL:</span>
                    <span>{formatARS(cantinaData.totalAmount)}</span>
                  </div>
                  {cantinaData.paymentMethod && (
                    <div className="text-[10px] text-right mt-0.5">
                      Medio: {cantinaData.paymentMethod}
                    </div>
                  )}
                </div>

                {cantinaData.notes && (
                  <div className="mt-1.5 p-1 bg-slate-100 rounded text-[10px] border border-black italic">
                    <strong>OBS:</strong> {cantinaData.notes}
                  </div>
                )}
              </div>
            )}

            {/* PIE DEL TICKET */}
            <div className="text-center pt-2 space-y-0.5 text-[9px] text-slate-700">
              <div>¡Gracias por elegirnos!</div>
              <div>Canchar Club • Tu predio bajo control</div>
              <div className="pt-1 text-[8px] text-slate-500">
                Impreso el {new Date().toLocaleDateString('es-AR')} {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </div>

        {/* BOTONES DE CONTROL (NO IMPRIMIBLES) */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800 print:hidden">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            type="button"
            onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Ticket</span>
          </Button>
        </div>

        {/* ESTILOS DE IMPRESIÓN PARA MEDIA PRINT */}
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #thermal-receipt-container,
            #thermal-receipt-container * {
              visibility: visible;
            }
            #thermal-receipt-container {
              position: absolute;
              left: 0;
              top: 0;
              width: ${paperWidth === '80mm' ? '72mm' : '48mm'};
              margin: 0;
              padding: 4px;
              box-shadow: none;
              border: none;
            }
            @page {
              margin: 0;
              size: ${paperWidth === '80mm' ? '80mm' : '58mm'} auto;
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  )
}
