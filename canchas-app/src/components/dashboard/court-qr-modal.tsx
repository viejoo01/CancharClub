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
import { QrCode, Printer, Copy, Check, Download, Loader2 } from 'lucide-react'
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
    court,
    tableName = '',
    clubSlug = ''
  } = props
  const [copied, setCopied] = useState(false)
  const [selectedTable, setSelectedTable] = useState(tableName || '')
  const [downloading, setDownloading] = useState(false)
  const [printing, setPrinting] = useState(false)

  if (!isOpen) return null

  const effectiveSlug = clubSlug || 'club'
  const isCourtMode = Boolean(court)
  const origin = typeof window !== 'undefined' ? window.location.origin : siteConfig.url
  const tableParam = selectedTable.trim() ? `&mesa=${encodeURIComponent(selectedTable.trim())}` : ''
  const orderUrl = isCourtMode
    ? `${origin}/club/${effectiveSlug}/pedido?cancha=${encodeURIComponent(court?.name || '')}`
    : `${origin}/club/${effectiveSlug}/pedido?origen=mesa${tableParam}`

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(orderUrl)}&bgcolor=ffffff&color=020617&qzone=2`

  const titleText = isCourtMode
    ? `CANCHA ${court?.name?.replace(/cancha/i, '').trim() || ''}`
    : (selectedTable.trim() ? selectedTable.toUpperCase() : 'PEDIDOS DESDE LA MESA')

  const subtitleText = isCourtMode
    ? 'Pedí a la cantina durante tu turno'
    : 'Hacé tu pedido desde la mesa y retiralo por el mostrador'

  const handleCopy = () => {
    navigator.clipboard.writeText(orderUrl)
    setCopied(true)
    toast.success('Enlace de pedido copiado al portapapeles')
    setTimeout(() => setCopied(false), 2000)
  }

  // Impresión aislada por iframe (Solución 100% libre de cortes o páginas en blanco)
  const handlePrint = () => {
    setPrinting(true)
    const oldFrame = document.getElementById('canchar-qr-print-frame')
    if (oldFrame) oldFrame.remove()

    const iframe = document.createElement('iframe')
    iframe.id = 'canchar-qr-print-frame'
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.style.opacity = '0'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) {
      window.print()
      setPrinting(false)
      return
    }

    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Cartel QR - ${titleText}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              background-color: #ffffff;
              color: #0f172a;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 92vh;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .poster-card {
              width: 140mm;
              padding: 10mm 10mm 8mm;
              border: 3.5px solid #0f172a;
              border-radius: 24px;
              text-align: center;
              background: #ffffff;
              display: flex;
              flex-direction: column;
              align-items: center;
              box-sizing: border-box;
              margin: auto;
            }
            .brand-badge {
              display: inline-block;
              background: #059669;
              color: #ffffff;
              font-size: 11pt;
              font-weight: 800;
              letter-spacing: 2px;
              text-transform: uppercase;
              padding: 5px 16px;
              border-radius: 9999px;
              margin-bottom: 8px;
            }
            .main-title {
              font-size: 22pt;
              font-weight: 900;
              color: #020617;
              margin-bottom: 4px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .subtitle {
              font-size: 11pt;
              font-weight: 600;
              color: #475569;
              margin-bottom: 14px;
            }
            .qr-frame {
              background: #ffffff;
              padding: 12px;
              border: 2.5px solid #e2e8f0;
              border-radius: 20px;
              display: inline-block;
              margin-bottom: 14px;
            }
            .qr-img {
              width: 78mm;
              height: 78mm;
              display: block;
            }
            .cta-heading {
              font-size: 14pt;
              font-weight: 800;
              color: #0f172a;
              margin-bottom: 6px;
            }
            .payment-pill {
              font-size: 10.5pt;
              font-weight: 700;
              color: #059669;
              background: #ecfdf5;
              border: 1.5px solid #a7f3d0;
              padding: 6px 16px;
              border-radius: 10px;
              display: inline-block;
              margin-bottom: 14px;
            }
            .steps-grid {
              width: 100%;
              border-top: 1.5px dashed #cbd5e1;
              padding-top: 12px;
              display: flex;
              justify-content: space-between;
              gap: 8px;
            }
            .step-box {
              flex: 1;
              text-align: center;
              padding: 0 4px;
            }
            .step-circle {
              width: 22px;
              height: 22px;
              background: #0f172a;
              color: #ffffff;
              border-radius: 50%;
              font-weight: 800;
              font-size: 8.5pt;
              line-height: 22px;
              margin: 0 auto 4px;
              text-align: center;
            }
            .step-title {
              font-size: 9pt;
              font-weight: 800;
              color: #0f172a;
              display: block;
              margin-bottom: 2px;
            }
            .step-desc {
              font-size: 7.5pt;
              color: #64748b;
              line-height: 1.25;
            }
          </style>
        </head>
        <body>
          <div class="poster-card">
            <div class="brand-badge">${siteConfig.name} • CANTINA</div>
            <div class="main-title">${titleText}</div>
            <div class="subtitle">${subtitleText}</div>

            <div class="qr-frame">
              <img class="qr-img" src="${qrImageUrl}" alt="QR Pedido" />
            </div>

            <div class="cta-heading">Escaneá con la cámara de tu celular</div>
            <div class="payment-pill">Pagá con Transferencia o en Efectivo en mostrador</div>

            <div class="steps-grid">
              <div class="step-box">
                <div class="step-circle">1</div>
                <span class="step-title">Escaneá el QR</span>
              </div>
              <div class="step-box">
                <div class="step-circle">2</div>
                <span class="step-title">Elegí lo que quieras</span>
              </div>
              <div class="step-box">
                <div class="step-circle">3</div>
                <span class="step-title">Retirá tu pedido</span>
              </div>
            </div>
          </div>
        </body>
      </html>
    `)
    doc.close()

    const img = doc.querySelector('img')
    const executePrint = () => {
      setTimeout(() => {
        setPrinting(false)
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setTimeout(() => {
          iframe.remove()
        }, 4000)
      }, 300)
    }

    if (img) {
      if (img.complete) {
        executePrint()
      } else {
        img.onload = executePrint
        img.onerror = executePrint
      }
    } else {
      executePrint()
    }
  }

  // Descarga directa del cartel en imagen PNG Ultra HD (300 DPI)
  const handleDownloadImage = async () => {
    setDownloading(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 1600
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No canvas context')

      // Fondo
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 1200, 1600)

      // Borde del cartel
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 14
      ctx.beginPath()
      ctx.roundRect(80, 80, 1040, 1440, 48)
      ctx.stroke()

      // Header Pill Badge
      ctx.fillStyle = '#059669'
      ctx.beginPath()
      ctx.roundRect(400, 140, 400, 64, 32)
      ctx.fill()

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${siteConfig.name.toUpperCase()} • CANTINA`, 600, 182)

      // Título principal
      ctx.fillStyle = '#020617'
      ctx.font = '900 52px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(titleText, 600, 275)

      // Subtítulo
      ctx.fillStyle = '#475569'
      ctx.font = '600 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(subtitleText, 600, 325)

      // Marco del QR
      ctx.fillStyle = '#f8fafc'
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.roundRect(330, 380, 540, 540, 36)
      ctx.fill()
      ctx.stroke()

      // Carga del QR
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = qrImageUrl
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })
      ctx.drawImage(img, 360, 410, 480, 480)

      // Llamado a la acción
      ctx.fillStyle = '#0f172a'
      ctx.font = '800 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText('Escaneá con la cámara de tu celular', 600, 990)

      // Pill de pagos
      ctx.fillStyle = '#ecfdf5'
      ctx.strokeStyle = '#a7f3d0'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(220, 1030, 760, 60, 20)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#059669'
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText('Pagá con Transferencia o en Efectivo en mostrador', 600, 1068)

      // Línea punteada
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 3
      ctx.setLineDash([12, 10])
      ctx.beginPath()
      ctx.moveTo(140, 1140)
      ctx.lineTo(1060, 1140)
      ctx.stroke()
      ctx.setLineDash([])

      // 3 Pasos
      const stepItems = [
        { num: '1', title: 'Escaneá el QR', x: 280 },
        { num: '2', title: 'Elegí lo que quieras', x: 600 },
        { num: '3', title: 'Retirá tu pedido', x: 920 },
      ]

      stepItems.forEach(s => {
        ctx.fillStyle = '#0f172a'
        ctx.beginPath()
        ctx.arc(s.x, 1200, 26, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 22px sans-serif'
        ctx.fillText(s.num, s.x, 1208)

        ctx.fillStyle = '#0f172a'
        ctx.font = 'bold 24px sans-serif'
        ctx.fillText(s.title, s.x, 1255)
      })

      // Descarga
      const link = document.createElement('a')
      link.download = `cartel-qr-${(titleText.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'mesa')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      toast.success('¡Cartel descargado en imagen PNG de alta resolución!')
    } catch (err) {
      console.error('Error downloading flyer:', err)
      toast.error('Error al generar imagen del cartel')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-115 max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full text-center bg-slate-900 border-slate-800 text-slate-100 p-4 sm:p-5">
        <DialogHeader>
          <div className="mx-auto w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-1.5">
            <QrCode className="w-5 h-5 text-emerald-400" />
          </div>
          <DialogTitle className="text-lg font-bold text-white">
            {isCourtMode ? `Código QR ${court?.name}` : 'Cartel QR para Pedidos en Mesa'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {isCourtMode
              ? 'Código QR para imprimir y colocar en la entrada o red de la cancha.'
              : 'Colocá este cartel en las mesas del club. Los jugadores escanean con su celular, piden y retiran por mostrador.'}
          </DialogDescription>
        </DialogHeader>

        {/* Selector de número de mesa opcional */}
        {!isCourtMode && (
          <div className="flex items-center justify-center gap-2 pt-1">
            <label className="text-[11px] text-slate-400 font-semibold">Número de Mesa (opcional):</label>
            <input
              type="text"
              placeholder="Ej: Mesa 1, Mesa 2..."
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="h-7 w-36 px-2 text-xs rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        {/* Vista previa idéntica a la que se imprimirá */}
        <div 
          id="qr-table-poster" 
          className="my-3 p-4 rounded-2xl bg-white text-slate-900 shadow-2xl border-2 border-slate-950 flex flex-col items-center max-w-[340px] mx-auto"
        >
          <div className="px-3 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-[9px] tracking-widest uppercase mb-1">
            {siteConfig.name} • CANTINA
          </div>
          <div className="text-lg font-black text-slate-950 uppercase tracking-tight">
            {titleText}
          </div>
          <div className="text-[10px] font-medium text-slate-500 mb-2 text-center">
            {subtitleText}
          </div>

          <div className="p-2 bg-white border-2 border-slate-200 rounded-xl shadow-inner mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={qrImageUrl} 
              alt="QR Pedidos Cantina" 
              className="w-40 h-40 mx-auto"
            />
          </div>

          <div className="text-[11px] font-extrabold text-slate-900 mb-0.5">
            Escaneá con la cámara de tu celular
          </div>
          <div className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 mb-2.5 text-center">
            Pagá con Transferencia o en Efectivo en mostrador
          </div>

          <div className="w-full pt-2 border-t border-dashed border-slate-300 grid grid-cols-3 gap-1 text-center">
            <div className="space-y-0.5">
              <div className="w-4 h-4 rounded-full bg-slate-900 text-white text-[9px] font-bold mx-auto flex items-center justify-center">1</div>
              <div className="text-[9px] font-bold text-slate-900 leading-tight">Escaneá</div>
            </div>
            <div className="space-y-0.5">
              <div className="w-4 h-4 rounded-full bg-slate-900 text-white text-[9px] font-bold mx-auto flex items-center justify-center">2</div>
              <div className="text-[9px] font-bold text-slate-900 leading-tight">Pedí</div>
            </div>
            <div className="space-y-0.5">
              <div className="w-4 h-4 rounded-full bg-slate-900 text-white text-[9px] font-bold mx-auto flex items-center justify-center">3</div>
              <div className="text-[9px] font-bold text-slate-900 leading-tight">Retirá</div>
            </div>
          </div>
        </div>

        {/* Input link */}
        <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-left">
          <span className="truncate text-slate-400 flex-1 font-mono text-[11px]">{orderUrl}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="h-7 px-2 text-slate-300 hover:text-white"
            title="Copiar enlace"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadImage}
            disabled={downloading}
            className="w-full sm:w-auto flex-1 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold gap-1.5 min-h-10 rounded-xl"
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span>Descargar Imagen (PNG)</span>
          </Button>

          <Button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="w-full sm:w-auto flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5 text-xs min-h-10 rounded-xl shadow-md cursor-pointer"
          >
            {printing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            <span>Imprimir Cartel (A4/Mesa)</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
