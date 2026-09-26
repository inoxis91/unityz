/**
 * Marge après l'échéance d'un abonnement Stripe en cours : au renouvellement, Stripe ouvre la
 * nouvelle période puis ne prélève la facture qu'environ une heure plus tard, et l'échéance
 * n'avance qu'avec invoice.payment_succeeded. Sans marge, la guilde perdrait l'accès entre les deux.
 * Un échec de prélèvement passe l'abonnement en past_due, qui a son propre délai de grâce.
 */
export const RENEWAL_GRACE_HOURS = 24;

/** Condition SQL « la guilde a un accès payant » sur la table `guilds` aliasée `g`. */
export const hasPaidAccessSql = (g: string) => `(
  ${g}.subscription_expires_at > CURRENT_TIMESTAMP
  OR (${g}.stripe_subscription_id IS NOT NULL
      AND ${g}.subscription_status IN ('active', 'trialing')
      AND ${g}.subscription_expires_at > CURRENT_TIMESTAMP - INTERVAL '${RENEWAL_GRACE_HOURS} hours')
)`;
