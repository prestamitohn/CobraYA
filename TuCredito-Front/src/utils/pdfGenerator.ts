import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PrestamoDTO, ResumenPrestamoDTO, Cuota } from '../types';
import { formatCurrency, formatDate } from './formatters';
import type { PagoDetalle } from '../services/paymentService';
import type { ExcedenteDetalleSocio, ExcedentePeriodo, FondoExcedenteSnapshot } from '../types/cobraya';

export const exportToPDF = (title: string, headers: string[], data: string[][], filename: string) => {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(title, 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Fecha de reporte: ${new Date().toLocaleDateString()}`, 14, 30);

  autoTable(doc, {
    head: [headers],
    body: data,
    startY: 35,
    theme: 'grid',
    headStyles: { fillColor: [5, 150, 105], textColor: 255 },
    styles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [245, 247, 250] }
  });

  doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportLoanDetailPDF = (loan: PrestamoDTO, summary: ResumenPrestamoDTO | undefined, installments: Cuota[]) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Header
  doc.setFillColor(124, 58, 237); // Primary color
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text(`Préstamo #${loan.idPrestamo}`, 14, 25);
  
  
  doc.text(`Nro. Comprobante:`, 15, 45);
  doc.text(`Fecha de emisión: ${new Date().toLocaleDateString()}`, pageWidth - 14, 25, { align: 'right' });

  // Client Info Section
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text('Información del Cliente', 14, 55);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  
  // Left Column
  doc.text('Cliente:', 14, 65);
  doc.setTextColor(0);
  doc.text(loan.nombrePrestatario, 40, 65);
  
  doc.setTextColor(100);
  doc.text('DNI:', 14, 72);
  doc.setTextColor(0);
  doc.text(loan.dniPrestatario.toString(), 40, 72);

  // Right Column (Loan Details)
  doc.setTextColor(100);
  doc.text('Monto Otorgado:', pageWidth / 2, 65);
  doc.setTextColor(0);
  doc.text(formatCurrency(loan.montoOtorgado, loan.moneda), (pageWidth / 2) + 35, 65);

  doc.setTextColor(100);
  doc.text('Tasa Interés:', pageWidth / 2, 72);
  doc.setTextColor(0);
  doc.text(`${loan.tasaInteres}% Mensual`, (pageWidth / 2) + 35, 72);

  doc.setTextColor(100);
  doc.text('Fecha Otorgamiento:', pageWidth / 2, 79);
  doc.setTextColor(0);
  doc.text(formatDate(loan.fechaOtorgamiento), (pageWidth / 2) + 35, 79);

  // Summary Section (if available)
  let startY = 95;
  if (summary) {
    doc.setDrawColor(200);
    doc.line(14, 85, pageWidth - 14, 85);
    
    doc.setFontSize(12);
    doc.text('Resumen', 14, 95);
    
    doc.setFontSize(10);
    doc.text(`Cuotas Totales: ${summary.cantidadCuotasOriginales}`, 14, 105);
    doc.text(`Cuotas Pagadas: ${summary.cantidadCuotasEfectivas}`, 60, 105);
    doc.text(`Meses Activo: ${summary.mesesActivo}`, 110, 105);
    
    startY = 115;
  }

  // Installments Table
  doc.setFontSize(14);
  doc.text('Plan de Cuotas', 14, startY);

  const tableData = installments.map(cuota => [
    `${cuota.nroCuota}/${loan.cantidadCtas}`,
    formatDate(cuota.fecVto),
    formatCurrency(cuota.monto, loan.moneda),
    cuota.saldoPendiente ? formatCurrency(cuota.saldoPendiente, loan.moneda) : '-',
    cuota.idEstado === 2 ? 'Pagada' : cuota.idEstado === 1 ? 'Pendiente' : 'Vencida'
  ]);

  autoTable(doc, {
    head: [['Cuota', 'Vencimiento', 'Monto', 'Saldo', 'Estado']],
    body: tableData,
    startY: startY + 5,
    theme: 'grid',
    headStyles: { fillColor: [124, 58, 237], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: [245, 247, 250] }
  });

  doc.save(`Prestamo_${loan.idPrestamo}_${loan.dniPrestatario}.pdf`);
};

export interface ReciboNegocio {
  nombre: string;
  logoUrl?: string | null;
  rtn?: string | null;
}

/** Convierte una URL de imagen (p. ej. el logo del negocio en Storage) a data URL para poder embeberla en el PDF; null si falla (CORS, red, formato no soportado por jsPDF). */
export async function imageUrlToDataUrl(url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const format = blob.type === 'image/png' ? 'PNG' : blob.type === 'image/jpeg' ? 'JPEG' : null;
    if (!format) return null;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { dataUrl, format };
  } catch {
    return null;
  }
}

