import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Check,
  FileSignature,
  FileSpreadsheet,
  Gavel,
  Landmark,
  LayoutDashboard,
  MessageCircle,
  PiggyBank,
  Receipt,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet2,
} from 'lucide-react';
import { BrandHero } from '../components/brand/BrandHero';

// Precios de ejemplo — el único ancla confirmada es "el plan más barato en L500".
// Los demás montos son una propuesta razonable (saltos ~1.8x típicos de SaaS) y se
// pueden ajustar acá mismo sin tocar el resto del componente.
const PLANES = [
  {
    nombre: 'Básico',
    precio: 500,
    audiencia: 'Para el prestamista individual',
    destacado: false,
    caracteristicas: [
      '1 usuario (el dueño del negocio)',
      'Hasta 50 clientes activos',
      'Préstamos con los 4 sistemas de amortización',
      'Cobro diario, semanal, quincenal o mensual',
      'Mora automática y dashboard de KPIs',
      'Recibos con membrete de tu negocio',
    ],
  },
  {
    nombre: 'Profesional',
    precio: 950,
    audiencia: 'Para negocios con cobradores en la calle',
    destacado: true,
    caracteristicas: [
      'Hasta 3 usuarios (dueño + 2 cobradores)',
      'Clientes activos ilimitados',
      'Todo lo del plan Básico, más:',
      'Multas, refinanciamiento y gastos administrativos',
      'Contrato digital con firma en pantalla',
      'Notificaciones push y botón de WhatsApp',
      'Exportación a Excel y PDF',
    ],
  },
  {
    nombre: 'Cooperativa',
    precio: 1800,
    audiencia: 'El módulo completo de ahorro y crédito',
    destacado: false,
    caracteristicas: [
      'Usuarios ilimitados + rol Auditor',
      'Todo lo del plan Profesional, más:',
      'Aportaciones de socios con interés capitalizable',
      'Productos de ahorro (vista, programado, plazo fijo)',
      'Cálculo y reparto de excedentes (Ley de Cooperativas HN)',
      'Portal de autoservicio para cada socio',
      'Aportación masiva a todos los socios',
    ],
  },
];

const FEATURES = [
  { icon: Wallet2, title: 'Préstamos flexibles', desc: 'Francés, alemán, americano o directo, con cobro diario, semanal, quincenal o mensual.' },
  { icon: TrendingUp, title: 'Mora automática', desc: 'Las cuotas vencidas se marcan solas todos los días — nadie tiene que revisarlo a mano.' },
  { icon: Gavel, title: 'Multas y refinanciamiento', desc: 'Aplica cargos por atraso y refinancia préstamos sin perder el historial original.' },
  { icon: LayoutDashboard, title: 'Dashboard con proyecciones', desc: 'KPIs, morosidad, composición de cartera y flujo de caja proyectado en tiempo real.' },
  { icon: ShieldCheck, title: 'Clasificación de clientes', desc: 'Excelente, bueno, regular o malo — calculado solo, o ajustado a mano si conoces el caso.' },
  { icon: Receipt, title: 'Recibos con tu marca', desc: 'Comprobantes en PDF con el logo y RTN de tu negocio en cada pago, aportación o depósito.' },
  { icon: FileSignature, title: 'Contrato digital', desc: 'Genera el contrato de préstamo y fírmalo en pantalla con el cliente, sin papel.' },
  { icon: Bell, title: 'Notificaciones push', desc: 'Un resumen diario de cuotas por cobrar y en mora, directo al celular del cobrador.' },
  { icon: MessageCircle, title: 'Aviso por WhatsApp', desc: 'Notifica un pago, abono o depósito al cliente con un clic, sin salir de la app.' },
  { icon: FileSpreadsheet, title: 'Exporta todo', desc: 'Cartera, pagos y reportes a Excel o PDF cuando los necesites.' },
  { icon: Users, title: 'Roles por persona', desc: 'Dueño, cobrador con acceso a su ruta, o auditor de solo lectura — cada quien ve lo suyo.' },
  { icon: RefreshCw, title: '14 días de prueba', desc: 'Prueba todo el sistema sin compromiso; el pago es manual, sin tarjeta de crédito.' },
];

