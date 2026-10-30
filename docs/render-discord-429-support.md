# Support request: Discord HTTP 429 from Render

Service: https://bot-rankup-discord.onrender.com

The application works locally, but Discord HTTP requests from the Render deployment return HTTP 429. This affects both the OAuth token exchange and HTTP requests when answering slash commands. The bot can remain connected to the Discord Gateway while those HTTP requests fail.

Observed application logs on 2026-10-30 (Asia/Saigon, UTC+07:00):

```text
19:15:17 [OAuth] OAUTH_RATE_LIMITED {"httpStatus":429}
19:16:13 [Discord] Executing /help
19:16:13 [Discord REST] HTTP_ERROR {"httpStatus":429}
19:21:54 [OAuth] OAUTH_RATE_LIMITED {"httpStatus":429}
19:22:18 [Discord] Executing /help
19:22:18 [Discord REST] HTTP_ERROR {"httpStatus":429}
```

The same Client ID and Client Secret shown in the Render configuration were verified with Discord's client credentials grant from the local environment and returned HTTP 200. The configured OAuth callback is:

```text
https://bot-rankup-discord.onrender.com/auth/discord/callback
```

Please investigate the service's outbound connectivity to Discord and help establish whether an outbound IP restriction or a Discord route/global limit is involved. Please advise which request identifiers or outbound IP information should be provided to Discord Support.

The current evidence establishes HTTP 429 but does not establish an IP ban or a specific restriction duration. Updated diagnostic logging can include the Retry-After delay, rate-limit scope, response format and Cloudflare Ray ID when supplied by the upstream response. No credentials, authorization codes, cookies or interaction URLs are included in this report.

References:

- https://docs.discord.com/developers/topics/rate-limits
- https://render.com/docs/outbound-ip-addresses
