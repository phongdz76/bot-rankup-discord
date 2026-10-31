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

## Recurrence on 2026-10-31

Service ID: `srv-dbfoos7avr4c73dk1njg`, Singapore region. Running revision: `ff90770`. All times below are Asia/Saigon (UTC+07:00).

The previous cooldown ended around 15:19:13. The bot logged in at 15:19:15, registered global commands successfully, and completed role synchronization for two guilds (1 and 38 non-bot members). Another cooldown was observed at 15:53:33, without an intervening deployment. The application continued receiving `/help` Gateway events, but Discord rejected the initial interaction acknowledgment.

```text
15:53:33 [Discord] Executing /help
15:53:33 [Discord REST] HTTP_ERROR {"httpStatus":429,"retryAfterSeconds":1933,"responseFormat":"json","cfRay":"a5316e154999a17f-SIN"}
15:53:33 [Discord] INTERACTION_RATE_LIMITED {"command":"help","retryAfterSeconds":1933.05,"scope":"user","global":false}
15:57:43 [Discord] Executing /help
15:57:43 [Discord REST] HTTP_ERROR {"httpStatus":429,"retryAfterSeconds":1683,"responseFormat":"json","cfRay":"a53174315842fdc0-SIN"}
16:05:46 [Discord REST] HTTP_ERROR {"httpStatus":429,"retryAfterSeconds":1200,"responseFormat":"json","cfRay":"a5317ff70bf1ce4f-SIN"}
16:05:46 [Discord] INTERACTION_RATE_LIMITED {"command":"help","retryAfterSeconds":1200.05,"scope":"user","global":false}
```

The command execution entries above are shortened; the status and diagnostic JSON are copied from the service logs. These responses point to the same earliest retry time of approximately **16:25:46 on 2026-10-31**. This is the server-provided cooldown deadline, not a guarantee that later requests will succeed. Failed interactions must not be replayed after the cooldown; a fresh command is needed.

During this investigation, `/health` returned HTTP 200 with `database: true`, `discord: true`, `botEnabled: true`, and revision `ff90770`. This endpoint checks database/Gateway readiness, not successful interaction acknowledgment. Local read-only requests to `/users/@me` and `/oauth2/applications/@me` both returned HTTP 200; the bot identity matched the configured application and no interactions endpoint URL was configured. These checks establish local authentication health, not local interaction-callback success.

The reviewed code uses cached voice/member state for voice XP, compares roles before writing changes, and caches completed guild role scans. This review does not establish the actual outgoing request rate or the cause of the restriction. Render documents shared outbound IP ranges within a region, but the observed JSON 429 responses and Cloudflare Ray IDs alone do not establish an IP ban, shared-IP interference, or Cloudflare error 1015. Please use the supplied timestamps and Ray IDs to investigate the restriction and its recurrence.

## Measured recurrence at 16:37 on 2026-10-31

Revision `9459cee` adds response counts and safely reads cloned error bodies. It was deployed at 16:23. The initial login request returned HTTP 429, `discordCode: 0`, and `Retry-After: 144` at 16:23:22 (Ray ID `a53199c25f41604b-SIN`). The process waited and logged in successfully at 16:25:48.

The response summary for 16:25 recorded exactly six successful bot REST responses: one `other`, one `application`, and four `guild`. Global command registration and both guild role scans completed. No further bot REST responses were logged before the next `/help` at 16:37:54. That first command after the idle interval was rejected again:

```text
16:26:20 [Discord REST] REQUEST_SUMMARY {"minute":"2026-10-31T09:25:00.000Z","counts":{"other:ok":1,"application:ok":1,"guild:ok":4}}
16:37:54 [Discord REST] HTTP_ERROR {"operation":"interaction","httpStatus":429,"retryAfterSeconds":3301,"discordCode":0,"responseFormat":"json","cfRay":"a531af0aca30ce7a-SIN"}
16:38:15 [Discord REST] HTTP_ERROR {"operation":"interaction","httpStatus":429,"retryAfterSeconds":3280,"discordCode":0,"responseFormat":"json","cfRay":"a531af90dc7262f7-SIN"}
```

These two deadlines converge around 17:32:55 Asia/Saigon. The counter includes every received HTTP response, including SDK retries, for this bot's REST client. It excludes OAuth/dashboard calls, other processes, other tenants, and requests that have not produced a response. This observation does not indicate a burst from this bot's REST client preceding the new restriction.

The HTTP 429 error bodies contain numeric code `0`; no `X-RateLimit-Bucket` was detected. Code `0` alone is insufficient to classify the restriction as an IP ban. Please investigate whether another service sharing the outbound address or another upstream restriction accounts for the recurrence. Raising compute resources alone has not been established as a remedy. The deployment is diagnostic instrumentation; it has not fixed the recurring upstream rejection.
