# 📊 Complete Payment Link Data API

## ✅ **Enhanced Features**

I've added comprehensive methods that return **both formatted text responses AND full payment link data** with enhanced statistics and analytics.

## 🚀 **New Methods Available**

### **1. Get Single Payment Link with Full Data**
```typescript
// Through MastraService
const result = await mastraService.getPaymentLinkFullStats(linkId, telegramUserId);

// Response structure:
{
  response: string,     // Formatted text for display
  linkData: {           // Full link object with enhanced stats
    // All original payment link fields
    _id: ObjectId,
    linkId: string,
    title: string,
    amount: string,
    token: string,
    status: string,
    payments: [],
    viewCount: number,
    linkUrl: string,
    // ... all other payment link fields
    
    // Enhanced statistics
    stats: {
      totalTransactions: number,
      totalAmountReceived: string,
      currentUses: number,
      maxUses: number,
      conversionRate: string,      // Percentage of views that converted
      averageTransactionAmount: string
    }
  },
  success: boolean
}
```

### **2. Get All Payment Links with Full Data**
```typescript
// Through MastraService
const result = await mastraService.getAllPaymentLinksFullStats(telegramUserId);

// Response structure:
{
  response: string,     // Formatted text for display
  linksData: [          // Array of all payment links with stats
    {
      // All original payment link fields
      _id: ObjectId,
      linkId: string,
      title: string,
      amount: string,
      token: string,
      status: string,
      payments: [],
      // ... all other fields
      
      // Enhanced statistics
      stats: {
        totalTransactions: number,
        totalAmountReceived: string,
        currentUses: number,
        maxUses: number,
        viewCount: number,
        conversionRate: string,
        averageTransactionAmount: string,
        status: string,
        isActive: boolean,
        createdAt: Date,
        updatedAt: Date
      }
    }
    // ... more links
  ],
  success: boolean
}
```

### **3. Get Raw Payment Link Data Only**
```typescript
// Get all payment links (raw data)
const links = await mastraService.getPaymentLinksRawData(telegramUserId);
// Returns: PaymentLink[] | null

// Get specific payment link (raw data)
const link = await mastraService.getPaymentLinkRawData(linkId, telegramUserId);
// Returns: PaymentLink | null
```

## 📈 **Enhanced Statistics Included**

Each payment link now includes these calculated statistics:

```typescript
stats: {
  totalTransactions: number,        // Count of successful payments
  totalAmountReceived: string,      // Total amount received
  currentUses: number,              // Current usage count
  maxUses: number,                  // Maximum allowed uses
  viewCount: number,                // Number of times link was viewed
  conversionRate: string,           // (transactions/views) * 100
  averageTransactionAmount: string, // Average amount per transaction
  status: string,                   // Current link status
  isActive: boolean,                // Quick active status check
  createdAt: Date,                  // Creation timestamp
  updatedAt: Date                   // Last update timestamp
}
```

## 🔍 **Usage Examples**

### **Example 1: Get Full Stats for Display + API**
```typescript
import { MastraService } from './mastra/mastra.service';

async function getPaymentLinkAnalytics(linkId: string, userId: string) {
  const result = await mastraService.getAllPaymentLinksFullStats(userId);
  
  if (result.success && result.linksData) {
    // Display formatted text to user
    console.log(result.response);
    
    // Use raw data for API/analytics
    result.linksData.forEach(link => {
      console.log(`Link: ${link.title}`);
      console.log(`Conversion Rate: ${link.stats.conversionRate}%`);
      console.log(`Revenue: ${link.stats.totalAmountReceived} ${link.token}`);
      console.log(`Performance: ${link.stats.totalTransactions}/${link.stats.viewCount}`);
      console.log(`Full URL: ${link.linkUrl}`);
      
      // Access all payment details
      if (link.payments && link.payments.length > 0) {
        link.payments.forEach(payment => {
          console.log(`Payment: ${payment.amount} from ${payment.payerAddress} on ${payment.paidAt}`);
        });
      }
    });
  }
}
```

### **Example 2: Track Specific Link Performance**
```typescript
async function trackLinkPerformance(linkId: string, userId: string) {
  const result = await mastraService.getPaymentLinkFullStats(linkId, userId);
  
  if (result.success && result.linkData) {
    const link = result.linkData;
    
    // Display to user
    console.log(result.response);
    
    // Analytics processing
    const analytics = {
      linkId: link.linkId,
      title: link.title,
      totalRevenue: parseFloat(link.stats.totalAmountReceived),
      conversionRate: parseFloat(link.stats.conversionRate),
      averageTransaction: parseFloat(link.stats.averageTransactionAmount),
      isPerformingWell: parseFloat(link.stats.conversionRate) > 5, // 5% conversion threshold
      
      // Full payment history
      paymentHistory: link.payments || [],
      
      // Link details
      fullUrl: link.linkUrl,
      qrCodeUrl: link.qrCodeUrl,
      expiresAt: link.expiresAt,
      
      // Customer data collected
      customerFields: link.details || {},
      
      // Metadata
      source: link.metadata?.source,
      createdAt: link.createdAt
    };
    
    return analytics;
  }
  
  return null;
}
```

### **Example 3: Generate Business Reports**
```typescript
async function generateBusinessReport(userId: string) {
  const result = await mastraService.getAllPaymentLinksFullStats(userId);
  
  if (result.success && result.linksData) {
    const links = result.linksData;
    
    const report = {
      summary: {
        totalLinks: links.length,
        activeLinks: links.filter(l => l.stats.isActive).length,
        totalRevenue: links.reduce((sum, l) => sum + parseFloat(l.stats.totalAmountReceived), 0),
        totalTransactions: links.reduce((sum, l) => sum + l.stats.totalTransactions, 0),
        totalViews: links.reduce((sum, l) => sum + l.stats.viewCount, 0)
      },
      
      topPerformers: links
        .sort((a, b) => parseFloat(b.stats.conversionRate) - parseFloat(a.stats.conversionRate))
        .slice(0, 5)
        .map(link => ({
          title: link.title,
          linkId: link.linkId,
          conversionRate: link.stats.conversionRate,
          revenue: link.stats.totalAmountReceived,
          token: link.token
        })),
      
      recentActivity: links
        .filter(l => l.payments && l.payments.length > 0)
        .flatMap(l => l.payments.map(p => ({
          linkTitle: l.title,
          linkId: l.linkId,
          amount: p.amount,
          token: l.token,
          payer: p.payerAddress,
          date: p.paidAt
        })))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10)
    };
    
    return report;
  }
  
  return null;
}
```

## 🎯 **Key Benefits**

✅ **Complete Data Access**: Get both user-friendly text AND full structured data
✅ **Enhanced Analytics**: Conversion rates, averages, performance metrics
✅ **Transaction Details**: Full payment history with payer addresses and timestamps
✅ **Business Intelligence**: Ready for reports, dashboards, and analytics
✅ **Flexible Usage**: Use text for display, data for processing
✅ **Security**: Only returns data for payment links owned by the user
✅ **Performance**: Optimized queries with sorting and error handling

## 🚀 **Ready to Use**

All methods are now available through the `MastraService` and can be injected into your controllers, services, or used directly in the Telegram handlers.

The system now returns **complete payment link data** with comprehensive statistics, making it perfect for:
- Business dashboards
- Analytics reports  
- API responses
- Mobile app integration
- Advanced merchant features

**Try it now with any of the new methods!** 🎉