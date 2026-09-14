'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  MessageCircle,
  Mail,
  CheckCircle2,
  Sparkles
} from 'lucide-react'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { RegisterClubModal } from '@/components/public/register-club-modal'
import { CancharClubIcon } from '@/components/shared/canchar-club-logo'
import { SAAS_PLANS_LIST } from '@/config/saas-plans'

export default function SumarClubLandingPage() {
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)

  const whatsappUrl =
    'https://wa.me/543816839320?text=Hola%20me%20llamo%20...%20quisiera%20agregar%20mi%20club%20a%20CancharClub%2C%20me%20podr%C3%ADas%20comentar%20un%20poco%20m%C3%A1s%20sobre%20c%C3%B3mo%20funciona%20el%20sistema%3F'
  const emailUrl =
    'mailto:cancharclub@gmail.com?subject=Quiero%20sumar%20mi%20club%20a%20CancharClub&body=Hola%20me%20llamo%20...%20quisiera%20agregar%20mi%20club%20a%20CancharClub%2C%20me%20podr%C3%ADas%20comentar%20un%20poco%20m%C3%A1s%20sobre%20c%C3%B3mo%20funciona%20el%20sistema%3F'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col transition-colors duration-200 selection:bg-emerald-500 selection:text-white font-sans">
      
      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* NAVBAR SUPERIOR                                                       */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <header className="w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-slate-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Inicio</span>
            </Link>
          </div>

          <Link href="/" className="flex items-center gap-2.5 group">
            <CancharClubIcon className="w-8 h-8 group-hover:scale-105 transition-transform" />
            <span className="font-black text-base sm:text-lg tracking-tight text-slate-100">
              Canchar<span className="text-emerald-400">Club</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/auth/login"
              className="hidden sm:inline-flex text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline px-3 py-1.5"
            >
              Acceso Clubes →
            </Link>
          </div>
        </div>
      </header>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECCIÓN 1: HERO PRINCIPAL (FIEL A LA CAPTURA 1)                        */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <section className="w-full pt-16 pb-16 sm:pt-24 sm:pb-20 px-4 sm:px-6 flex flex-col items-center text-center">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          
          {/* Badge: 1 mes de prueba gratis */}
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs sm:text-[13px] font-semibold mb-8 shadow-xs">
            <span>1 mes de prueba gratis</span>
          </div>

          {/* Gran Título: Tu club, siempre lleno */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-100 leading-[1.15]">
            Tu club, siempre lleno
          </h1>

          {/* Subtítulo descriptivo */}
          <p className="mt-5 text-base sm:text-xl text-slate-400 font-normal max-w-2xl leading-relaxed">
            Sumá tu club a Canchar Club y empezá a recibir reservas online hoy mismo. Sin complicaciones.
          </p>

          {/* Botones de acción: WhatsApp & Email */}
          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full max-w-md">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto flex-1 h-12 px-7 rounded-2xl bg-[#22c55e] hover:bg-[#16a34a] active:scale-[0.99] text-white font-bold text-sm sm:text-base shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <MessageCircle className="w-5 h-5 fill-white text-transparent" />
              <span>Escribinos por WhatsApp</span>
            </a>

            <a
              href={emailUrl}
              className="w-full sm:w-auto flex-1 h-12 px-7 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-100 font-bold text-sm sm:text-base border border-slate-800 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Mail className="w-4 h-4 text-slate-400" />
              <span>Escribinos por email</span>
            </a>
          </div>

          {/* Botón secundario para registro online instantáneo */}
          <div className="mt-5 text-center">
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              ¿Preferís registrarlo online vos mismo? Hacé clic acá →
            </button>
          </div>
        </div>
      </section>

      {/* Línea divisoria suave */}
      <div className="w-full max-w-4xl mx-auto border-t border-slate-800/80" />

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECCIÓN 2: PARA TODO TIPO DE CANCHAS (FIEL A LA CAPTURA 1)             */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <section className="w-full py-16 sm:py-20 px-4 sm:px-6 flex flex-col items-center text-center">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
            Para todo tipo de canchas
          </h2>

          {/* Píldoras de deportes */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            <span className="px-5 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-xs sm:text-sm font-medium shadow-2xs">
              Pádel
            </span>
            <span className="px-5 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-xs sm:text-sm font-medium shadow-2xs">
              Fútbol
            </span>
            <span className="px-5 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-xs sm:text-sm font-medium shadow-2xs">
              Tenis
            </span>
            <span className="px-5 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-xs sm:text-sm font-medium shadow-2xs">
              Y más deportes
            </span>
          </div>
        </div>
      </section>

      {/* Línea divisoria suave */}
      <div className="w-full max-w-4xl mx-auto border-t border-slate-800/80" />

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECCIÓN 3: ASÍ DE SIMPLE (FIEL A LA CAPTURA 2)                         */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 flex flex-col items-center">
        <div className="max-w-5xl mx-auto w-full">
          
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 text-center mb-12 sm:mb-16">
            Así de simple
          </h2>

          {/* Grilla de 3 Pasos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 sm:gap-12">
            
            {/* Paso 1 */}
            <div className="flex flex-col text-left space-y-3">
              <span className="text-4xl sm:text-5xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                1
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-100">
                Nos contactás
              </h3>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed font-normal">
                Hablamos, te contamos cómo funciona y configuramos tu club juntos.
              </p>
            </div>

            {/* Paso 2 */}
            <div className="flex flex-col text-left space-y-3">
              <span className="text-4xl sm:text-5xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                2
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-100">
                Cargás tus canchas
              </h3>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed font-normal">
                Subís tus horarios, precios y fotos desde un panel simple.
              </p>
            </div>

            {/* Paso 3 */}
            <div className="flex flex-col text-left space-y-3">
              <span className="text-4xl sm:text-5xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                3
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-100">
                Recibís reservas
              </h3>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed font-normal">
                Los jugadores ven tu disponibilidad en tiempo real y reservan sin llamar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Línea divisoria suave */}
      <div className="w-full max-w-4xl mx-auto border-t border-slate-800/80" />

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECCIÓN: PRECIOS SIMPLES (FIEL A LA CAPTURA)                          */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 flex flex-col items-center">
        <div className="max-w-4xl mx-auto w-full text-center">
          
          {/* Título: Precios simples */}
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100">
            Precios simples
          </h2>

          {/* Subtítulo aclaratorio de Mercado Pago */}
          <p className="mt-3 text-sm sm:text-base text-slate-400 font-normal max-w-2xl mx-auto leading-relaxed">
            1 mes de prueba gratis. Mercado Pago te pide un medio de pago, pero el primer cobro es recién a los 30 días.
          </p>

          {/* Grilla de 4 Tarjetas de Precios Segmentadas por Predio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-7 mt-10 sm:mt-12 text-left">
            {SAAS_PLANS_LIST.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-[26px] p-6 sm:p-8 flex flex-col justify-between transition-all duration-200 ${
                  plan.isPopular
                    ? 'bg-slate-900 border-2 border-emerald-500/60 shadow-xl shadow-emerald-950/30 relative'
                    : 'bg-slate-900 border border-slate-800 hover:border-slate-700 shadow-sm'
                }`}
              >
                <div>
                  {/* Badge */}
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                        plan.isPopular
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                          : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {plan.isPopular && <Sparkles className="w-3 h-3 text-emerald-400" />}
                      {plan.badge}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      {plan.name}
                    </span>
                  </div>

                  {/* Título: Ej. 1 Cancha / 2 Canchas */}
                  <h3 className="text-xl sm:text-2xl font-black text-slate-100 mb-1 tracking-tight">
                    {plan.courtsLabel}
                  </h3>

                  {/* Precio Principal */}
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-3xl sm:text-4xl font-black text-slate-100 tracking-tight">
                      {plan.priceTurnosLabel}
                    </span>
                  </div>

                  {/* Bajada de precio */}
                  <p className="text-xs sm:text-sm text-emerald-400/90 font-medium mt-1 mb-5">
                    {plan.priceSubtext}
                  </p>

                  {/* Divisor */}
                  <div className="w-full border-t border-slate-800/80 mb-5" />

                  {/* Detalle del servicio */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Detalle del servicio:
                    </h4>
                    <ul className="space-y-2.5">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-300 leading-snug">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Botón de acción */}
                <div className="mt-8 pt-4 border-t border-slate-800/60">
                  <button
                    onClick={() => setIsRegisterModalOpen(true)}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      plan.isPopular
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/50'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    <span>Empezar con {plan.courtsLabel}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Aclaración al pie de las tarjetas */}
          <p className="mt-8 text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-normal">
            Abono mensual del 1 al 7 de cada mes. Ajustado automáticamente al valor del turno de tu complejo.
          </p>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECCIÓN: PIE DE PÁGINA "¿LISTO PARA EMPEZAR?" (FIEL A LA CAPTURA)     */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <footer className="w-full mt-12 flex flex-col items-center">
        {/* Banner Verde Completo */}
        <div className="w-full bg-[#1ea866] py-16 sm:py-24 px-4 text-center text-white flex flex-col items-center justify-center">
          <div className="max-w-2xl mx-auto flex flex-col items-center">
            
            {/* Título: ¿Listo para empezar? */}
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
              ¿Listo para empezar?
            </h2>

            {/* Subtítulo */}
            <p className="mt-3 text-sm sm:text-lg text-emerald-50/95 font-normal max-w-xl mx-auto">
              Sumá tu club hoy y empezá tu mes de prueba gratis.
            </p>

            {/* Botones de Acción */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4 w-full max-w-md">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto flex-1 h-12 px-7 rounded-2xl bg-[#e9f7ef] hover:bg-white text-[#1ea866] font-bold text-sm sm:text-base shadow-sm transition-all flex items-center justify-center cursor-pointer"
              >
                <span>Escribinos por WhatsApp</span>
              </a>

              <a
                href={emailUrl}
                className="w-full sm:w-auto flex-1 h-12 px-7 rounded-2xl bg-transparent hover:bg-white/10 text-white font-bold text-sm sm:text-base border border-white transition-all flex items-center justify-center cursor-pointer"
              >
                <span>Escribinos por email</span>
              </a>
            </div>
          </div>
        </div>

        {/* Enlace inferior centrado: ← Volver al inicio */}
        <div className="py-8 text-center">
          <Link
            href="/"
            className="text-xs sm:text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium transition-colors"
          >
            ← Volver al inicio
          </Link>
        </div>
      </footer>

      {/* Modal interactivo de registro */}
      <RegisterClubModal
        open={isRegisterModalOpen}
        onOpenChange={setIsRegisterModalOpen}
      />
    </div>
  )
}
