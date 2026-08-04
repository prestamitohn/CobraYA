import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from './formatters';
import { SISTEMAS_AMORTIZACION, FRECUENCIAS_COBRO, Cuota } from '../types/cobraya';

const VERDE: [number, number, number] = [5, 150, 105];
const MARGEN = 15;

export interface ContratoNegocio {
  nombre: string;
  logoDataUrl?: { dataUrl: string; format: 'PNG' | 'JPEG' } | null;
  rtn?: string | null;
}

export interface ContratoCliente {
  nombre: string;
  apellido?: string | null;
  documento: string;
  telefono?: string | null;
  domicilio?: string | null;
}

export interface ContratoGarante {
  nombre: string;
  apellido?: string | null;
  documento?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
}

export interface ContratoPrestamo {
  id: string;
  montoOtorgado: number;
  tasaInteres: number;
  sistemaAmortizacion: string;
  frecuenciaCobro: string;
  cantidadCuotas: number;
  fechaOtorgamiento: string;
  fechaFinEstimada?: string | null;
  multaPorAtrasoMonto?: number | null;
  gastoAdministrativoMonto?: number | null;
}

export interface ContratoInput {
  negocio: ContratoNegocio;
  cliente: ContratoCliente;
  garante?: ContratoGarante | null;
  prestamo: ContratoPrestamo;
  cuotas: Cuota[];
  firmaClienteDataUrl: string;
  firmaPrestamistaDataUrl: string;
  fechaFirma: string;
}

function nombreCompleto(p: { nombre: string; apellido?: string | null }): string {
  return `${p.nombre} ${p.apellido ?? ''}`.trim();
}

function labelSistema(valor: string): string {
  return SISTEMAS_AMORTIZACION.find((s) => s.value === valor)?.label ?? valor;
}

function labelFrecuencia(valor: string): string {
  return FRECUENCIAS_COBRO.find((f) => f.value === valor)?.label ?? valor;
}

