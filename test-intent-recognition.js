// Test intent recognition for payment link statistics
const testMessages = [
  "Show me all my payment link statistics",
  "show payment link stats",
  "payment link statistics", 
  "my payment link statistics",
  "view payment link stats",
  "track payment links",
  "show my balance", // Should still match balance
  "what's my balance", // Should match balance
];

const patterns = {
  payment_link_stats: [
    /\b(payment.*link.*stat|link.*stat|track.*payment.*link|payment.*link.*transaction)\b/i,
    /\b(how.*many.*transaction|total.*transaction.*link|payment.*link.*analytics)\b/i,
    /\b(link.*performance|payment.*received.*link)\b/i,
    /\b(show.*payment.*link.*stat|show.*link.*stat|show.*all.*payment.*link)\b/i,
    /\b(my.*payment.*link.*stat|all.*my.*payment.*link)\b/i,
    /\b(payment.*link.*overview|link.*overview|statistics.*payment.*link)\b/i,
    /\b(view.*payment.*link.*stat|display.*payment.*link)\b/i,
    /\b(payment.*link.*statistics|statistics.*payment.*link)\b/i,
    /\b(track.*payment.*links?|track.*links?)\b/i,
    /\b(show.*payment.*link|view.*payment.*link)\b/i,
  ],
  balance_check: [
    /\b(balance|wallet|how much|check)\b/i,
    /\b(show.*balance|show.*wallet)\b/i,
    /\b(my.*balance|account|funds|money)\b/i,
    /\b(usdc|usdt|dai|mnt).*balance\b/i,
    /\b(what.*have)\b/i,
  ],
};

function testIntentRecognition() {
  console.log("🧪 TESTING INTENT RECOGNITION\n");
  
  testMessages.forEach((message, index) => {
    console.log(`${index + 1}. Message: "${message}"`);
    
    let bestMatch = { type: 'unknown', confidence: 0 };
    
    // Test payment_link_stats first (higher priority)
    for (const regex of patterns.payment_link_stats) {
      if (message.match(regex)) {
        bestMatch = { type: 'payment_link_stats', confidence: 0.9 };
        break;
      }
    }
    
    // If no payment link stats match, test balance
    if (bestMatch.type === 'unknown') {
      for (const regex of patterns.balance_check) {
        if (message.match(regex)) {
          bestMatch = { type: 'balance_check', confidence: 0.8 };
          break;
        }
      }
    }
    
    console.log(`   → Intent: ${bestMatch.type} (confidence: ${bestMatch.confidence})`);
    console.log('');
  });
}

testIntentRecognition();