/**
 * CancharClub - Utilidad Universal de Exportación (Excel / CSV y Reportes PDF Limpios)
 */

export interface ExportData {
  title: string
  subtitle?: string
  headers: string[]
  rows: (string | number)[][]
  filename?: string
  summaryKpis?: { label: string; value: string }[]
}

/**
 * Exporta datos a CSV compatible nativamente con Microsoft Excel (BOM UTF-8 + separador ;)
 */
export function exportToCsv({ filename = 'reporte-cancharclub.csv', headers, rows }: ExportData) {
  if (typeof window === 'undefined') return

  const cleanRows = rows.map((row) =>
    row
      .map((cell) => {
        const val = String(cell ?? '').replace(/"/g, '""')
        return `"${val}"`
      })
      .join(';')
  )

  const csvContent = '\uFEFF' + [headers.map((h) => `"${h}"`).join(';'), ...cleanRows].join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Abre una ventana de impresión limpia y estilizada para guardar como PDF o imprimir en papel A4
 */
export function printCleanPdfReport({
  title,
  subtitle = 'Generado automáticamente por CancharClub',
  headers,
  rows,
  summaryKpis = [],
}: ExportData) {
  if (typeof window === 'undefined') return

  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) {
    alert('Por favor permití las ventanas emergentes para generar el PDF.')
    return
  }

  const kpisHtml = summaryKpis.length > 0
    ? `
      <div style="display: flex; gap: 16px; margin-bottom: 24px;">
        ${summaryKpis.map(kpi => `
          <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc;">
            <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">${kpi.label}</div>
            <div style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 4px;">${kpi.value}</div>
          </div>
        `).join('')}
      </div>
    `
    : ''

  const tableHeaderHtml = `
    <tr>
      ${headers.map(h => `<th style="padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; background: #0f172a; color: #ffffff; border: 1px solid #0f172a;">${h}</th>`).join('')}
    </tr>
  `

  const tableRowsHtml = rows.map((row, idx) => `
    <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      ${row.map(cell => `<td style="padding: 8px 12px; font-size: 12px; color: #334155; border: 1px solid #e2e8f0;">${cell}</td>`).join('')}
    </tr>
  `).join('')

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>${title} - CancharClub</title>
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #059669; padding-bottom: 16px; margin-bottom: 20px; }
        .logo { font-size: 20px; font-weight: 900; color: #059669; letter-spacing: -0.5px; }
        .logo span { color: #0f172a; }
        .date { font-size: 11px; color: #64748b; margin-top: 4px; }
        h1 { font-size: 22px; font-weight: 800; margin: 0 0 4px 0; color: #0f172a; }
        p.subtitle { font-size: 12px; color: #64748b; margin: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>${title}</h1>
          <p class="subtitle">${subtitle}</p>
        </div>
        <div style="text-align: right;">
          <div class="logo">Canchar<span>Club</span></div>
          <div class="date">Fecha de emisión: ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>

      ${kpisHtml}

      <table>
        <thead>${tableHeaderHtml}</thead>
        <tbody>${tableRowsHtml}</tbody>
      </table>

      <div class="footer">
        <span>CancharClub Software de Gestión Deportiva</span>
        <span>Documento oficial para control administrativo</span>
      </div>

      <script>
        window.onload = function() {
          window.print();
        }
      </script>
    </body>
    </html>
  `

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}
