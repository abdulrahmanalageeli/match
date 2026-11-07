/** The invitation URL stays on this device; no external QR service receives it. */
export async function qrDataUrl(url: string): Promise<string> {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(url, { width: 260, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#5a0f28', light: '#fffaf3' } });
}
