# Social Media Scheduler

A SaaS application for creating, scheduling, and publishing image posts to:

- Instagram Professional accounts
- LinkedIn member profiles
- LinkedIn organization pages later, after the required LinkedIn approval

> **Important:** Instagram supports real swipeable carousels. LinkedIn's API supports multi-image posts, not the same Instagram-style carousel. Therefore the product is positioned as a **Social Media Post Scheduler**, with platform-specific previews and publishing behavior.

---

## 1. Product Goal

The application allows a user to:

1. Create an account and log in.
2. Connect Instagram and/or LinkedIn.
3. Upload images.
4. Write a caption.
5. Select target platforms.
6. Preview how the post will appear on each platform.
7. Select a future date and time.
8. Schedule the post.
9. Let the scheduler publish it automatically.
10. See whether each platform succeeded or failed.

The first release should focus on a reliable MVP rather than building every advanced feature immediately.

---

# 2. MVP Scope

## Supported in MVP

### Instagram

- Instagram Professional accounts only
- Single-image posts
- Image carousels
- 2–10 carousel items
- Captions
- Scheduled publishing

### LinkedIn

- Authenticated member/personal profiles
- Single-image posts
- Multi-image posts
- 2–20 images
- Text/caption
- Scheduled publishing

### Application

- Authentication
- Social account connection
- Media upload
- Post composer
- Platform-specific preview
- Scheduling
- Calendar/list of scheduled posts
- Publishing status
- Basic retry for safe failures
- Token expiry warnings
- Basic error messages

---

# 3. Explicitly Out of MVP

Do not build these initially:

- LinkedIn organization/page publishing
- Reels
- Instagram Stories
- Video publishing
- LinkedIn articles
- LinkedIn polls
- LinkedIn document/PDF posts
- Native reposts
- @mentions
- Advanced analytics
- AI content generation
- Multiple additional social networks
- Complex queue infrastructure
- Enterprise-grade observability

These can be added after the MVP is stable.

---

# 4. Platform Reality

## Instagram

Instagram publishing uses a pull-based media model.

The application gives Meta a publicly reachable media URL. Meta fetches the image when the media container is created/published.

Therefore:

- Do not store a short-lived signed URL as the permanent media URL.
- Store the media in Cloudinary or S3.
- Generate a usable public URL when publishing.
- Validate images before scheduling.
- Prefer JPEG for publishing.
- Validate carousel aspect ratios.

Instagram carousel children are 2–10 images and the carousel follows the first image's aspect ratio.

---

## LinkedIn

LinkedIn uses a push-based upload model.

The application:

1. Initializes an image upload.
2. Receives an upload URL and image URN.
3. Uploads the binary image.
4. Collects the image URNs.
5. Creates the LinkedIn post.

For member publishing, the MVP uses the authenticated user's member identity.

LinkedIn multi-image posts are not the same as Instagram swipeable carousels.

---

# 5. Product Positioning

Do NOT advertise the MVP as:

> "Publish the same carousel to Instagram and LinkedIn."

Instead use:

> **Create once, customize per platform, schedule everywhere.**

Example:

```text
Create Post
     |
     +-------------------+
     |                   |
 Instagram            LinkedIn
     |                   |
 Carousel            Multi-image
     |                   |
     +---------+---------+
               |
           Schedule
               |
             Cron
               |
          Publish
```

---

# 6. Recommended Technology Stack

## Frontend

- Next.js
- App Router
- TypeScript
- Tailwind CSS
- shadcn/ui

## Backend

- Next.js Route Handlers
- TypeScript
- Prisma ORM
- PostgreSQL

## Authentication

- Auth.js

## Storage

- Cloudinary for MVP

S3 can be introduced later if required.

## Scheduler

- Vercel Cron

For MVP, use a simple bounded dispatcher.

If publishing volume becomes too high or jobs regularly exceed Vercel execution limits, move execution to:

- Inngest
- QStash
- Trigger.dev

The publishing state machine should remain independent of the execution provider.

---

# 7. High-Level Architecture

