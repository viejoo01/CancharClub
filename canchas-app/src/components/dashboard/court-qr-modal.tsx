'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { QrCode, Printer, Copy, Check, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { siteConfig } from '@/config/site'

interface CourtQrModalProps {
  isOpen: boolean
  onClose: () => void
  court?: {
    id: string
    name: string
    sport?: string
  } | null
  tableName?: string
  clubSlug?: string
}

export function CourtQrModal(props: CourtQrModalProps) {
  const {
    isOpen,
    onClose,
    tableName = '',
    clubSlug = 'padel-central'
  } = props
  const [copied, setCopied] = useState(false)
  const [selectedTable, setSelectedTable] = useState(tableName || '')

  if (!isOpen) return null

  const origin = typeof window !== 'undefined' ? window.location.origin : siteConfig.url
  const tableParam = selectedTable.trim() ? `&mesa=${encodeURIComponent(selectedTable.trim())}` : ''
  const orderUrl = `${origin}/club/${clubSlug}/pedido?origen=mesa${tableParam}`
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(orderUrl)}&bgcolor=ffffff&color=020617&qzone=2`

  const handleCopy = () => {
    navigator.clipboard.writeText(orderUrl)
    setCopied(true)
    toast.success('Enlace de pedido copiado al portapapeles')
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px] text-center bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader className="print:hidden">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-2">
            <QrCode className="w-6 h-6 text-emerald-400" />
          </div>
          <DialogTitle className="text-xl font-bold text-white">
            Código QR para Pedidos en Mesa
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Colocá este código QR en las mesas del club. Los jugadores escanean con su celular, piden lo que quieran y retiran por el mostrador de la cantina.
          </DialogDescription>
        </DialogHeader>

        {/* Selector de número de mesa opcional */}
        <div className="print:hidden flex items-center justify-center gap-2 pt-1">
          <label className="text-[11px] text-slate-400 font-semibold">Identificador de Mesa (opcional):</label>
          <input
            type="text"
            placeholder="Ej: Mesa 1, Mesa 2..."
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="h-7 w-36 px-2 text-xs rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Cartel imprimible / preview */}
        <div 
          id="qr-table-poster" 
          className="my-3 p-5 rounded-2xl bg-white text-slate-900 shadow-xl border border-slate-200 flex flex-col items-center"
        >
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">
            {siteConfig.name} • PEDIDOS AL INSTANTE
          </div>
          <div className="text-base font-extrabold text-slate-950 mb-3">
            {selectedTable.trim() ? selectedTable.toUpperCase() : 'PEDIDOS DESDE LA MESA'}
          </div>

          <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={qrImageUrl} 
              alt="QR Pedidos Cantina" 
              className="w-48 h-48 mx-auto"
            />
          </div>

          <div className="mt-3 text-xs font-bold text-slate-800">
            Escaneá con tu celular para pedir a la cantina
          </div>
          <div className="text-[10px] text-slate-600 font-medium mt-0.5">
            Hacé tu pedido y retiralo por el mostrador
          </div>
        </div>

        {/* Input link */}
        <div className="print:hidden flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-left">
          <span className="truncate text-slate-400 flex-1 font-mono">{orderUrl}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="h-7 px-2 text-slate-300 hover:text-white"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </div>

        <DialogFooter className="print:hidden flex flex-col sm:flex-row gap-2 pt-2">
          <a
            href={orderUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Probar Menú Jugador</span>
          </a>

          <Button
            onClick={handlePrint}
            className="w-full sm:w-auto flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 text-xs rounded-xl"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Cartel</span>
          </Button>
        </DialogFooter>

        {/* Estilos para impresión limpia del cartel */}
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #qr-table-poster,
            #qr-table-poster * {
              visibility: visible;
            }
            #qr-table-poster {
              position: absolute;
              left: 50%;
              top: 10%;
              transform: translateX(-50%);
              width: 320px;
              margin: 0 auto;
              padding: 24px;
              box-shadow: none;
              border: 2px solid #000;
              border-radius: 16px;
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  )
}