/** Comprobante de pago con membrete del negocio (nombre, logo, RTN) — cubre pagos de cuota, gasto administrativo y multa. */
export async function exportReciboPago(pago: PagoDetalle, negocio: ReciboNegocio): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const verde: [number, number, number] = [5, 150, 105];

  doc.setDrawColor(...verde);
  doc.setLineWidth(1);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10);

  doc.setFillColor(...verde);
  doc.rect(6, 6, pageWidth - 12, 25, 'F');

  const logo = negocio.logoUrl ? await imageUrlToDataUrl(negocio.logoUrl) : null;
  const textoInicioX = logo ? 32 : pageWidth / 2;
  const align = logo ? 'left' : 'center';
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, 10, 8, 18, 18);
    } catch {
      // si falla el embed, se sigue con el header solo de texto
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(negocio.nombre || 'CobraYA', textoInicioX, 16, { align });
  doc.setFontSize(9);
  doc.text('COMPROBANTE DE PAGO', textoInicioX, 23, { align });
  if (negocio.rtn) {
    doc.setFontSize(7);
    doc.text(`RTN: ${negocio.rtn}`, textoInicioX, 28, { align });
  }

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);

  doc.text('Nro. Comprobante:', 15, 45);
  doc.setFont('helvetica', 'bold');
  doc.text(`#${pago.id.slice(0, 8).toUpperCase()}`, 55, 45);
  doc.setFont('helvetica', 'normal');

  doc.text('Fecha:', 15, 52);
  doc.text(formatDate(pago.fechaPago), 55, 52);

  doc.setDrawColor(200);
  doc.line(15, 60, pageWidth - 15, 60);

  doc.text('Cliente:', 15, 70);
  doc.setFont('helvetica', 'bold');
  doc.text(pago.clienteNombre, 55, 70);
  doc.setFont('helvetica', 'normal');

  if (pago.clienteDocumento) {
    doc.text('Identidad:', 15, 77);
    doc.text(pago.clienteDocumento, 55, 77);
  }

  doc.line(15, 85, pageWidth - 15, 85);

  doc.text('Concepto:', 15, 95);
  doc.text(pago.concepto, 55, 95);

  doc.text('Medio de Pago:', 15, 102);
  doc.text(pago.medioPago, 55, 102);

  if (pago.descuento > 0) {
    doc.text('Descuento:', 15, 109);
    doc.text(formatCurrency(pago.descuento), 55, 109);
  }
  if (pago.recargo > 0) {
    doc.text('Recargo:', 15, pago.descuento > 0 ? 116 : 109);
    doc.text(formatCurrency(pago.recargo), 55, pago.descuento > 0 ? 116 : 109);
  }

  doc.setFillColor(245, 247, 250);
  doc.rect(15, 122, pageWidth - 30, 25, 'F');

  doc.setFontSize(12);
  doc.text('Total Pagado', pageWidth / 2, 130, { align: 'center' });
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...verde);
  doc.text(formatCurrency(pago.monto), pageWidth / 2, 141, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.setFontSize(8);
  doc.text('Este documento sirve como constancia de pago válida.', pageWidth / 2, pageHeight - 15, { align: 'center' });
  doc.text('Gracias por confiar en nosotros.', pageWidth / 2, pageHeight - 10, { align: 'center' });

  doc.save(`Recibo_${pago.id.slice(0, 8)}.pdf`);
}