```text
                         ┌─────────────────────┐
                         │       User          │
                         └──────────┬──────────┘
                                    │
                                    ↓
                         ┌─────────────────────┐
                         │      Next.js        │
                         │   Dashboard/UI      │
                         └──────────┬──────────┘
                                    │
                     ┌──────────────┼──────────────┐
                     ↓              ↓              ↓
                  Auth.js        Composer       Calendar
                                    │
                                    ↓
                         ┌─────────────────────┐
                         │     PostgreSQL      │
                         │       Prisma        │
                         └──────────┬──────────┘
                                    │
                                    ↓
                         ┌─────────────────────┐
                         │    Vercel Cron      │
                         │     Dispatcher      │
                         └──────────┬──────────┘
                                    │
                         ┌──────────┴──────────┐
                         ↓                     ↓
                  Instagram API          LinkedIn API
```

---

# 8. Project Structure

```text
app/
├── (auth)/
│   ├── login/
│   └── register/
│
├── dashboard/
│   ├── page.tsx
│   ├── posts/
│   ├── calendar/
│   ├── accounts/
│   └── settings/
│
├── api/
│   ├── auth/
│   │   └── [...nextauth]/
│   │
│   ├── meta/
│   │   ├── connect/
│   │   └── callback/
│   │
│   ├── linkedin/
│   │   ├── connect/
│   │   └── callback/
│   │
│   ├── targets/
│   │   ├── route.ts
│   │   └── [id]/
│   │
│   ├── posts/
│   │   ├── route.ts
│   │   └── [id]/
│   │
│   ├── uploads/
│   │   └── route.ts
│   │
│   └── cron/
│       ├── publish/
│       └── tokens/
│
components/
├── composer/
├── calendar/
├── posts/
├── accounts/
├── ui/
└── layout/

lib/
├── auth/
├── db/
├── providers/
│   ├── meta/
│   │   ├── client.ts
│   │   ├── oauth.ts
│   │   └── discovery.ts
│   │
│   └── linkedin/
│       ├── client.ts
│       ├── oauth.ts
│       └── images.ts
│
├── publishing/
│   ├── types.ts
│   ├── claim.ts
│   ├── reducer.ts
│   ├── instagram-publisher.ts
│   └── linkedin-publisher.ts
│
├── storage/
│   └── cloudinary.ts
│
├── security/
│   └── tokens.ts
│
└── validation/
    └── schemas.ts

prisma/
└── schema.prisma

vercel.json
.env.example
README.md
```

---

# 9. Database Design

The most important design decision is:

> A post and a publishing destination are separate entities.

For example:

```text
Post #101
   |
   +── PublishTarget → Instagram
   |
   +── PublishTarget → LinkedIn
```

This allows one platform to succeed while another fails.

Example:

```text
Instagram → PUBLISHED
LinkedIn   → FAILED

Post → PARTIALLY_PUBLISHED
```

---

# 10. Core Data Model

Recommended models:

```text
User
 ├── SocialAccount
 ├── Post
 └── Session

SocialAccount
 └── SocialTarget

Post
 ├── PostMedia
 └── PublishTarget

PublishTarget
 └── PublishAttempt
```

Recommended enums:

```prisma
enum Platform {
  INSTAGRAM
  LINKEDIN
}

enum PostStatus {
  DRAFT
  SCHEDULED
  PROCESSING
  PUBLISHED
  PARTIALLY_PUBLISHED
  FAILED
  CANCELLED
}

enum TargetStatus {
  PENDING
  PREPARING
  READY
  PUBLISHING
  VERIFYING
  PUBLISHED
  FAILED
  NEEDS_REVIEW
  SKIPPED
}

enum FailureClass {
  TRANSIENT
  RATE_LIMIT
  AUTH
  PERMISSION
  MEDIA
  AMBIGUOUS
  PERMANENT
}
```

---

# 11. Publishing State Machine

Each `PublishTarget` owns its real publishing state.

```text
PENDING
   |
   ↓
PREPARING
   |
   ↓
READY
   |
   ↓
PUBLISHING
   |
   ↓
VERIFYING
   |
   ↓
PUBLISHED
```

Failure paths:

