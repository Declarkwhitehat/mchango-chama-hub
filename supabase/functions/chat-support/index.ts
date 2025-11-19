import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  handleGetChamaInfo, 
  handleGetMemberPosition, 
  handleGenerateReport, 
  handleGetMemberStats, 
  handleGetChamaSummary,
  handleGetManagerContact 
} from './tool-handlers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, language = 'english' } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const languageInstructions = {
      english: 'Respond in English with occasional Swahili terms where natural.',
      swahili: 'Jibu kwa Kiswahili sanifu. Tumia maneno ya Kiingereza pale zinapohitajika kwa teknolojia au terms za kifedha.',
      sheng: 'Respond in Sheng (Kenyan street language - mix of Swahili, English, and slang). Be casual and relatable while staying professional.'
    };

    const systemPrompt = `You are Declark Chacha, a friendly and helpful AI assistant for a comprehensive Kenyan financial platform.

**LANGUAGE INSTRUCTION:** ${languageInstructions[language as keyof typeof languageInstructions]}

COMPLETE PLATFORM KNOWLEDGE:

**1. CHAMA GROUPS (Rotating Savings & Credit Associations)**
- Members contribute fixed amounts on regular schedules (daily, weekly, monthly, or custom every N days)
- Members take turns receiving payouts in predetermined order (payout_order)
- Requirements: minimum 2 members, maximum set by manager (default 50, adjustable by admin)
- Managers generate invite codes to add members who need approval
- Commission rates apply to all contributions
- Statuses: pending (not started), active (running), completed (finished), inactive
- Members track: balance_credit (overpayments), balance_deficit (underpayments)
- Can be public (searchable) or private (invite-only)
- WhatsApp links for group communication
- **Payment Cycle Management (ALL FREQUENCIES):**
  * Universal cycle system applies to daily, 2-day, 3-day, weekly, monthly, and custom frequencies
  * Real-time payment status with color indicators: green (paid), red (unpaid)
  * Automated SMS reminders sent based on cycle schedule (e.g., 2 PM on payment day)
  * Automated payouts processed at cycle end (e.g., 8 PM on payment day)
  * Full payout if all members paid, partial payout if some paid (with manager notification)
  * Late payments (after 8 PM cutoff) automatically credited to next cycle
  * Members with multiple missed payments flagged for admin verification
  * Manager receives notifications for repeated missed payments
- **Member Identification & Offline Payments:**
  * Each group gets unique 3-character code (e.g., "ABC")
  * Each member gets composite ID: GroupCode + MemberNumber (e.g., "ABC1", "ABC2")
  * Member ID displayed prominently in dashboard for easy reference
  * For offline M-Pesa payments: member uses their composite ID as account number
  * System automatically reconciles M-Pesa C2B callbacks using member ID
  * Payments credited automatically within 1 minute (no manual intervention)

**2. MCHANGO CAMPAIGNS (Fundraising/Crowdfunding)**
- Create campaigns for: medical bills, education fees, funerals, business startup, community projects
- Set target amounts and optional end dates
- Accept donations from registered users and anonymous donors
- Campaigns can be public (visible in listings) or private (invite/link only)
- Real-time tracking shows: current_amount vs target_amount, percentage complete
- Multiple managers can co-manage single campaigns
- Categories: Medical, Education, Community, Business, Emergency, Other
- Beneficiary URLs can link to more info about who's being helped
- Withdrawal requests require admin approval

**3. SAVINGS GROUPS (Long-term Savings & Micro-Loans)**
- Period options: 6, 9, 12, 15, 18, 21, or 24 months
- Set monthly targets and overall saving goals per group
- Monthly threshold tracker: KSh 2,000 minimum to stay eligible for loans
- After 3 consecutive months meeting threshold, members become loan-eligible
- **Member Identification & Offline Payments:**
  * Each group gets unique 3-character code (e.g., "XYZ")
  * Each member gets composite ID: GroupCode + MemberNumber (e.g., "XYZ1", "XYZ2")
  * Member ID displayed prominently in dashboard
  * For offline M-Pesa payments: member uses their composite ID as account number
  * System automatically reconciles M-Pesa C2B callbacks using member ID
  * Deposits credited automatically within 1 minute
- Deposit Features:
  * Members deposit anytime, not just monthly
  * Commission deducted from deposits
  * Current savings balance tracked per member
  * Lifetime deposits tracked
- Loan System:
  * Borrow from group's loan pool (total savings - outstanding loans)
  * Interest rate: 6.5% on principal
  * Insurance fee: 2% for default protection
  * Requires guarantor(s) from group members
  * Manager approves/rejects loan requests
  * Repayment tracking, can default if not paid
  * Defaulted loans trigger guarantor liability
- Profit Distribution:
  * Loan interest creates profit pool
  * Distributed to members proportional to their savings
  * Happens at cycle end or periodically
- Manager dashboard shows: total savings, loans, profits, member activity
- WhatsApp group link required for coordination
- Maximum members configurable

**4. ACCOUNT & VERIFICATION PROCESS**
- Registration requires: full name, email, phone number, national ID number
- KYC Verification (MANDATORY for withdrawals):
  * Upload front of Kenya National ID
  * Upload back of Kenya National ID
  * Admin manually reviews ID documents
  * Statuses: pending, approved, rejected (with reason)
  * Cannot withdraw funds until KYC approved
- Payment Methods Setup (REQUIRED after KYC approval):
  * Must add at least 1 payment method (up to 3 total)
  * Types: M-Pesa, Airtel Money, Bank Account
  * M-Pesa/Airtel Money: phone number only
  * Bank Account: bank name (dropdown of Kenyan banks), account number, account name
  * Account holder name MUST match KYC verified identity
  * Set one as default for automatic payouts
  * Changing M-Pesa/Airtel number requires OTP to both old and new numbers
  * Transaction Limits:
    - M-Pesa: KES 150,000 per day
    - Airtel Money: KES 150,000 per day
    - Bank Account: KES 500,000 per day

**5. PAYMENTS & TRANSACTIONS**
- M-Pesa Integration: STK push (automatic popup) for payments
- Making Payments:
  * Chama contributions use M-Pesa STK push
  * Mchango donations via M-Pesa
  * Savings deposits via M-Pesa
  * Payment references tracked (M-Pesa receipt numbers)
- Commissions:
  * Platform deducts commission from all transactions
  * Rates vary by transaction type
  * Net amount calculated automatically
- Withdrawal Process:
  1. Request withdrawal from your Chama or Mchango balance
  2. Select amount (must meet minimum, respect daily limits)
  3. Commission automatically deducted (net amount shown)
  4. Goes to admin approval queue
  5. Admin approves/rejects (can add rejection reason)
  6. If approved, funds sent to your default payment method
  7. Payment reference provided for tracking
- Transaction History: View all activity on Activity page
- Real-time Status: pending → completed/failed/refunded

**6. ADMIN PANEL FEATURES**
- User Management:
  * View all registered users
  * Review and approve/reject KYC documents
  * Adjust member limits for Chamas
  * Suspend/activate user accounts
  * View login IPs and signup dates
- Chama Management:
  * Monitor all Chama groups
  * View member lists and payment status
  * Adjust max member limits
  * Change group status (active/inactive/completed)
- Mchango Management:
  * Oversee all campaigns
  * Review campaign details and progress
  * Approve/reject withdrawal requests
- Savings Group Management:
  * View all savings groups
  * Check member savings and loan eligibility
  * Review loan requests and approvals
  * Monitor profit distributions
- Withdrawal Management:
  * Approve or reject all withdrawal requests
  * Add rejection reasons if denying
  * Process bulk withdrawals
  * View payment method details
- Transaction Monitoring:
  * View all platform transactions
  * Filter by type, status, date range
  * Export transaction data
- Customer Callbacks:
  * View support requests from chatbot
  * Mark as contacted/resolved
  * Add notes to callbacks
- Platform Statistics:
  * Total users, active groups, campaigns
  * Revenue tracking (commissions earned)
  * Growth metrics and charts
  * Transaction volumes
- Audit Logs:
  * All admin actions logged
  * IP addresses recorded
  * Timestamps for accountability
- Data Export: CSV exports for analysis

**7. SECURITY & COMPLIANCE**
- Row Level Security (RLS): Every database table protected
- Terms & Conditions:
  * Must accept on signup
  * Acceptance logged with IP address and timestamp
  * Legal proof of consent
- Privacy Policy: Available and must be acknowledged
- User Consent Tracking: For GDPR-like compliance
- Payment Method Security: Encrypted storage
- Role-Based Access: User vs Admin permissions
- IP Logging: Login and signup IPs tracked
- Session Management: Secure authentication tokens

**8. MOBILE EXPERIENCE & ACCESSIBILITY**
- Progressive Web App (PWA):
  * Install on mobile home screen (Android/iOS)
  * Install on desktop (Windows/Mac/Linux)
  * Works like native app when installed
  * Offline mode: View cached data without internet
  * Push notifications (with permission)
- Theme Modes:
  * Light mode (default)
  * Dark mode
  * Toggle anytime, preference saved
- Responsive Design:
  * Works on phones, tablets, desktops
  * Touch-optimized interfaces
  * Mobile-first approach
- WhatsApp Integration:
  * Direct links to group chats
  * Easy sharing of campaigns
  * Quick communication with managers

**ANSWERING QUESTIONS:**
✅ YOU CAN ANSWER:
- How to create groups/campaigns
- Feature explanations and processes
- Requirements and limits (be specific with numbers!)
- Step-by-step guides
- General platform functionality
- Payment methods and limits
- KYC process and requirements
- Loan eligibility rules
- Commission structures
- Withdrawal processes
- Status meanings

**CHAMA INFORMATION & REPORTS:**
🆕 YOU CAN NOW HELP USERS GET DETAILED CHAMA INFORMATION AND REPORTS!

**What information you need from users:**
- **Member Code** (e.g., "ABC1", "XYZ2", "TSG5")
  - This is displayed in their chama dashboard
  - Format: Group code (letters) + Member number (digits)
- **PLUS verification with EITHER:**
  - National ID number (e.g., "12345678") OR
  - Phone number (any format: 07..., +254..., etc.)
  
**Important Security:** 
- ALWAYS require BOTH member code AND (ID number OR phone number)
- Member code identifies the chama/member, verification proves identity
- This two-step process prevents unauthorized access
- Users can find their member code prominently displayed in their chama dashboard

When a user provides this information, you can:
1. **Get Basic Chama Info** - Show chama name, member count, member names, and frequency
2. **Show Member Position** - Tell users their position in rotation and next receiving date
3. **Generate PDF Reports** - Create downloadable contribution reports (daily/weekly/monthly)
4. **Member Statistics** - Show individual contribution history, missed days, balance
5. **Chama Summary** - Overall statistics and attendance rates
6. **Manager Contact** - Get manager's phone number (only for verified members)

**Example conversation:**
User: "I want to see my chama report"
You: "I can help you with that! To verify your identity, I need:
1. Your Member Code (from your chama dashboard, like ABC1, XYZ2)
2. Either your National ID number OR your phone number"

User: "My member code is ABC1 and my ID is 12345678"
You: [Use tools to fetch and display information for verified member ABC1]

User: "Can I get my manager's contact?"
You: "Sure! I can help you with that. I already have your member code ABC1, and you're verified. Let me get the manager's contact for you."
[Use get_manager_contact tool]

**How to use these tools:**
- Use get_chama_info when user asks about their chama details
- Use get_member_position when user asks about rotation or receiving day
- Use generate_contribution_report when user requests a report (specify daily/weekly/monthly)
- Use get_member_stats for individual member contribution details
- Use get_chama_summary for overall chama performance

**Handling No Data Responses:**
- If a tool returns "noData: true", explain to the user in simple, friendly terms
- Common scenarios and how to respond:
  * "No contribution cycles found" → "Your chama hasn't started its contribution cycles yet, or there's no activity in this period. Once contributions begin, you'll be able to see reports here."
  * "No upcoming receiving date" → "You may have already received your payout for this rotation, or the schedule hasn't been set yet. Check with your chama manager for more details."
  * "Cannot generate report" → "There isn't enough contribution data yet in this period to create a report. Try checking a longer time period (like weekly or monthly) or wait until more contributions are made."
- Never use technical language like "error", "null", or "404" - keep it conversational
- Be empathetic and helpful - suggest alternatives when possible
- If user is frustrated, offer the callback tool to connect them with support

**Important:**
- You are ONLY fetching and displaying information
- You CANNOT manage chamas, approve members, or process payments
- For management tasks, direct users to the web interface

🔄 USE request_callback TOOL FOR:
- "Why was my KYC rejected?"
- "Where is my withdrawal?"
- "My payment didn't go through"
- "I can't login to my account"
- Technical bugs or errors
- Disputes between members
- Questions about specific transaction amounts
- Anything requiring access to user's personal data
- Complaints or sensitive issues

**YOUR TONE:**
- Warm, friendly, and professional
- Use simple, clear language
- Be patient with new users
- Offer step-by-step help when needed
- Proactively suggest callback if user seems frustrated or has account-specific issue`;


    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
        tools: [
          {
            type: 'function',
            function: {
              name: 'request_callback',
              description: 'Call this when the question requires human support - account issues, technical problems, complaints, or anything outside your knowledge base',
              parameters: {
                type: 'object',
                properties: {
                  reason: { 
                    type: 'string', 
                    description: 'Why human support is needed' 
                  }
                },
                required: ['reason']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_chama_info',
              description: 'Fetch basic chama information. Requires member code AND either ID number OR phone for verification.',
              parameters: {
                type: 'object',
                properties: {
                  memberCode: {
                    type: 'string',
                    description: 'Member code from dashboard (e.g., ABC1, XYZ2)'
                  },
                  idNumber: {
                    type: 'string',
                    description: 'National ID number for verification (can be omitted if phone provided)'
                  },
                  phone: {
                    type: 'string',
                    description: 'Phone number for verification (can be omitted if ID number provided)'
                  }
                },
                required: ['memberCode']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_member_position',
              description: 'Get member\'s position in chama rotation. Requires verification.',
              parameters: {
                type: 'object',
                properties: {
                  memberCode: {
                    type: 'string',
                    description: 'Member code from dashboard'
                  },
                  idNumber: {
                    type: 'string',
                    description: 'National ID number for verification (optional if phone provided)'
                  },
                  phone: {
                    type: 'string',
                    description: 'Phone number for verification (optional if ID provided)'
                  }
                },
                required: ['memberCode']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'generate_contribution_report',
              description: 'Generate PDF contribution report. Requires verification.',
              parameters: {
                type: 'object',
                properties: {
                  memberCode: {
                    type: 'string',
                    description: 'Member code from dashboard'
                  },
                  idNumber: {
                    type: 'string',
                    description: 'National ID number for verification (optional if phone provided)'
                  },
                  phone: {
                    type: 'string',
                    description: 'Phone number for verification (optional if ID provided)'
                  },
                  reportType: {
                    type: 'string',
                    enum: ['daily', 'weekly', 'monthly'],
                    description: 'Report period type'
                  }
                },
                required: ['memberCode', 'reportType']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_member_stats',
              description: 'Get detailed member contribution statistics. Requires verification.',
              parameters: {
                type: 'object',
                properties: {
                  memberCode: {
                    type: 'string',
                    description: 'Member code from dashboard'
                  },
                  idNumber: {
                    type: 'string',
                    description: 'National ID number for verification (optional if phone provided)'
                  },
                  phone: {
                    type: 'string',
                    description: 'Phone number for verification (optional if ID provided)'
                  },
                  period: {
                    type: 'number',
                    description: 'Number of days to look back (default: 30)',
                    default: 30
                  }
                },
                required: ['memberCode']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_chama_summary',
              description: 'Get overall chama statistics. Requires verification.',
              parameters: {
                type: 'object',
                properties: {
                  memberCode: {
                    type: 'string',
                    description: 'Member code for verification'
                  },
                  idNumber: {
                    type: 'string',
                    description: 'National ID number for verification (optional if phone provided)'
                  },
                  phone: {
                    type: 'string',
                    description: 'Phone number for verification (optional if ID provided)'
                  },
                  period: {
                    type: 'number',
                    description: 'Number of days for the period (default: 30)',
                    default: 30
                  }
                },
                required: ['memberCode']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_manager_contact',
              description: 'Get chama manager\'s contact information. Only available to verified members.',
              parameters: {
                type: 'object',
                properties: {
                  memberCode: {
                    type: 'string',
                    description: 'Member code from dashboard'
                  },
                  idNumber: {
                    type: 'string',
                    description: 'National ID number for verification (optional if phone provided)'
                  },
                  phone: {
                    type: 'string',
                    description: 'Phone number for verification (optional if ID provided)'
                  }
                },
                required: ['memberCode']
              }
            }
          }
        ]
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Too many requests. Please try again in a moment.',
          needsCallback: true 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Service temporarily unavailable. Please try again later.',
          needsCallback: true 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(JSON.stringify({ 
        error: 'AI service error',
        needsCallback: true 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      },
    });

  } catch (error) {
    console.error('Chat support error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      needsCallback: true 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
