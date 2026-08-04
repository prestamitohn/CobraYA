import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, FileSignature, Loader2, Eraser } from 'lucide-react';
import { generarContratoPDF } from '../../utils/contratoGenerator';
import { imageUrlToDataUrl } from '../../utils/pdfGenerator';
import { guardarContrato } from '../../services/contractService';
import { getMyTenant } from '../../services/tenantService';
import { useToast } from '../../context/ToastContext';
import { Prestamo, Cliente, Cuota } from '../../types/cobraya';

function useSignaturePad(canvasRef: React.RefObject<HTMLCanvasElement>) {
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      padRef.current?.clear();
    };

    padRef.current = new SignaturePad(canvas, { backgroundColor: '#ffffff', penColor: '#111827' });
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      padRef.current?.off();
    };
  }, [canvasRef]);

  return padRef;
}

interface FirmaPanelProps {
  titulo: string;
  subtitulo: string;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onClear: () => void;
}

function FirmaPanel({ titulo, subtitulo, canvasRef, onClear }: FirmaPanelProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-main">{titulo}</p>
          <p className="text-xs text-muted">{subtitulo}</p>
        </div>
        <button type="button" onClick={onClear} className="flex items-center gap-1.5 text-xs text-muted hover:text-red-500 transition-colors">
          <Eraser className="h-3.5 w-3.5" />
          Limpiar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-32 rounded-lg border border-border bg-white touch-none"
      />
    </div>
  );
}

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  prestamo: Prestamo;
  cliente: Cliente;
  cuotas: Cuota[];
}

export function ContractModal({ isOpen, onClose, prestamo, cliente, cuotas }: ContractModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const clienteCanvasRef = useRef<HTMLCanvasElement>(null);
  const prestamistaCanvasRef = useRef<HTMLCanvasElement>(null);
  const clientePad = useSignaturePad(clienteCanvasRef);
  const prestamistaPad = useSignaturePad(prestamistaCanvasRef);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: getMyTenant, enabled: isOpen });

  const mutation = useMutation({
    mutationFn: async () => {
      if (clientePad.current?.isEmpty() || prestamistaPad.current?.isEmpty()) {
        throw new Error('Ambas firmas son obligatorias');
      }

      const logoDataUrl = tenant?.logoUrl ? await imageUrlToDataUrl(tenant.logoUrl) : null;
      const fechaFirma = new Date().toISOString().slice(0, 10);

      const doc = generarContratoPDF({
        negocio: { nombre: tenant?.nombre || 'CobraYA', logoDataUrl, rtn: tenant?.rtn },
        cliente: {
          nombre: cliente.nombre,
          apellido: cliente.apellido,
          documento: cliente.documento,
          telefono: cliente.telefono,
          domicilio: cliente.domicilio,
        },
        garante: cliente.garante ? {
          nombre: cliente.garante.nombre,
          apellido: cliente.garante.apellido,
          documento: cliente.garante.documento,
          telefono: cliente.garante.telefono,
          domicilio: cliente.garante.domicilio,
        } : null,
        prestamo: {
          id: prestamo.id,
          montoOtorgado: prestamo.montoOtorgado,
          tasaInteres: prestamo.tasaInteres,
          sistemaAmortizacion: prestamo.sistemaAmortizacion,
          frecuenciaCobro: prestamo.frecuenciaCobro,
          cantidadCuotas: prestamo.cantidadCuotas,
          fechaOtorgamiento: prestamo.fechaOtorgamiento,
          fechaFinEstimada: prestamo.fechaFinEstimada,
          multaPorAtrasoMonto: prestamo.multaPorAtrasoMonto,
          gastoAdministrativoMonto: prestamo.gastoAdministrativoMonto,
        },
        cuotas,
        firmaClienteDataUrl: clientePad.current!.toDataURL('image/png'),
        firmaPrestamistaDataUrl: prestamistaPad.current!.toDataURL('image/png'),
        fechaFirma,
      });

      const nombreArchivo = `Contrato_${prestamo.id.slice(0, 8)}.pdf`;
      const blob = doc.output('blob');
      await guardarContrato(prestamo.id, blob, nombreArchivo);
      doc.save(nombreArchivo);
    },
    onSuccess: () => {
      addToast('Contrato firmado y guardado en el expediente', 'success');
      queryClient.invalidateQueries({ queryKey: ['contratos', prestamo.id] });
      onClose();
    },
    onError: (error: any) => {
      addToast(error.message || 'Error al generar el contrato', 'error');
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface z-10">
          <h2 className="text-lg font-semibold text-main flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary-500" />
            Contrato de Préstamo
          </h2>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-xl border border-border bg-surfaceHighlight/30 p-4 text-sm text-muted">
            Se generará un contrato en PDF con los datos del cliente, el garante (si tiene), las condiciones del
            préstamo y el cronograma de cuotas. Ambas partes deben firmar abajo antes de guardarlo en el
            expediente del préstamo.
          </div>

          <FirmaPanel
            titulo="Firma del Deudor"
            subtitulo={`${cliente.nombre} ${cliente.apellido ?? ''}`.trim()}
            canvasRef={clienteCanvasRef}
            onClear={() => clientePad.current?.clear()}
          />

          <FirmaPanel
            titulo="Firma del Prestamista"
            subtitulo={tenant?.nombre || 'Negocio'}
            canvasRef={prestamistaCanvasRef}
            onClear={() => prestamistaPad.current?.clear()}
          />

          <label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
              className="mt-0.5 rounded border-border text-primary-500 focus:ring-primary-500"
            />
            Ambas partes confirman que las firmas anteriores fueron ingresadas por su propio titular y aceptan las
            condiciones del contrato generado.
          </label>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted hover:text-main transition-colors">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !aceptaTerminos}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-accent-gold text-white rounded-lg text-sm font-semibold shadow-lg shadow-primary-500/25 transition-all duration-200 disabled:opacity-50"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
              Firmar y Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
