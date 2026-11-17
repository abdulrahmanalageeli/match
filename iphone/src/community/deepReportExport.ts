import { Capacitor, registerPlugin } from '@capacitor/core';

const reportExport = registerPlugin<{ save(options: { html: string }): Promise<void> }>('WudaynReportExport');

/** Native: local PDF + Save to Files. Web: standalone, printable HTML. No upload. */
export async function saveDeepReport(html: string) {
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('WudaynReportExport')) throw Error('حدّث تطبيق وُدَين لحفظ التقرير على جهازك.');
    await reportExport.save({ html });
    return;
  }
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'wudayn-deep-analysis.html';
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