```text
PENDING ─────────────→ FAILED
PREPARING ───────────→ FAILED
READY ───────────────→ FAILED
PUBLISHING ──────────→ NEEDS_REVIEW
VERIFYING ───────────→ FAILED
```

The parent `Post.status` is derived from its targets.

Example:

```text
2 targets

Instagram = PUBLISHED
LinkedIn   = PUBLISHED

Post = PUBLISHED
```

```text
Instagram = PUBLISHED
LinkedIn   = FAILED

Post = PARTIALLY_PUBLISHED
```

---

# 12. MVP Instagram Publishing Flow

```text
Scheduled Post
      ↓
Validate account
      ↓
Check publishing limit
      ↓
Validate media
      ↓
Create image containers
      ↓
Poll container status
      ↓
Create carousel container
      ↓
Publish media
      ↓
Save provider IDs
      ↓
PUBLISHED
```

For a single image, skip the carousel-parent step.

For a carousel:

```text
Image 1 → child container
Image 2 → child container
Image 3 → child container
        ↓
Carousel container
        ↓
Publish
```

---

# 13. MVP LinkedIn Publishing Flow

```text
Scheduled Post
      ↓
Validate token
      ↓
Validate media
      ↓
Initialize image upload
      ↓
Upload image bytes
      ↓
Save image URN
      ↓
Repeat for remaining images
      ↓
Create LinkedIn post
      ↓
Save post ID
      ↓
PUBLISHED / VERIFYING
```

For one image:

```text
1 image → media post
```

For multiple images:

```text
2–20 images → multi-image post
```

---

# 14. Scheduling Design

Store:

```text
scheduledAtUtc
timezone
```

Example:

```text
scheduledAtUtc = 2026-09-10 03:30 UTC
timezone       = Asia/Kolkata
```

Never depend on the server's local timezone.

The UI should show the user's local time.

---

# 15. Scheduler Design

For MVP:

```text
Vercel Cron
     ↓
GET /api/cron/publish
     ↓
Find due PublishTargets
     ↓
Claim limited number
     ↓
Process targets
     ↓
Save state
     ↓
Finish
```

Cron should NOT attempt to publish an unlimited number of posts in one invocation.

Use a small bounded batch.

Example:

```text
Cron tick
   ↓
Claim 5 targets
   ↓
Process
   ↓
Save state
```

Next cron invocation processes the next batch.

---

# 16. Concurrency Protection

Two cron invocations must not publish the same target simultaneously.

Use:

- Atomic claim
- Database transaction
- Lock/lease
- `lockedUntil`
- `lockToken`

Conceptually:

```text
Target
status = READY
lockedUntil = null
```

Cron A:

```text
claims target
lockedUntil = now + lease
```

Cron B:

```text
cannot claim target
```

If Cron A crashes:

```text
lease expires
      ↓
target becomes claimable again
```

For the MVP, implement a simple safe claim mechanism first. Add advanced `FOR UPDATE SKIP LOCKED` optimization when concurrent publishing volume justifies it.

---

# 17. Idempotency and Duplicate Protection

This is critical.

The dangerous situation is:

```text
API request succeeds
       ↓
application crashes
       ↓
database never records success
       ↓
scheduler tries again
       ↓
DUPLICATE POST
```

Therefore:

- Persist provider state after every meaningful step.
- Move the target to `PUBLISHING` before the final provider call.
- Never blindly retry an ambiguous final create request.
- Use provider-specific reconciliation where available.
- If LinkedIn member publishing cannot be safely reconciled, use `NEEDS_REVIEW`.

A duplicate social post is worse than telling the user:

> "We could not confirm whether this post was published."

---

# 18. Retry Strategy

Do not retry every error.

## AUTH

```text
401 / authentication failure
        ↓
Stop
        ↓
Mark account invalid
        ↓
Ask user to reconnect
```

## PERMISSION

```text
403
 ↓
Stop
 ↓
Tell user to fix permissions
```

## MEDIA

```text
Invalid media
 ↓
Stop
 ↓
Ask user to replace media
```

## RATE_LIMIT

```text
429 / provider quota
 ↓
Wait according to provider guidance
 ↓
Retry later
```

## TRANSIENT

```text
5xx / temporary failure
 ↓
Retry with bounded backoff
```

