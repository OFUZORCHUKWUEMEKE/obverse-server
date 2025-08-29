export function formatPaymentTrackingReport(data: any): string {
  let response = `📊 **PAYMENT ANALYTICS REPORT**\n`;
  response += `═══════════════════════════════════\n\n`;
  
  // Executive Summary Section
  response += `📈 **Executive Summary** (${data.summary.timeframe.toUpperCase()})\n`;
  response += `┌─────────────────────────────────────┐\n`;
  response += `│ Payment Links        │ ${data.summary.totalPaymentLinks.toString().padStart(12)} │\n`;
  response += `│ Total Transactions   │ ${data.summary.totalTransactions.toString().padStart(12)} │\n`;
  response += `│ Revenue Generated    │ $${data.summary.totalAmountReceived.padStart(11)} │\n`;
  response += `│ Total Page Views     │ ${data.summary.totalViews.toString().padStart(12)} │\n`;
  response += `│ Conversion Rate      │ ${data.summary.overallConversionRate.padStart(9)}% │\n`;
  response += `│ Avg. Transaction     │ $${data.summary.averageTransactionAmount.padStart(11)} │\n`;
  response += `└─────────────────────────────────────┘\n\n`;
  
  // Performance Insights Section
  if (data.insights && data.insights.length > 0) {
    response += `💡 **Performance Insights**\n`;
    response += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    data.insights.slice(0, 3).forEach((insight: string, index: number) => {
      response += `${String(index + 1).padStart(2)}. ${insight}\n`;
    });
    response += `\n`;
  }
  
  // Top Performing Links Section
  if (data.paymentLinks && data.paymentLinks.length > 0) {
    response += `🔗 **Top Performing Payment Links**\n`;
    response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    data.paymentLinks.slice(0, 3).forEach((link: any, index: number) => {
      const statusEmoji = link.status === 'active' ? '🟢' : '🔴';
      const tokenEmoji = getTokenEmoji(link.token);
      response += `**${index + 1}. ${link.title}**\n`;
      response += `   📋 Link ID: \`${link.linkId}\`\n`;
      response += `   ${statusEmoji} Status: ${link.status.toUpperCase()}  ${tokenEmoji} Revenue: $${link.metrics.totalAmountReceived}\n`;
      response += `   📊 Transactions: ${link.metrics.totalTransactions} | 👁️ Views: ${link.metrics.viewCount} | 📈 Conversion: ${link.metrics.conversionRate}%\n\n`;
    });
  }
  
  // Recent Transaction Activity Section
  if (data.recentTransactions && data.recentTransactions.length > 0) {
    response += `💸 **Recent Transaction Activity**\n`;
    response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    data.recentTransactions.slice(0, 3).forEach((tx: any, index: number) => {
      const date = new Date(tx.paidAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      const time = new Date(tx.paidAt).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const shortAddress = tx.payerAddress ? `${tx.payerAddress.slice(0, 6)}...${tx.payerAddress.slice(-4)}` : 'Unknown';
      response += `**${index + 1}.** ${tx.linkTitle}\n`;
      response += `   💰 Amount: $${tx.amount} | 👤 From: \`${shortAddress}\`\n`;
      response += `   📅 Date: ${date} at ${time}\n`;
      if (tx.transactionHash) {
        response += `   🔗 Hash: \`${tx.transactionHash.slice(0, 12)}...\`\n`;
      }
      response += `\n`;
    });
  } else {
    response += `💸 **Recent Transaction Activity**\n`;
    response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    response += `No recent transactions found for the selected timeframe.\n\n`;
  }
  
  // Footer with action items
  response += `═══════════════════════════════════\n`;
  response += `📋 **Quick Actions:**\n`;
  response += `• View specific link: "payment link info [linkId]"\n`;
  response += `• Create new link: "create payment link"\n`;
  response += `• Change timeframe: "track payments 7d" or "24h"\n`;
  response += `\n📊 *Report generated on ${new Date().toLocaleString('en-US')}*`;
  
  return response;
}

function getTokenEmoji(token: string): string {
  const tokenEmojis: { [key: string]: string } = {
    USDC: '🔵',
    USDT: '🟢',
    DAI: '🟡',
    MNT: '🔷',
  };
  return tokenEmojis[token] || '🪙';
}