"use client";

/**
 * Binds the analytics identity to a business (brief §5, §6, §32). Rendered by
 * supplier server pages that have already resolved the business id, so no id
 * lookup happens in the browser. The id is an opaque uuid — never a name,
 * phone, or address.
 */

import { useEffect } from "react";

import { useAnalytics } from "./useAnalytics";

export function AnalyticsBusinessIdentity({ businessId }: { businessId: string }) {
  const analytics = useAnalytics("business");

  useEffect(() => {
    analytics.identifyBusiness(businessId);
  }, [analytics, businessId]);

  return null;
}