## AMBIGUOUS

```text
Timeout during final create
 ↓
Do NOT blindly create again
 ↓
NEEDS_REVIEW
```

---

# 19. Token Management

OAuth tokens must never be exposed to the browser.

Store encrypted tokens server-side.

Recommended:

```text
AES-256-GCM
```

Store encryption metadata so keys can be rotated later.

Never log:

- Access tokens
- Refresh tokens
- Client secrets
- Temporary upload URLs

The application should show token-expiry warnings.

For LinkedIn, scheduling should not allow a post far beyond the known token validity unless a valid refresh mechanism is available.

---

# 20. Security Rules

Every protected request should:

1. Get the server-side session.
2. Resolve the authenticated `userId`.
3. Query resources using that `userId`.
4. Never trust `userId` supplied by the client.

Example:

```ts
where: {
  id,
  userId: session.user.id
}
```

Additional rules:

- OAuth `state` must be validated.
- OAuth state should be single-use.
- Use httpOnly cookies where applicable.
- Tokens never go to client components.
- Use `Authorization` headers for provider APIs.
- Rate-limit post creation and uploads.
- Validate request bodies with Zod.
- Protect cron endpoints with `CRON_SECRET`.
- Redact provider responses before logging.

---

# 21. Composer UX

The composer should be platform-aware.

Example:

```text
---------------------------------
Create Post
---------------------------------

Caption
[ Write your caption... ]

Media
[ + Add Images ]

Platforms

☑ Instagram
☑ LinkedIn

---------------------------------
Instagram Preview
[ Carousel Preview ]

2–10 images
Aspect ratio: 1:1 / 4:5

---------------------------------
LinkedIn Preview
[ Multi-image Preview ]

Maximum: 20 images

---------------------------------

Schedule
Date: [10 Sep 2026]
Time: [09:00 AM]
Timezone: [Asia/Kolkata]

[ Schedule Post ]
```

If media is invalid for one target:

```text
Instagram
✓ Valid

LinkedIn
✓ Valid
```

or:

```text
Instagram
✕ First image aspect ratio issue
```

The user should understand the problem before scheduling.

---

# 22. Dashboard

The MVP dashboard should show:

```text
Dashboard
│
├── Connected Accounts
│   ├── Instagram
│   └── LinkedIn
│
├── Scheduled Posts
│
├── Published Posts
│
├── Failed Posts
│
└── Create Post
```

Post status examples:

```text
Draft
Scheduled
Processing
Published
Partially Published
Failed
Needs Review
Cancelled
```

---

# 23. Calendar

MVP calendar requirements:

- Month view
- Scheduled posts
- Platform indicators
- Status indicator
- Click post → details
- Edit scheduled post
- Cancel scheduled post

Do not build drag-and-drop rescheduling initially.

---

# 24. Post Details Page

Show:

```text
Post
------------------------------
Caption

Media

Targets
------------------------------
Instagram
Status: PUBLISHED

LinkedIn
Status: FAILED
Reason: Authentication expired

------------------------------
Actions

[ Edit ]
[ Cancel ]
[ Retry ]
```

For ambiguous publishing:

```text
LinkedIn
Status: NEEDS REVIEW

We could not confirm whether LinkedIn received the post.

[ Reconnect ]
[ Review ]
```

---

# 25. Media Handling

For MVP:

```text
Browser
   ↓
Cloudinary
   ↓
Store media URL
   ↓
PostMedia
```

Do not store uploaded binary files directly in PostgreSQL.

Validate:

### Instagram

- At least one image
- Carousel: 2–10 images
- JPEG preferred
- Compatible aspect ratio
- First image determines carousel ratio

### LinkedIn

- 1 image for single-image post
- 2–20 images for multi-image post

---

# 26. Environment Variables

```bash
DATABASE_URL=

AUTH_SECRET=
AUTH_URL=

# Meta
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=
META_GRAPH_VERSION=

# LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=
LINKEDIN_API_VERSION=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Security
TOKEN_ENCRYPTION_KEY=
TOKEN_ENCRYPTION_KEY_ID=

# Cron
CRON_SECRET=
```

