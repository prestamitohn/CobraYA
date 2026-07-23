import { describe, expect, it } from 'vitest';
import { calcularInteresMoratorio, calcularSimulacion, type SimulacionEntrada } from './amortizacion';

const base: Omit<SimulacionEntrada, 'sistemaAmortizacion'> = {
  montoPrestamo: 10000,
  cantidadCuotas: 6,
  tasaInteres: 10, // 10% por período
  fechaInicio: new Date('2026-01-01T00:00:00Z'),
  frecuenciaCobro: 'mensual',
};

function saldoFinal(resultado: ReturnType<typeof calcularSimulacion>) {
  return resultado.detalleCuotas[resultado.detalleCuotas.length - 1].saldoRestante;
}

function sumaCapital(resultado: ReturnType<typeof calcularSimulacion>) {
  return resultado.detalleCuotas.reduce((acc, c) => acc + c.capital, 0);
}

describe('calcularSimulacion', () => {
  it('valida monto, cuotas e interés', () => {
    expect(() => calcularSimulacion({ ...base, montoPrestamo: 0, sistemaAmortizacion: 'directo' })).toThrow();
    expect(() => calcularSimulacion({ ...base, cantidadCuotas: 0, sistemaAmortizacion: 'directo' })).toThrow();
    expect(() => calcularSimulacion({ ...base, tasaInteres: -1, sistemaAmortizacion: 'directo' })).toThrow();
  });

  describe('directo (flat)', () => {
    it('reproduce la fórmula de CalculadoraService.CalcularDirecto', () => {
      // interesTotal = 10000 * 0.10 * 6 = 6000; totalAPagar = 16000; cuota = round(16000/6) = 2667
      const r = calcularSimulacion({ ...base, sistemaAmortizacion: 'directo' });
      expect(r.montoCuota).toBe(2667);
      expect(r.detalleCuotas).toHaveLength(6);
      // cada cuota es igual (monto constante) en el sistema directo
      expect(new Set(r.detalleCuotas.map((c) => c.monto)).size).toBe(1);
      // capital por cuota = round(10000/6) = 1667 en TODAS las cuotas (a diferencia
      // de Francés/Alemán, el sistema Directo no hace true-up en la última cuota,
      // tal como CalculadoraService.CalcularDirecto en el .NET original) — por eso
      // la suma de capital (1667*6=10002) se pasa del monto prestado por el
      // arrastre de redondeo, y saldoRestante se clampea a 0 en la última cuota.
      expect(r.detalleCuotas[0].capital).toBe(1667);
      expect(sumaCapital(r)).toBe(10002);
      expect(saldoFinal(r)).toBe(0);
    });

    it('genera vencimientos mensuales por defecto (+k meses)', () => {
      const r = calcularSimulacion({ ...base, sistemaAmortizacion: 'directo' });
      expect(r.detalleCuotas[0].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-02-01');
      expect(r.detalleCuotas[5].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-07-01');
    });
  });

  describe('frances (cuota fija, PMT estándar)', () => {
    it('cierra el saldo en 0 y mantiene la cuota constante salvo redondeo final', () => {
      const r = calcularSimulacion({ ...base, sistemaAmortizacion: 'frances' });
      // PMT = P * (i*(1+i)^n) / ((1+i)^n - 1) = 10000 * (0.1*1.771561)/(0.771561) ≈ 2296.07 -> round 2296
      expect(r.montoCuota).toBe(2296);
      expect(saldoFinal(r)).toBe(0);
      // todas menos la última cuota deben tener el mismo monto (la última se ajusta por true-up)
      const montosSinUltima = r.detalleCuotas.slice(0, -1).map((c) => c.monto);
      expect(new Set(montosSinUltima).size).toBe(1);
    });

    it('con tasa 0 equivale a amortización lineal simple', () => {
      const r = calcularSimulacion({ ...base, tasaInteres: 0, sistemaAmortizacion: 'frances' });
      expect(r.montoCuota).toBe(Math.round(base.montoPrestamo / base.cantidadCuotas));
      expect(saldoFinal(r)).toBe(0);
    });
  });

  describe('aleman (capital constante, cuota decreciente)', () => {
    it('capital constante y cuotas estrictamente decrecientes', () => {
      const r = calcularSimulacion({ ...base, sistemaAmortizacion: 'aleman' });
      const capitalConstante = Math.round(base.montoPrestamo / base.cantidadCuotas);
      for (const c of r.detalleCuotas.slice(0, -1)) {
        expect(c.capital).toBe(capitalConstante);
      }
      for (let k = 1; k < r.detalleCuotas.length; k++) {
        expect(r.detalleCuotas[k].monto).toBeLessThan(r.detalleCuotas[k - 1].monto);
      }
      expect(saldoFinal(r)).toBe(0);
      expect(sumaCapital(r)).toBeCloseTo(10000, 0);
    });
  });

  describe('americano (interés fijo + bullet final)', () => {
    it('cuotas intermedias son solo interés y la última paga capital + interés', () => {
      const r = calcularSimulacion({ ...base, sistemaAmortizacion: 'americano' });
      const interesConstante = Math.round(base.montoPrestamo * (base.tasaInteres / 100));
      for (const c of r.detalleCuotas.slice(0, -1)) {
        expect(c.capital).toBe(0);
        expect(c.monto).toBe(interesConstante);
      }
      const ultima = r.detalleCuotas[r.detalleCuotas.length - 1];
      expect(ultima.capital).toBe(base.montoPrestamo);
      expect(ultima.monto).toBe(base.montoPrestamo + interesConstante);
    });
  });

  describe('frecuencia de cobro', () => {
    it('diario avanza k días en vez de k meses', () => {
      const r = calcularSimulacion({ ...base, frecuenciaCobro: 'diario', sistemaAmortizacion: 'directo' });
      expect(r.detalleCuotas[0].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-01-02');
      expect(r.detalleCuotas[5].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-01-07');
    });

    it('semanal avanza k*7 días', () => {
      const r = calcularSimulacion({ ...base, frecuenciaCobro: 'semanal', sistemaAmortizacion: 'directo' });
      expect(r.detalleCuotas[0].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-01-08');
      expect(r.detalleCuotas[1].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-01-15');
    });

    it('quincenal avanza k*15 días', () => {
      const r = calcularSimulacion({ ...base, frecuenciaCobro: 'quincenal', sistemaAmortizacion: 'directo' });
      expect(r.detalleCuotas[0].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-01-16');
      expect(r.detalleCuotas[1].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-01-31');
    });
  });
});

describe('calcularInteresMoratorio', () => {
  it('es 0 si el pago es antes o en la fecha de vencimiento', () => {
    const vto = new Date('2026-01-15T00:00:00Z');
    expect(calcularInteresMoratorio(1000, vto, vto)).toBe(0);
    expect(calcularInteresMoratorio(1000, vto, new Date('2026-01-10T00:00:00Z'))).toBe(0);
  });

  it('cobra 1% del monto de cuota por cada día de atraso', () => {
    const vto = new Date('2026-01-15T00:00:00Z');
    const pago = new Date('2026-01-20T00:00:00Z'); // 5 días de atraso
    expect(calcularInteresMoratorio(1000, vto, pago)).toBe(50); // 1000 * 0.01 * 5
  });
});
