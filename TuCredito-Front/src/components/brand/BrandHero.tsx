import { useId } from 'react';

/**
 * Ilustración de marca para los paneles de Login/Register — reemplaza la foto de
 * stock genérica ("Finance Building" de Unsplash) del template original. SVG propio,
 * sin dependencias externas: carga instantánea y usa exactamente la paleta de
 * CobraYA (verde crecimiento + dorado cobro) validada para contraste/daltonismo.
 *
 * viewBox cuadrado (no portrait): con `preserveAspectRatio="slice"` en un panel más
 * ancho que alto, un viewBox portrait recorta todo el centro — cuadrado deja la
 * composición (monedas + gráfica ascendente) visible en cualquier proporción real.
 *
 * Los ids de los gradientes se namespacean con useId(): este componente se monta dos
 * veces en la misma página (versión mobile oculta + desktop), y con ids fijos ambas
 * instancias comparten `url(#...)`, lo que hace que el navegador no pueda resolver
 * el relleno de una de las dos — se ve como formas negras/transparentes sin color.
 */
export function BrandHero({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `${uid}-${name}`;
  const ref = (name: string) => `url(#${uid}-${name})`;

  return (
    <svg
      viewBox="0 0 800 800"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Ilustración CobraYA: monedas y cartera de préstamos en crecimiento"
    >
      <defs>
        <linearGradient id={id('bars')} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id={id('line')} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#FBBF24" />
        </linearGradient>
        <radialGradient id={id('coin')} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="55%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </radialGradient>
        <radialGradient id={id('coin-green')} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#6EE7B7" />
          <stop offset="55%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#047857" />
        </radialGradient>
        <radialGradient id={id('glow-green')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('glow-gold')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
        <pattern id={id('dots')} width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill="#FFFFFF" fillOpacity="0.1" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="800" height="800" fill="#0B0E14" />

      {/* Ambient glow */}
      <circle cx="180" cy="180" r="320" fill={ref('glow-green')} />
      <circle cx="640" cy="560" r="340" fill={ref('glow-gold')} />

      {/* Textura sutil de puntos */}
      <rect x="0" y="0" width="800" height="800" fill={ref('dots')} />

      {/* Línea de tendencia ascendente, cruzando toda la escena */}
      <polyline
        points="90,460 220,500 340,380 470,420 590,290 710,180"
        fill="none"
        stroke={ref('line')}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <circle cx="710" cy="180" r="12" fill="#FBBF24" />
      <circle cx="710" cy="180" r="26" fill="#FBBF24" fillOpacity="0.25" />

      {/* Gráfica de barras ascendente — pieza central */}
      <g>
        <rect x="110" y="560" width="66" height="150" rx="12" fill={ref('bars')} opacity="0.55" />
        <rect x="204" y="500" width="66" height="210" rx="12" fill={ref('bars')} opacity="0.68" />
        <rect x="298" y="430" width="66" height="280" rx="12" fill={ref('bars')} opacity="0.8" />
        <rect x="392" y="340" width="66" height="370" rx="12" fill={ref('bars')} opacity="0.92" />
        <rect x="486" y="250" width="66" height="460" rx="12" fill={ref('bars')} />
      </g>
      <line x1="90" y1="712" x2="720" y2="712" stroke="#FFFFFF" strokeOpacity="0.15" strokeWidth="2" />

      {/* Monedas: pila abajo a la izquierda + monedas sueltas flotando */}
      <g>
        <ellipse cx="150" cy="705" rx="58" ry="16" fill={ref('coin')} opacity="0.9" />
        <ellipse cx="150" cy="683" rx="58" ry="16" fill={ref('coin')} />
        <ellipse cx="150" cy="661" rx="58" ry="16" fill={ref('coin')} opacity="0.95" />
        <ellipse cx="150" cy="639" rx="58" ry="16" fill={ref('coin')} />
        <rect x="132" y="623" width="36" height="4" rx="2" fill="#FEF3C7" fillOpacity="0.8" />
      </g>

      <g>
        <circle cx="650" cy="150" r="46" fill={ref('coin')} />
        <circle cx="650" cy="150" r="46" fill="none" stroke="#FEF3C7" strokeOpacity="0.5" strokeWidth="2" />
        <rect x="632" y="146" width="36" height="8" rx="4" fill="#FEF3C7" fillOpacity="0.85" />
      </g>

      <g>
        <circle cx="600" cy="330" r="30" fill={ref('coin-green')} />
        <rect x="587" y="326" width="26" height="6" rx="3" fill="#ECFDF5" fillOpacity="0.85" />
      </g>

      <g>
        <circle cx="710" cy="440" r="22" fill={ref('coin')} opacity="0.9" />
        <rect x="700" y="437" width="20" height="5" rx="2.5" fill="#FEF3C7" fillOpacity="0.85" />
      </g>

      <g>
        <circle cx="95" cy="230" r="20" fill={ref('coin-green')} opacity="0.85" />
        <rect x="86" y="227" width="18" height="5" rx="2.5" fill="#ECFDF5" fillOpacity="0.8" />
      </g>
    </svg>
  );
}
