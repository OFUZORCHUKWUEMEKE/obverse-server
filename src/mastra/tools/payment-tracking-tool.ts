import { Tool } from '@mastra/core';
import { z } from 'zod';

export const createPaymentTrackingTool = (
  paymentLinkRepository: any,
  userRepository: any,
) => {
  return new Tool({
    id: 'track_payments',
    description:
      'Track and monitor payments for payment links with detailed analytics. Can search by payment link name/title and create transaction tracking URLs like the /payment-link slash command',
    inputSchema: z.object({
      telegramUserId: z.string().describe('Telegram user ID of the requester'),
      linkId: z
        .string()
        .optional()
        .describe(
          'Specific payment link ID to track (optional - if not provided, shows all user payment links)',
        ),
      linkName: z
        .string()
        .optional()
        .describe(
          'Payment link name/title to search for (case-insensitive partial match)',
        ),
      timeframe: z
        .enum(['24h', '7d', '30d', '90d', 'all'])
        .default('30d')
        .describe('Time frame for payment tracking'),
      includeTransactions: z
        .boolean()
        .default(true)
        .describe('Include detailed transaction information'),
      includeTrackingUrl: z
        .boolean()
        .default(true)
        .describe('Include transaction tracking URL for each payment link'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(10)
        .describe('Maximum number of transactions to return'),
    }),
    execute: async (params: any) => {
      const {
        telegramUserId,
        linkId,
        linkName,
        timeframe = '30d',
        includeTransactions = true,
        includeTrackingUrl = true,
        limit = 10,
      } = params;

      try {
        // Get user
        const user = await userRepository.findOne({
          telegramId: telegramUserId,
        });

        if (!user) {
          return {
            success: false,
            error: 'User not found',
            data: null,
          };
        }

        // Calculate time range
        const timeRanges = {
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000,
          '90d': 90 * 24 * 60 * 60 * 1000,
          all: null,
        };

        const timeRange = timeRanges[timeframe];
        const startDate = timeRange ? new Date(Date.now() - timeRange) : null;

        const query: any = { creatorUserId: user._id };
        if (linkId) {
          query.linkId = linkId;
        }

        // Find payment links
        let paymentLinks = await paymentLinkRepository.find(query);

        // Filter by name if provided (case-insensitive partial match)
        if (linkName && !linkId) {
          paymentLinks = paymentLinks.filter(
            (link) =>
              link.title &&
              link.title.toLowerCase().includes(linkName.toLowerCase()),
          );
        }

        if (!paymentLinks || paymentLinks.length === 0) {
          let errorMessage = '';
          let suggestions: string[] = [];

          if (linkId) {
            errorMessage = `Payment link with ID "${linkId}" not found or you don't have access to it`;
          } else if (linkName) {
            errorMessage = `No payment links found matching "${linkName}"`;
            
            // Get all user's payment links to provide suggestions
            const allUserLinks = await paymentLinkRepository.find({ creatorUserId: user._id });
            if (allUserLinks && allUserLinks.length > 0) {
              suggestions = allUserLinks
                .slice(0, 5)
                .map(link => link.title)
                .filter(title => title && title.trim());
            }
          } else {
            errorMessage = 'No payment links found for this user';
          }
          
          // Generate smart error message
          let smartErrorMessage = '';
          
          if (linkId) {
            smartErrorMessage = `❌ **Payment Link Not Found**\n\n`;
            smartErrorMessage += `I couldn't find a payment link with ID "${linkId}". This could mean:\n`;
            smartErrorMessage += `• The link ID doesn't exist\n`;
            smartErrorMessage += `• You don't have access to this link\n`;
            smartErrorMessage += `• There might be a typo in the ID\n\n`;
            smartErrorMessage += `💡 **What you can do:**\n`;
            smartErrorMessage += `• Use /payment-link command to search by name instead\n`;
            smartErrorMessage += `• Check your payment links with: "show all my payment links"\n`;
          } else if (linkName) {
            smartErrorMessage = `🔍 **No Matches Found**\n\n`;
            smartErrorMessage += `I couldn't find any payment links matching "${linkName}"\n\n`;
            
            if (suggestions.length > 0) {
              smartErrorMessage += `🎯 **Your Available Payment Links:**\n`;
              suggestions.forEach((suggestion, idx) => {
                smartErrorMessage += `${idx + 1}. ${suggestion}\n`;
              });
              smartErrorMessage += `\n💡 Try searching for one of these names instead!\n`;
            } else {
              smartErrorMessage += `💡 **Getting Started:**\n`;
              smartErrorMessage += `• Create your first payment link with /payment\n`;
              smartErrorMessage += `• Or ask: "create a payment link for $50"\n`;
            }
          } else {
            smartErrorMessage = `📭 **No Payment Links Found**\n\n`;
            smartErrorMessage += `You haven't created any payment links yet.\n\n`;
            smartErrorMessage += `🚀 **Get Started:**\n`;
            smartErrorMessage += `• Use /payment to create your first payment link\n`;
            smartErrorMessage += `• Or try: "create a payment link for coffee shop"\n`;
            smartErrorMessage += `• Payment links help you receive crypto payments easily!\n`;
          }

          return {
            success: false,
            error: errorMessage,
            message: smartErrorMessage,
            data: {
              suggestions,
              searchCriteria: {
                linkId: linkId || null,
                linkName: linkName || null,
                matchesFound: 0,
              }
            },
          };
        }

        // Aggregate payment data
        let totalTransactions = 0;
        let totalAmountReceived = 0;
        let totalViews = 0;
        const allTransactions: any[] = [];
        const linkSummaries: any[] = [];

        for (const paymentLink of paymentLinks) {
          // Filter payments by timeframe
          const filteredPayments = paymentLink.payments
            ? paymentLink.payments.filter(
              (payment) =>
                !startDate || new Date(payment.paidAt) >= startDate,
            )
            : [];

          // Calculate link-specific metrics
          const linkTotalTransactions = filteredPayments.length;
          const linkTotalAmount = filteredPayments.reduce(
            (sum, payment) => sum + parseFloat(payment.amount || '0'),
            0,
          );
          const linkViews = paymentLink.viewCount || 0;
          const conversionRate =
            linkViews > 0 ? (linkTotalTransactions / linkViews) * 100 : 0;

          // Add to totals
          totalTransactions += linkTotalTransactions;
          totalAmountReceived += linkTotalAmount;
          totalViews += linkViews;

          // Get recent transactions for this link from the payment link's payments array
          if (includeTransactions && filteredPayments.length > 0) {
            allTransactions.push(
              ...filteredPayments.map((payment) => ({
                payerAddress: payment.payerAddress,
                amount: payment.amount,
                transactionHash: payment.transactionHash,
                paidAt: payment.paidAt,
                createdAt: payment.paidAt, // Use paidAt as createdAt for consistency
                linkId: paymentLink.linkId,
                linkTitle: paymentLink.title,
                metadata: payment.metadata || {},
              })),
            );
          }

          // Generate transaction tracking URL
          const baseUrl = process.env.BASE_URL || 'https://obverse-ui.vercel.app';
          const trackingUrl = `${baseUrl}/transactions/${paymentLink.linkId}`;

          // Link summary
          linkSummaries.push({
            linkId: paymentLink.linkId,
            title: paymentLink.title,
            status: paymentLink.status,
            token: paymentLink.token,
            amount: paymentLink.amount,
            type: paymentLink.type,
            createdAt: paymentLink.createdAt,
            trackingUrl: includeTrackingUrl ? trackingUrl : undefined,
            metrics: {
              totalTransactions: linkTotalTransactions,
              totalAmountReceived: linkTotalAmount.toFixed(2),
              viewCount: linkViews,
              conversionRate: conversionRate.toFixed(2),
              averageTransactionAmount:
                linkTotalTransactions > 0
                  ? (linkTotalAmount / linkTotalTransactions).toFixed(2)
                  : '0',
              lastPaymentAt:
                filteredPayments.length > 0
                  ? filteredPayments[filteredPayments.length - 1].paidAt
                  : null,
            },
            recentPayments: filteredPayments.slice(-3).map((payment) => ({
              payerAddress: payment.payerAddress,
              amount: payment.amount,
              transactionHash: payment.transactionHash,
              paidAt: payment.paidAt,
            })),
          });
        }

        // Sort transactions by date (most recent first)
        allTransactions.sort(
          (a, b) =>
            new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
        );

        // Calculate overall metrics
        const overallConversionRate =
          totalViews > 0 ? (totalTransactions / totalViews) * 100 : 0;

        const averageTransactionAmount =
          totalTransactions > 0 ? totalAmountReceived / totalTransactions : 0;

        // Performance insights
        const insights = generatePaymentInsights(linkSummaries, timeframe, linkName);

        // Generate smart response message
        const responseMessage = generateSmartResponse(
          paymentLinks,
          linkSummaries,
          totalTransactions,
          totalAmountReceived,
          linkName,
          linkId,
          timeframe
        );

        return {
          success: true,
          error: null,
          message: responseMessage,
          data: {
            searchCriteria: {
              linkId: linkId || null,
              linkName: linkName || null,
              timeframe,
              searchType: linkId ? 'id' : linkName ? 'name' : 'all',
              matchesFound: paymentLinks.length,
            },
            summary: {
              timeframe,
              totalPaymentLinks: paymentLinks.length,
              totalTransactions,
              totalAmountReceived: totalAmountReceived.toFixed(2),
              totalViews,
              overallConversionRate: overallConversionRate.toFixed(2),
              averageTransactionAmount: averageTransactionAmount.toFixed(2),
            },
            paymentLinks: linkSummaries,
            recentTransactions: includeTransactions
              ? allTransactions.slice(0, limit)
              : [],
            insights,
            generatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        const smartErrorMessage = `🚨 **Payment Tracking Error**\n\n` +
          `Something went wrong while tracking your payment links.\n\n` +
          `**Error Details:** ${error.message}\n\n` +
          `💡 **What you can try:**\n` +
          `• Wait a moment and try again\n` +
          `• Check if you have any payment links created\n` +
          `• Try searching with a different name or time period\n` +
          `• Contact support if the issue persists\n`;

        return {
          success: false,
          error: `Failed to track payments: ${error.message}`,
          message: smartErrorMessage,
          data: null,
        };
      }
    },
  });
};

function generatePaymentInsights(
  linkSummaries: any[],
  timeframe: string,
  searchName?: string,
): string[] {
  const insights: string[] = [];

  if (linkSummaries.length === 0) {
    const message = searchName
      ? `No payment links found matching "${searchName}" for the specified timeframe.`
      : 'No payment links found for the specified timeframe.';
    insights.push(message);
    return insights;
  }

  // Add search-specific insights
  if (searchName && linkSummaries.length === 1) {
    const link = linkSummaries[0];
    insights.push(
      `✅ Successfully located "${link.title}" - transaction tracking is now available`,
    );
    
    if (link.metrics.totalTransactions > 0) {
      insights.push(
        `💡 This payment link is performing well with ${link.metrics.totalTransactions} transactions`,
      );
    } else {
      insights.push(
        `📈 No transactions yet - consider sharing the QR code or tracking URL to boost visibility`,
      );
    }
  } else if (searchName && linkSummaries.length > 1) {
    insights.push(
      `🔍 Found ${linkSummaries.length} payment links matching "${searchName}" - all tracking URLs provided`,
    );
    
    const bestPerformer = linkSummaries.reduce((best, current) =>
      parseFloat(current.metrics.totalAmountReceived) > parseFloat(best.metrics.totalAmountReceived) ? current : best
    );
    
    if (parseFloat(bestPerformer.metrics.totalAmountReceived) > 0) {
      insights.push(
        `🏆 "${bestPerformer.title}" is your top performer among these matches`,
      );
    }
  }

  // Best performing link
  const bestLink = linkSummaries.reduce((best, current) =>
    parseFloat(current.metrics.totalAmountReceived) >
      parseFloat(best.metrics.totalAmountReceived)
      ? current
      : best,
  );

  if (parseFloat(bestLink.metrics.totalAmountReceived) > 0) {
    insights.push(
      `🏆 Your top earner: "${bestLink.title}" generated $${bestLink.metrics.totalAmountReceived}`,
    );
    
    // Add actionable advice for the best performer
    if (parseFloat(bestLink.metrics.conversionRate) > 5) {
      insights.push(
        `💡 "${bestLink.title}" has an excellent ${bestLink.metrics.conversionRate}% conversion rate - consider replicating this success pattern`,
      );
    }
  }

  // Conversion rate analysis
  const avgConversionRate =
    linkSummaries.reduce(
      (sum, link) => sum + parseFloat(link.metrics.conversionRate),
      0,
    ) / linkSummaries.length;

  if (avgConversionRate > 0) {
    insights.push(`📊 Your average conversion rate: ${avgConversionRate.toFixed(2)}%`);

    const highPerformingLinks = linkSummaries.filter(
      (link) => parseFloat(link.metrics.conversionRate) > avgConversionRate,
    );
    
    const lowPerformingLinks = linkSummaries.filter(
      (link) => parseFloat(link.metrics.conversionRate) < avgConversionRate && parseFloat(link.metrics.conversionRate) > 0,
    );

    if (highPerformingLinks.length > 0) {
      insights.push(
        `🚀 ${highPerformingLinks.length} link(s) beating your average - these are your winners!`,
      );
    }
    
    if (lowPerformingLinks.length > 0) {
      insights.push(
        `📈 ${lowPerformingLinks.length} link(s) below average - try optimizing their descriptions or amounts`,
      );
    }
  }

  // Activity insights
  const activeLinks = linkSummaries.filter(
    (link) => link.metrics.totalTransactions > 0,
  );

  const inactiveLinks = linkSummaries.filter(
    (link) =>
      link.metrics.totalTransactions === 0 && link.metrics.viewCount > 0,
  );

  if (activeLinks.length > 0) {
    insights.push(
      `✅ ${activeLinks.length} link(s) are generating revenue in the ${timeframe} period`,
    );
  }

  if (inactiveLinks.length > 0) {
    const totalInactiveViews = inactiveLinks.reduce((sum, link) => sum + link.metrics.viewCount, 0);
    if (totalInactiveViews > 0) {
      insights.push(
        `⚠️ ${inactiveLinks.length} link(s) have ${totalInactiveViews} views but no payments - potential conversion opportunities!`,
      );
    } else {
      insights.push(
        `💡 ${inactiveLinks.length} link(s) need more visibility - consider sharing them on social media or with QR codes`,
      );
    }
  }

  // Recent activity
  const recentLinks = linkSummaries.filter(
    (link) =>
      link.metrics.lastPaymentAt &&
      new Date(link.metrics.lastPaymentAt) >
      new Date(Date.now() - 24 * 60 * 60 * 1000),
  );

  if (recentLinks.length > 0) {
    insights.push(
      `🔥 ${recentLinks.length} link(s) had recent activity (last 24 hours) - momentum is building!`,
    );
  }

  return insights;
}

function generateSmartResponse(
  paymentLinks: any[],
  linkSummaries: any[],
  totalTransactions: number,
  totalAmountReceived: number,
  linkName?: string,
  linkId?: string,
  timeframe: string = '30d'
): string {
  const timeframeText = {
    '24h': 'last 24 hours',
    '7d': 'last 7 days', 
    '30d': 'last 30 days',
    '90d': 'last 90 days',
    'all': 'all time'
  }[timeframe] || timeframe;

  let response = '';

  // Handle specific search scenarios
  if (linkId || linkName) {
    if (paymentLinks.length === 1) {
      const link = linkSummaries[0];
      const tokenEmoji = getTokenEmoji(link.token);
      
      response += `✅ **Payment Link Found!**\n\n`;
      response += `🔗 **Name:** ${link.title}\n`;
      response += `💰 **Amount:** ${link.amount} ${tokenEmoji} ${link.token}\n`;
      response += `📊 **Status:** ${link.status.charAt(0).toUpperCase() + link.status.slice(1)}\n`;
      response += `📈 **Transactions:** ${link.metrics.totalTransactions}\n`;
      
      if (link.trackingUrl) {
        response += `\n🌐 **Transaction Tracking:**\n${link.trackingUrl}\n`;
      }

      // Performance details
      if (link.metrics.totalTransactions > 0) {
        response += `\n📊 **Performance (${timeframeText}):**\n`;
        response += `• Total Received: $${link.metrics.totalAmountReceived}\n`;
        response += `• Views: ${link.metrics.viewCount}\n`;
        response += `• Conversion Rate: ${link.metrics.conversionRate}%\n`;
        response += `• Average Transaction: $${link.metrics.averageTransactionAmount}\n`;
        
        if (link.metrics.lastPaymentAt) {
          const lastPayment = new Date(link.metrics.lastPaymentAt).toLocaleString();
          response += `• Last Payment: ${lastPayment}\n`;
        }
      } else {
        response += `\n💡 **Status:** No transactions received yet in the ${timeframeText}.\n`;
        if (link.metrics.viewCount > 0) {
          response += `However, your link has ${link.metrics.viewCount} views. Consider optimizing your payment flow!\n`;
        }
      }

      // Recent transactions
      if (link.recentPayments && link.recentPayments.length > 0) {
        response += `\n🔄 **Recent Transactions:**\n`;
        link.recentPayments.forEach((payment, idx) => {
          const date = new Date(payment.paidAt).toLocaleDateString();
          response += `${idx + 1}. $${payment.amount} - ${payment.payerAddress.slice(0, 8)}... (${date})\n`;
        });
      }

    } else if (paymentLinks.length > 1) {
      response += `🔍 **Multiple Links Found**\n\n`;
      response += `Found **${paymentLinks.length}** payment links matching "${linkName}"\n\n`;
      
      linkSummaries.forEach((link, idx) => {
        const tokenEmoji = getTokenEmoji(link.token);
        response += `**${idx + 1}. ${link.title}**\n`;
        response += `   Amount: ${link.amount} ${tokenEmoji} ${link.token} | Transactions: ${link.metrics.totalTransactions}\n`;
        if (link.trackingUrl) {
          response += `   Tracking: ${link.trackingUrl}\n`;
        }
        response += '\n';
      });

      response += `💡 **Combined Performance (${timeframeText}):**\n`;
      response += `• Total Revenue: $${totalAmountReceived.toFixed(2)}\n`;
      response += `• Total Transactions: ${totalTransactions}\n`;
    }
  } else {
    // Overview of all payment links
    response += `📊 **Payment Links Overview**\n\n`;
    response += `**Period:** ${timeframeText.charAt(0).toUpperCase() + timeframeText.slice(1)}\n`;
    response += `**Total Links:** ${paymentLinks.length}\n`;
    response += `**Total Transactions:** ${totalTransactions}\n`;
    response += `**Total Revenue:** $${totalAmountReceived.toFixed(2)}\n\n`;

    if (linkSummaries.length > 0) {
      // Show top performing links
      const topLinks = linkSummaries
        .sort((a, b) => parseFloat(b.metrics.totalAmountReceived) - parseFloat(a.metrics.totalAmountReceived))
        .slice(0, 3);

      if (topLinks.length > 0 && parseFloat(topLinks[0].metrics.totalAmountReceived) > 0) {
        response += `🏆 **Top Performing Links:**\n`;
        topLinks.forEach((link, idx) => {
          const tokenEmoji = getTokenEmoji(link.token);
          response += `${idx + 1}. **${link.title}** - $${link.metrics.totalAmountReceived} (${link.metrics.totalTransactions} transactions)\n`;
          if (link.trackingUrl) {
            response += `   Track: ${link.trackingUrl}\n`;
          }
        });
        response += '\n';
      }

      // Active vs inactive links
      const activeLinks = linkSummaries.filter(link => link.metrics.totalTransactions > 0);
      const inactiveLinks = linkSummaries.filter(link => link.metrics.totalTransactions === 0);
      
      if (activeLinks.length > 0) {
        response += `✅ **Active:** ${activeLinks.length} links with transactions\n`;
      }
      if (inactiveLinks.length > 0) {
        response += `⏸️ **Inactive:** ${inactiveLinks.length} links without transactions\n`;
      }
    }
  }

  // Add helpful tips
  response += `\n💡 **Pro Tips:**\n`;
  response += `• Use tracking URLs to monitor transactions in real-time\n`;
  response += `• Share QR codes for easier mobile payments\n`;
  response += `• Monitor conversion rates to optimize your payment flows\n`;

  return response;
}

function getTokenEmoji(token: string): string {
  const emojis = {
    'USDC': '🔵',
    'USDT': '🟢', 
    'DAI': '🟡',
    'MNT': '🟢'
  };
  return emojis[token] || '🪙';
}
