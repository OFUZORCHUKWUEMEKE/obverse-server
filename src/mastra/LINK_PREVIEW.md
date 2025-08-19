# Payment Link Preview Feature

This document describes the comprehensive link preview system for cryptocurrency payment links.

## Overview

The payment link preview feature generates beautiful, social media-ready preview images and meta tags for cryptocurrency payment requests. When users share payment links on platforms like Telegram, Twitter, Discord, or any social media, they get rich previews with professional branding.

## Features

### 🎨 Visual Preview Generation

- **SVG-based preview images** - Scalable, crisp graphics that work on all devices
- **Token-specific branding** - Each cryptocurrency has its own color scheme:
  - 🔵 USDC - Professional blue (#2775ca)
  - 🟢 USDT - Tether green (#26a17b)  
  - 🟡 DAI - DAI yellow/gold (#f5ac37)
- **Professional design** - Dark theme with gradients and modern typography
- **QR code integration** - Visual QR code representation for mobile scanning
- **Responsive layouts** - Optimized for both mobile and desktop viewing

### 🌐 Open Graph & SEO Integration

- **Dynamic meta tags** - Automatically generated based on payment details
- **Twitter Card support** - Rich previews on Twitter and other social platforms
- **SEO optimization** - Proper meta descriptions and keywords
- **Social sharing ready** - Perfect previews when shared on any platform

### 📱 API Endpoints

#### Preview Image Endpoint
```
GET /preview/payment/{linkId}/image
```
- Returns SVG preview image for the payment link
- Content-Type: `image/svg+xml`
- Cacheable and optimized for CDN delivery

#### Payment Page Endpoint  
```
GET /preview/payment/{linkId}
```
- Returns full HTML page with Open Graph meta tags
- Includes embedded preview image
- Mobile-responsive payment interface
- Ready for social media crawlers

#### Test Endpoint
```
GET /preview/test/{linkId}
```
- Development endpoint for testing preview generation
- Returns JSON with preview data and image
- Useful for debugging and development

## Technical Implementation

### Core Components

1. **PaymentLinkImageGenerator** (`tools/image-generator.ts`)
   - Generates SVG-based preview images
   - Token-specific color schemes and emojis
   - Responsive design with proper typography

2. **PreviewService** (`preview.service.ts`)
   - Business logic for preview generation
   - Open Graph meta tag creation
   - HTML template generation for payment pages

3. **MastraController** (`mastra.controller.ts`)
   - HTTP endpoints for serving previews
   - Database integration for payment link data
   - Error handling and 404 responses

### Database Integration

The system automatically fetches payment link details from the database using the `linkId` parameter, including:
- Payment name/title
- Token type and amount  
- Creator wallet information
- Link status and metadata

### Environment Configuration

Set the `BASE_URL` environment variable to ensure correct preview URLs:
```bash
BASE_URL=https://your-domain.com
```

## Usage Examples

### Creating a Payment Link with Preview

When users create payment links through the Telegram bot or API:

```javascript
// Payment link creation returns preview URLs
{
  "success": true,
  "data": {
    "linkId": "ABC12345",
    "linkUrl": "https://your-domain.com/preview/payment/ABC12345",
    "previewImageUrl": "https://your-domain.com/preview/payment/ABC12345/image",
    "qrCodeDataUrl": "data:image/png;base64,..."
  }
}
```

### Social Media Sharing

When the payment link is shared on social media, platforms automatically detect:

```html
<!-- Automatically generated meta tags -->
<meta property="og:title" content="Payment Request: Coffee Shop Order" />
<meta property="og:description" content="Pay 5.50 USDC - Secure cryptocurrency payment via Mantle Network" />
<meta property="og:image" content="https://your-domain.com/preview/payment/ABC12345/image" />
<meta property="og:url" content="https://your-domain.com/preview/payment/ABC12345" />
```

### Mobile Wallet Integration

The payment page includes:
- QR code for mobile wallet scanning
- "Connect Wallet" button for web3 integration
- Responsive design for mobile devices
- Security messaging and branding

## Telegram Integration

The link preview system is fully integrated with the Telegram bot:

### Message Enhancement
- Payment link messages include preview URLs
- Users can share links that show rich previews
- QR codes are embedded alongside preview images

### Bot Commands
- `/payment` command creates links with preview generation
- Balance checks include preview-ready formatting
- All responses optimized for social sharing

## Design Specifications

### Preview Image Dimensions
- **Size**: 800x600 pixels (4:3 aspect ratio)
- **Format**: SVG for scalability
- **Theme**: Dark with gradient backgrounds
- **Typography**: Arial/system fonts for compatibility

### Color Scheme
- **Background**: Dark gradient (#1a1b23 to #111827)
- **Card**: Semi-transparent dark (#2d2e3f)
- **Text**: White (#ffffff) and light gray (#9ca3af)
- **Accent**: Blue (#3b82f6) and brand colors per token

### Layout Elements
- Header with payment emoji and title
- Large, prominent amount display
- Token indicator with emoji and color
- QR code section (when available)
- Wallet address (truncated for readability)
- Mantle Network branding footer

## Security Considerations

- **No sensitive data** - Preview images contain only public payment information
- **Rate limiting** - Implement rate limiting on preview endpoints
- **Validation** - All payment link IDs are validated before processing
- **Error handling** - Graceful fallbacks for invalid or expired links

## Performance Optimization

- **SVG format** - Lightweight, scalable images
- **Caching headers** - Proper HTTP caching for CDN integration
- **Lazy generation** - Preview images generated on-demand
- **Error boundaries** - Fallback responses for edge cases

## Deployment Considerations

1. **Environment Variables**
   ```bash
   BASE_URL=https://your-production-domain.com
   ```

2. **CDN Integration** (Recommended)
   - Serve preview images through CDN for better performance
   - Cache preview endpoints with appropriate TTL

3. **SSL/HTTPS**
   - Required for social media platforms to fetch previews
   - Ensures secure image serving

4. **Monitoring**
   - Track preview endpoint usage
   - Monitor error rates and performance
   - Log social media crawler activity

## Future Enhancements

### Planned Features
- **Custom branding** - Allow users to upload custom logos
- **Animation support** - Subtle animations in SVG previews  
- **Multiple formats** - PNG/JPEG alternatives for broader compatibility
- **Template system** - Multiple preview design templates
- **Analytics** - Track preview views and social shares

### Integration Opportunities
- **Link shortening** - Integration with URL shorteners
- **QR code styling** - Custom QR code designs per token
- **Multi-language** - Localized previews based on user language
- **White label** - Custom branding for different deployments

## Testing

### Manual Testing
1. Create a payment link through Telegram bot
2. Share the link on various social platforms
3. Verify preview images load correctly
4. Test on mobile and desktop devices

### Automated Testing
```javascript
// Test preview generation
const testData = {
  name: "Test Payment",
  amount: "100.00",
  token: "USDC",
  walletAddress: "0x1234...5678"
};

const preview = await PaymentLinkImageGenerator.generatePaymentPreview(testData);
expect(preview).toContain('<svg');
```

### Platform Testing
Test link previews on:
- ✅ Telegram
- ✅ Discord  
- ✅ Twitter/X
- ✅ WhatsApp
- ✅ Facebook
- ✅ LinkedIn
- ✅ Slack

## Support & Troubleshooting

### Common Issues

**Preview not showing on social media:**
- Verify BASE_URL is set correctly
- Check HTTPS is enabled
- Ensure link is publicly accessible
- Test with platform-specific debuggers

**Image not loading:**
- Check SVG syntax in generated images
- Verify endpoint returns correct content-type
- Test image URL directly in browser

**Database errors:**
- Ensure payment link exists in database
- Check MongoDB connection
- Verify link ID format and validation

### Debugging Tools

**Social Media Debuggers:**
- Facebook Sharing Debugger
- Twitter Card Validator  
- LinkedIn Post Inspector
- Telegram Instant View Editor

**Local Testing:**
```bash
# Test preview endpoint
curl https://your-domain.com/preview/payment/ABC12345

# Test image endpoint  
curl https://your-domain.com/preview/payment/ABC12345/image
```

---

The payment link preview feature transforms simple payment requests into professional, shareable experiences that build trust and encourage user engagement across all social platforms.