/** Certificado de excedente para un socio de cooperativa — resume su cuota-parte del reparto de un período ya cerrado (Art. 43-44, Decreto 65-87). */
export async function exportCertificadoExcedente(
  periodo: ExcedentePeriodo,
  socio: ExcedenteDetalleSocio,
  negocio: ReciboNegocio,
  fondos: FondoExcedenteSnapshot[] = [],
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const verde: [number, number, number] = [5, 150, 105];

  doc.setDrawColor(...verde);
  doc.setLineWidth(1);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  doc.setFillColor(...verde);
  doc.rect(9, 9, pageWidth - 18, 32, 'F');

  const logo = negocio.logoUrl ? await imageUrlToDataUrl(negocio.logoUrl) : null;
  const textoInicioX = logo ? 40 : pageWidth / 2;
  const align = logo ? 'left' : 'center';
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, 15, 12, 22, 22);
    } catch {
      // si falla el embed, se sigue con el header solo de texto
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(negocio.nombre || 'CobraYA', textoInicioX, 21, { align });
  doc.setFontSize(11);
  doc.text('CERTIFICADO DE EXCEDENTE COOPERATIVO', textoInicioX, 29, { align });
  if (negocio.rtn) {
    doc.setFontSize(8);
    doc.text(`RTN: ${negocio.rtn}`, textoInicioX, 36, { align });
  }

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);

  let y = 52;
  doc.text('Socio:', 20, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`${socio.nombre} ${socio.apellido ?? ''}`.trim(), 55, y);
  doc.setFont('helvetica', 'normal');

  y += 8;
  doc.text('Período:', 20, y);
  doc.text(`${formatDate(periodo.fechaDesde)} — ${formatDate(periodo.fechaHasta)}`, 55, y);

  y += 8;
  doc.text('Fecha de emisión:', 20, y);
  doc.text(formatDate(periodo.createdAt), 55, y);

  y += 12;
  doc.setDrawColor(200);
  doc.line(20, y, pageWidth - 20, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Detalle del cálculo', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y += 8;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Concepto', 'Monto']],
    body: [
      ['Ingresos totales del período (intereses + multas + servicios)', formatCurrency(periodo.ingresosTotales)],
      ...fondos.map((f): [string, string] => [`${f.nombre} (${f.porcentaje}%)`, `- ${formatCurrency(f.monto)}`]),
      ['Excedente neto entre socios', formatCurrency(periodo.excedenteNeto)],
      ['Interés pagado por este socio en el período', formatCurrency(socio.interesPagado)],
      ['Proporción de este socio sobre el total', `${(socio.proporcion * 100).toFixed(2)}%`],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: verde },
    margin: { left: 20, right: 20 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 12;

  doc.setFillColor(245, 247, 250);
  doc.rect(20, finalY, pageWidth - 40, 26, 'F');

  doc.setFontSize(12);
  doc.text('Excedente correspondiente a este socio', pageWidth / 2, finalY + 9, { align: 'center' });
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...verde);
  doc.text(formatCurrency(socio.montoExcedente), pageWidth / 2, finalY + 21, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.setFontSize(8);
  doc.text(
    'Cálculo en proporción al uso de servicios de crédito (interés pagado por el socio) sobre el total del período,',
    pageWidth / 2,
    pageHeight - 20,
    { align: 'center' },
  );
  doc.text('conforme al Art. 43 y 44 de la Ley de Cooperativas de Honduras (Decreto 65-87).', pageWidth / 2, pageHeight - 15, { align: 'center' });

  doc.save(`Certificado_Excedente_${socio.nombre}_${periodo.fechaHasta}.pdf`);
}
