import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, FileDown, ChevronDown } from 'lucide-react';

// Import dinámico: xlsx/jspdf pesan ~230kB gzip entre las tres. Cargarlas solo al
// hacer clic evita que ese peso se sume al bundle de Préstamos/Pagos/Clientes,
// que ya se cargan de por sí vía React.lazy() (ver fix de "carga lenta" anterior).

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

interface ExportMenuProps<T> {
  data: T[] | undefined;
  columns: ExportColumn<T>[];
  filenameBase: string;
  title: string;
}

export function ExportMenu<T>({ data, columns, filenameBase, title }: ExportMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const buildRows = () => (data ?? []).map((row) => {
    const obj: Record<string, string | number> = {};
    columns.forEach((c) => { obj[c.header] = c.value(row); });
    return obj;
  });

  const handleExcel = async () => {
    const { exportToExcel } = await import('../../utils/excelGenerator');
    exportToExcel(buildRows(), filenameBase, filenameBase);
    setOpen(false);
  };

  const handleCSV = async () => {
    const { exportToCSV } = await import('../../utils/csvGenerator');
    exportToCSV(buildRows(), filenameBase);
    setOpen(false);
  };

  const handlePDF = async () => {
    const { exportToPDF } = await import('../../utils/pdfGenerator');
    const headers = columns.map((c) => c.header);
    const rows = (data ?? []).map((row) => columns.map((c) => String(c.value(row))));
    exportToPDF(title, headers, rows, filenameBase);
    setOpen(false);
  };

  const disabled = !data || data.length === 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm text-main hover:bg-surfaceHighlight transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Exportar</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && !disabled && (
        <div className="absolute right-0 mt-2 w-44 bg-surface border border-border rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95">
          <button onClick={handleExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-main hover:bg-surfaceHighlight transition-colors">
            <FileSpreadsheet className="h-4 w-4 text-emerald-500" /> Excel (.xlsx)
          </button>
          <button onClick={handleCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-main hover:bg-surfaceHighlight transition-colors">
            <FileDown className="h-4 w-4 text-blue-500" /> CSV
          </button>
          <button onClick={handlePDF} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-main hover:bg-surfaceHighlight transition-colors">
            <FileText className="h-4 w-4 text-red-500" /> PDF
          </button>
        </div>
      )}
    </div>
  );
}