Keep API versions in environment variables rather than hardcoding them throughout the application.

---

# 27. Vercel Cron

Example:

```json
{
  "crons": [
    {
      "path": "/api/cron/publish",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/tokens",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Use a Vercel plan that supports the required cron frequency and execution duration.

Cron is only the trigger. It should not become the permanent job-processing architecture.

---

# 28. API Design

## Authentication

```text
GET /api/auth/[...nextauth]
```

## Social Accounts

```text
GET    /api/targets
POST   /api/targets
DELETE /api/targets/:id
```

## Posts

```text
POST   /api/posts
GET    /api/posts
GET    /api/posts/:id
PATCH  /api/posts/:id
DELETE /api/posts/:id
POST   /api/posts/:id/retry
```

## Uploads

```text
POST /api/uploads
```

## OAuth

```text
GET /api/meta/connect
GET /api/meta/callback

GET /api/linkedin/connect
GET /api/linkedin/callback
```

## Cron

```text
GET /api/cron/publish
GET /api/cron/tokens
```

---

# 29. Publisher Interface

Keep platform-specific logic behind a common interface.

Example:

```ts
interface Publisher {
  validate(target: PublishTarget): Promise<void>;

  advance(
    target: PublishTarget
  ): Promise<PublishResult>;

  reconcile(
    target: PublishTarget
  ): Promise<ReconcileResult>;
}
```

Implement:

```text
InstagramPublisher
LinkedInPublisher
```

Later:

```text
XPublisher
TikTokPublisher
ThreadsPublisher
PinterestPublisher
```

The scheduler should not need to know platform-specific API details.

---

# 30. Build Order

## Phase 1 — Foundation

### Step 1

Create Next.js project:

```text
Next.js
TypeScript
Tailwind
shadcn/ui
```

### Step 2

Add:

```text
Prisma
PostgreSQL
```

### Step 3

Create database schema and migrations.

### Step 4

Add Auth.js.

### Step 5

Build protected dashboard.

---

# 31. Phase 2 — Media

### Step 6

Integrate Cloudinary.

### Step 7

Build upload component.

### Step 8

Add media validation.

### Step 9

Create `Post` and `PostMedia`.

---

# 32. Phase 3 — LinkedIn First

LinkedIn member publishing is the best first social integration because it avoids depending on organization-page approval.

### Step 10

Create LinkedIn application.

### Step 11

Implement OAuth.

### Step 12

Resolve authenticated member identity.

### Step 13

Store encrypted token.

### Step 14

Implement image upload.

### Step 15

Implement single-image publishing.

### Step 16

Implement multi-image publishing.

### Step 17

Display publishing result.

---

# 33. Phase 4 — Instagram

### Step 18

Create Meta application.

### Step 19

Configure required Instagram/Meta permissions.

### Step 20

Implement OAuth.

### Step 21

Discover linked Page and Instagram Professional account.

### Step 22

Store the selected target.

### Step 23

Implement single-image publishing.

### Step 24

Implement carousel publishing.

### Step 25

Implement container-status polling.

---

# 34. Phase 5 — Composer

### Step 26

Build post composer.

### Step 27

Add platform selection.

### Step 28

Add platform-specific validation.

### Step 29

Add Instagram preview.

### Step 30

Add LinkedIn preview.

### Step 31

Add caption editor.

---

# 35. Phase 6 — Scheduling

### Step 32

Add date/time selector.

### Step 33

Add timezone handling.

### Step 34

Create `PublishTarget`.

### Step 35

Implement target state machine.

### Step 36

Implement Vercel Cron.

### Step 37

Implement bounded target claiming.

### Step 38

Connect cron to both publishers.

---

# 36. Phase 7 — Reliability

### Step 39

Add lock/lease handling.

### Step 40

Add error classification.

### Step 41

Add safe retries.

### Step 42

Add `NEEDS_REVIEW`.

### Step 43

Add token-expiry warnings.

### Step 44

Add basic reconciliation where supported.

### Step 45

Prevent duplicate publishing.

---

# 37. Phase 8 — Product Polish

### Step 46

Build calendar.

### Step 47

Build post details.

### Step 48

Build account management.

### Step 49

Add basic notifications.

### Step 50

Add basic logging.

### Step 51

Add loading/error/empty states.

### Step 52

Responsive UI.

---

# 38. Testing

Do not use real social APIs in normal CI tests.

Mock provider APIs at the `fetch` boundary.

Test:

### Authentication

- Unauthorized user cannot access dashboard.
- User A cannot access User B's post.
- User A cannot modify User B's social account.

### Scheduling

- Correct timezone conversion.
- Scheduled post is not published early.
- Due post is picked up.
- Cancelled post is skipped.

### Concurrency

- Two cron invocations cannot claim the same target.
- Expired lease can be reclaimed.

### Instagram

- Single image.
- Carousel.
- Invalid aspect ratio.
- Invalid media.
- Container polling.
- Publishing failure.

### LinkedIn

- Single image.
- Multi-image.
- Upload failure.
- Token failure.
- Rate limiting.
- Ambiguous final request.

### Status

Test:

```text
PUBLISHED
FAILED
PARTIALLY_PUBLISHED
NEEDS_REVIEW
```

The most important tests are:

1. Concurrent target claiming.
2. Duplicate prevention.
3. LinkedIn ambiguous publishing.
4. Instagram publishing flow.
5. Cross-user authorization.

---

# 39. Observability

MVP does not need a large observability platform.

Start with structured logs containing:

```text
requestId
postId
publishTargetId
userId
platform
step
durationMs
result
errorCode
```

Never log:

```text
accessToken
refreshToken
clientSecret
uploadUrl
```

Later add:

- Error tracking
- Metrics
- Provider trace IDs
- Alerts
- Distributed tracing

---

# 40. LinkedIn Organization Pages

This is a **post-MVP feature**.

Do not block MVP development on it.

Requirements may include:

- Organization publishing permissions
- Appropriate admin role
- LinkedIn Community Management/Marketing Developer access
- Application/approval process

Architecture should support it through:

```text
SocialTarget
    |
    +── MEMBER
    |
    +── ORGANIZATION
