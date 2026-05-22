# Vobiz Integration Guide — Connecting Cloud Telephony to the Voice Agent Platform

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Get Your Vobiz SIP Credentials](#step-1-get-your-vobiz-sip-credentials)
4. [Step 2: Add Vobiz Provider in the Dashboard](#step-2-add-vobiz-provider-in-the-dashboard)
5. [Step 3: Verify the Configuration](#step-3-verify-the-configuration)
6. [Step 4: Trigger Outbound Calls](#step-4-trigger-outbound-calls)
7. [Architecture Overview](#architecture-overview)
8. [SIP Credential Fields Explained](#sip-credential-fields-explained)
9. [Troubleshooting](#troubleshooting)
10. [API Reference](#api-reference)
11. [Future: Adding Inbound Calling Support](#future-adding-inbound-calling-support)
12. [Security Considerations](#security-considerations)

---

## Overview

The Voice Agent Platform supports **multiple cloud telephony providers** for making outbound calls with your AI voice agents. This guide walks you through connecting **Vobiz** — a SIP-based cloud telephony service — to the platform.

Once connected, your voice agents can make automated outbound calls via the Vobiz phone number, combining the power of Gemini Live API with real telephony infrastructure.

### How It Works

```
┌──────────────┐     SIP/RTP      ┌──────────────┐     PSTN      ┌──────────┐
│  Voice Agent │ ──────────────▶ │    Vobiz     │ ────────────▶ │ Customer │
│  Platform    │ ◀────────────── │  SIP Server  │ ◀──────────── │  Phone   │
│  (Node.js)   │   Audio Stream   │              │    Voice      │          │
└──────────────┘                  └──────────────┘               └──────────┘
       │
       │ Gemini Live API
       ▼
┌──────────────┐
│  Google AI   │
│  (Gemini)    │
└──────────────┘
```

---

## Prerequisites

Before you begin, ensure you have:

1. **A Vobiz Account** — Sign up at [vobiz.com](https://vobiz.com) or contact their sales team
2. **SIP Trunk / DID Number** — Purchase a DID (Direct Inward Dialing) number from Vobiz
3. **SIP Credentials** — Obtain your SIP username, password, and server address from the Vobiz portal
4. **A Running Voice Agent Platform** — Your platform should be deployed and accessible
5. **At Least One Voice Agent Created** — Create a voice agent with a system prompt before connecting telephony

---

## Step 1: Get Your Vobiz SIP Credentials

### 1.1 Log into the Vobiz Portal

Navigate to your Vobiz dashboard at `https://portal.vobiz.com` (or the URL provided by Vobiz).

### 1.2 Locate SIP Settings

In the Vobiz portal:
- Go to **Settings** → **SIP Trunks** (or **SIP Accounts**)
- Find or create a SIP trunk for outbound calling

### 1.3 Note Down the Following Credentials

| Field | Example Value | Description |
|-------|---------------|-------------|
| **SIP Server** | `sip.vobiz.com` | The hostname of the Vobiz SIP proxy server |
| **SIP Username** | `100123` | Your SIP account username (often numeric) |
| **SIP Password** | `YourSipP@ss123` | Your SIP account password |
| **Phone Number** | `+919876543210` | The DID number assigned to your trunk |
| **Port** | `5060` (default) | SIP signaling port (usually 5060 for UDP/TCP, 5061 for TLS) |

> **⚠️ Important:** Keep your SIP password secure. Never share it in public repositories or logs.

---

## Step 2: Add Vobiz Provider in the Dashboard

### 2.1 Navigate to the Telephony Section

1. Log into your Voice Agent Platform dashboard
2. In the **left sidebar**, click **Telephony**
3. Click the **"Add Provider"** button

### 2.2 Fill in the Provider Form

| Form Field | What to Enter |
|------------|---------------|
| **Provider Name** | A friendly name, e.g., "My Vobiz Outbound Line" |
| **Service Provider** | Select **Vobiz** from the dropdown |
| **Call Direction** | Select **Outbound** |
| **Phone Number** | Enter your Vobiz DID number (e.g., `+919876543210`) |
| **SIP Server** | Enter the Vobiz SIP server address (e.g., `sip.vobiz.com`) |
| **SIP Username** | Enter your SIP username from Step 1 |
| **SIP Password** | Enter your SIP password from Step 1 |
| **Active** | Check this to enable the provider |

### 2.3 Save the Provider

Click **"Save Provider"**. You should see a success toast notification and the new provider card appearing in the list.

---

## Step 3: Verify the Configuration

After saving, verify your provider appears in the telephony list with:

- ✅ **Status**: "Active" (green badge)
- ✅ **Provider**: "Vobiz" (cyan badge)
- ✅ **Direction**: "Outbound" (purple badge)
- ✅ **Phone Number**: Your DID number displayed

You can click **"Edit"** to update credentials at any time.

---

## Step 4: Trigger Outbound Calls

> **Note:** The outbound calling trigger API will be available in a future update. Currently, the telephony provider configuration is stored and ready for integration.

### Planned Outbound Call Flow

1. Your application makes an API call to `/api/telephony/:providerId/call` with the target phone number
2. The platform initiates a SIP INVITE to the Vobiz server using stored credentials
3. When the call is answered, the Gemini Live audio stream bridges to the SIP media stream
4. The AI agent converses with the callee in real-time
5. Call is terminated when the conversation ends or the callee hangs up

### Example API Request (Coming Soon)

```bash
curl -X POST https://your-platform.com/api/telephony/{providerId}/call \
  -H "Content-Type: application/json" \
  -H "Cookie: token=your-jwt-token" \
  -d '{
    "agentId": "your-agent-id",
    "targetNumber": "+919876543210",
    "callbackUrl": "https://your-server.com/callback"
  }'
```

---

## Architecture Overview

### Multi-Provider Design

The platform uses a **provider-agnostic architecture** that allows you to connect multiple telephony services simultaneously:

```
┌─────────────────────────────────────────────────┐
│              Voice Agent Platform                │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │         Telephony Provider Manager        │   │
│  │                                           │   │
│  │  ┌─────────┐  ┌────────┐  ┌───────┐     │   │
│  │  │  Vobiz  │  │ Twilio │  │ Plivo │     │   │
│  │  │ (SIP)   │  │ (API)  │  │ (API) │     │   │
│  │  └─────────┘  └────────┘  └───────┘     │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           Gemini Live API Bridge          │   │
│  │     (Audio streaming & transcription)     │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Database Schema

Each telephony provider is stored with:

| Column | Type | Description |
|--------|------|-------------|
| `id` | String | Unique provider ID |
| `name` | String | Friendly name |
| `provider` | Enum | `vobiz`, `twilio`, or `plivo` |
| `direction` | Enum | `outbound` or `inbound` |
| `isActive` | Boolean | Whether this provider is enabled |
| `phoneNumber` | String | The DID/phone number |
| `sipServer` | String | SIP server hostname (Vobiz) |
| `sipUsername` | String | SIP authentication username |
| `sipPassword` | String | SIP authentication password (encrypted) |
| `apiKey` | String | API key (Twilio/Plivo) |
| `apiSecret` | String | API secret (Twilio/Plivo) |
| `accountSid` | String | Account SID (Twilio) |
| `authToken` | String | Auth token (Twilio) |
| `webhookUrl` | String | Webhook URL for callbacks |
| `userId` | String | Owner user ID |

---

## SIP Credential Fields Explained

### For Vobiz (SIP-Based)

| Field | Required | Description |
|-------|----------|-------------|
| **SIP Server** | ✅ | The Vobiz SIP proxy server hostname (e.g., `sip.vobiz.com`) |
| **SIP Username** | ✅ | Your SIP account username for authentication |
| **SIP Password** | ✅ | Your SIP account password for authentication |
| **Phone Number** | ✅ | The DID number for caller ID and routing |

### For Twilio (API-Based) — Coming Soon

| Field | Required | Description |
|-------|----------|-------------|
| **Account SID** | ✅ | Twilio account identifier |
| **Auth Token** | ✅ | Twilio authentication token |
| **Phone Number** | ✅ | Twilio phone number for outbound calls |

### For Plivo (API-Based) — Coming Soon

| Field | Required | Description |
|-------|----------|-------------|
| **API Key (Auth ID)** | ✅ | Plivo authentication ID |
| **API Secret (Auth Token)** | ✅ | Plivo authentication token |
| **Phone Number** | ✅ | Plivo phone number |

---

## Troubleshooting

### Common Issues

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Provider not appearing after save | API error | Check browser console for errors; verify database connection |
| "Invalid request input" error | Form validation failed | Ensure all required fields are filled and provider type is selected |
| SIP connection refused | Wrong SIP server or port | Verify the SIP server hostname with Vobiz support |
| Authentication failed | Wrong SIP credentials | Double-check username and password in the Vobiz portal |
| Call quality issues | Network/bandwidth | Ensure your server has sufficient bandwidth for RTP streams |

### Checking Provider Status via API

```bash
# List all providers
curl -s https://your-platform.com/api/telephony \
  -H "Cookie: token=your-jwt-token" | jq .

# Get a specific provider
curl -s https://your-platform.com/api/telephony/{id} \
  -H "Cookie: token=your-jwt-token" | jq .
```

---

## API Reference

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/telephony` | List all providers for the authenticated user |
| `GET` | `/api/telephony/:id` | Get a specific provider |
| `POST` | `/api/telephony` | Create a new provider |
| `PUT` | `/api/telephony/:id` | Update a provider |
| `DELETE` | `/api/telephony/:id` | Delete a provider |

### Create Provider Request Body

```json
{
  "name": "My Vobiz Line",
  "provider": "vobiz",
  "direction": "outbound",
  "isActive": true,
  "phoneNumber": "+919876543210",
  "sipServer": "sip.vobiz.com",
  "sipUsername": "100123",
  "sipPassword": "YourSipP@ss123"
}
```

### Response (credentials masked)

```json
{
  "id": "clx1234567890",
  "name": "My Vobiz Line",
  "provider": "vobiz",
  "direction": "outbound",
  "isActive": true,
  "phoneNumber": "+919876543210",
  "sipServer": "sip.vobiz.com",
  "sipUsername": "100123",
  "sipPassword": "**********s123",
  "apiKey": null,
  "apiSecret": null,
  "accountSid": null,
  "authToken": null,
  "webhookUrl": null,
  "createdAt": "2026-05-21T14:30:00.000Z",
  "updatedAt": "2026-05-21T14:30:00.000Z"
}
```

> **Note:** Sensitive fields (`sipPassword`, `apiKey`, `apiSecret`, `authToken`) are always masked in API responses for security.

---

## Future: Adding Inbound Calling Support

In a future update, the platform will support **inbound calling** with Vobiz:

1. **Webhook Configuration**: You'll configure a webhook URL in your Vobiz portal that points to your Voice Agent Platform
2. **Incoming Call Routing**: When a call arrives at your Vobiz DID number, Vobiz will send a webhook to your platform
3. **Agent Assignment**: The platform will route the incoming call to the configured voice agent
4. **Real-time AI Response**: The Gemini AI agent will answer and converse with the caller

### Planned Inbound Flow

```
Customer → PSTN → Vobiz DID → Webhook → Platform → Gemini AI → Response → Customer
```

---

## Security Considerations

1. **Credential Storage**: SIP passwords and API keys are stored in the database. Consider adding encryption-at-rest for production deployments.
2. **API Response Masking**: All credential fields are masked in API responses (only last 4 characters shown).
3. **Authentication Required**: All telephony API endpoints require JWT authentication.
4. **User Isolation**: Each user can only see and manage their own telephony providers.
5. **Input Validation**: All inputs are validated with Zod schemas before processing.
6. **HTTPS**: Always use HTTPS in production to protect credentials in transit.