function formatLempiras(n: number): string {
  return `L ${n.toLocaleString('es-HN')}`;
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-main">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-primary-600 to-accent-gold flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-white text-base">C</span>
            </div>
            <span className="text-lg font-bold tracking-tight">CobraYA</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-muted">
            <a href="#caracteristicas" className="hover:text-main transition-colors">Características</a>
            <a href="#precios" className="hover:text-main transition-colors">Precios</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="px-3 py-2 text-sm font-medium text-muted hover:text-main transition-colors">
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-primary-600 to-accent-gold text-white rounded-lg text-sm font-semibold shadow-lg shadow-primary-500/20 hover:shadow-primary-500/40 transition-all"
            >
              Comenzar gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-20">
          <BrandHero className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background to-background" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface/60 text-xs font-medium text-muted mb-6">
            <Landmark className="h-3.5 w-3.5 text-primary-500" />
            Para prestamistas y cooperativas de ahorro y crédito en Honduras
          </span>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-main max-w-3xl mx-auto">
            Gestiona préstamos, ahorros y cooperativas en un solo lugar
          </h1>
          <p className="mt-6 text-lg text-muted max-w-2xl mx-auto">
            CobraYA digitaliza tu cartera de préstamos — cobros, mora, contratos y recibos — o el ciclo completo de
            una cooperativa: aportaciones, ahorros y reparto de excedentes. Todo en Lempiras, listo para tu equipo.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-accent-gold text-white rounded-xl text-sm font-semibold shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:scale-[1.02] transition-all"
            >
              Comenzar prueba gratis de 14 días
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#precios"
              className="px-6 py-3 rounded-xl text-sm font-semibold border border-border text-main hover:bg-surfaceHighlight transition-colors"
            >
              Ver precios
            </a>
          </div>
          <p className="mt-5 text-xs text-muted">Sin tarjeta de crédito · Configuración en minutos · Pago manual por transferencia o depósito</p>
        </div>
      </section>

      {/* Para quién es */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-main">Un sistema, dos formas de usarlo</h2>
          <p className="mt-3 text-muted max-w-xl mx-auto">Elige el tipo de negocio al registrarte — CobraYA adapta el menú y las herramientas a lo que necesitas.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-panel rounded-2xl border border-border p-8">
            <div className="h-12 w-12 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center mb-4">
              <Landmark className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-main mb-2">Prestamistas</h3>
            <p className="text-sm text-muted mb-5">Gestiona tu cartera de préstamos, sola o con cobradores en campo.</p>
            <ul className="space-y-3 text-sm">
              {[
                'Préstamos con 4 sistemas de amortización',
                'Cobro diario, semanal, quincenal o mensual',
                'Mora y multas automáticas',
                'Refinanciamiento sin perder el historial',
                'Clasificación automática de clientes',
                'Cobradores con acceso solo a su ruta',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary-500 flex-shrink-0 mt-0.5" />
                  <span className="text-muted">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-panel rounded-2xl border border-border p-8">
            <div className="h-12 w-12 rounded-xl bg-accent-gold/10 text-accent-gold flex items-center justify-center mb-4">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-main mb-2">Cooperativas de Ahorro y Crédito</h3>
            <p className="text-sm text-muted mb-5">El módulo completo, alineado a la Ley de Cooperativas de Honduras (Decreto 65-87).</p>
            <ul className="space-y-3 text-sm">
              {[
                'Aportaciones de socios con interés capitalizable',
                'Productos de ahorro: a la vista, programado, plazo fijo',
                'Excedentes con Reserva Legal y fondos configurables',
                'Portal de autoservicio para cada socio',
                'Aportación masiva a todos los socios',
                'Rol Auditor de solo lectura',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-accent-gold flex-shrink-0 mt-0.5" />
                  <span className="text-muted">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="caracteristicas" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 scroll-mt-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-main">Todo lo que necesitas para cobrar a tiempo</h2>
          <p className="mt-3 text-muted max-w-xl mx-auto">Incluido en la plataforma, sin integraciones aparte.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-5 rounded-xl border border-border bg-surfaceHighlight/30 hover:border-primary-500/30 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-primary-500/10 text-primary-500 flex items-center justify-center mb-3">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-main mb-1">{f.title}</h3>
              <p className="text-sm text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="precios" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 scroll-mt-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-main">Precios simples, en Lempiras</h2>
          <p className="mt-3 text-muted max-w-xl mx-auto">Todos los planes incluyen 14 días de prueba gratis. Pago manual por transferencia o depósito — sin tarjeta de crédito.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PLANES.map((plan) => (
            <div
              key={plan.nombre}
              className={`rounded-2xl border p-8 flex flex-col ${
                plan.destacado
                  ? 'border-primary-500 bg-primary-500/5 shadow-xl shadow-primary-500/10 md:-translate-y-2'
                  : 'border-border bg-surface/50'
              }`}
            >
              {plan.destacado && (
                <span className="self-start mb-3 px-2.5 py-1 rounded-full bg-primary-500 text-white text-xs font-semibold">
                  Más popular
                </span>
              )}
              <h3 className="text-lg font-bold text-main">{plan.nombre}</h3>
              <p className="text-sm text-muted mt-1">{plan.audiencia}</p>
              <div className="mt-5 mb-1">
                <span className="text-4xl font-extrabold text-main">{formatLempiras(plan.precio)}</span>
                <span className="text-muted text-sm"> /mes</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm flex-1">
                {plan.caracteristicas.map((c) => (
                  <li key={c} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary-500 flex-shrink-0 mt-0.5" />
                    <span className="text-muted">{c}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className={`mt-8 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  plan.destacado
                    ? 'bg-gradient-to-r from-primary-600 to-accent-gold text-white shadow-lg shadow-primary-500/20 hover:shadow-primary-500/40'
                    : 'border border-border text-main hover:bg-surfaceHighlight'
                }`}
              >
                Comenzar prueba gratis
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="rounded-2xl bg-gradient-to-r from-primary-600 to-accent-gold p-10 sm:p-14 text-center text-white relative overflow-hidden">
          <div className="relative z-10">
            <PiggyBank className="h-10 w-10 mx-auto mb-4 opacity-90" />
            <h2 className="text-2xl sm:text-3xl font-bold">Empieza a cobrar mejor desde hoy</h2>
            <p className="mt-3 text-white/90 max-w-lg mx-auto">14 días de prueba gratis, sin tarjeta de crédito. Configura tu negocio o cooperativa en minutos.</p>
            <Link
              to="/register"
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-white text-primary-600 rounded-xl text-sm font-bold shadow-lg hover:scale-[1.02] transition-transform"
            >
              Crear mi cuenta gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-primary-600 to-accent-gold flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-white text-sm">C</span>
            </div>
            <span className="font-bold text-main">CobraYA</span>
            <span className="text-xs text-muted">· Hecho para Honduras 🇭🇳</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted">
            <a href="#caracteristicas" className="hover:text-main transition-colors">Características</a>
            <a href="#precios" className="hover:text-main transition-colors">Precios</a>
            <Link to="/login" className="hover:text-main transition-colors">Iniciar sesión</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
