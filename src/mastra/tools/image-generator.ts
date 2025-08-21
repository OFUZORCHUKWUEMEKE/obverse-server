// Image generation utility for payment link previews using SVG

export interface PaymentPreviewData {
  name: string;
  amount: string;
  token: 'USDC' | 'USDT' | 'DAI';
  walletAddress?: string;
  qrCodeDataUrl?: string;
}

export class PaymentLinkImageGenerator {
  private static readonly CANVAS_WIDTH = 800;
  private static readonly CANVAS_HEIGHT = 600;
  private static readonly COLORS = {
    background: '#1a1b23',
    cardBackground: '#2d2e3f',
    primary: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    text: '#ffffff',
    textSecondary: '#9ca3af',
    accent: '#6366f1',
  };

  private static getTokenColor(token: string): string {
    switch (token) {
      case 'USDC':
        return '#2775ca';
      case 'USDT':
        return '#26a17b';
      case 'DAI':
        return '#f5ac37';
      default:
        return this.COLORS.primary;
    }
  }

  private static getTokenEmoji(token: string): string {
    switch (token) {
      case 'USDC':
        return '🔵';
      case 'USDT':
        return '🟢';
      case 'DAI':
        return '🟡';
      default:
        return '💰';
    }
  }

  static async generatePaymentPreview(
    data: PaymentPreviewData,
  ): Promise<string> {
    // Generate SVG-based preview image that can be converted to PNG or used directly
    return this.generateSimplePreview(data);
  }

  private static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  // Alternative method using HTML Canvas API for server-side rendering
  static async generateSimplePreview(
    data: PaymentPreviewData,
  ): Promise<string> {
    // Return a data URL for a simple SVG-based preview image
    const svg = `
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1a1b23;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#111827;stop-opacity:1" />
          </linearGradient>
        </defs>
        
        <!-- Background -->
        <rect width="800" height="600" fill="url(#bg)"/>
        
        <!-- Card -->
        <rect x="50" y="50" width="700" height="500" rx="20" fill="#2d2e3f"/>
        
        <!-- Header -->
        <text x="400" y="120" text-anchor="middle" fill="#ffffff" font-size="32" font-family="Arial" font-weight="bold">💳 Payment Request</text>
        
        <!-- Title -->
        <text x="400" y="180" text-anchor="middle" fill="#ffffff" font-size="28" font-family="Arial" font-weight="bold">${data.name}</text>
        
        <!-- Token Circle -->
        <circle cx="340" cy="250" r="25" fill="${this.getTokenColor(data.token)}"/>
        <text x="340" y="260" text-anchor="middle" fill="#ffffff" font-size="24" font-family="Arial">${this.getTokenEmoji(data.token)}</text>
        
        <!-- Amount -->
        <text x="380" y="265" fill="#ffffff" font-size="48" font-family="Arial" font-weight="bold">${data.amount} ${data.token}</text>
        
        <!-- Divider -->
        <line x1="100" y1="320" x2="700" y2="320" stroke="#9ca3af" stroke-width="2"/>
        
        <!-- QR Code placeholder -->
        <rect x="350" y="380" width="100" height="100" rx="8" fill="#ffffff"/>
        <text x="400" y="360" text-anchor="middle" fill="#9ca3af" font-size="18" font-family="Arial">📱 Scan to Pay</text>
        
        <!-- Footer -->
        <text x="400" y="520" text-anchor="middle" fill="#9ca3af" font-size="14" font-family="Arial">
          ${data.walletAddress ? `Wallet: ${data.walletAddress.slice(0, 8)}...${data.walletAddress.slice(-6)}` : ''}
        </text>
        
        <!-- Branding -->
        <text x="400" y="560" text-anchor="middle" fill="#6366f1" font-size="16" font-family="Arial" font-weight="bold">🚀 Powered by Mantle Network</text>
      </svg>
    `;

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
}
