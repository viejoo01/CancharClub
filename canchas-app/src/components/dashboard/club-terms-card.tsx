'use client'

import { useState } from 'react'
import { 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  ShieldCheck, 
  Scale, 
  Lock,
  CreditCard,
  Building2,
  Calendar,
  AlertCircle,
  HelpCircle,
  Clock,
  UserCheck
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { acceptClubTermsAction } from '@/actions/saas-billing.actions'
import { toast } from 'sonner'

interface ClubTermsCardProps {
  tenantId?: string
  initialAcceptedAt?: string | null
  onAccepted?: (timestamp: string) => void
}

export function ClubTermsCard({
  tenantId,
  initialAcceptedAt,
  onAccepted,
}: ClubTermsCardProps) {
  const [acceptedAt, setAcceptedAt] = useState<string | null>(initialAcceptedAt || null)
  const [agreedCheckbox, setAgreedCheckbox] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isAccepted = Boolean(acceptedAt)

  const handleAcceptTerms = async () => {
    if (!agreedCheckbox) {
      toast.error('Debes marcar la casilla para confirmar la lectura y aceptación de los términos.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await acceptClubTermsAction(tenantId)
      if (res.success && res.acceptedAt) {
        setAcceptedAt(res.acceptedAt)
        onAccepted?.(res.acceptedAt)
        toast.success('¡Términos y Condiciones aceptados exitosamente!', {
          description: 'Tu conformidad quedó registrada en la base de datos de CancharClub.',
        })
      } else {
        toast.error(res.error || 'No se pudo registrar la aceptación. Intentá nuevamente.')
      }
    } catch (err) {
      console.error('Error accepting terms:', err)
      toast.error('Ocurrió un error inesperado al aceptar los términos.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatAcceptedDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' hs'
    } catch {
      return isoStr
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <Card id="terminos-y-condiciones" className="border-slate-800 bg-slate-900/90 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
      <CardHeader className="p-6 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-lg sm:text-xl font-black text-white tracking-tight">
                  Términos y Condiciones del Servicio
                </CardTitle>
                <Badge variant="outline" className="text-[10px] uppercase font-bold border-indigo-500/40 text-indigo-300 bg-indigo-500/10">
                  CancharClub
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-300 mt-1">
                Contrato de adhesión y marco operativo para dueños y administradores de canchas deportivas.
              </CardDescription>
            </div>
          </div>

          <div>
            {isAccepted ? (
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs px-3 py-1 font-bold flex items-center gap-1.5 shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Aceptado el {formatAcceptedDate(acceptedAt!)}</span>
              </Badge>
            ) : (
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs px-3 py-1 font-bold flex items-center gap-1.5 animate-pulse">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Aceptación Obligatoria Pendiente</span>
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Banner de Estado */}
        {!isAccepted ? (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-bold text-amber-300 block text-sm">
                Lectura y aceptación obligatoria para operar tu complejo
              </strong>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Para mantener la publicación y operativa de tus canchas en CancharClub, debés leer detenidamente este documento y confirmar tu aceptación al pie del mismo.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-emerald-300">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-white text-xs block">
                  Conformidad registrada en la base de datos
                </span>
                <span className="text-[11px] text-slate-400">
                  Fecha de registro: {formatAcceptedDate(acceptedAt!)} • Leyes de la República Argentina
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="h-8 text-xs border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Imprimir Copia Oficial
            </Button>
          </div>
        )}

        {/* CONTENEDOR DE TEXTO LEGAL COMPLETO Y FORMATEADO */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-6 max-h-[520px] overflow-y-auto space-y-6 text-xs text-slate-300 leading-relaxed font-sans shadow-inner selection:bg-emerald-500/30 selection:text-white">
          
          <div className="border-b border-slate-800 pb-4 text-center">
            <h3 className="text-base sm:text-lg font-black text-white tracking-wider uppercase font-mono">
              TÉRMINOS Y CONDICIONES - CANCHARCLUB
            </h3>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              Acuerdo de Prestación del Software SaaS de Gestión Deportiva
            </p>
          </div>

          {/* LO QUE NECESITÁS SABER ANTES DE EMPEZAR */}
          <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-2.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-400" />
              Lo que necesitás saber antes de empezar:
            </h4>
            <ul className="space-y-2 text-[11px] text-slate-200">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">●</span>
                <span><strong>Período de prueba:</strong> 15 días gratis. Si no cancelás antes, el pago se efectuará automáticamente.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">●</span>
                <span><strong>Pago:</strong> Solo tarjeta de débito o crédito. La suscripción se renueva cada 30 días.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">●</span>
                <span><strong>Alertas:</strong> Recibirás recordatorios 3 días antes del vencimiento. Nunca habrá corte sorpresa.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">●</span>
                <span><strong>Si no pagás a tiempo:</strong> Habrá una mora del 3% por cada día de atraso.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">●</span>
                <span><strong>Quién se encarga de qué:</strong> Vos cobrás directamente a los jugadores. CancharClub solo te facilita la plataforma. Nosotros no tocamos dinero de nadie.</span>
              </li>
            </ul>
          </div>

          {/* ¿QUÉ ES CANCHARCLUB? */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              ¿QUÉ ES CANCHARCLUB?
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              CancharClub es una plataforma online donde cargás tu cancha, horarios y precios. Los jugadores la ven, hacen la reserva y te pagan directamente. Nosotros solo facilitamos que se encuentren. No recibimos dinero de las reservas y no intervenimos en lo que pasa entre vos y el jugador.
            </p>
          </div>

          <div className="h-px bg-slate-800" />

          {/* PERÍODO DE PRUEBA */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              PERÍODO DE PRUEBA
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Cuando se efectúe el registro y una vez activado el período de prueba, tenés <strong>15 días gratis</strong> para disfrutar de la plataforma. Durante estos días podés cargar información sobre tu cancha, horarios y precios sin pagar nada.
            </p>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Si no querés continuar, tenés que cancelar antes de que terminen los 15 días. Si no lo hacés y tenés cargada una tarjeta de débito o crédito, asumimos que querés seguir y te vamos a cobrar a partir del día 16.
            </p>
          </div>

          <div className="h-px bg-slate-800" />

          {/* CÓMO FUNCIONA EL PAGO */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              CÓMO FUNCIONA EL PAGO
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Solo aceptamos <strong>tarjeta de débito o crédito</strong>. Tu primer pago se realiza una vez finalizado el período de prueba. El dinero se debita automáticamente. Si todo anda bien, tu cuenta sigue activa y los jugadores pueden seguir viendo tu cancha.
            </p>
          </div>

          <div className="h-px bg-slate-800" />

          {/* ALERTAS ANTES DEL VENCIMIENTO */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              ALERTAS ANTES DEL VENCIMIENTO
            </h4>
            <p className="text-slate-300 text-[11px]">
              No habrá sorpresas. Te avisamos antes:
            </p>
            <ul className="space-y-1.5 text-[11px] text-slate-300 pl-2">
              <li className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">●</span>
                <span><strong>3 días antes:</strong> Primer recordatorio.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">●</span>
                <span><strong>2 días antes:</strong> Segundo recordatorio.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">●</span>
                <span><strong>1 día antes:</strong> Último recordatorio.</span>
              </li>
            </ul>
            <p className="text-[11px] text-slate-400 italic">
              Si tu tarjeta funciona, se cobra y listo. Si falla, te avisamos.
            </p>
          </div>

          <div className="h-px bg-slate-800" />

          {/* QUÉ PASA SI NO PAGÁS A TIEMPO */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              QUÉ PASA SI NO PAGÁS A TIEMPO
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Si tu tarjeta se rechaza, tu cuenta quedará en estado de pausa hasta que se efectivice el pago, tu cancha ya no será visible en la plataforma.
            </p>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Si tu cuenta se encuentra pausada y querés reactivarla, tenés que pagar la suscripción más una <strong>mora del 3% por cada día de atraso</strong> desde la fecha de vencimiento.
            </p>
          </div>

          <div className="h-px bg-slate-800" />

          {/* CÓMO REACTIVAR SI SE CORTÓ */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              CÓMO REACTIVAR SI SE CORTÓ
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300 pl-1">
              <li>Actualizá tu tarjeta si es necesario.</li>
              <li>Contactanos diciendo que querés reactivar.</li>
              <li>Intentamos el cobro de nuevo (suscripción + mora).</li>
              <li>Si funciona, tu cancha vuelve a estar online.</li>
            </ol>
          </div>

          <div className="h-px bg-slate-800" />

          {/* TUS RESPONSABILIDADES */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              TUS RESPONSABILIDADES
            </h4>
            <p className="text-slate-300 text-[11px]">Vos sos responsable de:</p>
            <ul className="space-y-2 text-[11px] text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">●</span>
                <span><strong>Mantener datos actualizados:</strong> Información sobre tu cancha, horarios, precios.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">●</span>
                <span><strong>Cargar tus datos:</strong> En la plataforma hay un lugar para que pongas tu cuenta bancaria, alias, para que los jugadores te paguen directamente, como así también informar el teléfono al que deben enviar los comprobantes.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">●</span>
                <span><strong>Cobrar a los jugadores:</strong> El dinero va directo de ellos a vos. CancharClub no toca ese dinero. Si un jugador no paga, vos tenés que reclamarlo.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">●</span>
                <span><strong>Resolver conflictos:</strong> Si un jugador se arrepiente, quiere devolver el dinero, no se presenta, o causa un problema, vos tenés que solucionarlo directo con él.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">●</span>
                <span><strong>Pagar a CancharClub:</strong> A tiempo, en las fechas establecidas. No importa si tuviste reservas o no ese mes.</span>
              </li>
            </ul>
          </div>

          <div className="h-px bg-slate-800" />

          {/* ACCESO A LA PLATAFORMA */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-400" />
              ACCESO A LA PLATAFORMA
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Tu cuenta es personal y solo vos tenés acceso. Si querés que otro empleado o persona de tu equipo use la plataforma, podés designarlo como <strong>&quot;ENCARGADO.&quot;</strong>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <span className="font-bold text-emerald-400 text-[11px] block">
                  Los ENCARGADOS solo pueden:
                </span>
                <ul className="space-y-1 text-[10px] text-slate-300">
                  <li>• Ver y gestionar reservas diarias</li>
                  <li>• Cargar disponibilidad y horarios</li>
                  <li>• Comunicarse con jugadores</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <span className="font-bold text-red-400 text-[11px] block">
                  Los ENCARGADOS NO pueden:
                </span>
                <ul className="space-y-1 text-[10px] text-slate-300">
                  <li>• Ver ni cambiar datos bancarios</li>
                  <li>• Cambiar el plan de pago</li>
                  <li>• Ver facturas</li>
                  <li>• Cancelar la suscripción</li>
                </ul>
              </div>
            </div>

            <p className="text-[11px] font-semibold text-slate-200 pt-1">Importante: Vos sos responsable de:</p>
            <ul className="space-y-1 text-[11px] text-slate-300 pl-2">
              <li>● No compartir tu usuario y contraseña con gente que no confíes</li>
              <li>● Cambiar tu contraseña si sospechas que alguien la vio</li>
              <li>● Avisarnos si algo raro pasa en tu cuenta</li>
            </ul>

            <p className="text-[11px] font-semibold text-slate-400 pt-1">CancharClub no es responsable si:</p>
            <ul className="space-y-1 text-[11px] text-slate-400 pl-2">
              <li>● Compartís tu usuario y contraseña con alguien que no debería tenerlo</li>
              <li>● Un ENCARGADO hace algo que no querías</li>
              <li>● Alguien accede a tu cuenta sin permiso porque dejaste tu contraseña visible</li>
              <li>● Tu cuenta sufre cambios por culpa de que compartiste el acceso</li>
            </ul>
          </div>

          <div className="h-px bg-slate-800" />

          {/* DATOS BANCARIOS - RESPONSABILIDAD TUYA */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              DATOS BANCARIOS - RESPONSABILIDAD TUYA
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Es tu obligación cargar y actualizar tus datos bancarios y de contacto en el perfil de tu cancha. Es la forma en que los jugadores te pagan.
            </p>
            <p className="text-[11px] text-slate-400">CancharClub no es responsable de:</p>
            <ul className="space-y-1 text-[11px] text-slate-400 pl-2">
              <li>● Recordarte que cargues los datos.</li>
              <li>● Verificar que sean correctos.</li>
              <li>● Si un jugador no puede pagarte porque los datos están mal o faltan.</li>
            </ul>
          </div>

          <div className="h-px bg-slate-800" />

          {/* DE QUÉ NO SOMOS RESPONSABLES */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              DE QUÉ NO SOMOS RESPONSABLES
            </h4>
            <p className="text-slate-300 text-[11px]">CancharClub se exonera de:</p>
            <ul className="space-y-1.5 text-[11px] text-slate-300 pl-2">
              <li>● Si un jugador se arrepiente, cancela su reserva o quiere la devolución de su dinero.</li>
              <li>● Si un jugador no paga.</li>
              <li>● Si un jugador no se presenta.</li>
              <li>● Si un jugador se lastima, causa un accidente o daña algo en tu cancha.</li>
              <li>● Si tu cancha no está en las condiciones que dijiste.</li>
              <li>● Si tu cancha causa algún daño a los jugadores.</li>
              <li>● Si tu tarjeta es rechazada y pierdes ingresos.</li>
              <li>● Si alguien te estafa, agrede o causa problemas.</li>
              <li>● Si no tenés habilitaciones, licencias o seguros.</li>
            </ul>
            <p className="text-slate-300 leading-relaxed text-[11px] pt-1">
              CancharClub es solo una plataforma técnica. No somos parte de tus transacciones con jugadores. No recibimos dinero de ellos. Solo te conectamos con potenciales clientes.
            </p>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-emerald-300">
              <strong>Aclaración importante:</strong> El dinero que te pagan los jugadores va directo a tu cuenta bancaria. Nosotros no lo tocamos. No somos &quot;intermediarios de pagos.&quot; Solo te damos la plataforma donde ellos te encuentran.
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* MÉTODO DE RESERVA DE CANCHAS */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              MÉTODO DE RESERVA DE CANCHAS
            </h4>
            <p className="text-slate-300 text-[11px]">La plataforma permite que las reservas se efectúen mediante:</p>
            <ul className="space-y-1 text-[11px] text-slate-300 pl-2">
              <li>● Transferencias bancarias</li>
              <li>● Billeteras virtuales</li>
            </ul>
          </div>

          <div className="h-px bg-slate-800" />

          {/* PUEDO CAMBIAR DE PLAN O CANCELAR */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              PUEDO CAMBIAR DE PLAN O CANCELAR
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Podés cambiar de plan en cualquier momento. Los cambios toman efecto en el siguiente ciclo de 30 días.
            </p>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Podés cancelar tu suscripción cuando quieras a través de tu panel. La cancelación toma efecto al finalizar los 30 días en curso. No hay reembolsos de cuotas ya pagadas.
            </p>
          </div>

          <div className="h-px bg-slate-800" />

          {/* SI QUEREMOS CAMBIAR ESTOS TÉRMINOS */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-400" />
              SI QUEREMOS CAMBIAR ESTOS TÉRMINOS
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              CancharClub puede cambiar precios, planes y términos en cualquier momento. Si son cambios importantes (especialmente de precio), te avisamos con 15 días de anticipación. Si no estás de acuerdo, podés cancelar. Si seguís usando la plataforma después del aviso, significa que aceptás los cambios.
            </p>
          </div>

          <div className="h-px bg-slate-800" />

          {/* ACEPTACIÓN */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ACEPTACIÓN
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Cuando hacés clic en &quot;Acepto Términos y Condiciones&quot; durante el registro o en este panel, estás aceptando todo lo que dice acá, rigiéndonos por las leyes Argentinas.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
            <span>Última actualización: 24/09/2026</span>
            <span>Preguntas o problemas: <a href="mailto:cancharclub@gmail.com" className="text-emerald-400 hover:underline">cancharclub@gmail.com</a></span>
          </div>
        </div>

        {/* ACCIÓN DE ACEPTACIÓN O CONFIRMACIÓN */}
        {!isAccepted ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 border border-slate-800 space-y-4 shadow-xl">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedCheckbox}
                onChange={(e) => setAgreedCheckbox(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
              />
              <span className="text-xs text-slate-200 leading-relaxed select-none group-hover:text-white transition-colors">
                He leído atentamente, comprendo y <strong>acepto la totalidad de los Términos y Condiciones de CancharClub</strong> para la administración de mi club deportivo y sujeción a las leyes argentinas.
              </span>
            </label>

            <Button
              onClick={handleAcceptTerms}
              disabled={!agreedCheckbox || isSubmitting}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-5 rounded-xl shadow-lg shadow-emerald-950/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Registrando Aceptación en Base de Datos...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Aceptar Términos y Condiciones de CancharClub</span>
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Aceptación vigente registrada. Podés consultar estos términos en cualquier momento.
              </span>
            </div>
            <a
              href="mailto:cancharclub@gmail.com"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Consultas legales o soporte</span>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
