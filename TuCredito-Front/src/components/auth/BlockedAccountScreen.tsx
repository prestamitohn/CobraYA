import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Smartphone, CreditCard, Copy, Check } from 'lucide-react';
import { getActivePaymentAccounts } from '../../services/paymentAccountService';
import { getTipoCuentaPagoLabel, PlatformPaymentAccount } from '../../types/cobraya';

function CuentaPagoCard({ cuenta }: { cuenta: PlatformPaymentAccount }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (valor: string) => {
    navigator.clipboard.writeText(valor);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const Icon = cuenta.tipo === 'banco' ? Banknote : cuenta.tipo === 'tigo_money' ? Smartphone : CreditCard;

  return (
    <div className="rounded-xl border border-border bg-surfaceHighlight/30 p-4 text-left space-y-1.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-main">
        <Icon className="h-4 w-4 text-primary-500" />
        {getTipoCuentaPagoLabel(cuenta.tipo)}
      </div>
      <p className="text-sm text-muted">Beneficiario: <span className="text-main">{cuenta.nombreBeneficiario}</span></p>
      {cuenta.banco && <p className="text-sm text-muted">Banco: <span className="text-main">{cuenta.banco}</span></p>}
      {cuenta.tipoCuentaBancaria && <p className="text-sm text-muted">Tipo de cuenta: <span className="text-main">{cuenta.tipoCuentaBancaria}</span></p>}
      {cuenta.numeroCuenta && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted">Cuenta: <span className="text-main font-mono">{cuenta.numeroCuenta}</span></p>
          <button onClick={() => handleCopy(cuenta.numeroCuenta!)} className="text-muted hover:text-primary-500 transition-colors" title="Copiar">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
      {cuenta.telefono && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted">Teléfono: <span className="text-main font-mono">{cuenta.telefono}</span></p>
          <button onClick={() => handleCopy(cuenta.telefono!)} className="text-muted hover:text-primary-500 transition-colors" title="Copiar">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
      {cuenta.instrucciones && (
        <p className="text-xs text-muted italic pt-1.5 mt-1.5 border-t border-border">{cuenta.instrucciones}</p>
      )}
    </div>
  );
}

interface BlockedAccountScreenProps {
  titulo: string;
  mensaje: string;
  onLogout: () => void;
}

export function BlockedAccountScreen({ titulo, mensaje, onLogout }: BlockedAccountScreenProps) {
  const { data: cuentas } = useQuery({ queryKey: ['activePaymentAccounts'], queryFn: getActivePaymentAccounts });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-6 px-4 py-10 text-center overflow-y-auto">
      <h1 className="text-2xl font-bold text-main">{titulo}</h1>
      <p className="text-muted max-w-md">{mensaje}</p>

      {cuentas && cuentas.length > 0 && (
        <div className="w-full max-w-md space-y-3">
          <p className="text-sm font-medium text-main">Realiza tu pago a una de estas cuentas:</p>
          <div className="space-y-3">
            {cuentas.map((c) => <CuentaPagoCard key={c.id} cuenta={c} />)}
          </div>
          <p className="text-xs text-muted">Una vez realizado el pago, envíanos el comprobante para reactivar tu cuenta.</p>
        </div>
      )}

      <button
        onClick={onLogout}
        className="mt-2 px-4 py-2 rounded-lg border border-border text-main hover:bg-surfaceHighlight transition-colors"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