```

But do not build the entire feature until the required access is approved.

---

# 41. Future Architecture

When usage grows:

```text
                    Scheduler
                        |
                        ↓
                    Job Queue
                        |
          ┌─────────────┴─────────────┐
          ↓                           ↓
   Instagram Worker            LinkedIn Worker
          |                           |
          ↓                           ↓
   Instagram API               LinkedIn API
```

Possible queue/job systems:

```text
Inngest
QStash
Trigger.dev
```

The current publisher/state-machine design should remain reusable.

---

# 42. Scaling Strategy

Start simple:

```text
Next.js
PostgreSQL
Cloudinary
Vercel Cron
```

Then scale:

```text
Vercel Cron
     ↓
Queue
     ↓
Workers
     ↓
Provider APIs
```

Do not introduce a queue simply because it sounds scalable.

Introduce it when:

- publishing volume increases,
- cron execution becomes a bottleneck,
- jobs take too long,
- or reliable background execution becomes necessary.

---

# 43. Development Milestones

## Milestone 1

```text
Auth
+
Dashboard
+
Database
```

Result:

User can register/login and access the dashboard.

---

## Milestone 2

```text
Cloudinary
+
Upload
+
Composer
```

Result:

User can create and save a draft post.

---

## Milestone 3

```text
LinkedIn OAuth
+
LinkedIn Publishing
```

Result:

User can publish an image to LinkedIn.

---

## Milestone 4

```text
Instagram OAuth
+
Instagram Publishing
```

Result:

User can publish an image/carousel to Instagram.

---

## Milestone 5

```text
Scheduling
+
Cron
+
PublishTarget
```

Result:

User can schedule a future post and the system publishes it automatically.

---

## Milestone 6

```text
Retries
+
Token Handling
+
Failure States
+
Calendar
```

Result:

Production-ready MVP.

---

# 44. Definition of Done for MVP

The MVP is complete when a user can:

```text
1. Sign up
2. Log in
3. Connect LinkedIn
4. Connect Instagram
5. Upload images
6. Write caption
7. Select Instagram
8. Select LinkedIn
9. See separate previews
10. Select date/time
11. Schedule
12. Cron detects the post
13. Instagram publishes correctly
14. LinkedIn publishes correctly
15. Status is saved
16. Failed target is shown clearly
17. User can reconnect expired accounts
18. Users cannot access each other's data
19. Duplicate publishing is prevented as far as provider capabilities allow
```

---

# 45. Post-MVP Roadmap

## Version 1.1

- Better calendar
- Notifications
- Draft management
- Edit scheduled posts
- Better retry UI
- Basic analytics

## Version 1.2

- LinkedIn organization pages if approved
- Better token refresh
- Advanced scheduling
- Queue-based workers

## Version 2

- Facebook
- X
- Threads
- TikTok
- Pinterest
- Video
- AI content generation
- AI captions
- Hashtag suggestions
- Advanced analytics

---

# 46. Important Engineering Principles

### Principle 1

Do not put platform logic inside route handlers.

Use:

```text
Route Handler
     ↓
