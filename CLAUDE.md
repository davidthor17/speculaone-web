# SPECULA PROJECT RULES

## 1. Project purpose

Specula is an independent hotel assessment company focused on revealing the real guest experience.

The website should feel:
- premium
- restrained
- credible
- editorial
- confident
- sophisticated
- human

It should never feel:
- corporate
- generic SaaS
- overly promotional
- cheap
- loud
- AI-generated
- gimmicky

The goal is not simply to make a beautiful website. The website must communicate a credible commercial proposition to serious hotel owners and operators.

## 2. Writing style

Use concise, confident, intelligent language.

Prefer:
- short sentences
- precise wording
- strong statements
- understated confidence
- editorial luxury tone

Avoid:
- marketing clichés
- generic AI language
- unnecessary adjectives
- exaggerated claims
- filler copy
- repetitive explanations

Never use em dashes or double dashes in user-facing copy, UI text, accessibility text, or reports.

Use commas, periods, colons, or parentheses instead.

This is a permanent rule.

## 3. Specula terminology

The current terminology is locked.

Use:

Specula Mark

Reviewed by Specula

Certified by Specula

Spot Audit

Full Audit

Desk Review

Independent hotel assessment

Do NOT revert to:

Seal

Silver Seal

Gold Seal

Certified Property

Reviewed Property

Gold

Silver

Do not use "certification" as a generic replacement for "assessment" when describing the overall Specula service.

"Certified by Specula" is a specific outcome associated with the Full Audit when the required standard is met.

"Reviewed by Specula" is the outcome associated with a Spot Audit when the required standard is met.

The Specula Mark is earned, never bought.

## 4. Core philosophy

The following ideas are central to the brand:

Independent by design.

Confidential by principle.

Hotels pay for the audit, never for the result.

We do not audit to expose. We audit to improve.

The purpose is to show hotels what their guests actually experience and where that experience can be better.

Do not unnecessarily repeat these lines verbatim throughout the site. Reinforcement is good, accidental duplication is not.

## 5. Guest Journey

The homepage Guest Journey section uses a 5-stage structure:

Arrival
Stay
Service
Experience
Departure

The current static imagery is only a visual representation of those stages.

The cinematic Guest Journey video is a separate future project.

Do NOT add or restore a "Watch the Journey" CTA until the cinematic video is ready.

The 8 approved property images are assets for the eventual cinematic/video storytelling and selected static beats.

## 6. Current homepage narrative

The intended homepage sequence is:

Hero
→ Philosophy
→ Services
→ Approach
→ Guest Journey
→ Why Specula
→ Packages
→ The Specula Mark
→ Owners
→ Footer

Do not reorder sections unless explicitly instructed.

## 7. Navigation

Current primary navigation:

Home
Approach
Services
Insights
About
Contact

Request Audit → is the primary persistent CTA.

About currently points to about.html.

Insights does NOT currently have a destination.

Do not invent an Insights page or anchor.

The mobile navigation uses the existing full-screen menu implementation.

Do not change its behavior unless explicitly requested.

## 8. About page

About is intentionally kept as a real page for now.

Homepage About links should point to:

about.html

About uses the same navigation structure as the homepage:

Home
Approach
Services
Insights
About
Contact

Those links resolve to:

Home → index.html
Approach → index.html#approach
Services → index.html#services
Insights → #
About → about.html
Contact → index.html#owners

Request Audit → index.html#owners

Insights intentionally remains #. Do not invent an Insights destination.

index.html is the live homepage, served at speculaone.com/. The old prototype file hero-prototype.html was migrated into index.html and deleted. Do not recreate it, and do not point links at it.

Do not redesign About unless explicitly instructed.

## 9. Packages

There are three assessment levels:

Desk Review
Spot Audit
Full Audit

Only Spot Audit and Full Audit can earn the Specula Mark.

The Packages section should communicate the distinction clearly.

Do not reintroduce the old silver/gold terminology.

The current package structure and copy are approved unless explicitly reopened.

## 10. Owners / conversion form