export function generarContratoPDF(input: ContratoInput): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  let y = 0;

  const asegurarEspacio = (alto: number) => {
    if (y + alto > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
  };

  // --- Encabezado ---
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, pageWidth, 28, 'F');
  const logo = input.negocio.logoDataUrl;
  const textoX = logo ? 30 : MARGEN;
  if (logo) {
    try { doc.addImage(logo.dataUrl, logo.format, 10, 5, 18, 18); } catch { /* sigue sin logo */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(input.negocio.nombre || 'CobraYA', textoX, 13);
  doc.setFontSize(9);
  doc.text('CONTRATO DE PRÉSTAMO', textoX, 20);
  if (input.negocio.rtn) {
    doc.setFontSize(7);
    doc.text(`RTN: ${input.negocio.rtn}`, textoX, 25);
  }

  doc.setTextColor(0, 0, 0);
  y = 36;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Contrato Nro. ${input.prestamo.id.slice(0, 8).toUpperCase()}`, MARGEN, y);
  doc.text(`Fecha: ${formatDate(input.prestamo.fechaOtorgamiento)}`, pageWidth - MARGEN, y, { align: 'right' });
  y += 10;

  const seccion = (titulo: string) => {
    asegurarEspacio(12);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...VERDE);
    doc.text(titulo, MARGEN, y);
    doc.setDrawColor(...VERDE);
    doc.line(MARGEN, y + 1.5, pageWidth - MARGEN, y + 1.5);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9.5);
  };

  const campo = (etiqueta: string, valor: string) => {
    asegurarEspacio(6);
    doc.setTextColor(100);
    doc.text(etiqueta, MARGEN, y);
    doc.setTextColor(0, 0, 0);
    doc.text(valor || '-', MARGEN + 45, y);
    y += 6;
  };

  // --- I. Deudor ---
  seccion('I. Datos del Deudor');
  campo('Nombre completo:', nombreCompleto(input.cliente));
  campo('Identidad / RTN:', input.cliente.documento);
  if (input.cliente.telefono) campo('Teléfono:', input.cliente.telefono);
  if (input.cliente.domicilio) campo('Domicilio:', input.cliente.domicilio);
  y += 3;

  // --- II. Garante ---
  seccion('II. Datos del Garante');
  if (input.garante) {
    campo('Nombre completo:', nombreCompleto(input.garante));
    if (input.garante.documento) campo('Identidad:', input.garante.documento);
    if (input.garante.telefono) campo('Teléfono:', input.garante.telefono);
    if (input.garante.domicilio) campo('Domicilio:', input.garante.domicilio);
  } else {
    doc.setTextColor(100);
    doc.text('No aplica — préstamo sin garante.', MARGEN, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }
  y += 3;

  // --- III. Condiciones ---
  seccion('III. Condiciones del Préstamo');
  campo('Monto otorgado:', formatCurrency(input.prestamo.montoOtorgado));
  campo('Tasa de interés:', `${input.prestamo.tasaInteres}% por período`);
  campo('Sistema de amortización:', labelSistema(input.prestamo.sistemaAmortizacion));
  campo('Frecuencia de cobro:', labelFrecuencia(input.prestamo.frecuenciaCobro));
  campo('Cantidad de cuotas:', String(input.prestamo.cantidadCuotas));
  campo('Fecha de otorgamiento:', formatDate(input.prestamo.fechaOtorgamiento));
  if (input.prestamo.fechaFinEstimada) campo('Fecha estimada de finalización:', formatDate(input.prestamo.fechaFinEstimada));
  if (input.prestamo.gastoAdministrativoMonto) campo('Gasto administrativo:', formatCurrency(input.prestamo.gastoAdministrativoMonto));
  if (input.prestamo.multaPorAtrasoMonto) campo('Multa por atraso (por cuota):', formatCurrency(input.prestamo.multaPorAtrasoMonto));
  y += 3;

  // --- IV. Cláusulas ---
  seccion('IV. Cláusulas Generales');
  const clausulas = [
    'Objeto: El Prestamista entrega al Deudor la suma indicada en este contrato, que el Deudor se obliga a devolver junto con los intereses pactados, conforme al cronograma de pagos adjunto.',
    'Forma de pago: El Deudor pagará cada cuota en la fecha de su vencimiento, según el cronograma detallado en este documento.',
    `Mora: En caso de atraso en el pago de una cuota, el Deudor incurrirá en mora y podrá aplicarse una multa${input.prestamo.multaPorAtrasoMonto ? ` de ${formatCurrency(input.prestamo.multaPorAtrasoMonto)} por cada cuota vencida` : ' según lo acordado entre las partes'}.`,
    'Pago anticipado: El Deudor podrá cancelar total o parcialmente el saldo pendiente antes de las fechas de vencimiento, sin penalización adicional.',
    'Incumplimiento: Si el Deudor incurre en mora prolongada, el Prestamista podrá exigir el pago total del saldo pendiente y ejercer las acciones de cobro que correspondan.',
    'Garantía: De existir un Garante, este responde solidariamente por el cumplimiento de las obligaciones del Deudor bajo este contrato.',
    'Jurisdicción: Para cualquier controversia derivada de este contrato, las partes se someten a los tribunales competentes de la República de Honduras.',
    'Aceptación: Ambas partes declaran haber leído y entendido este contrato, y lo firman en señal de conformidad en la fecha indicada.',
  ];
  doc.setFontSize(8.5);
  clausulas.forEach((texto, i) => {
    const lineas = doc.splitTextToSize(`${i + 1}. ${texto}`, pageWidth - MARGEN * 2);
    asegurarEspacio(lineas.length * 4.2 + 2);
    doc.text(lineas, MARGEN, y);
    y += lineas.length * 4.2 + 2;
  });
  y += 4;

  // --- V. Cronograma ---
  asegurarEspacio(20);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...VERDE);
  doc.text('V. Cronograma de Pagos', MARGEN, y);
  doc.setDrawColor(...VERDE);
  doc.line(MARGEN, y + 1.5, pageWidth - MARGEN, y + 1.5);
  y += 6;

  autoTable(doc, {
    head: [['#', 'Vencimiento', 'Capital', 'Interés', 'Cuota']],
    body: input.cuotas.map((c) => [
      String(c.nroCuota),
      formatDate(c.fechaVto),
      formatCurrency(c.capital ?? 0),
      formatCurrency(c.interes ?? 0),
      formatCurrency(c.monto),
    ]),
    startY: y,
    theme: 'grid',
    headStyles: { fillColor: VERDE, textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: MARGEN, right: MARGEN },
  });
  // @ts-expect-error jspdf-autotable adjunta lastAutoTable al doc en runtime
  y = (doc.lastAutoTable?.finalY ?? y) + 12;

  // --- VI. Firmas ---
  asegurarEspacio(55);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...VERDE);
  doc.text('VI. Firmas', MARGEN, y);
  doc.setDrawColor(...VERDE);
  doc.line(MARGEN, y + 1.5, pageWidth - MARGEN, y + 1.5);
  y += 10;

  const anchoFirma = 70;
  const altoFirma = 25;
  const colIzq = MARGEN;
  const colDer = pageWidth - MARGEN - anchoFirma;

  try { doc.addImage(input.firmaClienteDataUrl, 'PNG', colIzq, y, anchoFirma, altoFirma); } catch { /* firma no disponible */ }
  try { doc.addImage(input.firmaPrestamistaDataUrl, 'PNG', colDer, y, anchoFirma, altoFirma); } catch { /* firma no disponible */ }

  y += altoFirma + 2;
  doc.setDrawColor(150);
  doc.line(colIzq, y, colIzq + anchoFirma, y);
  doc.line(colDer, y, colDer + anchoFirma, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(nombreCompleto(input.cliente), colIzq + anchoFirma / 2, y, { align: 'center' });
  doc.text(input.negocio.nombre || 'Prestamista', colDer + anchoFirma / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(7.5);
  doc.setTextColor(100);
  doc.text('Firma del Deudor', colIzq + anchoFirma / 2, y, { align: 'center' });
  doc.text('Firma del Prestamista', colDer + anchoFirma / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(8);
  doc.text(`Firmado electrónicamente el ${formatDate(input.fechaFirma)}.`, pageWidth / 2, y, { align: 'center' });

  // --- Pie de página en todas las páginas ---
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Documento generado electrónicamente por CobraYA · Página ${i} de ${totalPaginas}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' },
    );
  }

  return doc;
}
