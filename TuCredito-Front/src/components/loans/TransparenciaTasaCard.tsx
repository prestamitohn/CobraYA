import { AlertTriangle, TrendingUp, Info } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface TransparenciaTasaCardProps {
  /** Tasa periódica declarada por el usuario, ya anualizada (tasa_interes × períodos/año). No confundir con la TCEA. */
  tasaNominalAnual: number | null | undefined;
  /** Costo real anualizado del crédito (TIR del flujo de pagos, anualizada). */
  tasaEfectivaAnual: number | null | undefined;
  /** Suma de cuotas menos capital prestado. */
  costoTotalCredito: number | null | undefined;
  /** Solo tiene sentido cuando el sistema es "directo" (flat) — compara contra el mismo préstamo a interés sobre saldos (francés). */
  comparativo?: { interesFlat: number; interesSaldos: number; diferencia: number } | null;
}

function formatPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('es-HN', { maximumFractionDigits: 2 })}%`;
}

/** Panel de transparencia de tasa — la ficha del préstamo nunca debe mostrar solo la
 * tasa declarada: siempre va junto a la TCEA (costo real), tal como lo exige el
 * módulo de transparencia de tasa efectiva. */
export function TransparenciaTasaCard({ tasaNominalAnual, tasaEfectivaAnual, costoTotalCredito, comparativo }: TransparenciaTasaCardProps) {
  const brechaSignificativa = tasaNominalAnual != null && tasaEfectivaAnual != null && tasaEfectivaAnual - tasaNominalAnual > 5;

  return (
    <div className="rounded-xl border border-border bg-surfaceHighlight/30 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-main flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary-500" />
        Transparencia de tasa
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted">Tasa nominal declarada</p>
          <p className="text-lg font-bold text-main">{formatPct(tasaNominalAnual)} <span className="text-xs font-normal text-muted">anual</span></p>
        </div>
        <div>
          <p className="text-xs text-muted flex items-center gap-1">
            Tasa efectiva anual (TCEA)
            <Info className="h-3 w-3" />
          </p>
          <p className={`text-lg font-bold ${brechaSignificativa ? 'text-red-400' : 'text-main'}`}>{formatPct(tasaEfectivaAnual)}</p>
        </div>
      </div>

      <div className="pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted">Costo total del crédito (interés que paga el cliente)</span>
        <span className="text-sm font-semibold text-main">{costoTotalCredito != null ? formatCurrency(costoTotalCredito) : '—'}</span>
      </div>

      {brechaSignificativa && (
        <div className="flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>La TCEA es el costo real del crédito — casi siempre mayor a la tasa declarada, porque el interés flat se cobra sobre el capital original aunque el cliente ya haya abonado parte.</span>
        </div>
      )}

      {comparativo && (
        <div className="pt-3 border-t border-border space-y-2">
          <p className="text-xs font-medium text-muted">Comparado con interés sobre saldos (mismo capital, tasa, plazo y frecuencia):</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2">
              <p className="text-xs text-muted">Flat (declarado)</p>
              <p className="font-semibold text-main">{formatCurrency(comparativo.interesFlat)}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
              <p className="text-xs text-muted">Sobre saldos (francés)</p>
              <p className="font-semibold text-main">{formatCurrency(comparativo.interesSaldos)}</p>
            </div>
          </div>
          {comparativo.diferencia > 0 && (
            <p className="text-xs text-muted">
              El método flat cobra <span className="text-red-400 font-medium">{formatCurrency(comparativo.diferencia)}</span> más de interés que si se calculara sobre saldos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
