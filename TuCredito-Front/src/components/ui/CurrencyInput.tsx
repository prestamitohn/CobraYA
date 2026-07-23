import { useEffect, useId, useState } from 'react';

interface CurrencyInputProps {
  value: number | undefined;
  onValueChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

function formatDigits(digits: string): string {
  if (!digits) return '';
  return Number(digits).toLocaleString('es-HN');
}

/**
 * Input de monto con separador de miles en vivo (50000 -> 50,000 mientras se escribe).
 * No se puede lograr esto con <input type="number"> (los navegadores no permiten comas
 * ahí), así que es un input de texto que solo acepta dígitos y formatea en cada tecla.
 */
export function CurrencyInput({ value, onValueChange, placeholder, className, id }: CurrencyInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [digits, setDigits] = useState(value ? String(Math.trunc(value)) : '');

  useEffect(() => {
    const externalDigits = value != null && value !== 0 ? String(Math.trunc(value)) : '';
    if (document.activeElement?.id !== inputId) {
      setDigits(externalDigits);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setDigits(raw);
    onValueChange(raw ? Number(raw) : 0);
  };

  return (
    <input
      id={inputId}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatDigits(digits)}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
}