Service
     ↓
Publisher
     ↓
Provider API
```

---

### Principle 2

Do not treat a post as one publishing operation.

Treat each destination independently:

```text
Post
 ├── Instagram Target
 └── LinkedIn Target
```

---

### Principle 3

Do not blindly retry ambiguous requests.

Especially:

```text
POST succeeded?
Application crashed?
Unknown result?
```

Never assume failure.

---

### Principle 4

Keep provider-specific logic isolated.

```text
providers/
publishing/
```

This makes future integrations easier.

---

### Principle 5

Build MVP first.

Do not spend the first weeks building:

```text
Advanced analytics
Complex queue
Multiple providers
Enterprise observability
Organization pages
AI
```

Get this working first:

```text
Connect
   ↓
Create
   ↓
Schedule
   ↓
Publish
   ↓
Track status
```

---

# 47. Recommended Final Scope

The recommended MVP architecture is:

```text
                ┌───────────────┐
                │     User      │
                └───────┬───────┘
                        ↓
                ┌───────────────┐
                │    Next.js    │
                │   Dashboard   │
                └───────┬───────┘
                        ↓
               ┌─────────────────┐
               │     Composer    │
               └────────┬────────┘
                        ↓
                ┌───────────────┐
                │   PostgreSQL  │
                │    Prisma     │
                └───────┬───────┘
                        ↓
                ┌───────────────┐
                │  Vercel Cron  │
                └───────┬───────┘
                        ↓
             ┌──────────┴──────────┐
             ↓                     ↓
       ┌───────────┐         ┌───────────┐
       │ Instagram │         │ LinkedIn  │
       │ Publisher │         │ Publisher │
       └─────┬─────┘         └─────┬─────┘
             ↓                     ↓
       Instagram API         LinkedIn API
```

---

# 48. Final Recommendation

This architecture intentionally keeps the strong parts of the original design while reducing unnecessary MVP complexity.

### Build now

```text
Next.js
TypeScript
Tailwind
shadcn/ui
Prisma
PostgreSQL
Auth.js
Cloudinary
Vercel Cron
Instagram
LinkedIn member profiles
```

### Build later

```text
Queue workers
LinkedIn organizations
Analytics
Video
More platforms
AI
Advanced observability
```

### Target

**First goal:**

> A user can connect Instagram + LinkedIn, create an image post, schedule it, and have the system publish it reliably without duplicate posts.

Once that works end-to-end, expand the platform.

---

# 49. Implementation Command

Start the project with:

```bash
pnpm create next-app@latest social-scheduler
cd social-scheduler

pnpm add prisma @prisma/client next-auth
pnpm add zod
pnpm add cloudinary
pnpm add date-fns date-fns-tz

pnpm dlx prisma init
```

Then implement the milestones in the order described above.

---

## 50. Final Architecture Decision

```text
                 MVP
                  │
       ┌──────────┴──────────┐
       ↓                     ↓
   Instagram             LinkedIn
   Professional           Member
       │                   Profile
       │                     │
       └──────────┬──────────┘
                  ↓
            PublishTarget
                  ↓
              Scheduler
                  ↓
             PostgreSQL
```

**This is the recommended version to implement.**
