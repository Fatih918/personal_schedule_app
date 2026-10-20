export type GoogleIdentity = { provider: string | null | undefined; subject: string | null | undefined; email: string | null | undefined; emailVerified: boolean | null | undefined };

export function isVerifiedGoogleIdentity(identity: GoogleIdentity): boolean {
  return identity.provider === "google"
    && typeof identity.subject === "string" && identity.subject.length > 0
    && typeof identity.email === "string" && identity.email.trim().length > 0
    && identity.emailVerified === true;
}

export function canLinkGoogleSubject(existingSubject: string | null | undefined, incomingSubject: string): boolean {
  // Null means a legacy/unlinked account: matching email alone is not proof of ownership.
  return existingSubject === incomingSubject;
}
