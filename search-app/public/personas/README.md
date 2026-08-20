# Persona avatars — provenance

`dana.jpg` and `marcus.jpg` are **synthetic faces**: StyleGAN2 output from
`thispersondoesnotexist.com`, fetched 2026-08-14.

**These are not photographs of real people.** That is deliberate and it is the
reason this note exists. The personas they illustrate are fictional shoppers
with fabricated purchase histories, invented to demo Coveo's anonymous
`clientId` personalization (see `presentation/personalization-plan.md`).
Attaching a real person's face to an invented shopper — in a repository that is
going public — is avoidable, so it was avoided. No likeness, no model release,
no image licence to track.

Processing applied: centre-cropped to the top 92% of the frame (which removes
the "StyleGAN2 (Karras et al.)" watermark along the bottom edge), scaled to
256×256, JPEG q86. ~13KB each, down from ~500KB.

Guest deliberately has **no** image, because the anonymous visitor should not
look like a person. It rendered a neutral `User` glyph until 2026-08-18; it now
renders the site's own mark (`MooseMark`, from `brand/rabidlogo.png`) instead.
The rule is unchanged and still met — a moose is not a person — and the label
"Guest" sits beside the avatar in both placements, so the mark reading as "the
house" rather than "a shopper" is accurate for an un-switched visitor.
