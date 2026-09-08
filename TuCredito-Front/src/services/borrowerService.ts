import { supabase } from '../lib/supabase';
import { Cliente, Garante } from '../types/cobraya';

interface ClienteRow {
  id: string;
  documento: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  domicilio: string | null;
  correo: string | null;
  activo: boolean;
  garante_id: string | null;
  usuario_id?: string | null;
  numero_socio?: string | null;
  fecha_ingreso?: string;
  fecha_retiro?: string | null;
  motivo_retiro?: string | null;
  garantes?: {
    id: string;
    documento: string | null;
    nombre: string;
    apellido: string | null;
    telefono: string | null;
    domicilio: string | null;
    correo: string | null;
  } | null;
}

function mapGarante(row: NonNullable<ClienteRow['garantes']>): Garante {
  return {
    id: row.id,
    documento: row.documento,
    nombre: row.nombre,
    apellido: row.apellido,
    telefono: row.telefono,
    domicilio: row.domicilio,
  };
}

function mapCliente(row: ClienteRow): Cliente {
  return {
    id: row.id,
    documento: row.documento,
    nombre: row.nombre,
    apellido: row.apellido,
    telefono: row.telefono,
    domicilio: row.domicilio,
    correo: row.correo,
    activo: row.activo,
    garanteId: row.garante_id,
    garante: row.garantes ? mapGarante(row.garantes) : null,
    usuarioId: row.usuario_id,
    numeroSocio: row.numero_socio,
    fechaIngreso: row.fecha_ingreso,
    fechaRetiro: row.fecha_retiro,
    motivoRetiro: row.motivo_retiro,
  };
}

const CLIENTE_SELECT = 'id, documento, nombre, apellido, telefono, domicilio, correo, activo, garante_id, usuario_id, numero_socio, fecha_ingreso, fecha_retiro, motivo_retiro, garantes(id, documento, nombre, apellido, telefono, domicilio, correo)';

export interface BorrowerFilters {
  nombre?: string;
  activo?: boolean;
  /** true = solo dados de baja definitiva (fecha_retiro no nula); false = excluye a los dados de baja (deja solo suspendidos temporales cuando se combina con activo=false). */
  retirado?: boolean;
}

export async function getBorrowers(filters?: BorrowerFilters): Promise<Cliente[]> {
  let query = supabase.from('clientes').select(CLIENTE_SELECT).order('nombre').order('apellido');

  if (filters?.nombre) {
    // Se quitan %, , . ( ) — todos son metacaracteres del parser de filtros de
    // PostgREST (.or() los interpreta como separadores/operadores); sin esto, un
    // término con paréntesis o punto puede romper el filtro o alterar su lógica.
    const term = filters.nombre.replace(/[%,.()]/g, '');
    query = query.or(`nombre.ilike.%${term}%,apellido.ilike.%${term}%,documento.ilike.%${term}%,telefono.ilike.%${term}%,numero_socio.ilike.%${term}%`);
  }
  if (filters?.activo !== undefined) {
    query = query.eq('activo', filters.activo);
  }
  if (filters?.retirado !== undefined) {
    query = filters.retirado ? query.not('fecha_retiro', 'is', null) : query.is('fecha_retiro', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapCliente(row as unknown as ClienteRow));
}

/** Propone el siguiente correlativo de número de socio para el tenant (padding a 4 dígitos, ej. "0001") — queda editable en el formulario, no se fuerza. */
export async function getSiguienteNumeroSocio(): Promise<string> {
  const { data, error } = await supabase.from('clientes').select('numero_socio').not('numero_socio', 'is', null);
  if (error) throw error;
  const max = (data ?? []).reduce((acc, row: { numero_socio: string | null }) => {
    const n = parseInt(row.numero_socio ?? '', 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return String(max + 1).padStart(4, '0');
}

export async function getBorrowerByDocumento(documento: string): Promise<Cliente> {
  const { data, error } = await supabase
    .from('clientes')
    .select(CLIENTE_SELECT)
    .eq('documento', documento)
    .single();
  if (error) throw error;
  return mapCliente(data as unknown as ClienteRow);
}

export async function getBorrowerById(id: string): Promise<Cliente> {
  const { data, error } = await supabase
    .from('clientes')
    .select(CLIENTE_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return mapCliente(data as unknown as ClienteRow);
}

export interface GaranteInput {
  nombre?: string;
  apellido?: string;
  documento?: string;
  telefono?: string;
  domicilio?: string;
  correo?: string;
}

export interface CreateBorrowerInput {
  documento: string;
  nombre: string;
  apellido?: string;
  telefono?: string;
  domicilio?: string;
  correo?: string;
  numeroSocio?: string;
  garante?: GaranteInput;
}

export async function createBorrower(input: CreateBorrowerInput): Promise<Cliente> {
  let garanteId: string | null = null;

  if (input.garante?.nombre) {
    const { data: garanteRow, error: garanteError } = await supabase
      .from('garantes')
      .insert({
        nombre: input.garante.nombre,
        apellido: input.garante.apellido || null,
        documento: input.garante.documento || null,
        telefono: input.garante.telefono || null,
        domicilio: input.garante.domicilio || null,
        correo: input.garante.correo || null,
      })
      .select('id')
      .single();
    if (garanteError) throw garanteError;
    garanteId = garanteRow.id;
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert({
      documento: input.documento,
      nombre: input.nombre,
      apellido: input.apellido || null,
      telefono: input.telefono || null,
      domicilio: input.domicilio || null,
      correo: input.correo || null,
      numero_socio: input.numeroSocio || null,
      garante_id: garanteId,
    })
    .select(CLIENTE_SELECT)
    .single();
  if (error) throw error;
  return mapCliente(data as unknown as ClienteRow);
}

export async function updateBorrower(id: string, input: Partial<CreateBorrowerInput>): Promise<void> {
  // Solo se escriben las claves presentes en `input` — antes se mandaban TODAS con
  // `|| null`, así que un update parcial que omitiera, por ejemplo, `numeroSocio`
  // lo borraba en vez de dejarlo intacto. Hoy EditBorrower siempre manda el objeto
  // completo así que no se notaba, pero es una trampa para cualquier llamador futuro.
  const updates: Record<string, string | null> = {};
  if (input.nombre !== undefined) updates.nombre = input.nombre;
  if (input.apellido !== undefined) updates.apellido = input.apellido || null;
  if (input.telefono !== undefined) updates.telefono = input.telefono || null;
  if (input.domicilio !== undefined) updates.domicilio = input.domicilio || null;
  if (input.correo !== undefined) updates.correo = input.correo || null;
  if (input.numeroSocio !== undefined) updates.numero_socio = input.numeroSocio || null;

  const { error } = await supabase.from('clientes').update(updates).eq('id', id);
  if (error) throw error;
}

export async function toggleBorrowerStatus(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('clientes').update({ activo }).eq('id', id);
  if (error) throw error;
}

/** Baja definitiva de un socio/cliente (retiro) — conserva todo el historial, solo lo marca inactivo con fecha y motivo. Distinto de toggleBorrowerStatus, que es una suspensión temporal reversible sin motivo. */
export async function darBajaSocio(clienteId: string, motivo: string, fecha?: string): Promise<void> {
  const { error } = await supabase.rpc('dar_baja_socio', {
    p_cliente_id: clienteId,
    p_motivo: motivo,
    p_fecha: fecha ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
}

/** Revierte una baja definitiva. */
export async function reactivarSocio(clienteId: string): Promise<void> {
  const { error } = await supabase.rpc('reactivar_socio', { p_cliente_id: clienteId });
  if (error) throw error;
}
