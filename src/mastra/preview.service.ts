import { Injectable, Logger } from '@nestjs/common';
import { PaymentLinkImageGenerator, PaymentPreviewData } from './tools/image-generator';

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);

  async generatePaymentPreview(data: PaymentPreviewData): Promise<string> {
    try {
      this.logger.log(`Generating preview image for payment: ${data.name}`);
      
      const previewImage = await PaymentLinkImageGenerator.generatePaymentPreview(data);
      
      this.logger.log(`Preview image generated successfully for: ${data.name}`);
      return previewImage;
    } catch (error) {
      this.logger.error('Error generating preview image:', error);
      throw error;
    }
  }

  async generateOpenGraphMetaTags(
    linkUrl: string, 
    data: PaymentPreviewData, 
    previewImageUrl?: string
  ): Promise<string> {
    const title = `Payment Request: ${data.name}`;
    const description = `Pay ${data.amount} ${data.token} - Secure cryptocurrency payment via Mantle Network`;
    const siteName = 'Mantle Crypto Payments';

    return `
      <!-- Open Graph Meta Tags -->
      <meta property="og:title" content="${title}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:url" content="${linkUrl}" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="${siteName}" />
      ${previewImageUrl ? `<meta property="og:image" content="${previewImageUrl}" />` : ''}
      ${previewImageUrl ? `<meta property="og:image:width" content="800" />` : ''}
      ${previewImageUrl ? `<meta property="og:image:height" content="600" />` : ''}
      ${previewImageUrl ? `<meta property="og:image:type" content="image/svg+xml" />` : ''}
      
      <!-- Twitter Card Meta Tags -->
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${title}" />
      <meta name="twitter:description" content="${description}" />
      ${previewImageUrl ? `<meta name="twitter:image" content="${previewImageUrl}" />` : ''}
      
      <!-- Additional Meta Tags -->
      <meta name="description" content="${description}" />
      <meta name="keywords" content="crypto, payment, ${data.token}, mantle, blockchain, cryptocurrency" />
    `.trim();
  }

  generatePaymentPageHTML(
    linkUrl: string, 
    data: PaymentPreviewData, 
    previewImageUrl?: string,
    qrCodeDataUrl?: string
  ): string {
    const metaTags = this.generateOpenGraphMetaTags(linkUrl, data, previewImageUrl);
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Request: ${data.name}</title>
    
    ${metaTags}
    
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #1a1b23 0%, #111827 100%);
            color: #ffffff;
            min-height: 100vh;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: #2d2e3f;
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .header {
            font-size: 2rem;
            margin-bottom: 20px;
            color: #3b82f6;
        }
        .title {
            font-size: 1.8rem;
            margin-bottom: 30px;
            font-weight: bold;
        }
        .amount {
            font-size: 3rem;
            font-weight: bold;
            margin: 30px 0;
            color: #10b981;
        }
        .token-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 1.2rem;
            font-weight: bold;
            margin-left: 10px;
        }
        .usdc { background-color: #2775ca; }
        .usdt { background-color: #26a17b; }
        .dai { background-color: #f5ac37; color: #000; }
        .qr-section {
            margin: 40px 0;
            padding: 30px;
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
        }
        .qr-code {
            max-width: 200px;
            margin: 20px auto;
        }
        .wallet-info {
            margin-top: 30px;
            padding: 20px;
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            font-size: 0.9rem;
            color: #9ca3af;
        }
        .pay-button {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            margin-top: 20px;
            transition: background 0.3s;
        }
        .pay-button:hover {
            background: #2563eb;
        }
        .preview-image {
            max-width: 100%;
            height: auto;
            margin: 20px 0;
            border-radius: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">💳 Payment Request</div>
        <div class="title">${data.name}</div>
        
        ${previewImageUrl ? `<img src="${previewImageUrl}" alt="Payment Preview" class="preview-image" />` : ''}
        
        <div class="amount">
            ${data.amount}
            <span class="token-badge ${data.token.toLowerCase()}">${data.token}</span>
        </div>
        
        ${qrCodeDataUrl ? `
        <div class="qr-section">
            <h3>📱 Scan to Pay</h3>
            <img src="${qrCodeDataUrl}" alt="QR Code" class="qr-code" />
            <p>Scan this QR code with your crypto wallet to make the payment</p>
        </div>
        ` : ''}
        
        <button class="pay-button" onclick="connectWallet()">
            🚀 Pay with Crypto Wallet
        </button>
        
        ${data.walletAddress ? `
        <div class="wallet-info">
            <strong>Recipient Wallet:</strong><br>
            <code>${data.walletAddress}</code>
        </div>
        ` : ''}
        
        <div class="wallet-info">
            <strong>🔒 Secure Payment</strong><br>
            Powered by Mantle Network - Your transaction is secured by blockchain technology
        </div>
    </div>
    
    <script>
        function connectWallet() {
            // Add wallet connection logic here
            alert('Connect your crypto wallet to complete the payment of ${data.amount} ${data.token}');
        }
    </script>
</body>
</html>
    `.trim();
  }
}