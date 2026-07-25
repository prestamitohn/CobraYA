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
  };
}

const CLIENTE_SELECT = 'id, documento, nombre, apellido, telefono, domicilio, correo, activo, garante_id, garantes(id, documento, nombre, apellido, telefono, domicilio, correo)';

export interface BorrowerFilters {
  nombre?: string;
  activo?: boolean;
}

export async function getBorrowers(filters?: BorrowerFilters): Promise<Cliente[]> {
  let query = supabase.from('clientes').select(CLIENTE_SELECT).order('nombre');

  if (filters?.nombre) {
    const term = filters.nombre.replace(/[%,]/g, '');
    query = query.or(`nombre.ilike.%${term}%,apellido.ilike.%${term}%,documento.ilike.%${term}%,telefono.ilike.%${term}%`);
  }
  if (filters?.activo !== undefined) {
    query = query.eq('activo', filters.activo);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapCliente(row as unknown as ClienteRow));
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
      garante_id: garanteId,
    })
    .select(CLIENTE_SELECT)
    .single();
  if (error) throw error;
  return mapCliente(data as unknown as ClienteRow);
}

export async function updateBorrower(id: string, input: Partial<CreateBorrowerInput>): Promise<void> {
  const { error } = await supabase
    .from('clientes')
    .update({
      nombre: input.nombre,
      apellido: input.apellido || null,
      telefono: input.telefono || null,
      domicilio: input.domicilio || null,
      correo: input.correo || null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function toggleBorrowerStatus(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('clientes').update({ activo }).eq('id', id);
  if (error) throw error;
}