The Owners section is the primary conversion point.

Current fields:

Property name
Email
Select an audit
Additional focus

Additional focus is optional.

Current focus options include:

No additional focus
Front of House
Housekeeping
Food & Beverage
Rooms
Spa & Wellness
Other

Default focus must remain no additional focus.

Package selection must continue to support preselection from the package CTAs.

Do not modify owners-form.js or Supabase behavior unless explicitly requested.

Never submit the real form during testing.

## 11. Backend safety

Supabase is production-connected.

Do not:
- alter database schema
- alter Supabase configuration
- submit test leads
- modify owners-form.js
- change field mapping

unless explicitly instructed.

Testing must remain non-destructive.

## 12. Scope discipline

This is extremely important.

When given a task:

1. Inspect first.
2. Clearly identify what needs changing.
3. Change only the approved scope.
4. Do not opportunistically redesign unrelated areas.
5. Do not "improve" copy that was not part of the request.
6. Do not change approved imagery.
7. Do not modify backend logic unless explicitly requested.
8. Do not change locked sections simply because you personally prefer another solution.

If you discover an issue outside the requested scope:

FLAG IT.

Do not fix it automatically.

## 13. Approved visual language

The visual system is based on:

- ivory / paper backgrounds
- restrained bronze accents
- near-black dark passage
- serif editorial headlines
- restrained mono labels
- circular motifs
- architectural luxury imagery
- generous whitespace
- subtle transitions
- understated interaction

Do not introduce new visual languages without approval.

## 14. Image rules

Approved property imagery has already been sourced and audited.

Do not replace approved imagery without explicit approval.

When generating or evaluating new imagery:

- no readable text
- no logos
- no signage
- no artificial hotel branding
- no distorted architecture
- no duplicated people
- no anatomical errors
- no impossible hands or feet
- no duplicated furniture
- no artificial repeating corridors
- no obvious AI artifacts

Human figures must look natural and unposed unless explicitly specified otherwise.

## 15. QA requirements

For implementation passes, verify where relevant:

- 1440px
- 1024px
- 768px
- 375px

Check:

- horizontal overflow
- responsive layout
- navigation
- anchor links
- console errors
- visual hierarchy
- typography
- mobile spacing
- interactive behavior

DOM measurements alone are not sufficient for visual QA when screenshots are available.

Use actual screenshots whenever the environment supports them.

Also remember that zero overflow does not automatically mean the layout is visually good. Check for cramped elements, wrapping, collisions, and awkward spacing.

## 16. Pass workflow

We work in deliberate passes.

Typical workflow:

Audit
→ Review
→ Approval
→ /clear
→ Implementation
→ /clear
→ Verification

Do not combine a major audit and major implementation unless explicitly instructed.

After an audit, wait for approval before implementing.

After implementation, verify the result.

## 17. Reporting

Reports should be concise but useful.

Clearly distinguish:

CHANGED

VERIFIED

FLAGGED

UNTOUCHED

Never claim something was visually verified if only DOM measurements were performed.

Never claim a file was untouched without checking.

Never overclaim anatomical or visual quality when the resolution does not allow reliable inspection.

Most importantly:

NO EM DASHES OR DOUBLE DASHES IN REPORTS.

## 18. Current launch philosophy

This is a first public version of the Specula website.

The goal is to reach a strong launch-ready v1, not infinite perfection.

Do not continually expand scope with:
- unnecessary sections
- fake testimonials
- fake statistics
- unnecessary animations
- unnecessary content
- unnecessary integrations

The cinematic Guest Journey video, Insights content system, case studies, analytics expansion, SEO expansion, and other future enhancements can come after launch.

Prioritize:
clarity
credibility
commercial conversion
polish
stability

## 19. Decision rule

When uncertain:

Do not guess.

Inspect the existing implementation.

If the issue is outside scope, flag it.

If a change could materially affect approved design, copy, navigation, backend, or terminology, stop and ask for approval.

The user's explicit instructions take priority over personal design preference.

END OF PROJECT RULES
