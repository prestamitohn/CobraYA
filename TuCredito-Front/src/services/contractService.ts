import { supabase } from '../lib/supabase';

export interface ContratoDocumento {
  id: string;
  nombreOriginal: string;
  createdAt: string;
}

interface DocumentoRow {
  id: string;
  nombre_original: string;
  created_at: string;
}

/** Contratos ya guardados para un préstamo (más reciente primero) — historial si hubo re-firmas. */
export async function getContratosByPrestamo(prestamoId: string): Promise<ContratoDocumento[]> {
  const { data, error } = await supabase
    .from('documentos')
    .select('id, nombre_original, created_at')
    .eq('entidad_tipo', 'prestamo')
    .eq('entidad_id', prestamoId)
    .eq('tipo_documento', 'contrato')
    .eq('activo', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as DocumentoRow[]).map((row) => ({
    id: row.id,
    nombreOriginal: row.nombre_original,
    createdAt: row.created_at,
  }));
}

function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Sube el PDF del contrato firmado (vía Edge Function, ver gestionar-contrato) y lo enlaza al préstamo. */
export async function guardarContrato(prestamoId: string, pdfBlob: Blob, nombreArchivo: string): Promise<string> {
  const pdfBase64 = await fileToBase64(pdfBlob);
  const { data, error } = await supabase.functions.invoke('gestionar-contrato', {
    body: { action: 'guardar', prestamoId, pdfBase64, nombreArchivo },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.documentoId as string;
}

/** URL firmada temporal (5 min) para ver/descargar un contrato ya guardado. */
export async function obtenerUrlContrato(documentoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('gestionar-contrato', {
    body: { action: 'ver', documentoId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.url as string;
}
