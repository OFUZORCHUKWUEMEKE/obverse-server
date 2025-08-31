// Test script to demonstrate payment link tracking functionality
// This shows how merchants can track their payment links

const testPaymentLinkData = {
  linkId: "ABC123XY",
  title: "Coffee Shop Order",
  token: "USDC", 
  amount: "10.50",
  status: "active",
  payments: [
    {
      payerAddress: "0x1234567890123456789012345678901234567890",
      amount: "10.50",
      transactionHash: "0xabcdef...",
      paidAt: new Date("2024-01-15")
    },
    {
      payerAddress: "0x9876543210987654321098765432109876543210", 
      amount: "10.50",
      transactionHash: "0x123456...",
      paidAt: new Date("2024-01-14")
    }
  ],
  viewCount: 25,
  currentUses: 2,
  maxUses: 10,
  totalAmountReceived: "21.00"
};

function demonstrateTracking() {
  console.log("🔍 PAYMENT LINK TRACKING DEMO");
  console.log("=" .repeat(50));
  
  // Natural language examples
  console.log("\n📝 Natural Language Queries:");
  console.log("1. 'Show payment link statistics'");
  console.log("2. 'How many transactions on ABC123XY?'");
  console.log("3. 'Track my payment links'");
  
  // Command examples
  console.log("\n⌨️  Command Examples:");
  console.log("1. /linkstats");
  console.log("2. /linkstats ABC123XY");
  
  // Expected response format
  console.log("\n📊 Example Response:");
  console.log(`
📊 **Payment Link Statistics**

🔗 **Link:** ${testPaymentLinkData.title}
🆔 **ID:** \`${testPaymentLinkData.linkId}\`
🟢 **Status:** ${testPaymentLinkData.status}
🔵 **Token:** ${testPaymentLinkData.token}
💰 **Amount:** ${testPaymentLinkData.amount} ${testPaymentLinkData.token}

📈 **Transaction Summary:**
• **Total Transactions:** ${testPaymentLinkData.payments.length}
• **Uses:** ${testPaymentLinkData.currentUses}/${testPaymentLinkData.maxUses}
• **Total Received:** ${testPaymentLinkData.totalAmountReceived} ${testPaymentLinkData.token}
• **View Count:** ${testPaymentLinkData.viewCount}

💸 **Recent Transactions:**
${testPaymentLinkData.payments.map((payment, index) => {
    const shortAddress = `${payment.payerAddress.slice(0, 6)}...${payment.payerAddress.slice(-4)}`;
    const date = payment.paidAt.toLocaleDateString();
    return `${index + 1}. ${payment.amount} ${testPaymentLinkData.token} from ${shortAddress} on ${date}`;
  }).join('\n')}

🔗 **Link URL:** https://www.obverse.cc/pay/${testPaymentLinkData.linkId}
  `);
  
  console.log("\n✅ Features Available:");
  console.log("• Real-time transaction tracking");
  console.log("• Payment history with addresses");
  console.log("• View analytics");
  console.log("• Usage statistics");
  console.log("• Multi-link overview");
  console.log("• Secure (only your links)");
}

// Run the demo
demonstrateTracking();

module.exports = {
  demonstrateTracking,
  testPaymentLinkData
};