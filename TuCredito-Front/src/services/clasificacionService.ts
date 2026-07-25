import { supabase } from '../lib/supabase';
import { ClasificacionCliente, ClienteClasificacion } from '../types/cobraya';

interface ClasificacionRow {
  cliente_id: string;
  total_cuotas_vencidas_hist: number;
  cuotas_pagadas_a_tiempo: number;
  cuotas_pagadas_tarde: number;
  cuotas_vencidas_actuales: number;
  multas_activas: number;
  porcentaje_cumplimiento: number;
  clasificacion: ClasificacionCliente;
  no_recomendado_refinanciamiento: boolean;
}

function mapClasificacion(row: ClasificacionRow): ClienteClasificacion {
  return {
    clienteId: row.cliente_id,
    totalCuotasVencidasHist: row.total_cuotas_vencidas_hist,
    cuotasPagadasATiempo: row.cuotas_pagadas_a_tiempo,
    cuotasPagadasTarde: row.cuotas_pagadas_tarde,
    cuotasVencidasActuales: row.cuotas_vencidas_actuales,
    multasActivas: row.multas_activas,
    porcentajeCumplimiento: Number(row.porcentaje_cumplimiento),
    clasificacion: row.clasificacion,
    noRecomendadoRefinanciamiento: row.no_recomendado_refinanciamiento,
  };
}

export async function getClasificacionesClientes(): Promise<ClienteClasificacion[]> {
  const { data, error } = await supabase.rpc('obtener_clasificacion_clientes');
  if (error) throw error;
  return ((data ?? []) as ClasificacionRow[]).map(mapClasificacion);
}
